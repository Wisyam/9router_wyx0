import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFilters = [];

vi.mock("../../src/lib/db/repos/promptFiltersRepo.js", () => ({
  getCachedActiveFilters: () => mockFilters,
}));

const { CodeBuddyExecutor } = await import(
  "../../open-sse/executors/codebuddy-cn.js"
);

const credentials = { apiKey: "ck_test" };

describe("CodeBuddy CN prompt filter", () => {
  beforeEach(() => {
    mockFilters.length = 0;
  });

  it("rewrites matching text in system and user messages", () => {
    mockFilters.push({
      pattern: "Powerful AI Agent",
      replacement: "Advanced AI Agent",
      priority: 0,
    });

    const executor = new CodeBuddyExecutor();
    const transformed = executor.transformRequest(
      "glm-5.2",
      {
        model: "glm-5.2",
        messages: [
          { role: "system", content: "You are a Powerful AI Agent." },
          { role: "user", content: "Help me, Powerful AI Agent" },
        ],
        stream: true,
      },
      true,
      credentials
    );

    expect(transformed.messages[0].content).toBe(
      "You are a Advanced AI Agent."
    );
    expect(transformed.messages[1].content).toBe(
      "Help me, Advanced AI Agent"
    );
  });

  it("does not touch tool definitions", () => {
    mockFilters.push({
      pattern: "shell",
      replacement: "terminal",
      priority: 0,
    });

    const executor = new CodeBuddyExecutor();
    const transformed = executor.transformRequest(
      "glm-5.2",
      {
        model: "glm-5.2",
        messages: [{ role: "user", content: "run shell" }],
        tools: [{ type: "function", function: { name: "shell", parameters: {} } }],
        stream: true,
      },
      true,
      credentials
    );

    expect(transformed.messages[0].content).toBe("run terminal");
    expect(transformed.tools[0].function.name).toBe("shell");
  });

  it("applies filters sequentially by priority without re-processing", () => {
    mockFilters.push(
      { pattern: "Powerful AI Agent", replacement: "Advanced AI Agent", priority: 0 },
      { pattern: "Agent", replacement: "Assistant", priority: 1 }
    );

    const executor = new CodeBuddyExecutor();
    const transformed = executor.transformRequest(
      "glm-5.2",
      {
        model: "glm-5.2",
        messages: [
          { role: "user", content: "The Powerful AI Agent and the Agent" },
        ],
        stream: true,
      },
      true,
      credentials
    );

    expect(transformed.messages[0].content).toBe(
      "The Advanced AI Agent and the Assistant"
    );
  });

  it("leaves messages unchanged when no filters are active", () => {
    const executor = new CodeBuddyExecutor();
    const transformed = executor.transformRequest(
      "glm-5.2",
      {
        model: "glm-5.2",
        messages: [{ role: "user", content: "Hello" }],
        stream: true,
      },
      true,
      credentials
    );

    expect(transformed.messages[0].content).toBe("Hello");
  });

  it("handles array content blocks", () => {
    mockFilters.push({
      pattern: "Powerful AI Agent",
      replacement: "Advanced AI Agent",
      priority: 0,
    });

    const executor = new CodeBuddyExecutor();
    const transformed = executor.transformRequest(
      "glm-5.2",
      {
        model: "glm-5.2",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "You are a Powerful AI Agent." },
              { type: "image_url", image_url: { url: "data:..." } },
            ],
          },
        ],
        stream: true,
      },
      true,
      credentials
    );

    expect(transformed.messages[0].content[0].text).toBe(
      "You are a Advanced AI Agent."
    );
    expect(transformed.messages[0].content[1]).toEqual({
      type: "image_url",
      image_url: { url: "data:..." },
    });
  });

  it("does not rewrite tool role messages", () => {
    mockFilters.push({
      pattern: "result",
      replacement: "output",
      priority: 0,
    });

    const executor = new CodeBuddyExecutor();
    const transformed = executor.transformRequest(
      "glm-5.2",
      {
        model: "glm-5.2",
        messages: [
          { role: "user", content: "check result" },
          { role: "tool", content: "the result is 42", tool_call_id: "abc" },
        ],
        stream: true,
      },
      true,
      credentials
    );

    expect(transformed.messages[0].content).toBe("check output");
    expect(transformed.messages[1].content).toBe("the result is 42");
  });
});
