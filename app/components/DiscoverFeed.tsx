"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";

type DiscoverItem = {
  uri: string;
  cid: string;
  text: string;
  authorHandle: string;
  authorDisplay: string;
  feedName?: string;
  images?: { thumb?: string; alt?: string }[];
  indexedAt?: string;
  contentSummary?: string;
  reply?: {
    parentAuthorHandle?: string;
    parentAuthorDisplay?: string;
    parentText?: string;
    rootAuthorDisplay?: string;
    rootAuthorHandle?: string;
  };
};

type FeedTab = "timeline" | "discover" | "following" | "mutuals";

export default function DiscoverFeed({
  enabled,
  onSelect,
}: {
  enabled: boolean;
  onSelect: (item: DiscoverItem) => void;
}) {
  const [loadingTab, setLoadingTab] = useState<FeedTab | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [itemsByTab, setItemsByTab] = useState<Record<FeedTab, DiscoverItem[]>>({
    timeline: [],
    discover: [],
    following: [],
    mutuals: [],
  });
  const [showDiscover, setShowDiscover] = useState(true);
  const [activeTab, setActiveTab] = useState<FeedTab>("discover");
  const [cursorByTab, setCursorByTab] = useState<Record<FeedTab, string | undefined>>({
    timeline: undefined,
    discover: undefined,
    following: undefined,
    mutuals: undefined,
  });
  const [exhausted, setExhausted] = useState<Record<FeedTab, boolean>>({
    timeline: true,
    discover: false,
    following: false,
    mutuals: false,
  });
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [pauseAuto, setPauseAuto] = useState(false);
  const [likeState, setLikeState] = useState<Record<string, "idle" | "loading" | "liked" | "error">>({});
  const [likeErrors, setLikeErrors] = useState<Record<string, string>>({});

  const cardKey = useCallback((item: DiscoverItem) => item.uri || `${item.cid}-${item.authorHandle}`, []);

  const formatTimestamp = (iso?: string) => {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const getSessionAuth = useCallback(async () => {
    const handle = typeof window !== "undefined" ? window.localStorage.getItem("bsky-handle") : "";
    const appPassword = typeof window !== "undefined" ? window.localStorage.getItem("bsky-app-password") : "";
    if (!handle || !appPassword) {
      throw new Error("Handle + app password required for this feed.");
    }
    const sessionRes = await fetch("https://bsky.social/xrpc/com.atproto.server.createSession", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: handle, password: appPassword }),
    });
    if (!sessionRes.ok) {
      const detail = await sessionRes.text().catch(() => "");
      throw new Error(`Login failed: ${sessionRes.status} ${detail}`.trim());
    }
    const session = await sessionRes.json();
    const accessJwt = session.accessJwt;
    if (!accessJwt) throw new Error("Missing access token");
    return { headers: { Authorization: `Bearer ${accessJwt}` }, handle };
  }, []);

  const mapFeedItems = useCallback(
    (feed: any[], feedName: string): DiscoverItem[] =>
      feed?.map((item: any) => {
        const post = item?.post || {};
        const record = post?.record || {};
        const embed = post?.embed || record?.embed || {};
        const images =
          embed?.images?.map((img: any) => ({
            thumb: img?.fullsize || img?.thumb || img?.image,
            alt: img?.alt || "",
          })) || [];
        const parentPost = item?.reply?.parent;
        const rootPost = item?.reply?.root;
        const baseText = typeof record?.text === "string" ? record.text : "";
        const normalized = baseText.trim();
        const summary = normalized
          ? baseText
          : images.length
            ? "Media-only post"
            : "Original post has no visible text.";
        return {
          uri: post?.uri,
          cid: post?.cid,
          text: baseText,
          contentSummary: summary,
          authorHandle: post?.author?.handle || "",
          authorDisplay: post?.author?.displayName || post?.author?.handle || "",
          feedName,
          indexedAt: post?.indexedAt,
          images,
          reply: parentPost
            ? {
                parentAuthorHandle: parentPost?.author?.handle || "",
                parentAuthorDisplay: parentPost?.author?.displayName || parentPost?.author?.handle || "",
                parentText: parentPost?.record?.text || "",
                rootAuthorDisplay: rootPost?.author?.displayName || rootPost?.author?.handle || "",
                rootAuthorHandle: rootPost?.author?.handle || "",
              }
            : undefined,
        };
      }) || [],
    []
  );

  const fetchDiscover = useCallback(
    async (cursor?: string) => {
      // Try authenticated suggested feeds for a more personalized "discover" experience; fall back to public popular feeds.
      const tryAuthSuggested = async () => {
        const { headers } = await getSessionAuth();
        const genRes = await fetch(
          `https://bsky.social/xrpc/app.bsky.feed.getSuggestedFeeds?limit=10`,
          { headers }
        );
        if (!genRes.ok) return null;
        const genData = await genRes.json();
        const first = Array.isArray(genData?.feeds) && genData.feeds.length ? genData.feeds[0] : null;
        if (!first?.uri) return null;
        const feedRes = await fetch(
          `https://bsky.social/xrpc/app.bsky.feed.getFeed?feed=${encodeURIComponent(first.uri)}&limit=25${
            cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""
          }`,
          { headers }
        );
        if (!feedRes.ok) return null;
        const data = await feedRes.json();
        return {
          items: mapFeedItems(data?.feed || [], first.displayName || first.name || "Discover"),
          cursor: data?.cursor,
        };
      };

      const tryPublicPopular = async () => {
        const genRes = await fetch(
          "https://public.api.bsky.app/xrpc/app.bsky.unspecced.getPopularFeedGenerators?limit=10"
        );
        if (!genRes.ok) throw new Error("Failed to load Discover feeds");
        const genData = await genRes.json();
        const first = Array.isArray(genData?.feeds) && genData.feeds.length ? genData.feeds[0] : null;
        if (!first?.uri) throw new Error("No Discover feed available");
        const feedRes = await fetch(
          `https://public.api.bsky.app/xrpc/app.bsky.feed.getFeed?feed=${encodeURIComponent(first.uri)}&limit=25${
            cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""
          }`
        );
        if (!feedRes.ok) {
          const detail = await feedRes.text().catch(() => "");
          throw new Error(`Failed to load Discover feed: ${feedRes.status} ${detail}`.trim());
        }
        const data = await feedRes.json();
        return {
          items: mapFeedItems(data?.feed || [], first.displayName || first.name || "Discover"),
          cursor: data?.cursor,
        };
      };

      const authed = await tryAuthSuggested().catch(() => null);
      if (authed) return authed;
      return tryPublicPopular();
    },
    [getSessionAuth, mapFeedItems]
  );

  const fetchFollowing = useCallback(async (cursor?: string) => {
    const { headers } = await getSessionAuth();
    const res = await fetch(
      `https://bsky.social/xrpc/app.bsky.feed.getTimeline?limit=25${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      { headers }
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Failed to load Following: ${res.status} ${detail}`.trim());
    }
    const data = await res.json();
    return { items: mapFeedItems(data?.feed || [], "Following"), cursor: data?.cursor };
  }, [getSessionAuth, mapFeedItems]);

  const fetchMutuals = useCallback(async (cursor?: string) => {
    const { headers } = await getSessionAuth();
    const mutualsUri = "at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/mutuals";
    const res = await fetch(
      `https://bsky.social/xrpc/app.bsky.feed.getFeed?feed=${encodeURIComponent(mutualsUri)}&limit=25${
        cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""
      }`,
      { headers }
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Failed to load Mutuals: ${res.status} ${detail}`.trim());
    }
    const data = await res.json();
    return { items: mapFeedItems(data?.feed || [], "Mutuals"), cursor: data?.cursor };
  }, [getSessionAuth, mapFeedItems]);

  const fetchTimeline = useCallback(async () => {
    const { headers, handle } = await getSessionAuth();
    if (!handle) throw new Error("Missing handle");

    const pinnedRes = await fetch(
      `https://bsky.social/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(handle)}&limit=5&filter=pinned`,
      { headers }
    );
    const pinnedJson = pinnedRes.ok ? await pinnedRes.json() : { feed: [] };
    const pinnedItems = mapFeedItems(pinnedJson?.feed || [], "Pinned");

    const feedRes = await fetch(
      `https://bsky.social/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(
        handle
      )}&limit=10&filter=posts_with_replies`,
      { headers }
    );
    if (!feedRes.ok) {
      const detail = await feedRes.text().catch(() => "");
      throw new Error(`Failed to load timeline: ${feedRes.status} ${detail}`.trim());
    }
    const feedJson = await feedRes.json();
    const feedItems = mapFeedItems(feedJson?.feed || [], "Your timeline");

    const deduped = new Map<string, DiscoverItem>();
    pinnedItems.forEach((item) => {
      if (item.uri) deduped.set(item.uri, item);
    });
    feedItems.forEach((item) => {
      if (item.uri && !deduped.has(item.uri)) deduped.set(item.uri, item);
    });

    return { items: Array.from(deduped.values()).slice(0, 5) };
  }, [getSessionAuth, mapFeedItems]);

  const handleLike = useCallback(
    async (item: DiscoverItem) => {
      if (!item?.uri || !item?.cid) return;
      const key = cardKey(item);
      setLikeErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      setLikeState((prev) => ({ ...prev, [key]: "loading" }));
      try {
        const identifier = typeof window !== "undefined" ? window.localStorage.getItem("bsky-handle") : "";
        const appPassword = typeof window !== "undefined" ? window.localStorage.getItem("bsky-app-password") : "";
        if (!identifier || !appPassword) {
          throw new Error("Store your Bluesky handle and app password to like posts.");
        }
        const res = await fetch("/api/bluesky/like", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifier, appPassword, subjectUri: item.uri, subjectCid: item.cid }),
        });
        if (!res.ok) {
          const detail = await res.json().catch(() => null);
          throw new Error(detail?.error || "Failed to like post");
        }
        setLikeState((prev) => ({ ...prev, [key]: "liked" }));
      } catch (err: any) {
          setLikeState((prev) => ({ ...prev, [key]: "error" }));
          setLikeErrors((prev) => ({ ...prev, [key]: err?.message || "Failed to like" }));
      }
    },
    [cardKey]
  );

  const fetchTab = useCallback(
    async (tab: FeedTab, append = false) => {
      if (!enabled) return;
      if (loadingTab === tab) return;
      setLoadingTab(tab);
      setError(null);
      if (!append) {
        setItemsByTab((prev) => ({ ...prev, [tab]: [] }));
      }
      try {
        let result: DiscoverItem[] = [];
        let nextCursor: string | undefined = undefined;
        if (tab === "timeline") {
          const { items } = await fetchTimeline();
          result = items;
          nextCursor = undefined;
        } else if (tab === "discover") {
          const { items, cursor } = await fetchDiscover(cursorByTab[tab]);
          result = items;
          nextCursor = cursor;
        } else if (tab === "following") {
          const { items, cursor } = await fetchFollowing(cursorByTab[tab]);
          result = items;
          nextCursor = cursor;
        } else if (tab === "mutuals") {
          const { items, cursor } = await fetchMutuals(cursorByTab[tab]);
          result = items;
          nextCursor = cursor;
        }
        setItemsByTab((prev) => ({
          ...prev,
          [tab]: append ? [...(prev[tab] || []), ...result] : result,
        }));
        setCursorByTab((prev) => ({ ...prev, [tab]: nextCursor }));
        setExhausted((prev) => ({ ...prev, [tab]: tab === "timeline" ? true : !nextCursor }));
      } catch (err: any) {
        setError(err?.message || "Failed to load feed");
      } finally {
        setLoadingTab((current) => (current === tab ? null : current));
      }
    },
    [cursorByTab, enabled, fetchDiscover, fetchFollowing, fetchMutuals, fetchTimeline, loadingTab]
  );

  useEffect(() => {
    if (!enabled || !showDiscover) return;
    void fetchTab(activeTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, enabled, showDiscover]);

  const items = itemsByTab[activeTab] || [];

  const tabLabel = useMemo(
    () => ({
      timeline: "Timeline",
      discover: "Discover",
      following: "Following",
      mutuals: "Mutuals",
    }),
    []
  );

  const scrollEl = scrollRef.current;

  const maybeLoadMore = useCallback(() => {
    if (!scrollRef.current) return;
    if (loadingTab === activeTab) return;
    if (exhausted[activeTab]) return;
    const el = scrollRef.current;
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (remaining < 200) {
      void fetchTab(activeTab, true);
    }
  }, [activeTab, exhausted, fetchTab, loadingTab]);

  useEffect(() => {
    if (!enabled || !showDiscover) return;
    const el = scrollRef.current;
    if (!el) return;
    let raf: number;
    const step = () => {
      if (!el) return;
      if (!pauseAuto) {
        el.scrollTop += 1;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4 && exhausted[activeTab]) {
          el.scrollTop = 0;
        }
        maybeLoadMore();
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [activeTab, enabled, exhausted, maybeLoadMore, pauseAuto, showDiscover]);

  if (!enabled) return null;

  return (
    <div className="space-y-4 w-full lg:max-w-[520px]">
      <div className="mt-2 bg-white border border-gray-200 shadow-sm rounded-md">
        <div className="p-3 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {(["timeline", "discover", "following", "mutuals"] as FeedTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`rounded px-2 py-1 text-xs font-semibold ${
                  activeTab === tab ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
                }`}
              >
                {tabLabel[tab]}
              </button>
            ))}
          </div>
          <button
            className="text-xs font-semibold text-slate-700 underline"
            onClick={() => setShowDiscover((v) => !v)}
          >
            {showDiscover ? "Hide feed" : "Show feed"}
          </button>
        </div>
        <div
          className="overflow-hidden transition-[max-height,opacity] duration-150 ease-out"
          style={{
            maxHeight: showDiscover ? "1200px" : "0px",
            opacity: showDiscover ? 1 : 0,
            pointerEvents: showDiscover ? "auto" : "none",
          }}
        >
          <div
            className="h-[600px] lg:h-[calc(100vh-240px)] overflow-y-auto p-3 space-y-3 bg-white rounded-b-md"
            style={{ scrollbarGutter: "stable both-edges" }}
            ref={scrollRef}
            onMouseEnter={() => setPauseAuto(true)}
            onMouseLeave={() => setPauseAuto(false)}
            onScroll={maybeLoadMore}
          >
            {loadingTab === activeTab && <div className="text-sm text-slate-500">Loading {tabLabel[activeTab]}…</div>}
            {error && <div className="text-sm text-red-600">{error}</div>}
            {loadingTab !== activeTab && !error && items.length === 0 && (
              <div className="text-sm text-slate-500">No posts found yet.</div>
            )}
            {items.map((item, idx) => {
              const key = cardKey(item);
              const timestamp = formatTimestamp(item.indexedAt);
              const likeStatus = likeState[key] || "idle";
              return (
                <div
                  key={`${item.uri || "item"}-${idx}`}
                  role="button"
                  tabIndex={0}
                  className="w-full text-left rounded-2xl border border-gray-200 bg-gray-50/90 hover:bg-white p-4 shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-400 transition-colors"
                  onClick={() => onSelect(item)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(item);
                    }
                  }}
                >
                  {item.reply && (
                    <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="text-xs font-semibold text-slate-600">
                        Replying to{" "}
                        <span className="text-slate-900">
                          {item.reply.parentAuthorDisplay || item.reply.parentAuthorHandle || "unknown"}
                        </span>
                        {item.reply.rootAuthorHandle && item.reply.rootAuthorHandle !== item.reply.parentAuthorHandle && (
                          <span className="ml-1 text-slate-500">
                            in thread by{" "}
                            <span className="text-slate-900">
                              {item.reply.rootAuthorDisplay || item.reply.rootAuthorHandle}
                            </span>
                          </span>
                        )}
                      </div>
                      {item.reply.parentText && (
                        <div className="mt-2 text-base italic text-slate-700 leading-relaxed">
                          “{item.reply.parentText}”
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-base text-slate-900">
                        {item.authorDisplay || item.authorHandle}
                      </div>
                      <div className="text-xs text-slate-500">
                        @{item.authorHandle}
                        {timestamp && <span className="ml-1">• {timestamp}</span>}
                      </div>
                    </div>
                    {item.feedName && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                        {item.feedName}
                      </span>
                    )}
                  </div>
                  <p className="mt-3 text-[0.95rem] leading-relaxed text-slate-900 whitespace-pre-wrap break-words">
                    {item.contentSummary || item.text || "(no text)"}
                  </p>
                  {Array.isArray(item.images) && item.images.length > 0 && (
                    <div className="mt-3 grid grid-cols-1 gap-3">
                      {item.images.slice(0, 4).map((img: any, imageIdx: number) => (
                        <div key={imageIdx} className="relative overflow-hidden rounded-xl border border-gray-200 bg-white">
                          {img?.thumb ? (
                            <Image
                              src={img.thumb}
                              alt={img.alt || "Discover image"}
                              width={900}
                              height={600}
                              className="w-full h-auto object-cover"
                            />
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleLike(item);
                      }}
                      disabled={likeStatus === "loading" || likeStatus === "liked"}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                        likeStatus === "liked"
                          ? "border-green-500 bg-green-50 text-green-700"
                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      }`}
                    >
                      {likeStatus === "loading" ? "Liking..." : likeStatus === "liked" ? "Liked" : "Like"}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(item);
                      }}
                      className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Reply via Composer
                    </button>
                  </div>
                  {likeErrors[key] && (
                    <div className="mt-2 text-xs text-rose-600">{likeErrors[key]}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
