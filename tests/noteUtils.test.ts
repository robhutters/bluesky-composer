import { describe, it, expect } from "vitest";
import { contentKey, mergeLocalAndCloud, hashContent } from "../app/lib/noteUtils";

describe("noteUtils", () => {
  it("hashContent generates deterministic hash", () => {
    const a = hashContent("hello");
    const b = hashContent("hello");
    const c = hashContent("hello ");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("contentKey is length+hash based", () => {
    const k1 = contentKey("abc");
    const k2 = contentKey("abc");
    const k3 = contentKey("abcd");
    expect(k1).toBe(k2);
    expect(k1).not.toBe(k3);
  });

  it("mergeLocalAndCloud keeps unique notes and preserves cloud when duplicate", () => {
    const cloud = [
      { id: 1, plaintext: "note one" },
      { id: 2, plaintext: "note two" },
    ];
    const local = [
      { id: 3, plaintext: "note two" }, // duplicate text, should be ignored
      { id: 4, plaintext: "note three" },
    ];
    const merged = mergeLocalAndCloud(local, cloud);
    const mergedKeys = merged.map((n) => contentKey(n.plaintext));
    expect(merged.length).toBe(3);
    expect(mergedKeys).toContain(contentKey("note one"));
    expect(mergedKeys).toContain(contentKey("note two"));
    expect(mergedKeys).toContain(contentKey("note three"));
  });
});
