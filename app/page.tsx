"use client";
import { useEffect, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import Composer from "./components/Composer";
import NotesList from "./components/NotesList";
import Auth from "./components/Auth";
import { FloatingProfile } from "./components/FloatingProfile";
import LogoutButton from "./components/LogoutButton";
import Image from "next/image";
import { useAuth } from "./providers/AuthProvider";

const LOCAL_NOTES_KEY = "bsky-composer-notes";

export default function MainPage() {

  const { user } = useAuth();
  const [notes, setNotes] = useState<any[]>([]);

 

  useEffect(() => {
    if (user) {
      fetchNotes();
    } else {
      loadLocalNotes();
    }
  }, [user]);

  const loadLocalNotes = () => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(LOCAL_NOTES_KEY);
      if (!raw) {
        setNotes([]);
        return;
      }
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setNotes(parsed);
      }
    } catch {
      setNotes([]);
    }
  };

  const addLocalNote = (content: string) => {
    if (!content) return;
    const newNote = {
      id: Date.now(),
      plaintext: content,
      created_at: new Date().toISOString(),
    };
    setNotes((prev) => {
      const next = [newNote, ...prev];
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LOCAL_NOTES_KEY, JSON.stringify(next));
      }
      return next;
    });
  };

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
    if (!user) {
      setNotes((prev: any[]) => {
        const next = prev.filter((note) => note.id !== id);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(LOCAL_NOTES_KEY, JSON.stringify(next));
        }
        return next;
      });
      return;
    }
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
  
      <div className="space-y-6 flex flex-col items-center justify-center min-h-screen py-2 px-4 bg-gray-100 relative">



      <main className="w-full max-w-[800px] flex-col flex justify-center">
        <Image
          src="/assets/quote.jpg"
          alt="quote from a bluesky user: 'i need a notes app that has the character limit for bluesky and where it cuts down to the next line cuz if i have one more post with a lone word hanging off the bottom i may perish'"
          width={600}
          height={200}
          className="mx-auto mb-4 mt-8"
        />
        <Image
          src="/assets/bluesky-demo.gif"
          alt="BlueSky Composer demo"
          width={600}
          height={400}
          className="mx-auto mb-8 rounded-lg border border-gray-200 shadow-sm"
        />

        {user ? <div className="mt-8 mx-auto"><LogoutButton /></div> : null }
      {/* Composer always visible; saves locally when logged out, Supabase + local when logged in */}
      <Composer onNoteSaved={fetchNotes} onLocalSave={addLocalNote} user={user} />
    
      <NotesList notes={notes} onDelete={deleteNote} />

      {!user && (
        <div>
          <div className="p-4 border mt-12 rounded bg-yellow-50">
            <p className="text-sm">
              You’re browsing anonymously. Your draft and saved notes stay on this device. Sign in to back up notes to the cloud.
            </p>
          </div>
          <Auth />
        </div>
      )}
      <footer className="mt-12 text-center text-gray-500 text-sm">
        &copy; {new Date().getFullYear()} BlueSky Composer. Built with NextJS, React, TailwindCSS, <a href="https://supabase.com" className="underline">Supabase</a> and ❤️ by <a href="https://robhutters.com" className="underline">Rob Hutters</a>. Hosted on <a href="https://vercel.com" className="underline">Vercel</a>.
      </footer>
      </main>
      <FloatingProfile />
    </div>
    </>
    
  );
}
