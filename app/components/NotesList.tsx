"use client";

import { useState } from "react";

type NotesListProps = {
  notes: any[];
  onDelete: (id: string | number) => void;
  onReorder: (fromId: string | number, toId: string | number) => void;
  onMoveRelative: (id: string | number, direction: "up" | "down") => void;
  onUpdate: (id: string | number, text: string) => Promise<void> | void;
  metadata: Record<string, { pinned: boolean; tags: string[] }>;
  onTogglePin: (id: string | number) => void;
  onAddTag: (id: string | number, tag: string) => void;
  onRemoveTag: (id: string | number, tag: string) => void;
  canOrganize: boolean;
  allowThreadSelect?: boolean;
  selectedForThread?: Set<string | number>;
  onToggleThreadSelect?: (id: string | number) => void;
  threadSelectEnabled?: boolean;
};

export default function NotesList({
  notes,
  onDelete,
  onReorder,
  onMoveRelative,
  onUpdate,
  metadata,
  onTogglePin,
  onAddTag,
  onRemoveTag,
  canOrganize,
  allowThreadSelect = false,
  selectedForThread,
  onToggleThreadSelect,
  threadSelectEnabled = true,
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
    <div className="mt-6">
      <h3 className="text-lg font-semibold mb-3">Your Notes</h3>
      <p className="text-xs text-gray-600 mb-2">Drag and drop to reorder your notes (PRO only). Use the up/down buttons below (PRO only).</p>
      <ul className="space-y-3">
        {notes.map((note, index) => {
          const meta = metadata[String(note.id)] || { pinned: false, tags: [] };
          return (
            <li
              key={note.id}
            className={`p-4 border rounded bg-white ${canOrganize ? "" : "select-none"}`}
            draggable={canOrganize}
            onDragStart={(e) => {
              if (!canOrganize) return;
              e.dataTransfer.setData("text/plain", String(note.id));
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              if (!canOrganize) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            onDrop={(e) => {
              if (!canOrganize) return;
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
                      <span className={!threadSelectEnabled ? "opacity-50" : ""}>Thread</span>
                    </label>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onMoveRelative(note.id, "up")}
                  className={`px-2 py-1 text-[11px] font-semibold rounded ${canOrganize ? "text-gray-800 bg-gray-100 hover:bg-gray-200" : "text-gray-400 bg-gray-100 cursor-not-allowed"}`}
                  disabled={!canOrganize}
                  title={canOrganize ? "Move up" : "Pro feature"}
                >
                  ↑ Up
                </button>
                <button
                  type="button"
                  onClick={() => onMoveRelative(note.id, "down")}
                  className={`px-2 py-1 text-[11px] font-semibold rounded ${canOrganize ? "text-gray-800 bg-gray-100 hover:bg-gray-200" : "text-gray-400 bg-gray-100 cursor-not-allowed"}`}
                  disabled={!canOrganize}
                  title={canOrganize ? "Move down" : "Pro feature"}
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
              {note.imageData && (
                <div className="mt-2">
                  <img
                    src={note.imageData}
                    alt="Attached"
                    className="max-h-40 rounded border border-gray-200"
                  />
                </div>
              )}
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
