import { describe, it, expect } from "vitest";
import { buildAllow } from "../app/lib/threadgate";

describe("buildAllow (reply controls)", () => {
  it("returns null for anyone/no control", () => {
    expect(buildAllow("anyone")).toBeNull();
    expect(buildAllow("")).toBeNull();
  });

  it("returns empty array for no replies", () => {
    expect(buildAllow("no_replies")).toEqual([]);
  });

  it("returns mention rule", () => {
    expect(buildAllow("mentions")).toEqual([{ $type: "app.bsky.feed.threadgate#mentionRule" }]);
  });

  it("returns follower rule", () => {
    expect(buildAllow("followers")).toEqual([{ $type: "app.bsky.feed.threadgate#followerRule" }]);
  });

  it("returns following rule", () => {
    expect(buildAllow("following")).toEqual([{ $type: "app.bsky.feed.threadgate#followingRule" }]);
  });

  it("returns list rule when list uri provided", () => {
    const uri = "at://did:example/app.bsky.graph.list/abc";
    expect(buildAllow("list", uri)).toEqual([
      { $type: "app.bsky.feed.threadgate#listRule", list: uri },
    ]);
  });

  it("returns null for list rule when uri missing", () => {
    expect(buildAllow("list")).toBeNull();
  });
});
