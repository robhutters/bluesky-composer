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

  it("mergeLocalAndCloud merges by id and keeps edited text/image for same id", () => {
    const cloud = [{ id: 1, plaintext: "old text" }];
    const local = [{ id: 1, plaintext: "new text", imageData: "img-data" }];
    const merged = mergeLocalAndCloud(local, cloud);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe(1);
    expect(merged[0].plaintext).toBe("new text");
    expect(merged[0].imageData).toBe("img-data");
  });

  it("mergeLocalAndCloud dedupes identical plaintext across different ids", () => {
    const cloud = [{ id: 2, plaintext: "same note", extra: "cloud" }];
    const local = [{ id: 3, plaintext: "same note", imageData: "local-img" }];
    const merged = mergeLocalAndCloud(local, cloud);
    expect(merged).toHaveLength(1);
    const note = merged[0];
    // one note remains; cloud id stays authoritative, local fields merged
    expect(note.id).toBe(2);
    expect(note.extra).toBe("cloud");
    expect(note.imageData).toBe("local-img");
  });

  it("mergeLocalAndCloud keeps distinct notes when plaintext differs", () => {
    const cloud = [{ id: 1, plaintext: "note one" }];
    const local = [{ id: 2, plaintext: "note two" }];
    const merged = mergeLocalAndCloud(local, cloud);
    expect(merged).toHaveLength(2);
    const keys = merged.map((n) => contentKey(n.plaintext));
    expect(keys).toContain(contentKey("note one"));
    expect(keys).toContain(contentKey("note two"));
  });
});
