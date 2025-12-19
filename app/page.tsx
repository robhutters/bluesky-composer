"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import { contentKey, mergeLocalAndCloud, formatNotesToMarkdown, canExportNotes, sortWithPins } from "./lib/noteUtils";
import Composer from "./components/Composer";
import NotesList from "./components/NotesList";
import { FloatingProfile } from "./components/FloatingProfile";
import LogoutButton from "./components/LogoutButton";
import Image from "next/image";
import { useAuth } from "./providers/AuthProvider";
import { loadImagesForKey, saveImagesForKey, deleteImagesForKey } from "./lib/indexedImages";
import DiscoverFeed from "./components/DiscoverFeed";

const HERO_FEATURES = [
  {
    title: "Composer built for 300 characters",
    description:
      "See the exact BlueSky limit, auto-save at 300 chars, drop emoji, and clip long thoughts into threads instantly.",
  },
  {
    title: "Desktop feed browser",
    description:
      "Scroll Discover, Following, Mutuals, and your own timeline side-by-side. Tap any card to preload replies in the Composer.",
  },
  {
    title: "Media + threads without fuss",
    description:
      "Post up to four images or inline video, export Markdown, and keep encrypted backups without ever leaving your browser.",
  },
  {
    title: "Gamer-first workflow",
    description:
      "Keyboard shortcuts, drag-and-drop organization, Today picker, and quick copy buttons help you ship a take and get back to your games.",
  },
];

const APP_PASSWORD_STEPS = [
  {
    title: "Step 1 · Open BlueSky settings",
    description: "On the BlueSky app or web client, open the sidebar and tap Settings.",
    image: "/assets/instructions/step_1.jpg",
  },
  {
    title: "Step 2 · Privacy & Security",
    description: "Head to Privacy & Security → App Passwords. This is where BlueSky issues secondary passwords.",
    image: "/assets/instructions/step_2.jpg",
  },
  {
    title: "Step 3 · Create an app password",
    description: "Create a new password (name it anything). BlueSky shows it once—copy it somewhere safe.",
    image: "/assets/instructions/step_3.jpg",
  },
  {
    title: "Step 4 · Paste it into BlueSky Composer",
    description: "Inside the Composer, paste your handle + app password. That’s all you need to post directly.",
    image: null,
  },
];

const LOCAL_NOTES_KEY = "bsky-composer-notes";
const LOCAL_NOTE_META_KEY = "bsky-composer-note-meta";
const LOCAL_VISITOR_KEY = "bsky-composer-visitor";
const LOCAL_IMAGE_MAP_KEY = "bsky-composer-note-images";
const LOCAL_ORDER_KEY = "bsky-composer-note-order";
const LOCAL_HAS_CUSTOM_ORDER_KEY = "bsky-composer-has-custom-order";
const MAX_CHARACTERS = 300;

type NoteMeta = {
  noteId: string | number;
  pinned: boolean;
  tags: string[];
  versions?: { content: string; created_at: string }[];
};

const sortOldestFirst = (list: any[]) => {
  return [...(Array.isArray(list) ? list : [])].sort((a, b) => {
    const dateA = new Date(a?.created_at || a?.createdAt || a?.updated_at || 0).getTime() || 0;
    const dateB = new Date(b?.created_at || b?.createdAt || b?.updated_at || 0).getTime() || 0;
    return dateA - dateB;
  });
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
  const [visitorId, setVisitorId] = useState<string | null>(null);
  const [pinInfo, setPinInfo] = useState<string | null>(null);
  const [notesLoading, setNotesLoading] = useState(false);
  const lastStableNotesRef = useRef<any[]>([]);
  const hasCustomOrderRef = useRef<boolean>(false);
  const [replyTarget, setReplyTarget] = useState<any | null>(null);

  const scrollToInstructions = () => {
    if (typeof document === "undefined") return;
    const el = document.getElementById("app-password-steps");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const scrollToComposer = () => {
    if (typeof document === "undefined") return;
    const el = document.getElementById("composer-root");
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
    ensureVisitorId();
  }, []);

  // Early access mode (no gift code or paywall)

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
      const customFlag = window.localStorage.getItem(LOCAL_HAS_CUSTOM_ORDER_KEY) === "true";
      const raw = window.localStorage.getItem(LOCAL_ORDER_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      hasCustomOrderRef.current = customFlag && Array.isArray(parsed) && parsed.length > 0;
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  };

  const saveLocalOrder = (ids: Array<string | number>, options?: { custom?: boolean }) => {
    if (typeof window === "undefined") return;
    if (!ids.length) {
      window.localStorage.removeItem(LOCAL_ORDER_KEY);
      window.localStorage.removeItem(LOCAL_HAS_CUSTOM_ORDER_KEY);
      hasCustomOrderRef.current = false;
      return;
    }
    const isCustom = options?.custom ?? hasCustomOrderRef.current;
    const flagValue = isCustom ? "true" : "false";
    window.localStorage.setItem(LOCAL_ORDER_KEY, JSON.stringify(ids.map(String)));
    window.localStorage.setItem(LOCAL_HAS_CUSTOM_ORDER_KEY, flagValue);
    hasCustomOrderRef.current = isCustom;
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
    setNotes(applyOrder(safeLocal));
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
    setNotes(applyOrder(withImages));
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

  const dedupeByContent = (list: any[]) => {
    const seen = new Set<string>();
    const result: any[] = [];
    for (const note of list || []) {
      const key = contentKey(note?.plaintext || "");
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(note);
    }
    return result;
  };

  const addLocalNote = (content: string, images?: { data: string; alt: string }[]) => {
    if (!content) return;
    const key = contentKey(content);
    setNotes((prev) => {
      const base = Array.isArray(prev) ? prev : [];
      const existingIdx = base.findIndex((n: any) => contentKey(n.plaintext) === key);
      const now = Date.now();
      const newNote = {
        id: existingIdx >= 0 ? base[existingIdx].id : now,
        plaintext: content,
        created_at: existingIdx >= 0 ? base[existingIdx].created_at : new Date().toISOString(),
        imageData: images?.[0]?.data || null,
        images: Array.isArray(images) ? images.slice(0, 4) : [],
      };
      let next;
      if (existingIdx >= 0) {
        next = [...base];
        next[existingIdx] = newNote;
      } else {
        next = [newNote, ...base];
      }
      if (typeof window !== "undefined") {
        try {
          const deduped = dedupeByContent(next);
          const ordered = hasCustomOrderRef.current ? deduped : sortOldestFirst(deduped);
          persistLocalNotes(ordered);
          saveLocalOrder(ordered.map((n) => n.id), { custom: hasCustomOrderRef.current });
          return ordered;
        } catch (err) {
          console.error("Failed to store note locally", err);
          setStorageMessage("Local storage is full. Delete a few notes to keep saving.");
          setTimeout(() => setStorageMessage(null), 4000);
          return base;
        }
      } else {
        const deduped = dedupeByContent(next);
        const ordered = hasCustomOrderRef.current ? deduped : sortOldestFirst(deduped);
        saveLocalOrder(ordered.map((n) => n.id), { custom: hasCustomOrderRef.current });
        return ordered;
      }
    });
    if (images?.length) {
      const keyStr = contentKey(content);
      void saveImagesForKey(keyStr, images.slice(0, 4));
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
    const safe = Array.isArray(arr) ? arr.filter((n) => n && typeof n.id !== "undefined") : [];
    if (!safe.length) return arr;
    if (hasCustomOrderRef.current && order.length) {
      const rank = new Map<string, number>();
      order.forEach((id, idx) => rank.set(String(id), idx));
      return [...safe].sort((a, b) => {
        const ra = rank.has(String(a.id)) ? (rank.get(String(a.id)) as number) : Number.MAX_SAFE_INTEGER;
        const rb = rank.has(String(b.id)) ? (rank.get(String(b.id)) as number) : Number.MAX_SAFE_INTEGER;
        return ra - rb;
      });
    }
    return sortOldestFirst(safe);
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
        const deduped = dedupeByContent(arr);
        setNotes((prev: any[]) => {
          // Avoid blanking the list while fetch is in flight; keep prior notes if new payload is empty.
          if (!deduped.length && Array.isArray(prev) && prev.length) return prev;
          return deduped;
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
            saveLocalOrder([], { custom: false });
          }
        }
        await fetchMetadata();
      } else {
        const merged = mergeLocalAndCloud(local, Array.isArray(data) ? data : []).filter(
          (note: any) => !deletedIds.has(String(note.id))
        );
        const hydrated = await attachImages(merged);
        const ordered = applyOrder(hydrated);
        applySafeNotes(ordered);
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
    const base = notesLoading && lastStableNotesRef.current.length ? lastStableNotesRef.current : notes;
    return Array.isArray(base) ? base : [];
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
          saveLocalOrder(next.map((n) => n.id), { custom: hasCustomOrderRef.current });
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
          saveLocalOrder(next.map((n: any) => n.id), { custom: hasCustomOrderRef.current });
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
      hasCustomOrderRef.current = true;
      saveLocalOrder(next.map((n) => n.id), { custom: true });
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
      hasCustomOrderRef.current = true;
      saveLocalOrder(next.map((n) => n.id), { custom: true });
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

  const selectAllThreadNotes = () => {
    setThreadSelection(new Set(sortedNotes.map((note) => note.id)));
  };

  const clearThreadSelection = () => {
    setThreadSelection(new Set());
  };

  const deleteSelectedThreadNotes = async () => {
    if (!threadSelection.size) return;
    const ids = Array.from(threadSelection);
    for (const id of ids) {
      await deleteNote(id);
    }
    setThreadSelection(new Set());
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
        saveLocalOrder(sorted.map((n) => n.id), { custom: hasCustomOrderRef.current });
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
      const deduped = dedupeByContent(Array.isArray(ordered) ? ordered : []);
      setNotes(deduped);
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
    saveLocalOrder(sorted.map((n) => n.id), { custom: hasCustomOrderRef.current });
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
    setThreadMessage("Checking Bluesky availability...");
    const ok = await (async () => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        const res = await fetch("https://bsky.social/xrpc/com.atproto.server.describeServer", {
          method: "GET",
          signal: controller.signal,
        });
        clearTimeout(timer);
        return res.ok;
      } catch {
        return false;
      }
    })();
    if (!ok) {
      setThreadMessage("Bluesky seems unavailable right now. Try again soon.");
      setTimeout(() => setThreadMessage(null), 4000);
      setPostingThread(false);
      return;
    }
    setThreadMessage("Compressing images, this may take a moment...");
    try {
      const res = await fetch("/api/bluesky/thread", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: handle,
          appPassword,
          posts: selectedNotes.map((n) => {
            const imgs = Array.isArray(n.images)
              ? n.images
                  .filter((img: any) => typeof img?.data === "string")
                  .slice(0, 4)
              : n.imageData
                ? [{ data: n.imageData, alt: n.imageAlt || "" }]
                : [];
            return {
              text: n.plaintext || "",
              images: imgs,
            };
          }),
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
  
      <div className="space-y-5 sm:space-y-6 flex flex-col items-center justify-center min-h-screen py-4 sm:py-8 px-2 sm:px-5 bg-gray-100 text-slate-900 relative overflow-hidden">

      <div className="w-full max-w-[1400px] flex-col flex justify-center space-y-4 sm:space-y-6 md:space-y-7">
        {!user && (
          <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_0.7fr] gap-5 lg:gap-6 items-center">
            <div className="space-y-3 text-left">
              <h1 className="text-2xl sm:text-3xl font-semibold uppercase mt-2 sm:mt-4 text-slate-900 press-start">
                Because you love yapping about games.
              </h1>
              <p className="text-base sm:text-lg text-slate-700 font-[500]">
               A desktop-friendly notes app for BlueSky. 
              </p>
              <div className="flex flex-col md:flex-row flex-wrap gap-2">
               
                   <span className="mr-2 inline-flex items-center gap-2 rounded-full bg-white border border-gray-200 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                  <span className="h-2 w-2 rounded-full bg-rose-400 inline-block" />
                  No account necessary
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-white border border-gray-200 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                  <span className="h-2 w-2 rounded-full bg-sky-400 inline-block" />
                  Post to BlueSky with your app password
                </span>
             
              
               
                <span className="inline-flex items-center gap-2 rounded-full bg-white border border-gray-200 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                  <span className="h-2 w-2 rounded-full bg-purple-400 inline-block" />
                  Video posting ready today
                </span>
          
                
              </div>
            </div>
            <div className="relative">
              <div className="rounded-2xl border border-gray-200 bg-white shadow-xl p-4 sm:p-5">
                <div className="flex items-center justify-between text-xs text-slate-600 mb-3">
                  <span className="font-semibold text-slate-900">Composer preview</span>
                  <span className="px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px]">
                    Free posts enabled
                  </span>
                </div>
                <div className="space-y-3">
                  <div className="h-3 w-2/3 rounded bg-gray-200" />
                  <div className="h-3 w-1/2 rounded bg-gray-200" />
                  <div className="h-24 rounded-lg bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 shadow-inner" />
                  <div className="flex gap-2">
                    <div className="flex-1 rounded-md border border-sky-200 bg-sky-50 text-sky-700 text-center py-2 text-xs font-semibold shadow">
                      Post to Bluesky (free)
                    </div>
                    <div className="flex-1 rounded-md border border-pink-200 bg-pink-50 text-pink-700 text-center py-2 text-xs font-semibold shadow">
                      Thread preview
                    </div>
                  </div>
                </div>
              </div>
            </div>
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

        {/* Main layout: composer/notes + Discover feed */}
        <div className="">
          <div className="space-y-4 w-full">
        {!user && (
          <>
           
          
            <section id="app-password-steps" className="my-24 space-y-6">
              <div className="text-center">
                <p className="text-sm uppercase tracking-[0.2em] text-slate-500">No account required</p>
                <h3 className="text-3xl font-bold text-slate-900 mt-2">All you need is a BlueSky app password</h3>
                <p className="text-sm text-slate-600 mt-2">Follow these quick steps once. Composer stores your handle + app password securely in your browser.</p>
              </div>
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                {APP_PASSWORD_STEPS.map((step, idx) => (
                  <div key={step.title} className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Step {idx + 1}</p>
                      <span className="text-[11px] text-slate-400">{idx < 3 ? "BlueSky app" : "Composer"}</span>
                    </div>
                    <h4 className="text-lg font-semibold text-slate-900">{step.title}</h4>
                    <p className="text-sm text-slate-700">{step.description}</p>
                    {step.image ? (
                      <Image
                        src={step.image}
                        alt={step.title}
                        width={400}
                        height={280}
                        className="w-full rounded-xl border border-slate-200 shadow-sm object-cover"
                      />
                    ) : (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm text-slate-500">
                        Paste the password into the Composer’s Bluesky login section.
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        <div className="mt-24 grid grid-cols-1 gap-6 items-start xl:grid-cols-[minmax(0,1fr)_minmax(0,640px)_minmax(0,520px)]">
          <div className="space-y-4" id="composer-root">
            {replyTarget && (
              <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-600 font-semibold">Selected post</div>
                    <div className="font-semibold text-slate-900">
                      {replyTarget.authorDisplay || replyTarget.authorHandle}
                    </div>
                    <div className="text-xs text-slate-500">{replyTarget.authorHandle}</div>
                    {replyTarget.feedName && (
                      <div className="text-[11px] text-slate-500">Feed: {replyTarget.feedName}</div>
                    )}
                  </div>
                  <button
                    className="text-xs text-slate-600 underline"
                    onClick={() => setReplyTarget(null)}
                  >
                    Clear
                  </button>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-slate-800">
                  {replyTarget.contentSummary || replyTarget.text || "(no text)"}
                </p>
                {Array.isArray(replyTarget.images) && replyTarget.images.length > 0 && (
                  <div className="mt-3 grid grid-cols-1 gap-3">
                    {replyTarget.images.slice(0, 4).map((img: any, idx: number) => (
                      <div key={idx} className="relative overflow-hidden rounded border border-sky-100 bg-white">
                        {img?.thumb ? (
                          <Image
                            src={img.thumb}
                            alt={img.alt || "Discover image"}
                            width={420}
                            height={280}
                            className="w-full h-auto object-cover"
                          />
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-4 max-w-[650px] mx-auto">
            {user ? <div className="mt-2"><LogoutButton /></div> : null }
            {/* Composer always visible; saves locally when logged out, Supabase + local when logged in */}
            {!user && (
              <div className="mb-3 w-full flex flex-wrap gap-2 justify-center">
            
              </div>
            )}
        <Composer
          onNoteSaved={fetchNotes}
          onLocalSave={addLocalNote}
          user={user}
          isPro={plan === "pro"}
          replyTarget={replyTarget ? { uri: replyTarget.uri, cid: replyTarget.cid } : null}
        />
          </div>

          <DiscoverFeed enabled onSelect={setReplyTarget} />
        </div>

        {/* Notes + thread controls below the grid, full width */}
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
          canOrganize
          allowThreadSelect
          threadSelectEnabled
          selectedForThread={threadSelection}
          onToggleThreadSelect={toggleThreadSelect}
          onSelectAllThreads={selectAllThreadNotes}
          onClearThreadSelection={clearThreadSelection}
          onDeleteSelectedThreads={deleteSelectedThreadNotes}
        />

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
          <div className="mt-4 w-full lg:justify-center flex flex-wrap flex-col gap-2 sm:flex-row sm:justify-end sm:items-center">
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
          <div className="flex flex-row mt-4 items-center gap-2 flex-wrap">
                <button
                onClick={() => exportCloudNotes("json")}
                disabled={exporting || !user}
                className={`px-4 py-2 text-sm font-semibold rounded text-white shadow-sm w-full sm:w-auto ${
                  exporting || !user ? "bg-indigo-300 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-700"
                }`}
              >
                {exporting ? "Exporting..." : "Export notes (JSON)"}
              </button>
              <button
                onClick={() => exportCloudNotes("md")}
                disabled={exporting || !user}
                className={`px-4 py-2 text-sm font-semibold rounded text-white shadow-sm w-full sm:w-auto ${
                  exporting || !user ? "bg-purple-300 cursor-not-allowed" : "bg-purple-600 hover:bg-purple-700"
                }`}
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
          </div>
        </>

      <div className="flex flex-col justify-center items-center">
        <div className="mt-24 mb-4 p-4 max-w-[900px] border rounded bg-white shadow-sm">
          <h4 className="text-lg sm:text-xl md:text-2xl font-bold mb-2">Early Access Roadmap</h4>
          <p className="text-sm sm:text-base md:text-lg text-gray-600 mb-3">
            You’re getting everything for free while I build out the feature set. Here’s what’s live (and what’s coming) during early access:
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-full	text-sm sm:text-base md:text-lg text-left border">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 border text-sm sm:text-base md:text-lg">Feature</th>
                  <th className="px-3 py-2 border text-sm sm:text-base md:text-lg">Status</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { feature: "Post threads to Bluesky", status: "Available now" },
                  { feature: "Post videos to Bluesky", status: "Available now" },
                  { feature: "Organize notes (drag/drop + up/down + tags/pins)", status: "Available now" },
                  { feature: "Discover/Following/Mutuals feeds", status: "Available now" },
                  { feature: "Export notes (JSON + Markdown)", status: "Available now" },
                  { feature: "Version history & restore", status: "Coming later" },
                  { feature: "Advanced search & filters", status: "Coming later" },
                ].map((row) => (
                  <tr key={row.feature}>
                    <td className="px-3 py-2 border">{row.feature}</td>
                    <td className={`px-3 py-2 border ${row.status.includes("Available") ? "text-emerald-700" : "text-orange-600"}`}>
                      {row.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
     
      </div>
      <footer className="mt-24 text-center text-gray-500 text-sm">
        &copy; {new Date().getFullYear()} BlueSky Composer. Built with NextJS, React, TailwindCSS, and ❤️ by <a href="https://robhutters.com" className="underline">Rob Hutters</a>. Hosted on <a href="https://vercel.com" className="underline">Vercel</a>.
      </footer>
    </div>
  </div>
  </div>
  </div>
  <FloatingProfile />

</>

  );
}
