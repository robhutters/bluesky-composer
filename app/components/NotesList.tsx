"use client";

import { useState } from "react";

type NotesListProps = {
  notes: any[];
  onDelete: (id: string | number) => void;
  onReorder: (fromId: string | number, toId: string | number) => void;
  onMoveRelative: (id: string | number, direction: "up" | "down") => void;
  onUpdate: (id: string | number, text: string) => Promise<void> | void;
  onUpdateImageAlt?: (id: string | number, index: number, alt: string) => void;
  metadata: Record<string, { pinned: boolean; tags: string[] }>;
  onTogglePin: (id: string | number) => void;
  onAddTag: (id: string | number, tag: string) => void;
  onRemoveTag: (id: string | number, tag: string) => void;
  canOrganize: boolean;
  allowThreadSelect?: boolean;
  selectedForThread?: Set<string | number>;
  onToggleThreadSelect?: (id: string | number) => void;
  threadSelectEnabled?: boolean;
  onSelectAllThreads?: () => void;
  onClearThreadSelection?: () => void;
  onDeleteSelectedThreads?: () => void;
};

export default function NotesList({
  notes,
  onDelete,
  onReorder,
  onMoveRelative,
  onUpdate,
  onUpdateImageAlt,
  metadata,
  onTogglePin,
  onAddTag,
  onRemoveTag,
  canOrganize,
  allowThreadSelect = false,
  selectedForThread,
  onToggleThreadSelect,
  threadSelectEnabled = true,
  onSelectAllThreads,
  onClearThreadSelection,
  onDeleteSelectedThreads,
}: NotesListProps) {
  const [copiedId, setCopiedId] = useState<string | number | null>(null);
  const [tagInputs, setTagInputs] = useState<Record<string | number, string>>({});
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [editingText, setEditingText] = useState<string>("");
  const [savingEdit, setSavingEdit] = useState(false);
 

  const handleCopy = async (id: string | number, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => {
        setCopiedId((prev) => (prev === id ? null : prev));
      }, 1500);
    } catch (error) {
      console.error("Failed to copy note", error);
    }
  };

  return (
    <div className="mt-6 max-w-[700px] mx-auto">
      <h3 className="text-lg font-semibold mb-3">Your Notes</h3>
      <p className="text-xs text-gray-600 mb-2">Drag and drop to reorder your notes. Use the up/down buttons below for quick adjustments.</p>
      {(!notes || notes.length === 0) && (
        <div className="mb-4 rounded border-2 border-dashed border-gray-300 bg-white px-4 py-6 text-center text-sm text-gray-600">
          No notes to display yet.
        </div>
      )}
      {allowThreadSelect && (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-gray-600">
          <button
            type="button"
            onClick={() => threadSelectEnabled && onSelectAllThreads?.()}
            className="px-2 py-1 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700"
            disabled={!threadSelectEnabled}
          >
            Select all notes
          </button>
          <button
            type="button"
            onClick={() => threadSelectEnabled && onClearThreadSelection?.()}
            className="px-2 py-1 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700"
            disabled={!threadSelectEnabled}
          >
            Clear selection
          </button>
          <button
            type="button"
            onClick={() => onDeleteSelectedThreads?.()}
            className="px-2 py-1 rounded border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold"
            disabled={!selectedForThread || selectedForThread.size === 0}
          >
            Delete selected notes
          </button>
        </div>
      )}
      <ul className="space-y-3">
        {notes.map((note, index) => {
          const meta = metadata[String(note.id)] || { pinned: false, tags: [] };
          const isPinned = meta.pinned;
          return (
            <li
              key={note.id}
            className={`p-4 border rounded bg-white ${canOrganize ? "" : "select-none"}`}
            draggable={canOrganize && !isPinned}
            onDragStart={(e) => {
              if (!canOrganize || isPinned) return;
              e.dataTransfer.setData("text/plain", String(note.id));
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              if (!canOrganize || isPinned) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            onDrop={(e) => {
              if (!canOrganize || isPinned) return;
              e.preventDefault();
              const fromId = e.dataTransfer.getData("text/plain");
              if (fromId) {
                onReorder(fromId, note.id);
              }
              e.dataTransfer.clearData();
            }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2 text-xs text-gray-500">
                <div className="flex items-center gap-2">
                  {meta.pinned && <span className="text-amber-600 font-semibold">★ Pinned</span>}
                  {allowThreadSelect && (
                    <label className="flex items-center gap-1 text-[11px] text-gray-600">
                      <input
                        type="checkbox"
                    checked={selectedForThread?.has(note.id) || false}
                    onChange={() => threadSelectEnabled && onToggleThreadSelect && onToggleThreadSelect(note.id)}
                    className="h-3 w-3"
                    disabled={!threadSelectEnabled}
                  />
                      <span className={!threadSelectEnabled ? "opacity-50" : ""}>select</span>
                  </label>
                )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onMoveRelative(note.id, "up")}
                  className={`px-2 py-1 text-[11px] font-semibold rounded ${
                    canOrganize && !isPinned ? "text-gray-800 bg-gray-100 hover:bg-gray-200" : "text-gray-400 bg-gray-100 cursor-not-allowed"
                  }`}
                  disabled={!canOrganize || isPinned}
                  title={canOrganize ? (isPinned ? "Unpin to reorder" : "Move up") : "Pro feature"}
                >
                  ↑ Up
                </button>
                <button
                  type="button"
                  onClick={() => onMoveRelative(note.id, "down")}
                  className={`px-2 py-1 text-[11px] font-semibold rounded ${
                    canOrganize && !isPinned ? "text-gray-800 bg-gray-100 hover:bg-gray-200" : "text-gray-400 bg-gray-100 cursor-not-allowed"
                  }`}
                  disabled={!canOrganize || isPinned}
                  title={canOrganize ? (isPinned ? "Unpin to reorder" : "Move down") : "Pro feature"}
                >
                  ↓ Down
                </button>
                <button
                  type="button"
                  onClick={() => canOrganize && onTogglePin(note.id)}
                  disabled={!canOrganize}
                  className={`text-[11px] font-semibold ${canOrganize ? "text-amber-600 hover:text-amber-800" : "text-gray-400 cursor-not-allowed"}`}
                  title={canOrganize ? undefined : "Pro feature"}
                >
                  {meta.pinned ? "Unpin" : "Pin"}
                </button>
                <button
                  type="button"
                  onClick={() => handleCopy(note.id, note.plaintext)}
                  className="text-[11px] font-semibold text-blue-600 hover:text-blue-800"
                >
                  {copiedId === note.id ? "Copied!" : "Copy"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(note.id);
                    setEditingText(note.plaintext || "");
                  }}
                  className="text-[11px] font-semibold text-green-600 hover:text-green-800"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(note.id)}
                  className="text-[11px] font-semibold text-red-600 hover:text-red-800"
                >
                  Delete
                </button>
                </div>
              </div>
              {editingId === note.id ? (
                <div className="space-y-2">
                  <textarea
                    value={editingText}
                    onChange={(e) => setEditingText(e.target.value)}
                    maxLength={300}
                    className="w-full min-h-[80px] text-sm border rounded p-2"
                  />
                  <div className="flex gap-2 text-xs">
                    <button
                      type="button"
                      onClick={async () => {
                        setSavingEdit(true);
                        try {
                          await onUpdate(note.id, editingText);
                          setEditingId(null);
                          setEditingText("");
                        } finally {
                          setSavingEdit(false);
                        }
                      }}
                      className={`px-3 py-1 rounded text-white font-semibold ${
                        savingEdit ? "bg-green-400 cursor-wait" : "bg-green-600 hover:bg-green-700"
                      }`}
                      disabled={savingEdit}
                    >
                      {savingEdit ? "Saving..." : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(null);
                        setEditingText("");
                      }}
                      className="px-3 py-1 rounded border text-gray-700 hover:bg-gray-100"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">
                  {note.plaintext}
                </p>
              )}
              {(() => {
                const imgs = Array.isArray(note.images) && note.images.length
                  ? note.images.slice(0, 4)
                  : note.imageData
                    ? [{ data: note.imageData, alt: note.imageAlt || "" }]
                    : [];
                if (!imgs.length) return null;
                return (
                  <div className="mt-3 grid grid-cols-1 gap-3">
                    {imgs.map((img: any, idx: number) => (
                      <div key={`${note.id}-img-${idx}`} className="space-y-2">
                        <img
                          src={img.data}
                          alt={img.alt || `Attached image ${idx + 1}`}
                          className="w-full max-h-48 rounded border border-gray-200 object-cover"
                        />
                        <input
                          type="text"
                          value={img.alt || ""}
                          onChange={(e) => onUpdateImageAlt && onUpdateImageAlt(note.id, idx, e.target.value)}
                          placeholder="Alt text"
                          className="w-full rounded border border-gray-300 px-3 py-2 text-xs text-gray-800 shadow-sm"
                        />
                      </div>
                    ))}
                  </div>
                );
              })()}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {meta.tags.map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                    {tag}
                    <button
                      type="button"
                      onClick={() => canOrganize && onRemoveTag(note.id, tag)}
                      disabled={!canOrganize}
                      className={`text-gray-500 ${canOrganize ? "hover:text-red-600" : "cursor-not-allowed opacity-60"}`}
                      >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  value={tagInputs[note.id] || ""}
                  onChange={(e) => setTagInputs((prev) => ({ ...prev, [note.id]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (canOrganize) {
                        onAddTag(note.id, tagInputs[note.id] || "");
                        setTagInputs((prev) => ({ ...prev, [note.id]: "" }));
                      }
                    }
                  }}
                  placeholder={canOrganize ? "Add tag" : "Pro feature"}
                  disabled={!canOrganize}
                  className={`text-xs border px-2 py-1 rounded ${canOrganize ? "" : "bg-gray-100 cursor-not-allowed"}`}
                />
              </div>
              <div className="mt-3 flex items-center justify-between text-[11px] text-gray-500">
                <span>{new Date(note.created_at).toLocaleString()}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
