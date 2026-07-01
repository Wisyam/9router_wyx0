import { DefaultExecutor } from "./default.js";

const SAFE_RETRY_MARKER = Symbol("codebuddyCnSafeRetry");
const SAFE_SYSTEM_PROMPT = "You are a concise coding assistant. Answer the user's latest request directly.";
const STREAM_FILTER_PEEK_BYTES = 64 * 1024;
const CONTENT_FILTER_PATTERNS = [
  /敏感内容/u,
  /无法响应/u,
  /content filter/i,
  /blocked by the provider/i,
  /blocked by provider/i,
];
const SAFE_COPY_KEYS = [
  "model",
  "stream",
  "temperature",
  "top_p",
  "max_tokens",
  "max_completion_tokens",
  "reasoning_effort",
  "reasoning_summary",
];

function isContentFilterBody(text) {
  return CONTENT_FILTER_PATTERNS.some((pattern) => pattern.test(String(text || "")));
}

function textFromContent(content) {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function compactSafeMessages(messages) {
  const safeMessages = Array.isArray(messages)
    ? messages
      .map((message) => {
        const role = message?.role === "assistant" ? "assistant" : message?.role === "user" ? "user" : "";
        if (!role) return null;
        const content = textFromContent(message.content);
        return content ? { role, content } : null;
      })
      .filter(Boolean)
      .slice(-8)
    : [];

  if (!safeMessages.some((message) => message.role === "user")) {
    safeMessages.push({ role: "user", content: "Continue." });
  }

  return [
    { role: "system", content: SAFE_SYSTEM_PROMPT },
    ...safeMessages,
  ];
}

function buildSafeRetryBody(body) {
  const retryBody = {};
  for (const key of SAFE_COPY_KEYS) {
    if (body?.[key] !== undefined) retryBody[key] = body[key];
  }
  retryBody.stream = true;
  retryBody.messages = compactSafeMessages(body?.messages);
  return retryBody;
}

function responseIsEventStream(response) {
  return (response.headers?.get?.("content-type") || "").toLowerCase().includes("text/event-stream");
}

function cloneResponseHeaders(headers) {
  const cloned = new Headers(headers || {});
  cloned.delete("content-length");
  return cloned;
}

async function pipeReadableBody(body, controller) {
  if (!body?.getReader) {
    controller.close();
    return;
  }
  const reader = body.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      controller.enqueue(value);
    }
    controller.close();
  } catch (error) {
    controller.error(error);
  } finally {
    reader.releaseLock?.();
  }
}

/**
 * CodeBuddyExecutor — talks to https://copilot.tencent.com/v2/chat/completions
 *
 * CodeBuddy is OpenAI-compatible but rejects non-stream chat requests
 * (HTTP 400, code 11101 "Non-stream chat request is currently not supported").
 * The same-format (openai→openai) translator path leaves body.stream as the
 * client sent it, so we force it true here — 9router still re-aggregates the
 * SSE into a JSON response for non-streaming clients.
 */
export class CodeBuddyExecutor extends DefaultExecutor {
  constructor() {
    super("codebuddy-cn");
  }

  transformRequest(model, body, stream, credentials) {
    const sourceBody = body?.[SAFE_RETRY_MARKER] ? buildSafeRetryBody(body) : body;
    const transformed = super.transformRequest(model, sourceBody, stream, credentials);
    transformed.stream = true;

    // CodeBuddy only surfaces model reasoning when the request carries the CLI's
    // OpenAI-style params: reasoning_effort + reasoning_summary:"auto". 9router's
    // thinking pipeline sets reasoning_effort only when the client asks, and never
    // sets reasoning_summary — so reasoning never shows. Mirror the CLI here.
    const eff = transformed.reasoning_effort;
    if (eff === "none" || eff === "off") {
      delete transformed.reasoning_effort; // gateway has no "none" — just omit
    } else {
      if (!eff) transformed.reasoning_effort = "medium";
      transformed.reasoning_summary = "auto";
    }
    return transformed;
  }

  retryWithSafePayload(args) {
    args.log?.warn?.("CODEBUDDY_CN", "content filter hit; retrying with compact safe payload");
    return super.execute({
      ...args,
      body: {
        ...args.body,
        [SAFE_RETRY_MARKER]: true,
      },
    });
  }

  wrapStreamWithSafeRetry(result, args) {
    const response = result.response;
    if (!response.body?.getReader) return result;

    let activeReader;
    const stream = new ReadableStream({
      start: async (controller) => {
        const reader = response.body.getReader();
        activeReader = reader;
        const decoder = new TextDecoder();
        const buffered = [];
        let bufferedText = "";
        let bufferedBytes = 0;
        let canFlush = false;

        try {
          while (bufferedBytes < STREAM_FILTER_PEEK_BYTES && !canFlush) {
            const { value, done } = await reader.read();
            if (done) {
              for (const chunk of buffered) controller.enqueue(chunk);
              controller.close();
              return;
            }

            buffered.push(value);
            bufferedBytes += value?.byteLength ?? value?.length ?? 0;
            bufferedText += decoder.decode(value, { stream: true });

            if (isContentFilterBody(bufferedText)) {
              await reader.cancel?.("codebuddy-cn content filter retry");
              const retryResult = await this.retryWithSafePayload(args);
              await pipeReadableBody(retryResult.response.body, controller);
              return;
            }

            canFlush = bufferedText.includes("\n\n");
          }

          for (const chunk of buffered) controller.enqueue(chunk);
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        } finally {
          reader.releaseLock?.();
        }
      },
      cancel: async (reason) => {
        try {
          await activeReader?.cancel?.(reason);
        } catch {
          return null;
        }
      },
    });

    return {
      ...result,
      response: new Response(stream, {
        status: response.status,
        statusText: response.statusText,
        headers: cloneResponseHeaders(response.headers),
      }),
    };
  }

  async execute(args) {
    const result = await super.execute(args);
    if (args.body?.[SAFE_RETRY_MARKER]) return result;

    if (result.response.ok) {
      if (responseIsEventStream(result.response)) {
        return this.wrapStreamWithSafeRetry(result, args);
      }

      let okBodyText = "";
      try {
        okBodyText = await result.response.clone().text();
      } catch {
        okBodyText = "";
      }
      if (!isContentFilterBody(okBodyText)) return result;
      return this.retryWithSafePayload(args);
    }

    let bodyText = "";
    try {
      bodyText = await result.response.clone().text();
    } catch {
      bodyText = "";
    }
    if (!isContentFilterBody(bodyText)) return result;

    return this.retryWithSafePayload(args);
  }
}

export default CodeBuddyExecutor;
