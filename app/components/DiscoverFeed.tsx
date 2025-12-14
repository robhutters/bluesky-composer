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
};

type FeedTab = "discover" | "following" | "mutuals";

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
    discover: [],
    following: [],
    mutuals: [],
  });
  const [showDiscover, setShowDiscover] = useState(true);
  const [activeTab, setActiveTab] = useState<FeedTab>("discover");
  const [cursorByTab, setCursorByTab] = useState<Record<FeedTab, string | undefined>>({
    discover: undefined,
    following: undefined,
    mutuals: undefined,
  });
  const [exhausted, setExhausted] = useState<Record<FeedTab, boolean>>({
    discover: false,
    following: false,
    mutuals: false,
  });
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [pauseAuto, setPauseAuto] = useState(false);

  const getAuthHeaders = async () => {
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
    return { Authorization: `Bearer ${accessJwt}` };
  };

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
        return {
          uri: post?.uri,
          cid: post?.cid,
          text: record?.text || "",
          authorHandle: post?.author?.handle || "",
          authorDisplay: post?.author?.displayName || post?.author?.handle || "",
          feedName,
          images,
        };
      }) || [],
    []
  );

  const fetchDiscover = useCallback(
    async (cursor?: string) => {
      // Try authenticated suggested feeds for a more personalized "discover" experience; fall back to public popular feeds.
      const tryAuthSuggested = async () => {
        const headers = await getAuthHeaders();
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
    [getAuthHeaders, mapFeedItems]
  );

  const fetchFollowing = useCallback(async (cursor?: string) => {
    const headers = await getAuthHeaders();
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
  }, [mapFeedItems]);

  const fetchMutuals = useCallback(async (cursor?: string) => {
    const headers = await getAuthHeaders();
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
  }, [mapFeedItems]);

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
        if (tab === "discover") {
          const { items, cursor } = await fetchDiscover(cursorByTab[tab]);
          result = items;
          nextCursor = cursor;
        }
        if (tab === "following") {
          const { items, cursor } = await fetchFollowing(cursorByTab[tab]);
          result = items;
          nextCursor = cursor;
        }
        if (tab === "mutuals") {
          const { items, cursor } = await fetchMutuals(cursorByTab[tab]);
          result = items;
          nextCursor = cursor;
        }
        setItemsByTab((prev) => ({
          ...prev,
          [tab]: append ? [...(prev[tab] || []), ...result] : result,
        }));
        setCursorByTab((prev) => ({ ...prev, [tab]: nextCursor }));
        setExhausted((prev) => ({ ...prev, [tab]: !nextCursor }));
      } catch (err: any) {
        setError(err?.message || "Failed to load feed");
      } finally {
        setLoadingTab((current) => (current === tab ? null : current));
      }
    },
    [cursorByTab, enabled, fetchDiscover, fetchFollowing, fetchMutuals, loadingTab]
  );

  useEffect(() => {
    if (!enabled || !showDiscover) return;
    void fetchTab(activeTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, enabled, showDiscover]);

  const items = itemsByTab[activeTab] || [];

  const tabLabel = useMemo(
    () => ({
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
    <div className="space-y-4">
      <div className="mt-2 bg-white border border-gray-200 shadow-sm rounded-md">
        <div className="p-3 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {(["discover", "following", "mutuals"] as FeedTab[]).map((tab) => (
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
            {items.map((item, idx) => (
              <button
                key={`${item.uri || "item"}-${idx}`}
                className="w-full text-left rounded border border-gray-200 bg-gray-50 hover:bg-gray-100 p-3 shadow-sm"
                onClick={() => {
                  onSelect(item);
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold text-slate-900 text-sm">
                    {item.authorDisplay || item.authorHandle}
                  </div>
                  <span className="text-[11px] text-slate-500">{item.authorHandle}</span>
                </div>
                <p className="mt-2 text-sm text-slate-800 whitespace-pre-wrap break-words">{item.text || "(no text)"}</p>
                {Array.isArray(item.images) && item.images.length > 0 && (
                  <div className="mt-3 grid grid-cols-1 gap-3">
                    {item.images.slice(0, 4).map((img: any, idx: number) => (
                      <div key={idx} className="relative overflow-hidden rounded-lg border border-gray-200 bg-white">
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
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
