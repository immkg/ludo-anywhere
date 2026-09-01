import { describe, it, expect } from "vitest";
import { QUICK_CHAT_PHRASES, isQuickChatPhrase } from "./quickChat.js";

describe("isQuickChatPhrase", () => {
  it("accepts every phrase in the preset list", () => {
    for (const phrase of QUICK_CHAT_PHRASES) {
      expect(isQuickChatPhrase(phrase)).toBe(true);
    }
  });

  it("rejects free text not in the preset list", () => {
    expect(isQuickChatPhrase("something rude")).toBe(false);
    expect(isQuickChatPhrase("")).toBe(false);
  });

  it("is case-sensitive and rejects near matches or extra whitespace", () => {
    expect(isQuickChatPhrase("good luck!")).toBe(false);
    expect(isQuickChatPhrase("GG ")).toBe(false);
  });

  it("keeps the list small and deliberate", () => {
    expect(QUICK_CHAT_PHRASES.length).toBeGreaterThan(0);
    expect(QUICK_CHAT_PHRASES.length).toBeLessThanOrEqual(10);
  });

  it("has no duplicate phrases", () => {
    expect(new Set(QUICK_CHAT_PHRASES).size).toBe(QUICK_CHAT_PHRASES.length);
  });
});
