"use client";

import { useState } from "react";

type NotesListProps = {
  notes: any[];
  onDelete: (id: string | number) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  metadata: Record<string, { pinned: boolean; tags: string[] }>;
  onTogglePin: (id: string | number) => void;
  onAddTag: (id: string | number, tag: string) => void;
  onRemoveTag: (id: string | number, tag: string) => void;
  canOrganize: boolean;
};

export default function NotesList({ notes, onDelete, onReorder, metadata, onTogglePin, onAddTag, onRemoveTag, canOrganize }: NotesListProps) {
  const [copiedId, setCopiedId] = useState<string | number | null>(null);
  const [tagInputs, setTagInputs] = useState<Record<string | number, string>>({});

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
      <p className="text-xs text-gray-600 mb-2">Drag and drop to reorder your notes.</p>
      <ul className="space-y-3">
        {notes.map((note, index) => {
          const meta = metadata[String(note.id)] || { pinned: false, tags: [] };
          return (
            <li
              key={note.id}
              className="p-4 border rounded bg-white"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", index.toString());
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDrop={(e) => {
                e.preventDefault();
                const from = Number(e.dataTransfer.getData("text/plain"));
                if (!Number.isNaN(from)) {
                  onReorder(from, index);
                }
              }}
            >
              <div className="flex items-center justify-between text-xs text-gray-500 mb-2 gap-2">
                <div className="flex items-center gap-2">
                  {meta.pinned && <span className="text-amber-600 font-semibold">★ Pinned</span>}
                  <span>{new Date(note.created_at).toLocaleString()}</span>
                </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => canOrganize && onTogglePin(note.id)}
                  disabled={!canOrganize}
                  className={`text-xs font-semibold ${canOrganize ? "text-amber-600 hover:text-amber-800" : "text-gray-400 cursor-not-allowed"}`}
                  title={canOrganize ? undefined : "Pro feature"}
                >
                  {meta.pinned ? "Unpin" : "Pin"}
                </button>
                  <button
                    type="button"
                    onClick={() => handleCopy(note.id, note.plaintext)}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                  >
                    {copiedId === note.id ? "Copied!" : "Copy"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(note.id)}
                    className="text-xs font-semibold text-red-600 hover:text-red-800"
                  >
                    Delete
                  </button>
                </div>
              </div>
              <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">
                {note.plaintext}
              </p>
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
          </li>
        );
      })}
      </ul>
    </div>
  );
}
