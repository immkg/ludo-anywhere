import { describe, it, expect } from "vitest";

describe("ci workflow smoke test", () => {
  it("passes as expected", () => {
    expect(1 + 1).toBe(2);
  });

  it("fails on purpose to verify the sticky comment reports failures", () => {
    expect(1 + 1).toBe(2);
  });
});
