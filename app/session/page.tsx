"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { SessionRecord } from "../components/ReadingSessionCard";

const STORAGE_KEY = "reading-sessions";
const DB_NAME = "reading-sessions-db";
const DB_VERSION = 1;
const DB_STORE = "sessions";
const ACTIVE_KEY = "active-session";

const formatClock = (ms: number) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
};

const normalizeTitle = (title: string) => title.trim().toLowerCase().replace(/\s+[0-9]+$/i, "");

const loadLocalSessions = (): SessionRecord[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const loadActiveLocal = () => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ACTIVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const persistActiveLocal = (active: any) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACTIVE_KEY, JSON.stringify(active));
  } catch {
    /* ignore */
  }
};

const clearActiveLocal = () => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* ignore */
  }
};

const openSessionDb = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const persistSessions = async (sessions: SessionRecord[]) => {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new CustomEvent("sync-sessions", { detail: sessions }));
  }
  try {
    const db = await openSessionDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      const store = tx.objectStore(DB_STORE);
      const clearReq = store.clear();
      clearReq.onerror = () => reject(clearReq.error);
      clearReq.onsuccess = () => {
        sessions.forEach((item) => store.put(item));
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch {
    /* ignore */
  }
};

export default function SessionPage() {
  const [sessionActive, setSessionActive] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [genre, setGenre] = useState("");
  const [gameTitle, setGameTitle] = useState("");
  const [thoughts, setThoughts] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [knownGenres] = useState([
    "Action",
    "Adventure",
    "RPG",
    "Shooter",
    "Strategy",
    "Sports",
    "Rogue-lite",
    "Indie",
    "Puzzle",
    "Simulation",
    "Fighting",
    "Racing",
  ]);
  const [knownGames, setKnownGames] = useState<string[]>([]);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);
  const [lastGame, setLastGame] = useState<string | null>(null);
  const [pageVisible, setPageVisible] = useState(true);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const active = loadActiveLocal();
    if (active?.startedAt) {
      setSessionActive(true);
      setStartTime(active.startedAt);
      setElapsed(Date.now() - active.startedAt);
      setGenre(active.genre || "");
      setGameTitle(active.gameTitle || "");
      setThoughts(active.thoughts || "");
      setResuming(true);
      setTimeout(() => setResuming(false), 1500);
    }
    const existing = loadLocalSessions();
    const titles = Array.from(
      new Set(
        existing
          .map((s) => s.gameTitle || "")
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b)),
      ),
    ).slice(0, 50);
    setKnownGames(titles);
    const storedLast = window.localStorage.getItem("last-game-title");
    if (storedLast) setLastGame(storedLast);
  }, []);

  const syncFromSupabase = async () => {
    setSyncStatus("Syncing from Supabase…");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setSyncStatus("Sign in to Supabase to sync.");
        return;
      }
      const { data, error } = await supabase
        .from("gaming_sessions")
        .select("*")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      if (data?.length) {
        const normalized = data
          .map((row) => ({
            id: new Date(row.created_at || Date.now()).getTime(),
            durationMs: Number(row.duration_ms || 0),
            thoughts: row.thoughts || "",
            gameTitle: row.game_title || "",
            genre: row.genre || "",
            canonicalTitle: row.canonical_title || "",
          }))
          .sort((a, b) => b.id - a.id);
        await persistSessions(normalized);
        setSyncStatus(`Pulled ${normalized.length} sessions.`);
        // refresh known games
        const titles = Array.from(new Set(normalized.map((s) => s.gameTitle).filter(Boolean))).slice(0, 50);
        setKnownGames(titles);
      } else {
        setSyncStatus("No sessions found in Supabase.");
      }
    } catch (err: any) {
      setSyncStatus(err?.message || "Failed to sync.");
    } finally {
      setTimeout(() => setSyncStatus(null), 3000);
    }
  };

  const pullActiveFromSupabase = async () => {
    setSyncStatus("Checking for active session…");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setSyncStatus("Sign in to Supabase to pull active session.");
        return;
      }
      const { data, error } = await supabase
        .from("active_sessions")
        .select("*")
        .eq("user_id", session.user.id)
        .order("started_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      const active = data?.[0];
      if (!active) {
        setSyncStatus("No active session found.");
        return;
      }
      const startedAt = new Date(active.started_at || Date.now()).getTime();
      setSessionActive(true);
      setStartTime(startedAt);
      setElapsed(Date.now() - startedAt);
      setGenre(active.genre || "");
      setGameTitle(active.game_title || lastGame || "");
      setThoughts(active.thoughts || "");
      persistActiveLocal({
        startedAt,
        genre: active.genre || "",
        gameTitle: active.game_title || lastGame || "",
        thoughts: active.thoughts || "",
      });
      if (active.game_title) {
        setLastGame(active.game_title);
        window.localStorage.setItem("last-game-title", active.game_title);
      }
      setSyncStatus("Active session pulled.");
    } catch (err: any) {
      setSyncStatus(err?.message || "Failed to pull active session.");
    } finally {
      setTimeout(() => setSyncStatus(null), 3000);
    }
  };

  useEffect(() => {
    if (!sessionActive || !startTime) return;
    const t = setInterval(() => setElapsed(Date.now() - startTime), 400);
    return () => clearInterval(t);
  }, [sessionActive, startTime]);

  useEffect(() => {
    const handler = () => setPageVisible(!document.hidden);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handler);
    }
    return () => {
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handler);
      }
    };
  }, []);

  // Poll Supabase active session to stay in sync across devices
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    const poll = async () => {
      if (!pageVisible) return;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;
        const { data, error } = await supabase
          .from("active_sessions")
          .select("*")
          .eq("user_id", session.user.id)
          .limit(1);
        if (error) return;
        const active = data?.[0];
        if (!active) {
          if (sessionActive) {
            setSessionActive(false);
            setStartTime(null);
            setElapsed(0);
          }
          return;
        }
        const startedAt = active.started_at ? new Date(active.started_at).getTime() : Date.now();
        const isSameSession = startTime && Math.abs(startTime - startedAt) < 2000;
        if (!sessionActive || !isSameSession) {
          setStartTime(startedAt);
          setElapsed(Date.now() - startedAt);
          setSessionActive(true);
          setGenre(active.genre || "");
          setGameTitle(active.game_title || lastGame || "");
          setThoughts(active.thoughts || "");
          if (active.game_title) {
            setLastGame(active.game_title);
            if (typeof window !== "undefined") {
              window.localStorage.setItem("last-game-title", active.game_title);
            }
          }
        } else {
          setElapsed(Date.now() - startedAt);
        }
      } catch {
        /* ignore */
      }
    };
    interval = setInterval(poll, 5000);
    void poll();
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [sessionActive]);

  const handleStartStop = async () => {
    if (!sessionActive) {
      setSessionActive(true);
      const started = Date.now();
      setStartTime(started);
      setElapsed(0);
      setStatus(null);
      const rememberedTitle = gameTitle || lastGame || "";
      if (rememberedTitle) {
        setGameTitle(rememberedTitle);
      }
      persistActiveLocal({
        startedAt: started,
        genre,
        gameTitle: rememberedTitle,
        thoughts,
      });
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const { error } = await supabase.from("active_sessions").upsert(
            {
              user_id: session.user.id,
              started_at: new Date(started).toISOString(),
              game_title: rememberedTitle.trim(),
              genre: genre.trim(),
              thoughts: thoughts.trim(),
            },
            { onConflict: "user_id" }
          );
          if (error) throw error;
          setSyncStatus("Active session synced to Supabase.");
        } else {
          setSyncStatus("Not signed in to Supabase; session is local-only.");
        }
      } catch (err: any) {
        setSyncStatus(err?.message || "Could not sync active session.");
      }
      return;
    }

    if (!genre.trim()) {
      setStatus("Pick a genre before stopping.");
      return;
    }

    if (!gameTitle.trim()) {
      setStatus("Add a game title before stopping.");
      return;
    }

    const durationMs = Math.max(0, Date.now() - (startTime ?? Date.now()));
    const record: SessionRecord = {
      id: Date.now(),
      durationMs,
      thoughts: thoughts.trim(),
      gameTitle: gameTitle.trim(),
      genre: genre.trim(),
      canonicalTitle: normalizeTitle(gameTitle),
    };

    const existing = loadLocalSessions();
    const next = [record, ...existing];
    await persistSessions(next);
    clearActiveLocal();

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await supabase.from("active_sessions").delete().eq("user_id", session.user.id);
        const { error } = await supabase.from("gaming_sessions").insert({
          user_id: session.user.id,
          duration_ms: durationMs,
          thoughts: record.thoughts,
          game_title: record.gameTitle,
          canonical_title: record.canonicalTitle,
          genre: record.genre,
          created_at: new Date(record.id).toISOString(),
        });
        if (error) throw error;
      }
    } catch (err: any) {
      setSyncStatus(err?.message || "Could not sync finished session.");
    }

    setSessionActive(false);
    setStartTime(null);
    setElapsed(0);
    setThoughts("");
    setGameTitle("");
    setStatus("Session saved locally.");
  };

  const minutes = useMemo(() => Math.floor(elapsed / 60000), [elapsed]);
  const seconds = useMemo(() => Math.floor((elapsed % 60000) / 1000), [elapsed]);

  if (!isClient) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-100 via-white to-slate-100 text-slate-900 flex items-center justify-center px-4">
        <div className="text-sm text-slate-700">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 via-white to-slate-100 text-slate-900">
      <div className="max-w-xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-bold">Quick session tracker</h1>
          <Link href="/" className="text-sm font-semibold text-indigo-700 hover:text-indigo-900">
            Back to composer
          </Link>
        </div>
        {syncStatus && <div className="text-sm text-slate-700">{syncStatus}</div>}

        <div className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm space-y-6">
          <div className="text-center space-y-3">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Tap to {sessionActive ? "stop" : "start"}</p>
            <button
              onClick={handleStartStop}
              className={`mx-auto flex h-40 w-40 items-center justify-center rounded-full text-xl font-semibold text-white shadow-lg transition-all duration-300 ${
                sessionActive
                  ? "bg-gradient-to-br from-orange-500 via-rose-500 to-amber-500 animate-pulse"
                  : "bg-gradient-to-br from-indigo-500 via-blue-500 to-teal-500 hover:scale-105"
              }`}
            >
              {sessionActive ? "Stop" : "Start"}
            </button>
            <div className="text-5xl font-mono text-slate-900">{formatClock(elapsed)}</div>
            <div className="text-xs text-slate-600">
              {minutes}m {seconds}s
            </div>
            {lastGame && (
              <p className="text-[11px] text-slate-600">
                Last played: <span className="font-semibold">{lastGame}</span>
              </p>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={pullActiveFromSupabase}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
              >
                Pull active session
              </button>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Genre (required)</span>
              <select
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-base text-slate-800"
              >
                <option value="">Select a genre</option>
                {knownGenres.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Game title</span>
              <input
                value={gameTitle}
                onChange={(e) => setGameTitle(e.target.value)}
                placeholder="Baldur's Gate 3"
                list="known-games"
                className="rounded-lg border border-slate-300 px-3 py-2 text-base text-slate-800"
              />
              <datalist id="known-games">
                {knownGames.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
              <div className="flex flex-wrap gap-2 text-[11px] text-slate-600 mt-1">
                {lastGame && (
                  <button
                    type="button"
                    className="rounded border border-slate-200 bg-slate-50 px-2 py-1 font-semibold text-slate-800"
                    onClick={() => setGameTitle(lastGame)}
                  >
                    Use last: {lastGame}
                  </button>
                )}
                <button
                  type="button"
                  className="rounded border border-slate-200 bg-slate-50 px-2 py-1 font-semibold text-slate-800"
                  onClick={() => {
                    setGameTitle("");
                    setGenre("");
                    setThoughts("");
                  }}
                >
                  Clear fields
                </button>
              </div>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Quote / thoughts</span>
              <textarea
                value={thoughts}
                onChange={(e) => setThoughts(e.target.value)}
                rows={3}
                className="rounded-lg border border-slate-300 px-3 py-2 text-base text-slate-800"
                placeholder="What stood out during this session?"
              />
            </label>
          </div>

          {status && <div className="text-sm text-slate-700">{status}</div>}
          {!isClient && <div className="text-sm text-slate-500">Loading…</div>}
        </div>
      </div>
    </div>
  );
}
