"use client";

import { BskyAgent } from "../lib/simpleBskyAgent";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";

type TimelineItem = {
  uri: string;
  cid: string;
  text: string;
  authorHandle: string;
  authorDisplay: string;
  indexedAt?: string;
  images?: { thumb?: string; alt?: string }[];
  reply?: {
    parentAuthorHandle?: string;
    parentAuthorDisplay?: string;
    parentText?: string;
  };
};

function extractImages(embed: any): { thumb?: string; alt?: string }[] {
  const source = embed || {};
  if (Array.isArray(source?.images)) {
    return source.images.map((img: any) => ({
      thumb: img?.fullsize || img?.thumb || img?.image,
      alt: img?.alt || "",
    }));
  }
  if (source?.media?.images) {
    return source.media.images.map((img: any) => ({
      thumb: img?.fullsize || img?.thumb || img?.image,
      alt: img?.alt || "",
    }));
  }
  return [];
}

function toTimelineItem(post: any, replyCtx?: any): TimelineItem | null {
  if (!post) return null;
  const record = post.record || {};
  const embed = post.embed || record.embed || {};
  const reply = replyCtx || record.reply || undefined;
  const parentPost = reply?.parent?.post || reply?.parent || undefined;

  return {
    uri: post.uri,
    cid: post.cid,
    text: record?.text || "",
    authorHandle: post.author?.handle || "",
    authorDisplay: post.author?.displayName || post.author?.handle || "",
    indexedAt: post.indexedAt,
    images: extractImages(embed),
    reply: parentPost
      ? {
          parentAuthorHandle: parentPost?.author?.handle || "",
          parentAuthorDisplay: parentPost?.author?.displayName || parentPost?.author?.handle || "",
          parentText: parentPost?.record?.text || "",
        }
      : undefined,
  };
}

export default function MyTimelineFeed({
  enabled,
  onSelect,
}: {
  enabled: boolean;
  onSelect: (item: TimelineItem) => void;
}) {
  const [pinned, setPinned] = useState<TimelineItem[]>([]);
  const [posts, setPosts] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missingCreds, setMissingCreds] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchTimeline = useCallback(async () => {
    if (!enabled || typeof window === "undefined") return;
    const handle = window.localStorage.getItem("bsky-handle");
    const appPassword = window.localStorage.getItem("bsky-app-password");
    if (!handle || !appPassword) {
      setMissingCreds(true);
      return;
    }
    setMissingCreds(false);
    setLoading(true);
    setError(null);

    try {
      const agent = new BskyAgent({ service: "https://bsky.social" });
      await agent.login({ identifier: handle, password: appPassword });

      const profileRes = await agent.app.bsky.actor.getProfile({ actor: handle });
      const profile = profileRes?.data;

      const pinnedItems: TimelineItem[] = [];
      if (profile?.pinnedPost?.uri) {
        try {
          const thread = await agent.app.bsky.feed.getPostThread({
            uri: profile.pinnedPost.uri,
            depth: 0,
            parentHeight: 1,
          });
          const threadRoot: any = thread?.data?.thread;
          const threadPost = threadRoot?.post || threadRoot;
          const mapped = toTimelineItem(threadPost, threadRoot?.parent);
          if (mapped) pinnedItems.push(mapped);
        } catch (pinErr) {
          console.warn("Failed to load pinned post", pinErr);
        }
      }

      const feedRes = await agent.app.bsky.feed.getAuthorFeed({
        actor: handle,
        limit: 10,
        filter: "posts_with_replies",
      });
      const feedItems = feedRes?.data?.feed || [];
      const mappedFeed: TimelineItem[] = feedItems
        .map((item: any) => toTimelineItem(item?.post, item?.reply))
        .filter((item: TimelineItem | null): item is TimelineItem => Boolean(item));

      const deduped = new Map<string, TimelineItem>();
      pinnedItems.forEach((item) => {
        if (item.uri) deduped.set(item.uri, item);
      });
      mappedFeed.forEach((item: TimelineItem) => {
        if (item.uri && !deduped.has(item.uri)) {
          deduped.set(item.uri, item);
        }
      });

      const ordered = Array.from(deduped.values()).slice(0, 5);
      const pinnedUris = new Set(pinnedItems.map((item) => item.uri));
      const remaining = ordered.filter((item) => !pinnedUris.has(item.uri));

      setPinned(pinnedItems);
      setPosts(remaining);
      setLastUpdated(new Date());
    } catch (err: any) {
      setError(err?.message || "Failed to load timeline");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void fetchTimeline();
  }, [enabled, fetchTimeline]);

  if (!enabled) return null;

  const renderPost = (item: TimelineItem, idx: number, variant: "pinned" | "timeline") => (
    <button
      key={`${item.uri}-${variant}-${idx}`}
      className={`w-full text-left rounded border ${
        variant === "pinned" ? "border-amber-200 bg-amber-50" : "border-gray-200 bg-gray-50"
      } hover:bg-white p-3 shadow-sm`}
      onClick={() => onSelect(item)}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold text-slate-900 text-sm">
          {item.authorDisplay || item.authorHandle}
        </div>
        {item.indexedAt && (
          <span className="text-[11px] text-slate-500">
            {new Date(item.indexedAt).toLocaleDateString()}
          </span>
        )}
      </div>
      {item.reply && (
        <div className="mt-1 text-[11px] text-slate-600">
          Replying to {item.reply.parentAuthorDisplay || item.reply.parentAuthorHandle || "unknown"}
          {item.reply.parentText && (
            <div className="italic text-slate-500 line-clamp-2">“{item.reply.parentText}”</div>
          )}
        </div>
      )}
      <p className="mt-2 text-sm text-slate-800 whitespace-pre-wrap break-words">{item.text || "(no text)"}</p>
      {Array.isArray(item.images) && item.images.length > 0 && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          {item.images.slice(0, 2).map((img, imageIdx) => (
            <div key={imageIdx} className="relative overflow-hidden rounded border border-gray-200 bg-white">
              {img?.thumb ? (
                <Image
                  src={img.thumb}
                  alt={img.alt || "Timeline image"}
                  width={300}
                  height={200}
                  className="w-full h-auto object-cover"
                />
              ) : null}
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 text-right text-[11px] text-slate-500">Tap to reply via Composer</div>
    </button>
  );

  return (
    <div className="mt-6 space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <div className="text-sm font-semibold text-slate-900">Your Bluesky timeline</div>
          <div className="text-[11px] text-slate-500">
            View your posts and pinned updates. Tap any card to reply with the Composer.
          </div>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-500">
          {lastUpdated && <span>Updated {lastUpdated.toLocaleTimeString()}</span>}
          <button
            type="button"
            onClick={() => void fetchTimeline()}
            className="rounded border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {missingCreds && (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Save your Bluesky handle and app password in the Composer to load your timeline.
        </div>
      )}

      {error && (
        <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          {error}
        </div>
      )}

      {loading && <div className="text-sm text-slate-500">Loading your timeline…</div>}

      {!loading && !missingCreds && (
        <>
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase text-amber-600">Pinned posts</div>
            {pinned.length === 0 ? (
              <div className="rounded border border-dashed border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                No pinned posts on your Bluesky profile.
              </div>
            ) : (
              pinned.map((item, idx) => renderPost(item, idx, "pinned"))
            )}
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase text-slate-600">Latest posts</div>
            {posts.length === 0 ? (
              <div className="rounded border border-dashed border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                No recent posts found.
              </div>
            ) : (
              posts.map((item, idx) => renderPost(item, idx, "timeline"))
            )}
          </div>
        </>
      )}
    </div>
  );
}
