"use client";
// pages/index.tsx
import { useEffect, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import Auth from "./components/Auth";
import Composer from "./components/Composer";
import NotesList from "./components/NotesList";

export default function Home() {
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);



   const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
  };

  return (
    <main className="p-10">
      {!session ? <Auth /> : 
      <div>
        <button
            onClick={handleLogout}
            className="mb-6 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
          >
            Logout
          </button>
          <Composer />
          <NotesList />
      </div>
      
     }
    </main>
  );
}
