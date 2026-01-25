"use client";

import { useMemo, useState } from "react";
import { SessionRecord } from "./ReadingSessionCard";

type Props = {
  sessions: SessionRecord[];
};

type GenreSlice = { label: string; value: number };

export default function GamingAnalytics({ sessions }: Props) {
  const [posting, setPosting] = useState<string | null>(null);
  const [postMessage, setPostMessage] = useState<string | null>(null);
  const [pendingPost, setPendingPost] = useState<{ id: string; title: string; text: string } | null>(null);

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const totals = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const today = sessions.filter((s) => s.id >= todayStart.getTime()).length;
    const last7 = sessions.filter((s) => s.id >= now - 7 * dayMs).length;
    const last30 = sessions.filter((s) => s.id >= now - 30 * dayMs).length;
    const last365 = sessions.filter((s) => s.id >= now - 365 * dayMs).length;
    return { today, last7, last30, last365 };
  }, [sessions, now, dayMs]);

  const weekBars = useMemo(() => {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const counts = Array(7).fill(0);
    sessions.forEach((s) => {
      const d = new Date(s.id);
      const idx = (d.getDay() + 6) % 7; // Monday=0
      counts[idx] += 1;
    });
    return days.map((label, idx) => ({ label, value: counts[idx] }));
  }, [sessions]);

  const trend = useMemo(() => {
    const map = new Map<string, number>();
    sessions.forEach((s) => {
      const d = new Date(s.id);
      const key = d.toISOString().slice(0, 10);
      map.set(key, (map.get(key) || 0) + 1);
    });
    const entries = Array.from(map.entries()).sort(([a], [b]) => (a < b ? -1 : 1));
    return entries.slice(-60).map(([date, value]) => ({ date, value }));
  }, [sessions]);

  const genreSlices: GenreSlice[] = useMemo(() => {
    const map = new Map<string, number>();
    sessions.forEach((s) => {
      const key = s.genre || "Other";
      map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [sessions]);

  const topGames = useMemo(() => {
    const map = new Map<string, { count: number; display: string }>();
    sessions.forEach((s) => {
      const rawTitle = s.gameTitle || "Untitled";
      const canonical = s.canonicalTitle || rawTitle.toLowerCase();
      if (!map.has(canonical)) {
        map.set(canonical, { count: 0, display: rawTitle });
      }
      const entry = map.get(canonical)!;
      entry.count += 1;
      map.set(canonical, { count: entry.count, display: rawTitle });
    });
    return Array.from(map.entries())
      .map(([_, v]) => ({ title: v.display, value: v.count }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 3);
  }, [sessions]);

  const hoursTotals = useMemo(() => {
    const toHours = (rangeMs: number) =>
      sessions
        .filter((s) => s.id >= now - rangeMs)
        .reduce((sum, s) => sum + s.durationMs / (1000 * 60 * 60), 0);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const today = sessions
      .filter((s) => s.id >= todayStart.getTime())
      .reduce((sum, s) => sum + s.durationMs / (1000 * 60 * 60), 0);
    return {
      today,
      last7: toHours(7 * dayMs),
      last30: toHours(30 * dayMs),
      last365: toHours(365 * dayMs),
    };
  }, [sessions, now, dayMs]);

  const streaks = useMemo(() => {
    const days = new Set<string>();
    sessions.forEach((s) => {
      const key = new Date(s.id).toISOString().slice(0, 10);
      days.add(key);
    });
    const sorted = Array.from(days).sort((a, b) => (a < b ? -1 : 1));
    let current = 0;
    let longest = 0;
    let prev: string | null = null;
    sorted.forEach((d) => {
      if (!prev) {
        current = 1;
      } else {
        const diff = (Date.parse(d) - Date.parse(prev)) / dayMs;
        if (diff === 1) {
          current += 1;
        } else {
          current = 1;
        }
      }
      longest = Math.max(longest, current);
      prev = d;
    });
    return { current, longest };
  }, [sessions, dayMs]);

  const weeklyComparison = useMemo(() => {
    const weekMs = 7 * dayMs;
    const thisWeekStart = now - weekMs;
    const lastWeekStart = now - 2 * weekMs;
    const sumRange = (start: number, end: number) =>
      sessions
        .filter((s) => s.id >= start && s.id < end)
        .reduce(
          (acc, s) => ({
            count: acc.count + 1,
            hours: acc.hours + s.durationMs / (1000 * 60 * 60),
          }),
          { count: 0, hours: 0 },
        );
    const current = sumRange(thisWeekStart, now);
    const previous = sumRange(lastWeekStart, thisWeekStart);
    const deltaCount = previous.count === 0 ? (current.count > 0 ? 100 : 0) : ((current.count - previous.count) / previous.count) * 100;
    const deltaHours = previous.hours === 0 ? (current.hours > 0 ? 100 : 0) : ((current.hours - previous.hours) / previous.hours) * 100;
    return { current, previous, deltaCount, deltaHours };
  }, [sessions, now, dayMs]);

  const heatmap = useMemo(() => {
    const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
    sessions.forEach((s) => {
      const d = new Date(s.id);
      const dayIdx = (d.getDay() + 6) % 7; // Monday = 0
      const hour = d.getHours();
      grid[dayIdx][hour] += 1;
    });
    return grid;
  }, [sessions]);

  const postSummary = async (text: string) => {
    if (!text) return;
    setPosting(text);
    setPostMessage(null);
    try {
      const handle = typeof window !== "undefined" ? window.localStorage.getItem("bsky-handle") : "";
      const appPassword = typeof window !== "undefined" ? window.localStorage.getItem("bsky-app-password") : "";
      if (!handle || !appPassword) {
        setPostMessage("Add your Bluesky handle + app password in the Composer first.");
        setPosting(null);
        return;
      }
      const res = await fetch("/api/bluesky/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: handle,
          appPassword,
          text,
          images: [],
          replyControl: "anyone",
          replyListUri: "",
          replyTarget: null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to post");
      setPostMessage("Posted to Bluesky ✔️");
    } catch (err: any) {
      setPostMessage(err?.message || "Failed to post");
    } finally {
      setTimeout(() => setPostMessage(null), 3000);
      setPosting(null);
    }
  };

  const charts: { id: string; title: string; summary: string }[] = [
    {
      id: "totals",
      title: "Playtime totals",
      summary: `Playtime totals — Today: ${totals.today} sessions (${hoursTotals.today.toFixed(1)}h). 7d: ${totals.last7} sessions (${hoursTotals.last7.toFixed(1)}h). 30d: ${totals.last30} sessions (${hoursTotals.last30.toFixed(1)}h). Year: ${totals.last365} sessions (${hoursTotals.last365.toFixed(1)}h).`,
    },
    {
      id: "week",
      title: "Sessions by weekday",
      summary: `Sessions by weekday — ${weekBars.map((b) => `${b.label}: ${b.value}`).join(", ")}.`,
    },
    {
      id: "trend",
      title: "Sessions trend",
      summary:
        trend.length === 0
          ? "No sessions yet to chart a trend."
          : `Sessions trend — ${trend.length} days tracked, ${trend.reduce((s, t) => s + t.value, 0)} total sessions. Best day: ${
              trend.reduce((best, cur) => (cur.value > best.value ? cur : best), trend[0]).date
            } with ${
              trend.reduce((best, cur) => (cur.value > best.value ? cur : best), trend[0]).value
            } sessions.`,
    },
  ];

  return (
    <div className="w-full space-y-4">
      {postMessage && <div className="text-sm text-slate-600">{postMessage}</div>}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 auto-rows-fr">
        {charts.map((chart) => (
          <div key={chart.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3 h-full">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-800">{chart.title}</h4>
              <button
                className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
                onClick={() => {
                  setPendingPost({ id: chart.id, title: chart.title, text: chart.summary });
                  setPostMessage("Preview ready below. Confirm to post.");
                }}
                disabled={posting !== null || sessions.length === 0}
              >
                {posting ? "Posting…" : "Preview & post"}
              </button>
            </div>
            {chart.id === "totals" ? (
              <div className="grid grid-cols-2 gap-2 text-sm text-slate-800">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-xs text-slate-500">Today</div>
                  <div className="text-lg font-semibold">{totals.today}</div>
                  <div className="text-xs text-slate-500">{hoursTotals.today.toFixed(1)}h</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-xs text-slate-500">Last 7 days</div>
                  <div className="text-lg font-semibold">{totals.last7}</div>
                  <div className="text-xs text-slate-500">{hoursTotals.last7.toFixed(1)}h</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-xs text-slate-500">Last 30 days</div>
                  <div className="text-lg font-semibold">{totals.last30}</div>
                  <div className="text-xs text-slate-500">{hoursTotals.last30.toFixed(1)}h</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-xs text-slate-500">Last year</div>
                  <div className="text-lg font-semibold">{totals.last365}</div>
                  <div className="text-xs text-slate-500">{hoursTotals.last365.toFixed(1)}h</div>
                </div>
              </div>
            ) : chart.id === "week" ? (
              <div className="flex items-end justify-between gap-2">
                {weekBars.map((b) => (
                  <div key={b.label} className="flex-1">
                    <div
                      className="w-full rounded-t-md bg-sky-500"
                      style={{ height: `${Math.max(8, b.value * 24)}px` }}
                      title={`${b.value} sessions`}
                    />
                    <div className="pt-1 text-center text-xs font-semibold text-slate-700">{b.label}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-40 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center text-sm text-slate-600">
                {trend.length === 0 ? "No data yet." : `${trend.length} days of activity tracked.`}
              </div>
            )}
          </div>
        ))}
      </div>

      {pendingPost && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Preview</p>
              <h4 className="text-base font-semibold text-slate-900">{pendingPost.title}</h4>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-700">Are you sure?</span>
              <button
                onClick={() => {
                  setPendingPost(null);
                  setPostMessage(null);
                }}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                No
              </button>
              <button
                onClick={async () => {
                  const current = pendingPost;
                  if (!current) return;
                  await postSummary(current.text);
                  setPendingPost(null);
                }}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
                disabled={posting !== null}
              >
                Yes, post
              </button>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm whitespace-pre-wrap text-slate-800">{pendingPost.text}</p>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-800">Genre split</h4>
            <button
              className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
              onClick={() => {
                const summary =
                  genreSlices.length === 0
                    ? "No sessions yet."
                    : `Genre split — ${genreSlices.slice(0, 6).map((g) => `${g.label}: ${g.value}`).join(", ")}.`;
                setPendingPost({ id: "genre", title: "Genre split", text: summary });
                setPostMessage("Preview ready below. Confirm to post.");
              }}
              disabled={posting !== null || sessions.length === 0}
            >
              {posting ? "Posting…" : "Preview & post"}
            </button>
          </div>
          <div className="space-y-2 text-sm text-slate-800">
            {genreSlices.length === 0 ? (
              <p className="text-slate-600">No sessions yet.</p>
            ) : (
              genreSlices.slice(0, 6).map((g) => (
                <div key={g.label} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <span>{g.label}</span>
                  <span className="font-semibold">{g.value}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-800">Streaks & goals</h4>
            <button
              className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
              onClick={() => {
                const summary = `Streaks — Current: ${streaks.current} days, longest: ${streaks.longest} days. This week: ${weeklyComparison.current.count} sessions (${weeklyComparison.current.hours.toFixed(1)}h) vs last week: ${weeklyComparison.previous.count} sessions (${weeklyComparison.previous.hours.toFixed(1)}h), change ${weeklyComparison.deltaCount.toFixed(1)}% sessions, ${weeklyComparison.deltaHours.toFixed(1)}% hours.`;
                setPendingPost({ id: "streaks", title: "Streaks & goals", text: summary });
                setPostMessage("Preview ready below. Confirm to post.");
              }}
              disabled={posting !== null || sessions.length === 0}
            >
              {posting ? "Posting…" : "Preview & post"}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm text-slate-800">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-xs text-slate-500">Current streak</div>
              <div className="text-lg font-semibold">{streaks.current} days</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-xs text-slate-500">Longest streak</div>
              <div className="text-lg font-semibold">{streaks.longest} days</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 col-span-2">
              <div className="text-xs text-slate-500">This week vs last</div>
              <div className="text-sm font-semibold">
                {weeklyComparison.current.count} vs {weeklyComparison.previous.count} sessions ({weeklyComparison.deltaCount.toFixed(1)}%)
              </div>
              <div className="text-xs text-slate-600">
                Hours: {weeklyComparison.current.hours.toFixed(1)} vs {weeklyComparison.previous.hours.toFixed(1)} ({weeklyComparison.deltaHours.toFixed(1)}%)
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-800">Top games</h4>
            <button
              className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
              onClick={() => {
                const summary =
                  topGames.length === 0
                    ? "No games yet."
                    : `Top games — ${topGames.map((g) => `${g.title}: ${g.value} sessions`).join(", ")}.`;
                setPendingPost({ id: "top-games", title: "Top games", text: summary });
                setPostMessage("Preview ready below. Confirm to post.");
              }}
              disabled={posting !== null || sessions.length === 0}
            >
              {posting ? "Posting…" : "Preview & post"}
            </button>
          </div>
          <div className="space-y-2 text-sm text-slate-800">
            {topGames.length === 0 ? (
              <p className="text-slate-600">No games yet.</p>
            ) : (
              topGames.map((g) => (
                <div key={g.title} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <span className="line-clamp-1">{g.title}</span>
                  <span className="font-semibold">{g.value}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3 md:col-span-2 xl:col-span-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-800">Time of day heatmap</h4>
          </div>
          <div className="w-full overflow-x-auto">
            <div
              className="grid gap-1 text-[10px] text-slate-700 min-w-full"
              style={{
                gridTemplateColumns: "70px repeat(7, minmax(30px,1fr))",
              }}
            >
              <div />
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <div key={`head-${d}`} className="text-center text-slate-500">{d}</div>
              ))}
              {Array.from({ length: 24 }).map((_, hour) => (
                <div key={`row-hour-${hour}`} className="contents">
                  <div className="text-[11px] font-semibold text-slate-700 whitespace-nowrap flex items-center">
                    {hour}:00
                  </div>
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, dayIdx) => {
                    const val = heatmap[dayIdx][hour];
                    return (
                      <div key={`cell-${hour}-${dayIdx}`} className="flex items-center justify-center">
                        <div
                          className="h-5 w-full max-w-[32px] rounded-sm"
                          title={`${val} sessions on ${d} at ${hour}:00`}
                          style={{
                            backgroundColor:
                              val === 0
                                ? "#e2e8f0"
                                : `rgba(56,189,248,${Math.min(1, 0.25 + val / Math.max(1, totals.last30 || 4))})`,
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
