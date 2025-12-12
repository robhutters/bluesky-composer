export type ReplyControl =
  | "anyone"
  | "no_replies"
  | "mentions"
  | "followers"
  | "following"
  | "list";

/**
 * Build the Bluesky threadgate "allow" array from a reply control value.
 * Returns null when no threadgate is needed (anyone), [] for no replies.
 */
export function buildAllow(replyControl: ReplyControl | string, listUri?: string) {
  if (!replyControl || replyControl === "anyone") return null;
  if (replyControl === "no_replies") return [];
  if (replyControl === "mentions") return [{ $type: "app.bsky.feed.threadgate#mentionRule" }];
  if (replyControl === "followers") return [{ $type: "app.bsky.feed.threadgate#followerRule" }];
  if (replyControl === "following") return [{ $type: "app.bsky.feed.threadgate#followingRule" }];
  if (replyControl === "list") {
    if (!listUri) return null;
    return [{ $type: "app.bsky.feed.threadgate#listRule", list: listUri }];
  }
  return null;
}
