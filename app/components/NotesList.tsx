"use client";

import { useState } from "react";

type NotesListProps = {
  notes: any[];
  onDelete: (id: string | number) => void;
};

export default function NotesList({ notes, onDelete }: NotesListProps) {
  const [copiedId, setCopiedId] = useState<string | number | null>(null);

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
      <ul className="space-y-3">
        {notes.map((note) => (
          <li key={note.id} className="p-4 border rounded bg-white">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-2 gap-2">
              <span>{new Date(note.created_at).toLocaleString()}</span>
              <div className="flex items-center gap-2">
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
          </li>
        ))}
      </ul>
    </div>
  );
}
