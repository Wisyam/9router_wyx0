import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
const mockFilters = [];

vi.mock("../../open-sse/utils/proxyFetch.js", () => ({
  proxyAwareFetch: (...args) => fetchMock(...args),
}));

vi.mock("../../src/lib/db/repos/promptFiltersRepo.js", () => ({
  getActiveFiltersByProvider: async () => mockFilters,
}));

const { applyFiltersToMessages } = await import(
  "../../open-sse/utils/promptFilter.js"
);
const { CodeBuddyExecutor } = await import(
  "../../open-sse/executors/codebuddy-cn.js"
);

const credentials = { apiKey: "ck_test" };

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function sentBody() {
  return JSON.parse(fetchMock.mock.calls[0][1].body);
}

describe("applyFiltersToMessages (direct)", () => {
  it("rewrites matching text in system and user messages", () => {
    const filters = [
      { pattern: "Powerful AI Agent", replacement: "Advanced AI Agent" },
    ];
    const result = applyFiltersToMessages(
      [
        { role: "system", content: "You are a Powerful AI Agent." },
        { role: "user", content: "Help me, Powerful AI Agent" },
      ],
      filters
    );
    expect(result[0].content).toBe("You are a Advanced AI Agent.");
    expect(result[1].content).toBe("Help me, Advanced AI Agent");
  });

  it("does not touch tool definitions", () => {
    const filters = [{ pattern: "shell", replacement: "terminal" }];
    const result = applyFiltersToMessages(
      [{ role: "user", content: "run shell" }],
      filters
    );
    expect(result[0].content).toBe("run terminal");
  });

  it("applies filters sequentially by priority without re-processing", () => {
    const filters = [
      { pattern: "Powerful AI Agent", replacement: "Advanced AI Agent" },
      { pattern: "Agent", replacement: "Assistant" },
    ];
    const result = applyFiltersToMessages(
      [{ role: "user", content: "The Powerful AI Agent and the Agent" }],
      filters
    );
    expect(result[0].content).toBe(
      "The Advanced AI Agent and the Assistant"
    );
  });

  it("leaves messages unchanged when no filters are active", () => {
    const result = applyFiltersToMessages(
      [{ role: "user", content: "Hello" }],
      []
    );
    expect(result[0].content).toBe("Hello");
  });

  it("handles array content blocks", () => {
    const filters = [
      { pattern: "Powerful AI Agent", replacement: "Advanced AI Agent" },
    ];
    const result = applyFiltersToMessages(
      [
        {
          role: "user",
          content: [
            { type: "text", text: "You are a Powerful AI Agent." },
            { type: "image_url", image_url: { url: "data:..." } },
          ],
        },
      ],
      filters
    );
    expect(result[0].content[0].text).toBe(
      "You are a Advanced AI Agent."
    );
    expect(result[0].content[1]).toEqual({
      type: "image_url",
      image_url: { url: "data:..." },
    });
  });

  it("does not rewrite tool role messages", () => {
    const filters = [{ pattern: "result", replacement: "output" }];
    const result = applyFiltersToMessages(
      [
        { role: "user", content: "check result" },
        { role: "tool", content: "the result is 42", tool_call_id: "abc" },
      ],
      filters
    );
    expect(result[0].content).toBe("check output");
    expect(result[1].content).toBe("the result is 42");
  });

  it("supports regex word boundaries", () => {
    const filters = [{ pattern: "\\bAgent\\b", replacement: "Assistant" }];
    const result = applyFiltersToMessages(
      [{ role: "user", content: "The Agent and the AssistantAgent tool" }],
      filters
    );
    expect(result[0].content).toBe(
      "The Assistant and the AssistantAgent tool"
    );
  });

  it("supports regex alternation", () => {
    const filters = [
      { pattern: "Powerful|Dangerous", replacement: "Advanced" },
    ];
    const result = applyFiltersToMessages(
      [{ role: "user", content: "Powerful and Dangerous" }],
      filters
    );
    expect(result[0].content).toBe("Advanced and Advanced");
  });

  it("supports regex wildcard patterns", () => {
    const filters = [
      { pattern: "secret.*policy", replacement: "safe policy" },
    ];
    const result = applyFiltersToMessages(
      [
        {
          role: "system",
          content: "danger-full-access secret execution policy here",
        },
      ],
      filters
    );
    expect(result[0].content).toBe("danger-full-access safe policy here");
  });

  it("skips invalid regex patterns without breaking", () => {
    const filters = [
      { pattern: "[invalid", replacement: "should not appear" },
      { pattern: "valid", replacement: "replaced" },
    ];
    const result = applyFiltersToMessages(
      [{ role: "user", content: "this is valid" }],
      filters
    );
    expect(result[0].content).toBe("this is replaced");
  });
});

describe("CodeBuddy CN executor filter integration", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    mockFilters.length = 0;
  });

  it("applies filters to outgoing request body via execute", async () => {
    mockFilters.push({
      pattern: "Powerful AI Agent",
      replacement: "Advanced AI Agent",
      priority: 0,
    });
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "ok" }, 200));

    const executor = new CodeBuddyExecutor();
    await executor.execute({
      model: "glm-5.2",
      body: {
        model: "glm-5.2",
        messages: [
          { role: "system", content: "You are a Powerful AI Agent." },
          { role: "user", content: "Hello" },
        ],
        stream: true,
      },
      stream: true,
      credentials,
    });

    const body = sentBody();
    expect(body.messages[0].content).toBe("You are a Advanced AI Agent.");
  });

  it("does not re-apply filters on safe retry path", async () => {
    mockFilters.push({
      pattern: "Powerful",
      replacement: "Advanced",
      priority: 0,
    });
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: {
              message:
                "抱歉，系统检测到您当前输入的信息存在敏感内容，我无法响应您的请求。",
            },
          },
          400
        )
      )
      .mockResolvedValueOnce(jsonResponse({ id: "ok" }, 200));

    const executor = new CodeBuddyExecutor();
    await executor.execute({
      model: "glm-5.2",
      body: {
        model: "glm-5.2",
        messages: [
          { role: "system", content: "You are a Powerful AI Agent." },
          { role: "user", content: "Hello" },
        ],
        stream: true,
      },
      stream: true,
      credentials,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retryBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(retryBody.messages[0].content).toBe(
      "You are a concise coding assistant. Answer the user's latest request directly."
    );
  });

  it("sends unfiltered request when no filters exist", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "ok" }, 200));

    const executor = new CodeBuddyExecutor();
    await executor.execute({
      model: "glm-5.2",
      body: {
        model: "glm-5.2",
        messages: [{ role: "user", content: "Hello" }],
        stream: true,
      },
      stream: true,
      credentials,
    });

    const body = sentBody();
    expect(body.messages[0].content).toBe("Hello");
  });
});
