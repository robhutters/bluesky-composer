import { describe, it, expect } from "vitest";
import { canExportNotes, contentKey, mergeLocalAndCloud } from "../app/lib/noteUtils";

describe("canExportNotes", () => {
  it("disallows when not logged in", () => {
    expect(canExportNotes(null, true, false)).toBe(false);
  });
  it("disallows when not PRO", () => {
    expect(canExportNotes({ id: 1 }, false, false)).toBe(false);
  });
  it("disallows when exporting in progress", () => {
    expect(canExportNotes({ id: 1 }, true, true)).toBe(false);
  });
  it("allows when logged in, PRO, and not exporting", () => {
    expect(canExportNotes({ id: 1 }, true, false)).toBe(true);
  });
});

describe("mergeLocalAndCloud edge cases", () => {
  it("treats trimmed whitespace as duplicate content", () => {
    const cloud = [{ id: 1, plaintext: "hello" }];
    const local = [{ id: 2, plaintext: " hello  " }];
    const merged = mergeLocalAndCloud(local, cloud);
    expect(merged.length).toBe(1);
    expect(contentKey(merged[0].plaintext)).toBe(contentKey("hello"));
  });

  it("returns cloud when no local notes", () => {
    const cloud = [{ id: 1, plaintext: "cloud only" }];
    const merged = mergeLocalAndCloud([], cloud);
    expect(merged).toHaveLength(1);
    expect(merged[0].plaintext).toBe("cloud only");
  });
});
