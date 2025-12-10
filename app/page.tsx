"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import { contentKey, mergeLocalAndCloud, formatNotesToMarkdown, canExportNotes } from "./lib/noteUtils";
import Composer from "./components/Composer";
import NotesList from "./components/NotesList";
import Auth from "./components/Auth";
import { FloatingProfile } from "./components/FloatingProfile";
import LogoutButton from "./components/LogoutButton";
import Image from "next/image";
import { useAuth } from "./providers/AuthProvider";

const LOCAL_NOTES_KEY = "bsky-composer-notes";
const LOCAL_NOTE_META_KEY = "bsky-composer-note-meta";
const LOCAL_VISITOR_KEY = "bsky-composer-visitor";
const BANNER_SEEN_KEY = "bsky-composer-banner-seen";

type NoteMeta = {
  noteId: string | number;
  pinned: boolean;
  tags: string[];
  versions?: { content: string; created_at: string }[];
};

export default function MainPage() {
  const { user } = useAuth();
  const [notes, setNotes] = useState<any[]>([]);
  const [plan, setPlan] = useState<string | null>(null);
  const isPro = plan === "pro";
  const [upgradeMessage, setUpgradeMessage] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<Record<string, NoteMeta>>({});
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [exporting, setExporting] = useState<boolean>(false);
  const [threadSelection, setThreadSelection] = useState<Set<string | number>>(new Set());
  const [threadMessage, setThreadMessage] = useState<string | null>(null);
  const [postingThread, setPostingThread] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);
  const [editMessage, setEditMessage] = useState<string | null>(null);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [showBanner, setShowBanner] = useState(false);
  const [visitorId, setVisitorId] = useState<string | null>(null);
  const [giftCode, setGiftCode] = useState("");
  const [giftMessage, setGiftMessage] = useState<string | null>(null);
  const [giftLoading, setGiftLoading] = useState(false);

  const ensureVisitorId = () => {
    if (typeof window === "undefined") return null;
    let vid = window.localStorage.getItem(LOCAL_VISITOR_KEY);
    if (!vid) {
      vid = crypto.randomUUID();
      window.localStorage.setItem(LOCAL_VISITOR_KEY, vid);
    }
    setVisitorId(vid);
    return vid;
  };

  const redeemGiftCode = async () => {
    if (!user || plan === "pro") {
      setGiftMessage("Already on PRO or not signed in.");
      setTimeout(() => setGiftMessage(null), 3000);
      return;
    }
    const code = giftCode.trim();
    if (!code) {
      setGiftMessage("Enter a code first.");
      setTimeout(() => setGiftMessage(null), 2000);
      return;
    }
    setGiftLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not logged in");
      const res = await fetch("/api/redeem-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          code,
          clientId: visitorId || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to redeem");
      setGiftMessage("Code redeemed! PRO unlocked.");
      setPlan("pro");
      setGiftCode("");
      void fetchNotes();
      setTimeout(() => setGiftMessage(null), 4000);
    } catch (err: any) {
      setGiftMessage(err?.message || "Failed to redeem");
      setTimeout(() => setGiftMessage(null), 4000);
    } finally {
      setGiftLoading(false);
    }
  };

  useEffect(() => {
    if (!user || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("upgrade") === "success") {
      setUpgradeMessage("Pro unlocked! Cloud sync is now available.");
      void fetchPlanAndNotes();
    }
  }, [user]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const vid = ensureVisitorId();
    const seen = window.localStorage.getItem(BANNER_SEEN_KEY);
    if (!seen) {
      setShowBanner(true);
      window.localStorage.setItem(BANNER_SEEN_KEY, "1");
      if (vid) {
        void fetch("/api/track-save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: vid, kind: "promo_banner_shown" }),
        }).catch(() => {});
      }
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setPlan(null);
      loadLocalNotes();
      loadLocalMetadata();
      return;
    }
    void fetchPlanAndNotes();
  }, [user]);

  const getLocalNotes = (): any[] => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(LOCAL_NOTES_KEY);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      return [];
    }
    return [];
  };

  const loadLocalNotes = () => {
    const local = getLocalNotes();
    setNotes(local);
  };

  const loadLocalMetadata = () => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(LOCAL_NOTE_META_KEY);
      if (!raw) {
        setMetadata({});
        return;
      }
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        setMetadata(parsed);
      }
    } catch {
      setMetadata({});
    }
  };

  const addLocalNote = (content: string, imageData?: string | null) => {
    if (!content) return;
    const newNote = {
      id: Date.now(),
      plaintext: content,
      created_at: new Date().toISOString(),
      imageData: imageData || null,
    };
    setNotes((prev) => {
      const next = [newNote, ...prev];
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LOCAL_NOTES_KEY, JSON.stringify(next));
      }
      return next;
    });
  };

  const fetchPlanAndNotes = async () => {
    if (!user) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    loadLocalMetadata();

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("plan")
      .eq("id", session.user.id)
      .single();

    let userPlan = profile?.plan ?? "free";

    // If the profile row is missing, create it client-side (allowed by RLS) so the webhook can update it later.
    if (error && (error as any)?.code === "PGRST116") {
      const { error: insertError } = await supabase.from("profiles").upsert({
        id: session.user.id,
        email: session.user.email,
        plan: "free",
      });
      if (insertError) {
        console.error("Failed to create profile row", insertError);
      }
      userPlan = "free";
    } else if (error) {
      console.error("Error loading plan", error);
    }

    setPlan(userPlan);

    if (userPlan === "pro") {
      await fetchNotes();
    } else {
      loadLocalNotes();
    }

    // Fallback: if client thinks it's free, ask server to sync from payments table
    if (userPlan !== "pro") {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          const res = await fetch("/api/sync-plan", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          });
          const body = await res.json().catch(() => ({}));
          if (res.ok && body?.plan === "pro") {
            setPlan("pro");
            await fetchNotes();
          }
        }
      } catch (err) {
        console.error("Plan sync check failed", err);
      }
    }
  };

  const fetchNotes = useCallback(async () => {
    if (!user) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const res = await fetch("/api/getNotes", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (res.ok) {
      const data = await res.json();
      const local = getLocalNotes();
      const merged = mergeLocalAndCloud(local, data).filter(
        (note: any) => !deletedIds.has(String(note.id))
      );
      setNotes(merged);
      if (isPro) {
        await syncLocalNotesToCloud(data, session.access_token);
      }
      if (isPro) {
        await fetchMetadata();
      }
    }
  }, [deletedIds, isPro, user]);

  const fetchMetadata = async () => {
    if (!user || !isPro) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const res = await fetch("/api/metadata", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (res.ok) {
      const data = await res.json();
      const map: Record<string, NoteMeta> = {};
      for (const row of data || []) {
        map[String(row.note_id)] = {
          noteId: row.note_id,
          pinned: !!row.pinned,
          tags: row.tags || [],
          versions: row.versions || [],
        };
      }
      setMetadata(map);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LOCAL_NOTE_META_KEY, JSON.stringify(map));
      }
    }
  };

  const deleteNote = async (id: string | number) => {
    if (!user || !isPro) {
      setNotes((prev: any[]) => {
        const next = prev.filter((note) => note.id !== id);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(LOCAL_NOTES_KEY, JSON.stringify(next));
        }
        return next;
      });
      // clean metadata
      setMetadata((prev) => {
      const next = { ...prev };
      delete next[String(id)];
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LOCAL_NOTE_META_KEY, JSON.stringify(next));
      }
      return next;
    });
      return;
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const res = await fetch("/api/deleteNote", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ id }),
    });

    if (res.ok) {
      setDeletedIds((prev) => {
        const next = new Set(prev);
        next.add(String(id));
        return next;
      });
      setNotes((prev: any) => {
        const next = prev.filter((note: any) => note.id !== id);
        // also clear from local cache so mergeLocalAndCloud doesn't resurrect it
        if (typeof window !== "undefined") {
          window.localStorage.setItem(LOCAL_NOTES_KEY, JSON.stringify(next));
        }
        return next;
      });
      setMetadata((prev) => {
        const next = { ...prev };
        delete next[String(id)];
        if (typeof window !== "undefined") {
          window.localStorage.setItem(LOCAL_NOTE_META_KEY, JSON.stringify(next));
        }
        return next;
      });
      setDeleteMessage("Note deleted");
      setTimeout(() => setDeleteMessage(null), 2500);
      void fetchNotes();
    } else {
      console.error("Failed to delete note");
    }
  };

  const updateNoteContent = async (id: string | number, newText: string) => {
    const safe = newText.trim();
    if (!safe) {
      setEditMessage("Note cannot be empty");
      setTimeout(() => setEditMessage(null), 2500);
      return;
    }

    // Local-only flow
    if (!user || !isPro) {
      setNotes((prev: any[]) => {
        const next = prev.map((n) =>
          String(n.id) === String(id) ? { ...n, plaintext: safe } : n
        );
        if (typeof window !== "undefined") {
          window.localStorage.setItem(LOCAL_NOTES_KEY, JSON.stringify(next));
        }
        return next;
      });
      setEditMessage("Note updated locally");
      setTimeout(() => setEditMessage(null), 2500);
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setEditMessage("Not logged in");
      setTimeout(() => setEditMessage(null), 2500);
      return;
    }

    const res = await fetch("/api/updateNote", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ id, content: safe }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setEditMessage(body?.error || "Failed to update note");
      setTimeout(() => setEditMessage(null), 3000);
      return;
    }

    setNotes((prev: any[]) => {
      const next = prev.map((n: any) =>
        String(n.id) === String(id) ? { ...n, plaintext: safe } : n
      );
      // keep localStorage in sync to avoid mergeLocalAndCloud resurrecting old text
      if (typeof window !== "undefined") {
        const stored = getLocalNotes();
        const updatedStored = stored.map((n) =>
          String(n.id) === String(id) ? { ...n, plaintext: safe } : n
        );
        window.localStorage.setItem(LOCAL_NOTES_KEY, JSON.stringify(updatedStored));
      }
      return next;
    });
    setEditMessage("Note updated");
    setTimeout(() => setEditMessage(null), 2000);
  };

  const reorderNotes = (fromId: string | number, toId: string | number) => {
    setNotes((prev: any[]) => {
      const fromIdx = prev.findIndex((n) => String(n.id) === String(fromId));
      const toIdx = prev.findIndex((n) => String(n.id) === String(toId));
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      if ((!user || !isPro) && typeof window !== "undefined") {
        window.localStorage.setItem(LOCAL_NOTES_KEY, JSON.stringify(next));
      }
      return next;
    });
  };

  const moveRelative = (id: string | number, direction: "up" | "down") => {
    setNotes((prev: any[]) => {
      const idx = prev.findIndex((n) => String(n.id) === String(id));
      if (idx === -1) return prev;
      const targetIdx = direction === "up" ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(idx, 1);
      next.splice(targetIdx, 0, moved);
      if ((!user || !isPro) && typeof window !== "undefined") {
        window.localStorage.setItem(LOCAL_NOTES_KEY, JSON.stringify(next));
      }
      return next;
    });
  };

  const toggleThreadSelect = (id: string | number) => {
    setThreadSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePin = (id: string | number) => {
    if (!user || !isPro) return;
    setMetadata((prev) => {
      const current = prev[String(id)] || { noteId: id, pinned: false, tags: [], versions: [] };
      const updated = { ...current, pinned: !current.pinned };
      const next = { ...prev, [String(id)]: updated };
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LOCAL_NOTE_META_KEY, JSON.stringify(next));
      }
      return next;
    });
    void persistMetadata(id);
  };

  const addTag = (id: string | number, tag: string) => {
    if (!user || !isPro) return;
    const trimmed = tag.trim();
    if (!trimmed) return;
    setMetadata((prev) => {
      const current = prev[String(id)] || { noteId: id, pinned: false, tags: [], versions: [] };
      if (current.tags.includes(trimmed)) return prev;
      const updated = { ...current, tags: [...current.tags, trimmed] };
      const next = { ...prev, [String(id)]: updated };
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LOCAL_NOTE_META_KEY, JSON.stringify(next));
      }
      return next;
    });
    void persistMetadata(id);
  };

  const removeTag = (id: string | number, tag: string) => {
    if (!user || !isPro) return;
    setMetadata((prev) => {
      const current = prev[String(id)];
      if (!current) return prev;
      const updated = { ...current, tags: current.tags.filter((t) => t !== tag) };
      const next = { ...prev, [String(id)]: updated };
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LOCAL_NOTE_META_KEY, JSON.stringify(next));
      }
      return next;
    });
    void persistMetadata(id);
  };

  const persistMetadata = async (id: string | number) => {
    if (!user || !isPro) return;
    const meta = metadata[String(id)];
    if (!meta) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    void fetch("/api/metadata", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        noteId: id,
        pinned: meta.pinned,
        tags: meta.tags,
        versions: meta.versions || [],
      }),
    }).catch(() => {});
  };

  const syncLocalNotesToCloud = async (cloudNotes: any[], token: string) => {
    const localNotes = getLocalNotes();
    if (!localNotes.length) return;
    const cloudHashes = new Set(
      cloudNotes.map((n) => contentKey(n.plaintext))
    );
    let pushedCount = 0;
    for (const note of localNotes) {
      const key = contentKey(note.plaintext);
      if (!cloudHashes.has(key)) {
        await fetch("/api/saveNote", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ content: note.plaintext }),
        }).catch(() => {});
        pushedCount += 1;
      }
    }
    const refetch = await fetch("/api/getNotes", {
      headers: { Authorization: `Bearer ${token}` },
    });
      if (refetch.ok) {
        const data = await refetch.json();
        setNotes(mergeLocalAndCloud(localNotes, data));
        if (pushedCount > 0) {
          setSyncMessage(`Synced ${pushedCount} local note(s) to cloud`);
        setTimeout(() => setSyncMessage(null), 4000);
      }
    }
  };

  // Preserve manual order; only lift pinned items to the top while keeping relative order
  const sortedNotes = useMemo(() => {
    const pinned: any[] = [];
    const regular: any[] = [];
    for (const n of notes) {
      const isPinned = metadata[String(n.id)]?.pinned;
      if (isPinned) pinned.push(n);
      else regular.push(n);
    }
    return [...pinned, ...regular];
  }, [notes, metadata]);

  const postThreadToBluesky = async () => {
    if (!threadSelection.size) {
      setThreadMessage("Select at least one note to post as a thread.");
      setTimeout(() => setThreadMessage(null), 3000);
      return;
    }
    const selectedNotes = sortedNotes.filter((n) => threadSelection.has(n.id));
    if (!selectedNotes.length) {
      setThreadMessage("Selected notes not found.");
      setTimeout(() => setThreadMessage(null), 3000);
      return;
    }
    const handle = typeof window !== "undefined" ? window.localStorage.getItem("bsky-handle") : "";
    const appPassword =
      typeof window !== "undefined" ? window.localStorage.getItem("bsky-app-password") : "";
    if (!handle || !appPassword) {
      setThreadMessage("Add your Bluesky handle + app password in the composer first.");
      setTimeout(() => setThreadMessage(null), 4000);
      return;
    }

    setPostingThread(true);
    setThreadMessage(null);
    try {
      const res = await fetch("/api/bluesky/thread", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: handle,
          appPassword,
          posts: selectedNotes.map((n) => ({
            text: n.plaintext || "",
            imageData: n.imageData || null,
          })),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to post thread");
      setThreadMessage(`Posted ${selectedNotes.length} note(s) as a thread ✔️`);
      setThreadSelection(new Set());
      setTimeout(() => setThreadMessage(null), 4000);
    } catch (err: any) {
      setThreadMessage(err?.message || "Failed to post thread");
      setTimeout(() => setThreadMessage(null), 5000);
    } finally {
      setPostingThread(false);
    }
  };

  const exportCloudNotes = async (format: "json" | "md") => {
    if (!canExportNotes(user, isPro, exporting)) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setExporting(true);
    try {
      const res = await fetch("/api/getNotes", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch notes");
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error("Unexpected notes payload");

      if (format === "json") {
        const enriched = data.map((note: any) => {
          const meta = metadata[String(note.id)] || {};
          return {
            ...note,
            tags: meta.tags || [],
            imageData: note.imageData || null,
          };
        });
        const blob = new Blob([JSON.stringify(enriched, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "bluesky-composer-notes.json";
        link.click();
        URL.revokeObjectURL(url);
        setExportMessage("Exported your cloud notes to JSON");
      } else {
        const md = formatNotesToMarkdown(data, metadata);
        const blob = new Blob([md], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "bluesky-composer-notes.md";
        link.click();
        URL.revokeObjectURL(url);
        setExportMessage("Exported your cloud notes to Markdown");
      }
      setTimeout(() => setExportMessage(null), 4000);
    } catch (err: any) {
      setExportMessage(err?.message || "Export failed");
      setTimeout(() => setExportMessage(null), 4000);
    } finally {
      setExporting(false);
    }
  };

  // Live updates: subscribe to Supabase changes for this user, plus a light polling fallback.
  useEffect(() => {
    if (!user || !isPro) return;
    const channel = supabase
      .channel(`notes-rt-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notes",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void fetchNotes();
        }
      )
      .subscribe();

    const interval = setInterval(() => {
      void fetchNotes();
    }, 15000);

    return () => {
      clearInterval(interval);
      void channel.unsubscribe();
    };
  }, [fetchNotes, isPro, user]);

  return (
    <>
  
      <div className="space-y-6 flex flex-col items-center justify-center min-h-screen py-2 px-4 bg-gray-100 relative">



      <main className="w-full max-w-[800px] flex-col flex justify-center">
        {/* Inline messages (upgrade/sync) */}
        {upgradeMessage && (
          <div className="mb-4 rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 shadow-sm">
            {upgradeMessage}
          </div>
        )}
        {syncMessage && (
          <div className="mb-4 rounded border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 shadow-sm">
            {syncMessage}
          </div>
        )}
        {showBanner && (
          <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <div className="font-semibold">Limited beta offer: €15 lifetime PRO</div>
              <div className="text-xs text-amber-700">Available for a short time while the app is in beta.</div>
            </div>
            <button
              className="self-start sm:self-auto px-3 py-1 text-xs font-semibold rounded border border-amber-300 bg-white text-amber-700 hover:bg-amber-100"
              onClick={() => setShowBanner(false)}
            >
              Got it
            </button>
          </div>
        )}
        {(threadMessage || exportMessage || deleteMessage || editMessage) && (
          <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
            {[threadMessage, exportMessage, deleteMessage, editMessage]
              .filter(Boolean)
              .map((msg, idx) => {
                const text = String(msg);
                const isError =
                  text.toLowerCase().includes("fail") ||
                  text.toLowerCase().includes("error");
                return (
                  <div
                    key={`${text}-${idx}`}
                    className={`rounded border px-4 py-3 text-sm shadow-lg ${
                      isError
                        ? "border-rose-200 bg-rose-50 text-rose-800"
                        : "border-emerald-200 bg-emerald-50 text-emerald-800"
                    }`}
                  >
                    {text}
                  </div>
                );
              })}
          </div>
        )}
        <Image
          src="/assets/quote.jpg"
          alt="quote from a bluesky user: 'i need a notes app that has the character limit for bluesky and where it cuts down to the next line cuz if i have one more post with a lone word hanging off the bottom i may perish'"
          width={600}
          height={200}
          sizes="100vw"
          className="mx-auto mb-4 mt-8 w-full max-w-[600px] h-auto"
        />
        <Image
          src="/assets/bluesky-demo.gif"
          alt="BlueSky Composer demo"
          width={600}
          height={400}
          sizes="100vw"
          className="mx-auto mb-8 w-full max-w-[600px] h-auto rounded-lg border border-gray-200 shadow-sm"
        />

        {user ? <div className="mt-8 mx-auto"><LogoutButton /></div> : null }
      {/* Composer always visible; saves locally when logged out, Supabase + local when logged in */}
      <Composer
        onNoteSaved={fetchNotes}
        onLocalSave={addLocalNote}
        user={user}
        isPro={plan === "pro"}
        proCheckoutUrl={process.env.NEXT_PUBLIC_PRO_CHECKOUT_URL || ""}
      />
    
      <NotesList
        notes={sortedNotes}
        onDelete={deleteNote}
        onReorder={reorderNotes}
        onMoveRelative={moveRelative}
        onUpdate={updateNoteContent}
        metadata={metadata}
        onTogglePin={togglePin}
        onAddTag={addTag}
        onRemoveTag={removeTag}
        canOrganize={!!user && isPro}
        allowThreadSelect
        threadSelectEnabled={!!user && isPro}
        selectedForThread={threadSelection}
        onToggleThreadSelect={toggleThreadSelect}
      />

      {user && isPro && (
        <div className="mt-4 w-full flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            onClick={() => exportCloudNotes("json")}
            disabled={exporting}
            className={`px-4 py-2 text-sm font-semibold rounded text-white shadow-sm w-full sm:w-auto ${exporting ? "bg-indigo-400 cursor-wait" : "bg-indigo-600 hover:bg-indigo-700"}`}
          >
            {exporting ? "Exporting..." : "Export notes (JSON)"}
          </button>
          <button
            onClick={() => exportCloudNotes("md")}
            disabled={exporting}
            className={`px-4 py-2 text-sm font-semibold rounded text-white shadow-sm w-full sm:w-auto ${exporting ? "bg-purple-400 cursor-wait" : "bg-purple-600 hover:bg-purple-700"}`}
          >
            {exporting ? "Exporting..." : "Export notes (Markdown)"}
          </button>
          <button
            onClick={postThreadToBluesky}
            disabled={postingThread || threadSelection.size === 0}
            className={`px-4 py-2 text-sm font-semibold rounded text-white shadow-sm w-full sm:w-auto ${postingThread || threadSelection.size === 0 ? "bg-sky-300 cursor-not-allowed" : "bg-sky-600 hover:bg-sky-700"}`}
          >
            {postingThread ? "Posting thread..." : "Post selected as thread"}
          </button>
          <button
            onClick={() => {
              const selectedNotes = sortedNotes.filter((n) => threadSelection.has(n.id));
              const text = selectedNotes.map((n) => n.plaintext || "").join("\n\n---\n\n");
              if (!text.trim()) {
                setThreadMessage("Select at least one note to copy.");
                setTimeout(() => setThreadMessage(null), 3000);
                return;
              }
              void navigator.clipboard.writeText(text).then(() => {
                setThreadMessage("Copied selected notes for thread.");
                setTimeout(() => setThreadMessage(null), 3000);
              }).catch(() => {
                setThreadMessage("Failed to copy notes.");
                setTimeout(() => setThreadMessage(null), 3000);
              });
            }}
            className={`px-4 py-2 text-sm font-semibold rounded text-white shadow-sm w-full sm:w-auto bg-slate-600 hover:bg-slate-700`}
            disabled={threadSelection.size === 0}
          >
            Copy selected (thread)
          </button>
        </div>
      )}

      {!user && (
        <div>
          <div className="mt-8 mb-4 p-4 border rounded bg-white shadow-sm">
            <h4 className="text-base sm:text-lg font-semibold mb-2">PRO</h4>
            <p className="text-xs sm:text-sm text-gray-600 mb-1">Pay once, keep PRO forever. Price: <span className="font-semibold text-gray-800">€15</span>.</p>
            <p className="text-xs sm:text-sm text-gray-600 mb-3">Here’s what you get now and what’s coming soon:</p>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm text-left border">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 border">Feature</th>
                    <th className="px-3 py-2 border">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { feature: "Organize your notes (drag & drop + up/down + tags/pins)", status: "Available (PRO)" },
                    { feature: "Export notes (JSON + Markdown with tags/images included)", status: "Available (PRO)" },
                    { feature: "Post directly to Bluesky with a secure app password", status: "Available (PRO)" },
                    { feature: "Post selected notes as a thread to Bluesky", status: "Available (PRO)" },
                    { feature: "Copy selected notes to clipboard as text", status: "Available (PRO)" },
                    { feature: "Realtime updates (Supabase) with polling fallback", status: "Available (PRO)" },
                    { feature: "Delete protection (notes and metadata deleted across local/cloud)", status: "Available (PRO)" },
                    { feature: "Version history & restore", status: "Coming soon (PRO)" },
                    { feature: "Advanced search & filters", status: "Coming soon (PRO)" },
                  ].map((row, idx) => (
                    <tr
                      key={row.feature}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", String(idx));
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        // Cosmetic drag affordance only; no reordering needed
                      }}
                    >
                      <td className="px-3 py-2 border">{row.feature}</td>
                      <td className={`px-3 py-2 border ${row.status.toLowerCase().includes("available") ? "text-emerald-700" : "text-orange-600"}`}>
                        {row.status}
                      </td>
                    </tr>
                ))}
              </tbody>
            </table>
          </div>
            {user && !isPro && (
              <div className="mt-4 flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                <input
                  type="text"
                  value={giftCode}
                  onChange={(e) => setGiftCode(e.target.value)}
                  placeholder="Have a gift code?"
                  className="w-full sm:w-auto flex-1 rounded border px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={redeemGiftCode}
                  disabled={giftLoading}
                  className={`px-3 py-2 text-sm font-semibold rounded text-white shadow-sm ${
                    giftLoading ? "bg-amber-300 cursor-wait" : "bg-amber-500 hover:bg-amber-600"
                  }`}
                >
                  {giftLoading ? "Redeeming..." : "Redeem code"}
                </button>
                {giftMessage && (
                  <span className="text-xs text-amber-700">{giftMessage}</span>
                )}
              </div>
            )}
          </div>
          <div className="mt-6 mb-4 p-4 border rounded bg-white shadow-sm">
            <h4 className="text-base sm:text-lg font-semibold mb-2">What you get for free</h4>
            <ul className="text-xs sm:text-sm text-gray-700 list-disc list-inside space-y-1">
              <li>Local mode: drafts and saved notes stay on this device</li>
              <li>Optional local image attachments (never uploaded to Supabase)</li>
              <li>Write, copy, and delete notes locally</li>
              <li>Bluesky posting from the composer (single post) with a local-only app password</li>
            </ul>
          </div>
          <div className="p-4 border mt-12 rounded bg-yellow-50">
            <p className="text-sm">
              You’re browsing anonymously. Your draft and saved notes stay on this device. Sign in and upgrade to Pro to back up notes to the cloud.
            </p>
          </div>
          <Auth />
        </div>
      )}
      <footer className="mt-12 text-center text-gray-500 text-sm">
        &copy; {new Date().getFullYear()} BlueSky Composer. Built with NextJS, React, TailwindCSS, <a href="https://supabase.com" className="underline">Supabase</a> and ❤️ by <a href="https://robhutters.com" className="underline">Rob Hutters</a>. Hosted on <a href="https://vercel.com" className="underline">Vercel</a>.
      </footer>
      </main>
      <FloatingProfile />
    </div>
    </>
    
  );
}
