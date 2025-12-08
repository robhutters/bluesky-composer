"use client";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import Composer from "./components/Composer";
import NotesList from "./components/NotesList";
import Auth from "./components/Auth";
import { FloatingProfile } from "./components/FloatingProfile";
import LogoutButton from "./components/LogoutButton";
import Image from "next/image";
import { useAuth } from "./providers/AuthProvider";

const LOCAL_NOTES_KEY = "bsky-composer-notes";
const LOCAL_NOTE_META_KEY = "bsky-composer-note-meta";

type NoteMeta = {
  noteId: string | number;
  pinned: boolean;
  tags: string[];
  versions?: { content: string; created_at: string }[];
};

export default function MainPage() {
  const { user } = useAuth();
  const [notes, setNotes] = useState<any[]>([]);
  const [plan, setPlan] = useState<string | null>(null);
  const isPro = plan === "pro";
  const [upgradeMessage, setUpgradeMessage] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<Record<string, NoteMeta>>({});
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

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
      loadLocalMetadata();
      return;
    }
    void fetchPlanAndNotes();
  }, [user]);

  const getLocalNotes = (): any[] => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(LOCAL_NOTES_KEY);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      return [];
    }
    return [];
  };

  const loadLocalNotes = () => {
    const local = getLocalNotes();
    setNotes(local);
  };

  const loadLocalMetadata = () => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(LOCAL_NOTE_META_KEY);
      if (!raw) {
        setMetadata({});
        return;
      }
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        setMetadata(parsed);
      }
    } catch {
      setMetadata({});
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

    loadLocalMetadata();

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
      const local = getLocalNotes();
      setNotes(mergeLocalAndCloud(local, data));
      if (isPro) {
        await syncLocalNotesToCloud(data, session.access_token);
      }
      if (isPro) {
        await fetchMetadata();
      }
    }
  };

  const fetchMetadata = async () => {
    if (!user || !isPro) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const res = await fetch("/api/metadata", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (res.ok) {
      const data = await res.json();
      const map: Record<string, NoteMeta> = {};
      for (const row of data || []) {
        map[String(row.note_id)] = {
          noteId: row.note_id,
          pinned: !!row.pinned,
          tags: row.tags || [],
          versions: row.versions || [],
        };
      }
      setMetadata(map);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LOCAL_NOTE_META_KEY, JSON.stringify(map));
      }
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
      // clean metadata
      setMetadata((prev) => {
      const next = { ...prev };
      delete next[String(id)];
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LOCAL_NOTE_META_KEY, JSON.stringify(next));
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

  const togglePin = (id: string | number) => {
    if (!user || !isPro) return;
    setMetadata((prev) => {
      const current = prev[String(id)] || { noteId: id, pinned: false, tags: [], versions: [] };
      const updated = { ...current, pinned: !current.pinned };
      const next = { ...prev, [String(id)]: updated };
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LOCAL_NOTE_META_KEY, JSON.stringify(next));
      }
      return next;
    });
    void persistMetadata(id);
  };

  const addTag = (id: string | number, tag: string) => {
    if (!user || !isPro) return;
    const trimmed = tag.trim();
    if (!trimmed) return;
    setMetadata((prev) => {
      const current = prev[String(id)] || { noteId: id, pinned: false, tags: [], versions: [] };
      if (current.tags.includes(trimmed)) return prev;
      const updated = { ...current, tags: [...current.tags, trimmed] };
      const next = { ...prev, [String(id)]: updated };
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LOCAL_NOTE_META_KEY, JSON.stringify(next));
      }
      return next;
    });
    void persistMetadata(id);
  };

  const removeTag = (id: string | number, tag: string) => {
    if (!user || !isPro) return;
    setMetadata((prev) => {
      const current = prev[String(id)];
      if (!current) return prev;
      const updated = { ...current, tags: current.tags.filter((t) => t !== tag) };
      const next = { ...prev, [String(id)]: updated };
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LOCAL_NOTE_META_KEY, JSON.stringify(next));
      }
      return next;
    });
    void persistMetadata(id);
  };

  const persistMetadata = async (id: string | number) => {
    if (!user || !isPro) return;
    const meta = metadata[String(id)];
    if (!meta) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    void fetch("/api/metadata", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        noteId: id,
        pinned: meta.pinned,
        tags: meta.tags,
        versions: meta.versions || [],
      }),
    }).catch(() => {});
  };

  const hashContent = (content: string) => {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      hash = (hash << 5) - hash + content.charCodeAt(i);
      hash |= 0;
    }
    return hash.toString();
  };

  const contentKey = (plaintext: string) => {
    const text = (plaintext || "").trim();
    return `${text.length}:${hashContent(text)}`;
  };

  const mergeLocalAndCloud = (localNotes: any[], cloudNotes: any[]) => {
    const mergedMap = new Map<string, any>();
    for (const note of cloudNotes) {
      mergedMap.set(contentKey(note.plaintext), note);
    }
    for (const note of localNotes) {
      const key = contentKey(note.plaintext);
      if (!mergedMap.has(key)) {
        mergedMap.set(key, note);
      }
    }
    return Array.from(mergedMap.values());
  };

  const syncLocalNotesToCloud = async (cloudNotes: any[], token: string) => {
    const localNotes = getLocalNotes();
    if (!localNotes.length) return;
    const cloudHashes = new Set(
      cloudNotes.map((n) => contentKey(n.plaintext))
    );
    let pushedCount = 0;
    for (const note of localNotes) {
      const key = contentKey(note.plaintext);
      if (!cloudHashes.has(key)) {
        await fetch("/api/saveNote", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ content: note.plaintext }),
        }).catch(() => {});
        pushedCount += 1;
      }
    }
    const refetch = await fetch("/api/getNotes", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (refetch.ok) {
      const data = await refetch.json();
      setNotes(mergeLocalAndCloud(localNotes, data));
      if (pushedCount > 0) {
        setSyncMessage(`Synced ${pushedCount} local note(s) to cloud`);
        setTimeout(() => setSyncMessage(null), 4000);
      }
    }
  };

  const sortedNotes = useMemo(() => {
    return [...notes].sort((a, b) => {
      const metaA = metadata[String(a.id)];
      const metaB = metadata[String(b.id)];
      if (metaA?.pinned && !metaB?.pinned) return -1;
      if (!metaA?.pinned && metaB?.pinned) return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [notes, metadata]);

  return (
    <>
  
      <div className="space-y-6 flex flex-col items-center justify-center min-h-screen py-2 px-4 bg-gray-100 relative">



      <main className="w-full max-w-[800px] flex-col flex justify-center">
        {upgradeMessage && (
          <div className="mb-4 rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 shadow-sm">
            {upgradeMessage}
          </div>
        )}
        {syncMessage && (
          <div className="mb-4 rounded border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 shadow-sm">
            {syncMessage}
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
    
      <NotesList
        notes={sortedNotes}
        onDelete={deleteNote}
        onReorder={reorderNotes}
        metadata={metadata}
        onTogglePin={togglePin}
        onAddTag={addTag}
        onRemoveTag={removeTag}
        canOrganize={!!user && isPro}
      />

      {!user && (
        <div>
          <div className="mt-8 mb-4 p-4 border rounded bg-white shadow-sm">
            <h4 className="text-base font-semibold mb-2">PRO</h4>
            <p className="text-xs text-gray-600 mb-1">Pay once, keep Pro forever. Price: <span className="font-semibold text-gray-800">€15</span>.</p>
            <p className="text-xs text-gray-600 mb-3">Here’s what you get now and what’s coming soon:</p>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm text-left border">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 border">Feature</th>
                    <th className="px-3 py-2 border">Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-3 py-2 border">Encrypted cloud sync across devices</td>
                    <td className="px-3 py-2 border text-emerald-700">Available</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 border">Pinned notes & tags (organized list)</td>
                    <td className="px-3 py-2 border text-emerald-700">Available</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 border">Version history & restore</td>
                    <td className="px-3 py-2 border text-orange-600">Coming soon</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 border">Advanced search & filters</td>
                    <td className="px-3 py-2 border text-orange-600">Coming soon</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 border">Export/backup (email/Drive)</td>
                    <td className="px-3 py-2 border text-orange-600">Coming soon</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
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
