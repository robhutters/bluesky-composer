import { describe, it, expect } from "vitest";
import { isBskyLinked } from "../../11ty-robhutters/app/lib/bskyAuth";

describe("bskyAuth", () => {
  it("requires both handle and app password to be linked", () => {
    expect(isBskyLinked("", "")).toBe(false);
    expect(isBskyLinked("handle", "")).toBe(false);
    expect(isBskyLinked("", "pass")).toBe(false);
    expect(isBskyLinked("handle", "pass")).toBe(true);
  });
});
