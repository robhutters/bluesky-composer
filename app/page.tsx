"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import { contentKey, mergeLocalAndCloud, formatNotesToMarkdown, canExportNotes, sortWithPins } from "./lib/noteUtils";
import Composer from "./components/Composer";
import NotesList from "./components/NotesList";
import Auth from "./components/Auth";
import { FloatingProfile } from "./components/FloatingProfile";
import LogoutButton from "./components/LogoutButton";
import Image from "next/image";
import { useAuth } from "./providers/AuthProvider";
import { loadImagesForKey, saveImagesForKey, deleteImagesForKey } from "./lib/indexedImages";

const LOCAL_NOTES_KEY = "bsky-composer-notes";
const LOCAL_NOTE_META_KEY = "bsky-composer-note-meta";
const LOCAL_VISITOR_KEY = "bsky-composer-visitor";
const BANNER_SEEN_KEY = "bsky-composer-banner-seen";
const LOCAL_IMAGE_MAP_KEY = "bsky-composer-note-images";
const GIFT_OFFER_KEY = "bsky-composer-gift-offer";
const LOCAL_ORDER_KEY = "bsky-composer-note-order";
const MAX_CHARACTERS = 300;

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
  const [replyControl, setReplyControl] = useState<"anyone" | "no_replies" | "mentions" | "followers" | "following" | "list">("anyone");
  const [replyListUri, setReplyListUri] = useState<string>("");
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);
  const [editMessage, setEditMessage] = useState<string | null>(null);
  const [storageMessage, setStorageMessage] = useState<string | null>(null);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [showBanner, setShowBanner] = useState(false);
  const [visitorId, setVisitorId] = useState<string | null>(null);
  const [pinInfo, setPinInfo] = useState<string | null>(null);
  const [giftOfferCode, setGiftOfferCode] = useState<string | null>(null);
  const [notesLoading, setNotesLoading] = useState(false);
  const lastStableNotesRef = useRef<any[]>([]);

  const scrollToAuth = () => {
    const el = typeof document !== "undefined" ? document.getElementById("login-form") : null;
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

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


  useEffect(() => {
    if (!user || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const upgrade = params.get("upgrade");
    if (upgrade === "success") {
      setUpgradeMessage("Pro unlocked! Cloud sync is now available.");
      void fetchPlanAndNotes();
    }
    if (upgrade) {
      params.delete("upgrade");
      const query = params.toString();
      const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
      window.history.replaceState({}, "", nextUrl);
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

  // Offer a random unused gift code to non-logged-in visitors (once per client)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (user) return; // don't offer to logged-in users
    const vid = ensureVisitorId();
    if (!vid) return;
    const offered = window.localStorage.getItem(GIFT_OFFER_KEY);
    if (offered) {
      setGiftOfferCode(offered);
      return;
    }
    void fetch("/api/gift-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: vid }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.code) {
          setGiftOfferCode(data.code);
          window.localStorage.setItem(GIFT_OFFER_KEY, data.code);
        }
      })
      .catch(() => {});
  }, [user]);

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

  const getLocalOrder = (): string[] => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(LOCAL_ORDER_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  };

  const saveLocalOrder = (ids: Array<string | number>) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(LOCAL_ORDER_KEY, JSON.stringify(ids.map(String)));
  };

  const getLocalImages = (): Record<string, string> => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem(LOCAL_IMAGE_MAP_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  };

  const saveImageForContent = (plaintext: string, imageData?: string | null) => {
    if (!imageData || typeof window === "undefined") return;
    const map = getLocalImages();
    map[contentKey(plaintext)] = imageData;
    window.localStorage.setItem(LOCAL_IMAGE_MAP_KEY, JSON.stringify(map));
  };

  const removeImageForContent = (plaintext?: string) => {
    if (!plaintext || typeof window === "undefined") return;
    const map = getLocalImages();
    const key = contentKey(plaintext);
    if (map[key]) {
      delete map[key];
      window.localStorage.setItem(LOCAL_IMAGE_MAP_KEY, JSON.stringify(map));
    }
  };

  const migrateImageForEdit = (oldPlaintext: string | undefined, newPlaintext: string) => {
    if (typeof window === "undefined" || !oldPlaintext) return;
    const images = getLocalImages();
    const oldKey = contentKey(oldPlaintext);
    const newKey = contentKey(newPlaintext);
    if (oldKey === newKey || !images[oldKey]) return;
    const updated = { ...images };
    updated[newKey] = images[oldKey];
    delete updated[oldKey];
    window.localStorage.setItem(LOCAL_IMAGE_MAP_KEY, JSON.stringify(updated));
  };

  const loadLocalNotes = async () => {
    const local = getLocalNotes();
    const safeLocal = Array.isArray(local) ? local : [];
    // Optimistically render what's already in localStorage so the list doesn't vanish
    setNotes(safeLocal);
    // Hydrate images from IndexedDB in the background
    const withImages = await Promise.all(
      safeLocal.map(async (note) => {
        try {
          const key = contentKey(note.plaintext);
          const imgs = await loadImagesForKey(key);
          if (imgs?.length) {
            return { ...note, images: imgs, imageData: imgs[0]?.data || note.imageData || null };
          }
        } catch {
          /* ignore and fall back */
        }
        return note;
      })
    );
    setNotes(withImages);
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

  const stripImagesForStorage = (note: any) => ({
    ...note,
    imageData: null,
    images: Array.isArray(note.images)
      ? note.images.map((img: any) => ({ alt: img?.alt || "" }))
      : [],
  });

  const persistLocalNotes = (list: any[]) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(LOCAL_NOTES_KEY, JSON.stringify(list.map(stripImagesForStorage)));
  };

  const addLocalNote = (content: string, images?: { data: string; alt: string }[]) => {
    if (!content) return;
    const id = Date.now();
    const newNote = {
      id,
      plaintext: content,
      created_at: new Date().toISOString(),
      imageData: images?.[0]?.data || null,
      images: Array.isArray(images) ? images.slice(0, 4) : [],
    };
    setNotes((prev) => {
      const base = Array.isArray(prev) ? prev : [];
      const next = [newNote, ...base];
      if (typeof window !== "undefined") {
        try {
          persistLocalNotes(next);
          saveLocalOrder(next.map((n) => n.id));
        } catch (err) {
          console.error("Failed to store note locally", err);
          setStorageMessage("Local storage is full. Delete a few notes to keep saving.");
          setTimeout(() => setStorageMessage(null), 4000);
          return prev;
        }
      } else {
        saveLocalOrder(next.map((n) => n.id));
      }
      return next;
    });
    if (images?.length) {
      const key = contentKey(content);
      void saveImagesForKey(key, images.slice(0, 4));
    }
  };

  const attachImages = async (arr: any[]) => {
    return Promise.all(
      (arr || []).map(async (note: any) => {
        try {
          const key = contentKey(note.plaintext || "");
          const imgs = await loadImagesForKey(key);
          if (imgs?.length) {
            return { ...note, images: imgs, imageData: imgs[0]?.data || note.imageData || null };
          }
        } catch {
          /* ignore */
        }
        return note;
      })
    );
  };

  const applyOrder = (arr: any[]) => {
    const order = getLocalOrder();
    if (!order.length) return arr;
    const rank = new Map<string, number>();
    order.forEach((id, idx) => rank.set(String(id), idx));
    const safe = Array.isArray(arr) ? arr.filter((n) => n && typeof n.id !== "undefined") : [];
    if (!safe.length) return arr;
    return [...safe].sort((a, b) => {
      const ra = rank.has(String(a.id)) ? (rank.get(String(a.id)) as number) : Number.MAX_SAFE_INTEGER;
      const rb = rank.has(String(b.id)) ? (rank.get(String(b.id)) as number) : Number.MAX_SAFE_INTEGER;
      return ra - rb;
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
    setNotesLoading(true);
    try {
      if (!user) return;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch("/api/getNotes", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!res.ok) {
        return;
      }
      const data = await res.json();
      const local = getLocalNotes();

      const applySafeNotes = (arr: any) => {
        if (!Array.isArray(arr)) return;
        setNotes((prev: any[]) => {
          // Avoid blanking the list while fetch is in flight; keep prior notes if new payload is empty.
          if (!arr.length && Array.isArray(prev) && prev.length) return prev;
          return arr;
        });
      };

      // For Pro, treat cloud as source of truth; use local cache only to push unsynced items once.
      if (isPro) {
        const filteredCloud = Array.isArray(data)
          ? data.filter((note: any) => !deletedIds.has(String(note.id)))
          : [];
        const withImages = await attachImages(filteredCloud);
        const ordered = applyOrder(withImages);
        applySafeNotes(ordered);

        // Push any lingering local notes, then clear the local cache so edits don't resurrect old copies.
        if (local.length) {
          await syncLocalNotesToCloud(data, session.access_token);
          if (typeof window !== "undefined") {
            window.localStorage.setItem(LOCAL_NOTES_KEY, JSON.stringify([]));
            window.localStorage.setItem(LOCAL_ORDER_KEY, JSON.stringify([]));
          }
        }
        await fetchMetadata();
      } else {
        const merged = mergeLocalAndCloud(local, Array.isArray(data) ? data : []).filter(
          (note: any) => !deletedIds.has(String(note.id))
        );
        const hydrated = await attachImages(merged);
        applySafeNotes(hydrated);
      }
    } finally {
      setNotesLoading(false);
    }
  }, [deletedIds, isPro, user]);

  useEffect(() => {
    if (Array.isArray(notes) && notes.length) {
      lastStableNotesRef.current = notes;
    } else if (!notesLoading && Array.isArray(notes)) {
      // if fully loaded and empty, clear cache
      lastStableNotesRef.current = notes;
    }
  }, [notes, notesLoading]);

  const notesForDisplay = useMemo(() => {
    if (notesLoading && lastStableNotesRef.current.length) {
      return lastStableNotesRef.current;
    }
    return notes;
  }, [notes, notesLoading]);

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
        const target = prev.find((n) => String(n.id) === String(id));
        if (target?.plaintext) {
          removeImageForContent(target.plaintext);
          void deleteImagesForKey(contentKey(target.plaintext)).catch(() => {});
        }
        const next = prev.filter((note) => note.id !== id);
        if (typeof window !== "undefined") {
          persistLocalNotes(next);
          saveLocalOrder(next.map((n) => n.id));
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
        const base = Array.isArray(prev) ? prev : [];
        const target = base.find((n: any) => String(n.id) === String(id));
        if (target?.plaintext) {
          removeImageForContent(target.plaintext);
          void deleteImagesForKey(contentKey(target.plaintext)).catch(() => {});
        }
        const next = base.filter((note: any) => note && note.id !== undefined && String(note.id) !== String(id));
        // also clear from local cache so mergeLocalAndCloud doesn't resurrect it
        if (typeof window !== "undefined") {
          persistLocalNotes(next);
          saveLocalOrder(next.map((n: any) => n.id));
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

  const updateNoteImageAlt = (noteId: string | number, index: number, alt: string) => {
    setNotes((prev: any[]) => {
      const updated = prev.map((n) => {
        if (String(n.id) !== String(noteId)) return n;
        const imgs = Array.isArray(n.images)
          ? [...n.images]
          : n.imageData
            ? [{ data: n.imageData, alt: n.imageAlt || "" }]
            : [];
        if (!imgs[index]) return n;
        const data = (imgs as any)[index].data;
        imgs[index] = { ...imgs[index], alt, data };
        const key = contentKey(n.plaintext || "");
        void saveImagesForKey(key, imgs as any).catch(() => {});
        return { ...n, images: imgs, imageData: (imgs as any)[0]?.data || n.imageData || null };
      });
      if (typeof window !== "undefined") {
        persistLocalNotes(updated);
      }
      return updated;
    });
  };

  const updateNoteContent = async (id: string | number, newText: string) => {
    const safe = newText.trim();
    if (!safe) {
      setEditMessage("Note cannot be empty");
      setTimeout(() => setEditMessage(null), 2500);
      return;
    }
    if (safe.length > MAX_CHARACTERS) {
      setEditMessage(`Notes are limited to ${MAX_CHARACTERS} characters`);
      setTimeout(() => setEditMessage(null), 2500);
      return;
    }
    const existing = notes.find((n) => String(n.id) === String(id));

    // Local-only flow
    if (!user || !isPro) {
      setNotes((prev: any[]) => {
        const next = prev.map((n) =>
          String(n.id) === String(id) ? { ...n, plaintext: safe } : n
        );
        if (typeof window !== "undefined") {
          persistLocalNotes(next);
        }
        return next;
      });
      if (existing?.plaintext) {
        migrateImageForEdit(existing.plaintext, safe);
      }
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

    // Optimistically update local state so image stays visible until refetch.
    setNotes((prev: any[]) =>
      prev.map((n: any) =>
        String(n.id) === String(id) ? { ...n, plaintext: safe } : n
      )
    );
    if (existing?.plaintext) {
      migrateImageForEdit(existing.plaintext, safe);
    }

    // Refresh from server to avoid any local/cloud merge duplications
    await fetchNotes();
    setEditMessage("Note updated");
    setTimeout(() => setEditMessage(null), 2000);
  };

  const reorderNotes = (fromId: string | number, toId: string | number) => {
    setNotes((prev: any[]) => {
      const view = sortWithPins(prev, metadata);
      const fromIdx = view.findIndex((n) => String(n.id) === String(fromId));
      const toIdx = view.findIndex((n) => String(n.id) === String(toId));
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return prev;
      const next = [...view];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      if ((!user || !isPro) && typeof window !== "undefined") {
        persistLocalNotes(next);
      }
      saveLocalOrder(next.map((n) => n.id));
      return next;
    });
  };

  const moveRelative = (id: string | number, direction: "up" | "down") => {
    setNotes((prev: any[]) => {
      const view = sortWithPins(prev, metadata);
      const idx = view.findIndex((n) => String(n.id) === String(id));
      if (idx === -1) return prev;
      const targetIdx = direction === "up" ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= view.length) return prev;
      const next = [...view];
      const [moved] = next.splice(idx, 1);
      next.splice(targetIdx, 0, moved);
      if ((!user || !isPro) && typeof window !== "undefined") {
        persistLocalNotes(next);
      }
      saveLocalOrder(next.map((n) => n.id));
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
      // Reorder notes with updated pin state so drag/drop uses the same view as render.
      setNotes((prevNotes) => {
        const sorted = sortWithPins(prevNotes, next);
        saveLocalOrder(sorted.map((n) => n.id));
        return sorted;
      });
      setPinInfo(updated.pinned ? "Pinned note stays at the top. Unpin to reorder it." : null);
      return next;
    });
    void persistMetadata(id, {
      noteId: id,
      pinned: !(metadata[String(id)]?.pinned ?? false),
      tags: metadata[String(id)]?.tags || [],
      versions: metadata[String(id)]?.versions || [],
    });
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
    const current = metadata[String(id)] || { noteId: id, pinned: false, tags: [], versions: [] };
    const updated = { ...current, tags: current.tags.includes(trimmed) ? current.tags : [...current.tags, trimmed] };
    void persistMetadata(id, updated);
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
    const current = metadata[String(id)];
    if (current) {
      const updated = { ...current, tags: current.tags.filter((t) => t !== tag) };
      void persistMetadata(id, updated);
    }
  };

  const persistMetadata = async (id: string | number, metaOverride?: NoteMeta) => {
    if (!user || !isPro) return;
    const meta = metaOverride ?? metadata[String(id)];
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
        // After push, rely on cloud as the source of truth, but reattach local-only images.
        const filtered = (data || []).filter((n: any) => !deletedIds.has(String(n.id)));
        const withImages = await attachImages(filtered);
        const ordered = applyOrder(withImages);
        setNotes(ordered);
        if (pushedCount > 0) {
          setSyncMessage(`Synced ${pushedCount} local note(s) to cloud`);
        setTimeout(() => setSyncMessage(null), 4000);
      }
    }
  };

  // Preserve manual order; only lift pinned items to the top while keeping relative order
  const sortedNotes = useMemo(() => {
    const sorted = sortWithPins(notesForDisplay, metadata);
    // keep order persisted for consistency across refreshes
    saveLocalOrder(sorted.map((n) => n.id));
    return sorted;
  }, [notesForDisplay, metadata]);

  const pinnedCount = useMemo(
    () => sortedNotes.filter((n) => metadata[String(n.id)]?.pinned).length,
    [sortedNotes, metadata]
  );

  const selectedThreadNotes = useMemo(
    () => sortedNotes.filter((n) => threadSelection.has(n.id)),
    [sortedNotes, threadSelection]
  );

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
          replyControl,
          replyListUri,
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
  
      <div className="space-y-5 sm:space-y-6 flex flex-col items-center justify-center min-h-screen py-3 sm:py-6 px-2 sm:px-4 bg-gray-100 relative">

      <main className="w-full max-w-[900px] flex-col flex justify-center space-y-3 sm:space-y-4 md:space-y-5">
        {!user && (
          <div className="mb-6 space-y-2 text-left">
            <h1 className="text-2xl sm:text-3xl font-semibold uppercase mt-4 sm:mt-8 text-slate-900 press-start">
              Because I know you love yapping about games on Bluesky
            </h1>
            <p className="text-md text-slate-600">
              Think of it as a desktop notes app for BlueSky designed specifically for you.
            </p>
          </div>
        )}
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
        {giftOfferCode && !user && (
          <div className="mb-4 rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <div className="font-semibold">You won a free code to PRO (forever), congratulations!</div>
              <div className="text-xs text-emerald-700">
                Use it at checkout: <span className="font-mono">{giftOfferCode}</span>
              </div>
            </div>
            <button
              className="self-start sm:self-auto px-3 py-1 text-xs font-semibold rounded border border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-100"
              onClick={() => navigator.clipboard.writeText(giftOfferCode).catch(() => {})}
            >
              Copy
            </button>
          </div>
        )}
        {(threadMessage || exportMessage || deleteMessage || editMessage || storageMessage) && (
          <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
            {[threadMessage, exportMessage, deleteMessage, editMessage, storageMessage]
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
        {!user && (
          <>
            <Image
              src="/assets/quote.jpg"
              alt="quote from a bluesky user: 'i need a notes app that has the character limit for bluesky and where it cuts down to the next line cuz if i have one more post with a lone word hanging off the bottom i may perish'"
              width={600}
              height={200}
              sizes="100vw"
              className="mx-auto mb-4 mt-4 sm:mt-8 w-full max-w-[600px] h-auto"
            />
            <Image
              src="/assets/bluesky-demo.gif"
              alt="BlueSky Composer demo"
              width={600}
              height={400}
              sizes="100vw"
              className="mx-auto mb-6 sm:mb-8 w-full max-w-[600px] h-auto rounded-lg border border-gray-200 shadow-sm"
            />
            <h2 className="text-center">This is what your notes look like when stored in the cloud.</h2>
            <Image 
              src="/assets/notes_encrypted.png"
              alt="Your notes are always encrypted! This is what it looks like: a random set of characters."
              width={600}
              height={200}
              sizes="100vw"
              className="mx-auto mb-6 sm:mb-8 w-full max-w-[600px] h-auto rounded lg border border-gray-200 shadow-sm"
              />
          </>
        )}

        {user ? <div className="mt-8 mx-auto"><LogoutButton /></div> : null }
      {/* Composer always visible; saves locally when logged out, Supabase + local when logged in */}
      {!user && (
        <div className="mb-3 w-full flex flex-wrap gap-2 justify-center">
          <div className="inline-flex items-center gap-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-rose-500 inline-block" />
            Try it for free without signing in!
          </div>
          <div className="inline-flex items-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-sky-500 inline-block" />
            Grab an app password to post directly to BlueSky!
          </div>
        </div>
      )}
      <Composer
        onNoteSaved={fetchNotes}
        onLocalSave={addLocalNote}
        user={user}
        isPro={plan === "pro"}
        proCheckoutUrl={process.env.NEXT_PUBLIC_PRO_CHECKOUT_URL || ""}
      />
      {!user && (
        <div className="mt-4 mb-2 flex justify-center">
          <button
            type="button"
            onClick={scrollToAuth}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm"
          >
            Sign in to unlock PRO
          </button>
        </div>
      )}
      {pinnedCount > 0 && (
        <div className="mt-4 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {pinInfo || "Pinned notes stay at the top. Unpin to reorder them. Dragging is only available for unpinned notes."}
        </div>
      )}

      <NotesList
        notes={sortedNotes}
        onDelete={deleteNote}
        onReorder={reorderNotes}
        onMoveRelative={moveRelative}
        onUpdate={updateNoteContent}
        onUpdateImageAlt={updateNoteImageAlt}
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
        <>
          {selectedThreadNotes.length > 0 && (
            <div className="mt-4 w-full rounded border border-sky-100 bg-sky-50 px-4 py-3 shadow-sm">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-sm font-semibold text-sky-900">Thread order preview</p>
                <span className="text-xs text-sky-700">
                  Posts publish in this order (pinned stay first).
                </span>
              </div>
              <ol className="mt-2 space-y-1 text-sm text-sky-900">
                {selectedThreadNotes.map((n, idx) => (
                  <li key={n.id} className="flex items-start gap-2">
                    <span className="mt-[2px] inline-flex h-5 w-5 items-center justify-center rounded-full bg-sky-200 text-[11px] font-semibold text-sky-800">
                      {idx + 1}
                    </span>
                    <span className="line-clamp-2 break-words">{n.plaintext || "(empty note)"}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        <div className="mt-4 w-full flex flex-col gap-2 sm:flex-row sm:justify-end sm:items-center">
          <div className="flex flex-col gap-1 w-full sm:w-auto">
            <label className="text-xs font-semibold text-slate-700">Limit replies to thread</label>
            <select
              value={replyControl}
              onChange={(e) => setReplyControl(e.target.value as any)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm"
            >
              <option value="anyone">Anyone can reply</option>
              <option value="no_replies">No replies (lock thread)</option>
              <option value="mentions">Only people mentioned</option>
              <option value="followers">Only my followers</option>
              <option value="following">Only people I follow</option>
              <option value="list">Only people on a list (enter list AT-URI)</option>
            </select>
            {replyControl === "list" && (
              <input
                value={replyListUri}
                onChange={(e) => setReplyListUri(e.target.value)}
                placeholder="at://did:example/app.bsky.graph.list/xxxx"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 shadow-sm"
              />
            )}
          </div>
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
            {postingThread ? "Posting to BlueSky..." : "Post selected to BlueSky"}
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
        </>
      )}

      {!user && (
        <div>
          <div className="mt-8 mb-4 p-4 border rounded bg-white shadow-sm">
            <h4 className="text-lg sm:text-xl md:text-2xl font-bold mb-2">PRO</h4>
            <p className="text-sm sm:text-base md:text-lg text-gray-600 mb-1">Pay once, keep PRO forever. Price: <span className="font-semibold text-gray-800">€15</span>.</p>
            <p className="text-sm sm:text-base md:text-lg text-gray-600 mb-3">Here’s what you get now and what’s coming soon:</p>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm sm:text-base md:text-lg text-left border">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 border text-sm sm:text-base md:text-lg">Feature</th>
                    <th className="px-3 py-2 border text-sm sm:text-base md:text-lg">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { feature: "Organize your notes (drag & drop + up/down + tags/pins)", status: "Available (PRO)" },
                    { feature: "Export notes (JSON + Markdown with tags/images included)", status: "Available (PRO)" },
                    { feature: "Post directly to Bluesky with a secure app password", status: "Available (PRO)" },
                    { feature: "Post selected notes as a thread to Bluesky", status: "Available (PRO)" },
                    { feature: "Copy selected notes to clipboard as text", status: "Available (PRO)" },
                    { feature: "Notes synced to the cloud (encrypted)", status: "Available (PRO)" },
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
          </div>
          <div className="mt-6 mb-4 p-4 border rounded bg-white shadow-sm" id="login-form">
          <h4 className="text-base sm:text-lg font-semibold mb-2">What you get for free</h4>
          <ul className="text-xs sm:text-sm text-gray-700 list-disc list-inside space-y-1">
            <li>Local mode: drafts and saved notes stay on this device</li>
            <li>Write, copy, and delete notes without having to sign in</li>
            <li>Post directly to BlueSky (with the exception of Threads) with a local-only app password</li>
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
