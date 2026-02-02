"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-hooks/exhaustive-deps */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import { contentKey, mergeLocalAndCloud, formatNotesToMarkdown, canExportNotes, sortWithPins } from "./lib/noteUtils";
import Composer from "./components/Composer";
import NotesList from "./components/NotesList";
import { FloatingProfile } from "./components/FloatingProfile";
import { useAuth } from "./providers/AuthProvider";
import { loadImagesForKey, saveImagesForKey, deleteImagesForKey } from "./lib/indexedImages";

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
  const notesFetchInFlightRef = useRef(false);
  const lastStableNotesRef = useRef<any[]>([]);
  const [isClient, setIsClient] = useState(false);
  const hasCustomOrderRef = useRef<boolean>(false);

  const ensureVisitorId = () => {
    if (typeof window === "undefined") return null;
    let vid = window.localStorage.getItem(LOCAL_VISITOR_KEY);
    if (!vid) {
      const fallback = () => {
        try {
          const cryptoObj: Crypto | undefined = (window as any).crypto || (window as any).msCrypto;
          if (cryptoObj && typeof (cryptoObj as any).randomUUID === "function") {
            return (cryptoObj as any).randomUUID();
          }
          if (cryptoObj?.getRandomValues) {
            const arr = new Uint8Array(16);
            cryptoObj.getRandomValues(arr);
            arr[6] = (arr[6] & 0x0f) | 0x40;
            arr[8] = (arr[8] & 0x3f) | 0x80;
            return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
          }
        } catch {
          /* ignore */
        }
        return `vid-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      };
      const generatedVid = fallback();
      vid = generatedVid;
      window.localStorage.setItem(LOCAL_VISITOR_KEY, generatedVid);
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

  useEffect(() => {
    setIsClient(true);
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
  };

  const fetchNotes = useCallback(
    async (opts?: { force?: boolean }) => {
      if (notesFetchInFlightRef.current && !opts?.force) return;
      notesFetchInFlightRef.current = true;
      setNotesLoading(true);
      try {
        if (!user) return;
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const res = await fetch("/api/getNotes?includeMeta=true", {
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
            if (!deduped.length && Array.isArray(prev) && prev.length) return prev;
            return deduped;
          });
        };

        const cloudNotes = Array.isArray(data?.notes) ? data.notes : Array.isArray(data) ? data : [];

        if (isPro) {
          const filteredCloud = cloudNotes.filter((note: any) => !deletedIds.has(String(note.id)));
          const withImages = await attachImages(filteredCloud);
          const ordered = applyOrder(withImages);
          applySafeNotes(ordered);

          if (local.length) {
            await syncLocalNotesToCloud(cloudNotes, session.access_token);
            if (typeof window !== "undefined") {
              window.localStorage.setItem(LOCAL_NOTES_KEY, JSON.stringify([]));
              saveLocalOrder([], { custom: false });
            }
          }
        } else {
          const merged = mergeLocalAndCloud(local, cloudNotes).filter(
            (note: any) => !deletedIds.has(String(note.id))
          );
          const hydrated = await attachImages(merged);
          const ordered = applyOrder(hydrated);
          applySafeNotes(ordered);
        }

        const metaRows = data?.meta || [];
        if (Array.isArray(metaRows)) {
          const map: Record<string, NoteMeta> = {};
          for (const row of metaRows) {
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
      } finally {
        notesFetchInFlightRef.current = false;
        setNotesLoading(false);
      }
    },
    [applyOrder, attachImages, dedupeByContent, deletedIds, getLocalNotes, isPro, user]
  );

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
    /* metadata now bundled in fetchNotes */
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

  // Live updates: subscribe to Supabase changes for this user; no polling fallback.
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

    return () => {
      void channel.unsubscribe();
    };
  }, [fetchNotes, isPro, user]);

  return !isClient ? (
    <div className="min-h-screen bg-gray-100 text-slate-900 flex items-center justify-center px-4">
      <div className="text-sm text-slate-700">Loading…</div>
    </div>
  ) : (
    <>
      <div className="min-h-screen bg-gray-100 text-slate-900 py-6">
        <div className="max-w-[1400px] mx-auto px-3 sm:px-6 space-y-8">
          <div className="flex flex-wrap items-center gap-3 justify-end">
            <button
              onClick={() => {
                void fetchNotes({ force: true });
              }}
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
            >
              Sync notes now
            </button>
          </div>

          <div className="w-full max-w-5xl mx-auto rounded-3xl border border-slate-200 bg-white/90 shadow-lg p-6 sm:p-10 flex flex-col md:flex-row gap-6 md:gap-10 items-center">
            <div className="flex-1 space-y-3">
              <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">Drafts for BlueSky, finally here.</h1>
              <p className="text-sm sm:text-base text-slate-700 leading-relaxed">
                Capture long posts, split them into clean threads, and never lose a draft again.
              </p>
            </div>
            <div className="flex-1 w-full">
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm">
                <img
                  src="/assets/quote.jpg"
                  alt="BlueSky user upset about dangling words"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>

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
          {upgradeMessage && (
            <div className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 shadow-sm">
              {upgradeMessage}
            </div>
          )}
          {syncMessage && (
            <div className="rounded border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 shadow-sm">
              {syncMessage}
            </div>
          )}

          <div className="flex flex-col items-center gap-8">
            <div className="w-full max-w-4xl">
              <Composer
                onNoteSaved={fetchNotes}
                onLocalSave={addLocalNote}
                user={user}
                isPro={plan === "pro"}
                replyTarget={null}
                flat={false}
              />
            </div>

            <div className="w-full max-w-5xl rounded-3xl border border-slate-200 bg-white/90 overflow-hidden shadow-md divide-y">
              <div className="p-5 sm:p-7 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.25em] text-slate-500">Compose</p>
                    <h3 className="text-xl font-bold text-slate-900">Notes & Threads</h3>
                  </div>
                  <div className="text-xs text-slate-500 bg-slate-100 border border-slate-200 px-3 py-1 rounded-full">Local-first, autosave on</div>
                </div>
                {pinnedCount > 0 && (
                  <div className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
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

                {selectedThreadNotes.length > 0 && (
                  <div className="w-full rounded border border-sky-100 bg-sky-50 px-4 py-3 shadow-sm">
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

                <div className="w-full flex flex-wrap gap-3 items-start justify-between">
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
                  <div className="flex flex-wrap gap-2 w-full sm:w-auto">
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
                      className={`px-4 py-2 text-sm font-semibold rounded text-white shadow-sm w-full sm:w-auto ${
                        postingThread || threadSelection.size === 0 ? "bg-sky-300 cursor-not-allowed" : "bg-sky-600 hover:bg-sky-700"
                      }`}
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
                      className="px-4 py-2 text-sm font-semibold rounded text-white shadow-sm w-full sm:w-auto bg-slate-600 hover:bg-slate-700"
                      disabled={threadSelection.size === 0}
                    >
                      Copy selected (thread)
                    </button>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
      <FloatingProfile />
    </>
  );
}
