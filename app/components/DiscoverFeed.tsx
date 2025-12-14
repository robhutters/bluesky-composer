"use client";

import { useCallback, useEffect, useState } from "react";
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

export default function DiscoverFeed({
  enabled,
  onSelect,
}: {
  enabled: boolean;
  onSelect: (item: DiscoverItem) => void;
}) {
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [discoverFeed, setDiscoverFeed] = useState<DiscoverItem[]>([]);
  const [suggestedFeeds, setSuggestedFeeds] = useState<any[]>([]);
  const [selectedFeed, setSelectedFeed] = useState<string | null>(null);
  const [showDiscover, setShowDiscover] = useState(true);

  const fetchSuggestedFeeds = useCallback(async () => {
    setDiscoverError(null);
    try {
      const res = await fetch("https://public.api.bsky.app/xrpc/app.bsky.feed.getSuggestedFeeds?limit=50");
      if (!res.ok) throw new Error("Failed to load Discover feeds");
      const data = await res.json();
      const feeds = Array.isArray(data?.feeds) ? data.feeds : [];
      setSuggestedFeeds(feeds);
      if (!selectedFeed && feeds.length) {
        setSelectedFeed(feeds[0]?.uri || null);
      }
    } catch (err: any) {
      setDiscoverError(err?.message || "Failed to load Discover feeds");
    }
  }, [selectedFeed]);

  const fetchDiscoverFeed = useCallback(
    async (feedUri?: string) => {
      if (!enabled) return;
      const feedToUse = feedUri || selectedFeed;
      if (!feedToUse) return;
      setDiscoverLoading(true);
      setDiscoverError(null);
      try {
        const publicUrl = `https://public.api.bsky.app/xrpc/app.bsky.feed.getFeed?feed=${encodeURIComponent(feedToUse)}&limit=25`;
        const doAuthFetch = async () => {
          const handle = typeof window !== "undefined" ? window.localStorage.getItem("bsky-handle") : "";
          const appPassword = typeof window !== "undefined" ? window.localStorage.getItem("bsky-app-password") : "";
          if (!handle || !appPassword) {
            throw new Error("This feed needs an app password. Add your Bluesky handle + app password.");
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
          const authUrl = `https://bsky.social/xrpc/app.bsky.feed.getFeed?feed=${encodeURIComponent(feedToUse)}&limit=25`;
          const authed = await fetch(authUrl, { headers: { Authorization: `Bearer ${accessJwt}` } });
          if (!authed.ok) {
            const detail = await authed.text().catch(() => "");
            throw new Error(`Failed to load feed: ${authed.status} ${detail}`.trim());
          }
          return authed.json();
        };

        const res = await fetch(publicUrl);
        let data;
        if (res.status === 401) {
          data = await doAuthFetch();
        } else if (!res.ok) {
          const detail = await res.text().catch(() => "");
          throw new Error(`Failed to load feed: ${res.status} ${detail}`.trim());
        } else {
          data = await res.json();
        }
        const items: DiscoverItem[] =
          data?.feed?.map((item: any) => {
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
              createdAt: record?.createdAt || "",
              feedUri: feedToUse,
              feedName:
                suggestedFeeds.find((f: any) => f?.uri === feedToUse)?.displayName ||
                suggestedFeeds.find((f: any) => f?.uri === feedToUse)?.name ||
                "Discover",
              images,
            };
          }) || [];
        setDiscoverFeed(items);
      } catch (err: any) {
        setDiscoverError(err?.message || "Failed to load feed");
      } finally {
        setDiscoverLoading(false);
      }
    },
    [enabled, selectedFeed, suggestedFeeds]
  );

  useEffect(() => {
    if (!enabled) return;
    if (!suggestedFeeds.length) {
      void fetchSuggestedFeeds();
    }
  }, [enabled, fetchSuggestedFeeds, suggestedFeeds.length]);

  useEffect(() => {
    if (!enabled) return;
    if (selectedFeed) {
      void fetchDiscoverFeed(selectedFeed);
    }
  }, [enabled, fetchDiscoverFeed, selectedFeed]);

  if (!enabled) return null;

  return (
    <div className="space-y-4">
      <div className="mt-2 bg-white border border-gray-200 shadow-sm rounded-md">
        <div className="p-3 border-b border-gray-200 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-900">Discover tab (PRO)</div>
            <div className="text-[11px] text-slate-500">Browse feeds, pick one, tap to reply.</div>
          </div>
          <button
            className="text-xs font-semibold text-slate-700 underline"
            onClick={() => setShowDiscover((v) => !v)}
          >
            {showDiscover ? "Hide feed" : "Show feed"}
          </button>
        </div>
        <div
          className="border-b border-gray-200 overflow-hidden transition-[max-height,opacity] duration-150 ease-out"
          style={{
            maxHeight: showDiscover ? "1200px" : "0px",
            opacity: showDiscover ? 1 : 0,
            pointerEvents: showDiscover ? "auto" : "none",
          }}
        >
          <div className="p-3 space-y-2">
            <label className="text-xs font-semibold text-slate-700">Choose feed</label>
            <select
              value={selectedFeed || ""}
              onChange={(e) => {
                const next = e.target.value || null;
                setSelectedFeed(next);
                if (next) {
                  void fetchDiscoverFeed(next);
                }
              }}
              className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm"
            >
              <option value="">Select a feed</option>
              {suggestedFeeds.map((f: any) => (
                <option key={f.uri} value={f.uri}>
                  {f.displayName || f.name || f.uri}
                </option>
              ))}
            </select>
            {selectedFeed && (
              <div className="text-[11px] text-slate-500">
                Viewing: {suggestedFeeds.find((f: any) => f.uri === selectedFeed)?.description || "Feed posts"}
              </div>
            )}
          </div>
          <div
            className="h-[600px] lg:h-[calc(100vh-240px)] overflow-y-auto p-3 space-y-3 bg-white rounded-b-md"
            style={{ scrollbarGutter: "stable both-edges" }}
          >
            {discoverLoading && <div className="text-sm text-slate-500">Loading feed…</div>}
            {discoverError && <div className="text-sm text-red-600">{discoverError}</div>}
            {!discoverLoading && !discoverError && discoverFeed.length === 0 && (
              <div className="text-sm text-slate-500">No posts found yet.</div>
            )}
            {discoverFeed.map((item) => (
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
