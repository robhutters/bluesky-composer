"use client";
// components/Composer.tsx
import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

const MAX_CHARACTERS = 300;



export default function Composer() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    if (value.length <= MAX_CHARACTERS) setText(value);
  };

  const saveNote = async () => {
    if (!text) return;
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not logged in");

      const res = await fetch("/api/saveNote", {
            method: "POST",
            headers: { "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
             },
            body: JSON.stringify({ content: text }),
          });
          setLoading(false);

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to save note");
      }
      setText("");
      // keep passphrase in memory; do not send to server
    } catch (err: any) {
      alert(`Error saving note: ${err.message ?? "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto mt-8 p-6 border border-gray-200 rounded-lg bg-white shadow-sm">
      <h2 className="text-xl font-semibold mb-4">BlueSky Composer</h2>

     

      <label className="block text-sm font-medium text-gray-700 mb-1">
        Your note (max {MAX_CHARACTERS} chars)
      </label>
      <textarea
        value={text}
        onChange={handleChange}
        placeholder="What's on your mind?"
        className="w-full min-h-[120px] p-3 text-base border border-gray-300 rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      <div className="flex justify-between items-center mt-3">
        <span
          className={`text-sm ${
            text.length === MAX_CHARACTERS ? "text-red-500" : "text-gray-500"
          }`}
        >
          {text.length}/{MAX_CHARACTERS}
        </span>

        <button
          onClick={saveNote}
          disabled={text.length === 0 || loading}
          className={`px-4 py-2 rounded-md text-white transition ${
            text.length === 0 || loading
              ? "bg-blue-400 cursor-not-allowed opacity-50"
              : "bg-blue-600 hover:bg-blue-700"
          }`}
        >
          {loading ? "Encrypting..." : "Save note"}
        </button>
      </div>

      
    </div>
  );
}
