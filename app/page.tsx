"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useMemo, useRef, useState } from "react";
import { contentKey, formatNotesToMarkdown, sortWithPins } from "./lib/noteUtils";
import Composer from "./components/Composer";
import NotesList from "./components/NotesList";
import { FloatingProfile } from "./components/FloatingProfile";
import { loadImagesForKey, saveImagesForKey, deleteImagesForKey } from "./lib/indexedImages";

const LOCAL_NOTES_KEY = "bsky-composer-notes";
const LOCAL_NOTE_META_KEY = "bsky-composer-note-meta";
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
  const [notes, setNotes] = useState<any[]>([]);
  const [metadata, setMetadata] = useState<Record<string, NoteMeta>>({});
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
  const [pinInfo, setPinInfo] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);
  const hasCustomOrderRef = useRef<boolean>(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    loadLocalNotes();
    loadLocalMetadata();
  }, []);

  const getLocalNotes = (): any[] => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(LOCAL_NOTES_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
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
    window.localStorage.setItem(LOCAL_ORDER_KEY, JSON.stringify(ids.map(String)));
    window.localStorage.setItem(LOCAL_HAS_CUSTOM_ORDER_KEY, isCustom ? "true" : "false");
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
    setNotes(applyOrder(safeLocal));
    const withImages = await Promise.all(
      safeLocal.map(async (note) => {
        try {
          const key = contentKey(note.plaintext);
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
    setNotes(applyOrder(withImages));
  };

  const loadLocalMetadata = () => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(LOCAL_NOTE_META_KEY);
      if (!raw) { setMetadata({}); return; }
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") setMetadata(parsed);
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
    setNotes((prev: any[]) => {
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
      void saveImagesForKey(contentKey(content), images.slice(0, 4));
    }
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

  const deleteNote = (id: string | number) => {
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
    setMetadata((prev: any) => {
      const next = { ...prev };
      delete next[String(id)];
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LOCAL_NOTE_META_KEY, JSON.stringify(next));
      }
      return next;
    });
    setDeleteMessage("Note deleted");
    setTimeout(() => setDeleteMessage(null), 2500);
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
      if (typeof window !== "undefined") persistLocalNotes(updated);
      return updated;
    });
  };

  const updateNoteContent = (id: string | number, newText: string) => {
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
    setNotes((prev: any[]) => {
      const next = prev.map((n) =>
        String(n.id) === String(id) ? { ...n, plaintext: safe } : n
      );
      if (typeof window !== "undefined") persistLocalNotes(next);
      return next;
    });
    if (existing?.plaintext) migrateImageForEdit(existing.plaintext, safe);
    setEditMessage("Note updated");
    setTimeout(() => setEditMessage(null), 2500);
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
      if (typeof window !== "undefined") persistLocalNotes(next);
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
      if (typeof window !== "undefined") persistLocalNotes(next);
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
    for (const id of Array.from(threadSelection)) {
      deleteNote(id);
    }
    setThreadSelection(new Set());
  };

  const togglePin = (id: string | number) => {
    setMetadata((prev: any) => {
      const current = prev[String(id)] || { noteId: id, pinned: false, tags: [], versions: [] };
      const updated = { ...current, pinned: !current.pinned };
      const next = { ...prev, [String(id)]: updated };
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LOCAL_NOTE_META_KEY, JSON.stringify(next));
      }
      setNotes((prevNotes: any[]) => {
        const sorted = sortWithPins(prevNotes, next);
        saveLocalOrder(sorted.map((n) => n.id), { custom: hasCustomOrderRef.current });
        return sorted;
      });
      setPinInfo(updated.pinned ? "Pinned note stays at the top. Unpin to reorder it." : null);
      return next;
    });
  };

  const addTag = (id: string | number, tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed) return;
    setMetadata((prev: any) => {
      const current = prev[String(id)] || { noteId: id, pinned: false, tags: [], versions: [] };
      if (current.tags.includes(trimmed)) return prev;
      const updated = { ...current, tags: [...current.tags, trimmed] };
      const next = { ...prev, [String(id)]: updated };
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LOCAL_NOTE_META_KEY, JSON.stringify(next));
      }
      return next;
    });
  };

  const removeTag = (id: string | number, tag: string) => {
    setMetadata((prev: any) => {
      const current = prev[String(id)];
      if (!current) return prev;
      const updated = { ...current, tags: current.tags.filter((t: string) => t !== tag) };
      const next = { ...prev, [String(id)]: updated };
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LOCAL_NOTE_META_KEY, JSON.stringify(next));
      }
      return next;
    });
  };

  const sortedNotes = useMemo(() => {
    const sorted = sortWithPins(notes, metadata);
    saveLocalOrder(sorted.map((n) => n.id), { custom: hasCustomOrderRef.current });
    return sorted;
  }, [notes, metadata]);

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
            return { text: n.plaintext || "", images: imgs };
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

  const exportNotes = (format: "json" | "md") => {
    if (exporting) return;
    setExporting(true);
    try {
      if (format === "json") {
        const enriched = notes.map((note: any) => {
          const meta = metadata[String(note.id)] || {};
          return { ...note, tags: (meta as any).tags || [], imageData: note.imageData || null };
        });
        const blob = new Blob([JSON.stringify(enriched, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "bluesky-composer-notes.json";
        link.click();
        URL.revokeObjectURL(url);
        setExportMessage("Exported notes to JSON");
      } else {
        const md = formatNotesToMarkdown(notes, metadata);
        const blob = new Blob([md], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "bluesky-composer-notes.md";
        link.click();
        URL.revokeObjectURL(url);
        setExportMessage("Exported notes to Markdown");
      }
      setTimeout(() => setExportMessage(null), 4000);
    } catch (err: any) {
      setExportMessage(err?.message || "Export failed");
      setTimeout(() => setExportMessage(null), 4000);
    } finally {
      setExporting(false);
    }
  };

  return !isClient ? (
    <div className="min-h-screen bg-gray-100 text-slate-900 flex items-center justify-center px-4">
      <div className="text-sm text-slate-700">Loading…</div>
    </div>
  ) : (
    <>
      <div className="min-h-screen bg-gray-100 text-slate-900">
        <div className="w-full bg-white border-b border-slate-200 shadow-sm">
          <div className="max-w-[1400px] mx-auto px-6 sm:px-10 py-5 flex flex-col sm:flex-row items-center gap-6 sm:gap-10">
            <div className="flex-shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-sm">
              <img
                src="/assets/quote.jpg"
                alt="Bluesky user asking for a notes app that respects the character limit"
                className="h-28 w-auto object-cover"
              />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight leading-tight">The Bluesky composer your threads deserve.</h1>
              <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                Write with Bluesky&apos;s 300-character limit in mind, split long posts into clean threads, and never again have a lone word hanging off the bottom.
              </p>
            </div>
          </div>
        </div>
        <div className="max-w-[1400px] mx-auto px-3 sm:px-6 py-6 space-y-8">

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

          <div className="flex flex-col items-center gap-8">
            <div className="w-full max-w-4xl">
              <Composer
                onLocalSave={addLocalNote}
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
                      onClick={() => exportNotes("json")}
                      disabled={exporting}
                      className={`px-4 py-2 text-sm font-semibold rounded text-white shadow-sm w-full sm:w-auto ${
                        exporting ? "bg-indigo-300 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-700"
                      }`}
                    >
                      {exporting ? "Exporting..." : "Export notes (JSON)"}
                    </button>
                    <button
                      onClick={() => exportNotes("md")}
                      disabled={exporting}
                      className={`px-4 py-2 text-sm font-semibold rounded text-white shadow-sm w-full sm:w-auto ${
                        exporting ? "bg-purple-300 cursor-not-allowed" : "bg-purple-600 hover:bg-purple-700"
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
