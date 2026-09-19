import { describe, expect, it, vi } from "vitest";
import { claudeModelCall } from "./classify.js";

const sdk = vi.hoisted(() => ({
  calls: [] as Array<{ prompt: string; options: { model: string; maxTurns: number; allowedTools: string[]; abortController: AbortController } }>,
  /** What the SDK streams back; `claudeModelCall` only keeps the final result message. */
  stream: [] as Array<Record<string, unknown>>,
  /** Simulate a call still in the model's hands: nothing is yielded until the abort lands. */
  hang: false,
}));

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  async *query(args: (typeof sdk.calls)[number]) {
    sdk.calls.push(args);
    if (sdk.hang) {
      await new Promise((_, reject) => {
        args.options.abortController.signal.addEventListener("abort", () => reject(new Error("aborted by the caller")));
      });
    }
    for (const m of sdk.stream) {
      if (args.options.abortController.signal.aborted) throw new Error("aborted");
      yield m;
    }
  },
}));

describe("claudeModelCall", () => {
  it("asks for one turn with no tools and returns the result message", async () => {
    sdk.calls = [];
    sdk.stream = [{ type: "assistant", message: "thinking" }, { type: "result", result: '{"category":"school"}' }];
    expect(await claudeModelCall("claude-sonnet-5")("prompt text")).toBe('{"category":"school"}');
    expect(sdk.calls).toHaveLength(1);
    expect(sdk.calls[0]!.prompt).toBe("prompt text");
    expect(sdk.calls[0]!.options).toMatchObject({ model: "claude-sonnet-5", maxTurns: 1, allowedTools: [] });
  });

  it("stringifies a non-string result rather than passing an object on to the JSON extractor", async () => {
    sdk.stream = [{ type: "result", result: 42 }];
    expect(await claudeModelCall("claude-sonnet-5")("p")).toBe("42");
  });

  it("fails loudly on a run that ends without a result, so the caller can fall back", async () => {
    sdk.stream = [{ type: "assistant", message: "thinking" }];
    await expect(claudeModelCall("claude-sonnet-5")("p")).rejects.toThrow(/empty model reply/);
    sdk.stream = [{ type: "result", subtype: "error_during_execution" }]; // a result message with no result field
    await expect(claudeModelCall("claude-sonnet-5")("p")).rejects.toThrow(/empty model reply/);
    sdk.stream = [{ type: "result", result: "   " }];
    await expect(claudeModelCall("claude-sonnet-5")("p")).rejects.toThrow(/empty model reply/);
  });

  it("aborts a call that outlives its timeout, and drops the timer once the call is done", async () => {
    vi.useFakeTimers();
    try {
      sdk.calls = [];
      const clear = vi.spyOn(globalThis, "clearTimeout");
      sdk.stream = [{ type: "result", result: "ok" }];
      await claudeModelCall("claude-sonnet-5", 1000)("p");
      expect(clear).toHaveBeenCalled();
      expect(sdk.calls[0]!.options.abortController.signal.aborted).toBe(false);

      // The call is still in the model's hands when the timeout lands.
      sdk.hang = true;
      const rejects = expect(claudeModelCall("claude-sonnet-5", 1000)("p")).rejects.toThrow(/aborted by the caller/);
      await vi.advanceTimersByTimeAsync(1000);
      await rejects;
      expect(sdk.calls[1]!.options.abortController.signal.aborted).toBe(true);
      sdk.hang = false;
    } finally {
      vi.useRealTimers();
    }
  });
});
