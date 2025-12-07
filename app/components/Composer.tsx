"use client";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const MAX_CHARACTERS = 300;
const LOCAL_DRAFT_KEY = "bsky-composer-draft";

export default function Composer({
  onNoteSaved,
  onLocalSave,
  user,
}: {
  onNoteSaved: () => void;
  onLocalSave: (content: string) => void;
  user: any;
}) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasAutoSaved, setHasAutoSaved] = useState(false);
  const [flashMessage, setFlashMessage] = useState<string | null>(null);

  // Load any locally saved draft on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(LOCAL_DRAFT_KEY);
      if (stored) setText(stored);
    } catch {
      /* ignore */
    }
  }, []);

  // Persist draft locally on every change (works for signed-in and anonymous)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(LOCAL_DRAFT_KEY, text);
    } catch {
      /* ignore */
    }
  }, [text]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;

    if (value.length > MAX_CHARACTERS) {
      if (!hasAutoSaved) {
        const splitIndex = value.lastIndexOf(" ", MAX_CHARACTERS);
        const firstPart = value.slice(0, splitIndex);
        const remainder = value.slice(splitIndex + 1);

        setHasAutoSaved(true);
        setText(firstPart);

        autoSave(firstPart).then(() => {
          onNoteSaved();
          setText(remainder);
          setHasAutoSaved(false);
        });
      } else {
        setText(value);
      }
    } else {
      setText(value);
    }
  };

  const autoSave = async (partialText: string) => {
    if (!partialText) return;
    // Always keep a local copy
    onLocalSave(partialText);
    if (!user) return;
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not logged in");

      const res = await fetch("/api/saveNote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ content: partialText }),
      });
      setLoading(false);

      if (res.ok) {
        setFlashMessage("Note auto-saved ✔️");
        setTimeout(() => setFlashMessage(null), 5000);
      }
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to auto-save note");
      }
    } catch (err: any) {
      setFlashMessage(`Error auto-saving: ${err.message ?? "Unknown error"}`);
      setTimeout(() => setFlashMessage(null), 5000);
    } finally {
      setLoading(false);
    }
  };

  const saveNote = async () => {
    if (!text) return;
    setLoading(true);
    try {
      // Always save locally
      onLocalSave(text);

      if (user) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("Not logged in");

        const res = await fetch("/api/saveNote", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ content: text }),
        });
        setLoading(false);

        if (res.ok) {
          setFlashMessage("Note saved ✔️");
          setTimeout(() => setFlashMessage(null), 3000);
          onNoteSaved(); // refresh remote list
        }
        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || "Failed to save note");
        }
      } else {
        setFlashMessage("Note saved locally ✔️");
        setTimeout(() => setFlashMessage(null), 3000);
      }
      setText("");
    } catch (err: any) {
      alert(`Error saving note: ${err.message ?? "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };



  return (
    <div className="w-full max-w-lg mx-auto mt-8 p-6 border border-gray-200 rounded-lg bg-white shadow-sm">
      <h2 className="text-xl font-semibold mb-4">BlueSky Composer</h2>
      {flashMessage && (
        <div className="mt-2 text-sm text-green-600 transition-opacity duration-500">
          {flashMessage}
        </div>
      )}
     

      <label className="block text-sm font-medium text-gray-700 mb-1">
        Your note (max {MAX_CHARACTERS} chars). Auto-saves when limit is reached.
      </label>
      <p className="text-[12px] text-gray-600 mb-2">
        Saving while signed in also stores an encrypted copy in the cloud. 
      </p>
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
          {loading ? "Saving..." : "Save note"}
        </button>
      </div>

      
    </div>
  );
}
