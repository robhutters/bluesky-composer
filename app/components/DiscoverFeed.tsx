"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<DiscoverItem[]>([]);
  const [showDiscover, setShowDiscover] = useState(true);
  const [activeTab, setActiveTab] = useState<FeedTab>("discover");
  const [fetchedTabs, setFetchedTabs] = useState<Set<FeedTab>>(new Set());

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

  const fetchDiscover = useCallback(async () => {
    const genRes = await fetch("https://public.api.bsky.app/xrpc/app.bsky.unspecced.getPopularFeedGenerators?limit=10");
    if (!genRes.ok) throw new Error("Failed to load Discover feeds");
    const genData = await genRes.json();
    const first = Array.isArray(genData?.feeds) && genData.feeds.length ? genData.feeds[0] : null;
    if (!first?.uri) throw new Error("No Discover feed available");
    const feedRes = await fetch(
      `https://public.api.bsky.app/xrpc/app.bsky.feed.getFeed?feed=${encodeURIComponent(first.uri)}&limit=25`
    );
    if (!feedRes.ok) {
      const detail = await feedRes.text().catch(() => "");
      throw new Error(`Failed to load Discover feed: ${feedRes.status} ${detail}`.trim());
    }
    const data = await feedRes.json();
    return mapFeedItems(data?.feed || [], first.displayName || first.name || "Discover");
  }, [mapFeedItems]);

  const fetchFollowing = useCallback(async () => {
    const headers = await getAuthHeaders();
    const res = await fetch("https://bsky.social/xrpc/app.bsky.feed.getTimeline?limit=25", { headers });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Failed to load Following: ${res.status} ${detail}`.trim());
    }
    const data = await res.json();
    return mapFeedItems(data?.feed || [], "Following");
  }, [mapFeedItems]);

  const fetchMutuals = useCallback(async () => {
    const headers = await getAuthHeaders();
    const mutualsUri = "at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/mutuals";
    const res = await fetch(
      `https://bsky.social/xrpc/app.bsky.feed.getFeed?feed=${encodeURIComponent(mutualsUri)}&limit=25`,
      { headers }
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Failed to load Mutuals: ${res.status} ${detail}`.trim());
    }
    const data = await res.json();
    return mapFeedItems(data?.feed || [], "Mutuals");
  }, [mapFeedItems]);

  const fetchTab = useCallback(
    async (tab: FeedTab) => {
      if (!enabled) return;
      setLoading(true);
      setError(null);
      try {
        let result: DiscoverItem[] = [];
        if (tab === "discover") result = await fetchDiscover();
        if (tab === "following") result = await fetchFollowing();
        if (tab === "mutuals") result = await fetchMutuals();
        setItems(result);
        setFetchedTabs((prev) => new Set([...prev, tab]));
      } catch (err: any) {
        setError(err?.message || "Failed to load feed");
      } finally {
        setLoading(false);
      }
    },
    [enabled, fetchDiscover, fetchFollowing, fetchMutuals]
  );

  useEffect(() => {
    if (!enabled) return;
    if (!fetchedTabs.has(activeTab)) {
      void fetchTab(activeTab);
    }
  }, [activeTab, enabled, fetchTab, fetchedTabs]);

  const tabLabel = useMemo(
    () => ({
      discover: "Discover",
      following: "Following",
      mutuals: "Mutuals",
    }),
    []
  );

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
          >
            {loading && <div className="text-sm text-slate-500">Loading {tabLabel[activeTab]}…</div>}
            {error && <div className="text-sm text-red-600">{error}</div>}
            {!loading && !error && items.length === 0 && (
              <div className="text-sm text-slate-500">No posts found yet.</div>
            )}
            {items.map((item) => (
              <button
                key={item.uri}
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
