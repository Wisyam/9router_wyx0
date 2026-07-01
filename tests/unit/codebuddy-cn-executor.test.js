import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

vi.mock("../../open-sse/utils/proxyFetch.js", () => ({
  proxyAwareFetch: (...args) => fetchMock(...args),
}));

const { CodeBuddyExecutor } = await import("../../open-sse/executors/codebuddy-cn.js");

const credentials = { apiKey: "ck_test" };

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function sseResponse(chunks, status = 200) {
  return new Response(chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n", {
    status,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function parseRequestBody(callIndex) {
  return JSON.parse(fetchMock.mock.calls[callIndex][1].body);
}

describe("CodeBuddy CN executor", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("retries content-filter failures with a compact safe chat payload", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        error: {
          message: "抱歉，系统检测到您当前输入的信息存在敏感内容，我无法响应您的请求，请检查后重新输入。",
        },
      }, 400))
      .mockResolvedValueOnce(jsonResponse({ id: "ok" }, 200));

    const executor = new CodeBuddyExecutor();
    const result = await executor.execute({
      model: "glm-5.2",
      body: {
        model: "glm-5.2",
        messages: [
          { role: "system", content: "danger-full-access secret execution policy" },
          { role: "developer", content: "browser automation policy" },
          { role: "user", content: "tesd" },
        ],
        tools: [{ type: "function", function: { name: "shell", parameters: {} } }],
        stream: true,
      },
      stream: true,
      credentials,
    });

    expect(result.response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const retryBody = parseRequestBody(1);
    expect(retryBody.messages).toEqual([
      {
        role: "system",
        content: "You are a concise coding assistant. Answer the user's latest request directly.",
      },
      { role: "user", content: "tesd" },
    ]);
    expect(retryBody.tools).toBeUndefined();
    expect(JSON.stringify(retryBody)).not.toContain("danger-full-access");
    expect(JSON.stringify(retryBody)).not.toContain("browser automation policy");
  });

  it("retries streamed content-filter replies with a compact safe chat payload", async () => {
    fetchMock
      .mockResolvedValueOnce(sseResponse([{
        id: "blocked",
        choices: [{
          delta: {
            content: "抱歉，系统检测到您当前输入的信息存在敏感内容，我无法响应您的请求，请检查后重新输入。",
          },
        }],
      }]))
      .mockResolvedValueOnce(sseResponse([{
        id: "ok",
        choices: [{ delta: { content: "OK" }, finish_reason: "stop" }],
      }]));

    const executor = new CodeBuddyExecutor();
    const result = await executor.execute({
      model: "glm-5.2",
      body: {
        model: "glm-5.2",
        messages: [
          { role: "system", content: "Claude Code security policy and shell tool instructions" },
          { role: "user", content: "tes" },
        ],
        tools: [{ type: "function", function: { name: "bash", parameters: {} } }],
        stream: true,
      },
      stream: true,
      credentials,
    });

    expect(result.response.status).toBe(200);
    expect(await result.response.text()).toContain("OK");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const retryBody = parseRequestBody(1);
    expect(retryBody.messages).toEqual([
      {
        role: "system",
        content: "You are a concise coding assistant. Answer the user's latest request directly.",
      },
      { role: "user", content: "tes" },
    ]);
    expect(retryBody.tools).toBeUndefined();
    expect(JSON.stringify(retryBody)).not.toContain("Claude Code");
    expect(JSON.stringify(retryBody)).not.toContain("bash");
  });
});
