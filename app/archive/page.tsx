"use client";

import { useEffect, useState } from "react";
import { SessionRecord } from "../components/ReadingSessionCard";
import { supabase } from "../lib/supabaseClient";

const STORAGE_KEY = "reading-sessions";
const DB_NAME = "reading-sessions-db";
const DB_VERSION = 1;
const DB_STORE = "sessions";

const loadLocal = (): SessionRecord[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
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

const normalizeRemote = (row: any): SessionRecord => {
  const created = row?.created_at ? new Date(row.created_at).getTime() : row?.id || Date.now();
  const title = row?.game_title || row?.book_title || row?.gameTitle || "";
  const canonical = row?.canonical_title || row?.canonicalTitle || (title || "").trim().toLowerCase().replace(/\s+[0-9]+$/i, "");
  return {
    id: Number(created),
    durationMs: Number(row?.duration_ms ?? row?.durationMs ?? 0),
    thoughts: row?.thoughts || "",
    gameTitle: title,
    genre: row?.genre || "",
    canonicalTitle: canonical,
  };
};

export default function ArchivePage() {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMessage, setAuthMessage] = useState<string | null>(null);

  const loadSessions = async () => {
    if (typeof window === "undefined") return;
    setStatus("Loading…");
    // Try Supabase first
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data } = await supabase
          .from("gaming_sessions")
          .select("*")
          .eq("user_id", session.user.id)
          .order("created_at", { ascending: false })
          .limit(500);
        if (data?.length) {
          const rows = data.map(normalizeRemote).sort((a, b) => b.id - a.id);
          setSessions(rows);
          setLoading(false);
          setStatus(null);
          return;
        }
      }
    } catch {
      // fall through to local
    }
    try {
      const db = await openSessionDb();
      const rows: SessionRecord[] = await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readonly");
        const store = tx.objectStore(DB_STORE);
        const req = store.getAll();
        req.onsuccess = () => resolve(Array.isArray(req.result) ? (req.result as SessionRecord[]) : []);
        req.onerror = () => reject(req.error);
      });
      if (rows?.length) {
        setSessions(rows.sort((a, b) => b.id - a.id));
        setLoading(false);
        setStatus(null);
        return;
      }
    } catch {
      // fall back to localStorage
    }
    const local = loadLocal().sort((a, b) => b.id - a.id);
    setSessions(local);
    setLoading(false);
    setStatus(local.length ? null : "No sessions found locally or in Supabase.");
  };

  useEffect(() => {
    void loadSessions();
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<SessionRecord[]>).detail;
      if (Array.isArray(detail)) {
        setSessions(detail.sort((a, b) => b.id - a.id));
      }
    };
    window.addEventListener("sync-sessions", listener as EventListener);
    return () => window.removeEventListener("sync-sessions", listener as EventListener);
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 text-slate-900 py-8">
      <div className="max-w-3xl mx-auto px-4">
        <div className="mb-6">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Archive</p>
          <h1 className="text-2xl font-bold text-slate-900">All gaming sessions</h1>
          <p className="text-sm text-slate-600">Full history kept locally. Tap a card for details.</p>
          {status && <p className="text-xs text-slate-600 mt-1">{status}</p>}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white/90 p-4 shadow-sm mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-slate-900">Sign in to Supabase</h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 shadow-sm"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 shadow-sm"
            />
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  setAuthMessage(null);
                  try {
                    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
                    if (error) throw error;
                    setAuthMessage("Signed in.");
                    void loadSessions();
                  } catch (err: any) {
                    setAuthMessage(err?.message || "Failed to sign in.");
                  }
                }}
                className="flex-1 rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
              >
                Sign in
              </button>
              <button
                onClick={async () => {
                  setAuthMessage(null);
                  try {
                    const { error } = await supabase.auth.signUp({ email: email.trim(), password });
                    if (error) throw error;
                    setAuthMessage("Account created. Check your email if confirmation is required.");
                  } catch (err: any) {
                    setAuthMessage(err?.message || "Failed to create account.");
                  }
                }}
                className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
              >
                Sign up
              </button>
            </div>
          </div>
          {authMessage && <p className="mt-2 text-sm text-slate-700">{authMessage}</p>}
        </div>

        {loading ? (
          <p className="text-sm text-slate-600">Loading…</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-slate-600">No sessions yet.</p>
        ) : (
          <div className="space-y-3 max-w-[520px] mx-auto">
            {sessions.map((s) => (
              <div key={s.id} className="rounded-xl border border-slate-200 bg-white/90 p-4 shadow-sm space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>{new Date(s.id).toLocaleString()}</span>
                  <span className="font-semibold text-slate-800">
                    {Math.max(1, Math.round((s.durationMs || 0) / 60000))}m
                  </span>
                </div>
                <div className="text-xs font-semibold text-slate-700">{s.genre || "Genre not set"}</div>
                <p className="text-sm font-semibold text-slate-900 whitespace-pre-wrap break-words">{s.thoughts || "(no quote)"}</p>
                {s.gameTitle ? <p className="text-xs italic text-slate-700">— {s.gameTitle}</p> : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
