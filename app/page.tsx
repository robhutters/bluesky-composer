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
  const [plan, setPlan] = useState<string | null>(null);
  const isPro = plan === "pro";
  const [upgradeMessage, setUpgradeMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!user || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("upgrade") === "success") {
      setUpgradeMessage("Pro unlocked! Cloud sync is now available.");
      void fetchPlanAndNotes();
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setPlan(null);
      loadLocalNotes();
      return;
    }
    void fetchPlanAndNotes();
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

  const addLocalNote = (content: string, imageData?: string | null) => {
    if (!content) return;
    const newNote = {
      id: Date.now(),
      plaintext: content,
      created_at: new Date().toISOString(),
      imageData: imageData || null,
    };
    setNotes((prev) => {
      const next = [newNote, ...prev];
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LOCAL_NOTES_KEY, JSON.stringify(next));
      }
      return next;
    });
  };

  const fetchPlanAndNotes = async () => {
    if (!user) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("plan")
      .eq("id", session.user.id)
      .single();

    let userPlan = profile?.plan ?? "free";

    // If the profile row is missing, create it client-side (allowed by RLS) so the webhook can update it later.
    if (error && (error as any)?.code === "PGRST116") {
      const { error: insertError } = await supabase.from("profiles").upsert({
        id: session.user.id,
        email: session.user.email,
        plan: "free",
      });
      if (insertError) {
        console.error("Failed to create profile row", insertError);
      }
      userPlan = "free";
    } else if (error) {
      console.error("Error loading plan", error);
    }

    setPlan(userPlan);

    if (userPlan === "pro") {
      await fetchNotes();
    } else {
      loadLocalNotes();
    }

    // Fallback: if client thinks it's free, ask server to sync from payments table
    if (userPlan !== "pro") {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          const res = await fetch("/api/sync-plan", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          });
          const body = await res.json().catch(() => ({}));
          if (res.ok && body?.plan === "pro") {
            setPlan("pro");
            await fetchNotes();
          }
        }
      } catch (err) {
        console.error("Plan sync check failed", err);
      }
    }
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
    if (!user || !isPro) {
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

  const reorderNotes = (fromIndex: number, toIndex: number) => {
    setNotes((prev: any[]) => {
      if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= prev.length || toIndex >= prev.length) {
        return prev;
      }
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      if ((!user || !isPro) && typeof window !== "undefined") {
        window.localStorage.setItem(LOCAL_NOTES_KEY, JSON.stringify(next));
      }
      return next;
    });
  };

  return (
    <>
  
      <div className="space-y-6 flex flex-col items-center justify-center min-h-screen py-2 px-4 bg-gray-100 relative">



      <main className="w-full max-w-[800px] flex-col flex justify-center">
        {upgradeMessage && (
          <div className="mb-4 rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 shadow-sm">
            {upgradeMessage}
          </div>
        )}
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
      <Composer
        onNoteSaved={fetchNotes}
        onLocalSave={addLocalNote}
        user={user}
        isPro={plan === "pro"}
        proCheckoutUrl={process.env.NEXT_PUBLIC_PRO_CHECKOUT_URL || ""}
      />
    
      <NotesList notes={notes} onDelete={deleteNote} onReorder={reorderNotes} />

      {!user && (
        <div>
          <div className="p-4 border mt-12 rounded bg-yellow-50">
            <p className="text-sm">
              You’re browsing anonymously. Your draft and saved notes stay on this device. Sign in and upgrade to Pro to back up notes to the cloud.
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
