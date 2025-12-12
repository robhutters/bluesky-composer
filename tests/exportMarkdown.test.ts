import { describe, it, expect } from "vitest";
import { formatNotesToMarkdown, contentKey, mergeLocalAndCloud } from "../app/lib/noteUtils";

describe("formatNotesToMarkdown", () => {
  it("includes tags and images when present", () => {
    const notes = [
      { id: 1, plaintext: "Hello world", created_at: "2025-01-01T00:00:00Z", imageData: "https://example.com/img.png" },
    ];
    const metadata = { "1": { tags: ["tag1", "tag2"] } };
    const md = formatNotesToMarkdown(notes, metadata);
    expect(md).toContain("Hello world");
    expect(md).toContain("tag1");
    expect(md).toContain("![Image 1 for note 1](https://example.com/img.png)");
  });

  it("gracefully handles missing metadata and timestamps", () => {
    const notes = [
      { id: 2, plaintext: "No meta" },
    ];
    const md = formatNotesToMarkdown(notes, {});
    expect(md).toContain("No meta");
  });
});

describe("mergeLocalAndCloud", () => {
  it("keeps cloud note when content duplicates local", () => {
    const cloud = [{ id: 1, plaintext: "keep me" }];
    const local = [{ id: 2, plaintext: "keep me" }];
    const merged = mergeLocalAndCloud(local, cloud);
    // merged should have only one copy of the content
    expect(merged.length).toBe(1);
    // cloud id stays authoritative to avoid UUID/type mismatches
    expect(merged[0].id).toBe(1);
  });

  it("merges distinct notes from local and cloud", () => {
    const cloud = [{ id: 1, plaintext: "cloud" }];
    const local = [{ id: 2, plaintext: "local" }];
    const merged = mergeLocalAndCloud(local, cloud);
    const keys = merged.map((n) => contentKey(n.plaintext));
    expect(keys).toContain(contentKey("cloud"));
    expect(keys).toContain(contentKey("local"));
  });
});
