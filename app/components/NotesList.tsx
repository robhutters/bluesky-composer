"use client";

export default function NotesList({ notes }: { notes: any[] }) {  

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
