"use client";
import { useEffect, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import Composer from "./components/Composer";
import NotesList from "./components/NotesList";
import Auth from "./components/Auth";
import LogoutButton from "./components/LogoutButton";

export default function MainPage() {
  const [user, setUser] = useState<any>(null);
  const [notes, setNotes] = useState([]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
     
    })();
  }, []);

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

  return (
    <div className="space-y-6 flex flex-col items-center justify-center min-h-screen py-2 px-4 bg-gray-100">



      <main className="w-full max-w-[800px] flex-col flex justify-center">
      <blockquote className="border-l-4 mt-8 border-blue-500 pl-4 italic text-gray-600 mb-6">
        <p>
          i need a notes app that has the character limit for bluesky and where it cuts down to the next line cuz if i have one more post with a lone word hanging off the bottom i may perish --- Lyx Lyon (bsky user)
        </p>
      </blockquote>

        { user ? <div className="mt-8 mx-auto"><LogoutButton /></div> : null }
      {/* Composer is always visible */}
      <Composer onNoteSaved={fetchNotes} user={user} />

      {/* Notes only load if logged in */}
      {user ? (
        <NotesList notes={notes} />
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
  );
}
