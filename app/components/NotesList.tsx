"use client";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

type Note = {
  id: string;
  plaintext: string;
  created_at: string;
};

export default function NotesList() {
  const [notes, setNotes] = useState<Note[]>([]);

  useEffect(() => {
    (async () => {
     const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch("/api/getNotes", {
        headers: {
          "Authorization": `Bearer ${session.access_token}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setNotes(data);
      } else {
        const { error } = await res.json();
        alert(error);
      }
    })();
  }, []);

  return (
    <div className="mt-6">
      <h3 className="text-lg font-semibold mb-3">Your Notes</h3>
      <ul className="space-y-3">
        {notes.map((note) => (
          <li key={note.id} className="p-4 border rounded bg-white">
            <div className="text-xs text-gray-500 mb-2">
              {new Date(note.created_at).toLocaleString()}
            </div>
            <p className="text-sm text-gray-800">{note.plaintext}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
