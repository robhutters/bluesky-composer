"use client";
import { useEffect, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import Composer from "./components/Composer";
import NotesList from "./components/NotesList";
import Auth from "./components/Auth";
import LogoutButton from "./components/LogoutButton";
import Image from "next/image";
import { useAuth } from "./providers/AuthProvider";

export default function MainPage() {

  const { user } = useAuth();
  const [notes, setNotes] = useState([]);

 

  useEffect(() => {
    if (user) {
      fetchNotes();
    }
  }, [user]);

  const fetchNotes = async () => {

    if (!user) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const res = await fetch("/api/getNotes", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
     
    if (res.ok) {
     
      const data = await res.json();
      setNotes(data);
    
    }
  };

  const deleteNote = async (id: string | number) => {
    if (!user) return;
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
      setNotes((prev: any) => prev.filter((note: any) => note.id !== id));
    } else {
      console.error("Failed to delete note");
    }
  };

  return (
    <>
  
      <div className="space-y-6 flex flex-col items-center justify-center min-h-screen py-2 px-4 bg-gray-100">



      <main className="w-full max-w-[800px] flex-col flex justify-center">
        <Image src="/assets/quote.jpg" alt="quote from a bluesky user: 'i need a notes app that has the character limit for bluesky and where it cuts down to the next line cuz if i have one more post with a lone word hanging off the bottom i may perish'" width={600} height={200} className="mx-auto mb-4 mt-8" />
        <Image src="/assets/notes_example.png" alt="Example of notes saved under the composer" width={600} height={350} className="mx-auto mb-6 rounded-lg border border-gray-200 shadow-sm" />
        <div className="mt-6 p-4 rounded-lg border border-gray-200 bg-white shadow-sm">
          <h2 className="text-lg font-semibold mb-2">Secure storage</h2>
          <p className="text-sm text-gray-700 mb-3">
            Notes are encrypted before they are stored. Even in the database, they look like unreadable ciphertext. Only your authenticated session can read or delete your notes; the decryption key stays on the server.
          </p>
          <Image
            src="/assets/notes_encrypted.png"
            alt="Example of encrypted note ciphertext"
            width={600}
            height={240}
            className="mx-auto rounded border border-gray-200"
          />
          <ul className="mt-3 text-sm text-gray-700 list-disc list-inside space-y-1">
            <li>Traffic uses HTTPS; your session token authorizes access.</li>
            <li>Ciphertext is stored in the database; the key never leaves the server.</li>
            <li>Only the note owner can read or delete their notes.</li>
            <li className="text-red-700 font-semibold">Risk profile: if the server or encryption key is compromised, an attacker or rogue operator could access notes. </li>
            <li>For normal use (drafts intended for posting), this risk is considered very low.</li>
          </ul>
        </div>

        { user ? <div className="mt-8 mx-auto"><LogoutButton /></div> : null }
      {/* Composer is always visible */}
      <Composer onNoteSaved={fetchNotes} user={user} />
    
      {/* Notes only load if logged in */}
      {user ? (
        <NotesList notes={notes} onDelete={deleteNote} />
      ) : (
          <div>
            <div className="p-4 border mt-12 rounded bg-yellow-50">

              <p className="text-sm">
            You’re browsing anonymously. Sign in to save and view notes.
          </p>
         
          </div>
          <Auth />
        </div>
      )}
      <footer className="mt-12 text-center text-gray-500 text-sm">
        &copy; {new Date().getFullYear()} BlueSky Composer. Built with NextJS, React, TailwindCSS, <a href="https://supabase.com" className="underline">Supabase</a> and ❤️ by <a href="https://robhutters.com" className="underline">Rob Hutters</a>. Hosted on <a href="https://vercel.com" className="underline">Vercel</a>.
      </footer>
      </main>
    </div>
    </>
    
  );
}
