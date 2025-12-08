"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const MAX_CHARACTERS = 300;
const LOCAL_DRAFT_KEY = "bsky-composer-draft";
const LOCAL_VISITOR_KEY = "bsky-composer-visitor";
const ACTIVITY_PING_INTERVAL_MS = 30000;

export default function Composer({
  onNoteSaved,
  onLocalSave,
  user,
  isPro,
  proCheckoutUrl,
}: {
  onNoteSaved: () => void;
  onLocalSave: (content: string, imageData?: string | null) => void;
  user: any;
  isPro: boolean;
  proCheckoutUrl?: string;
}) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [hasAutoSaved, setHasAutoSaved] = useState(false);
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const [visitorId, setVisitorId] = useState<string | null>(null);
  const lastPingRef = useRef<number>(0);
  const lastSavePingRef = useRef<number>(0);
  const [imageData, setImageData] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Load any locally saved draft on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(LOCAL_DRAFT_KEY);
      if (stored) setText(stored);
      let vid = window.localStorage.getItem(LOCAL_VISITOR_KEY);
      if (!vid) {
        vid = crypto.randomUUID();
        window.localStorage.setItem(LOCAL_VISITOR_KEY, vid);
      }
      setVisitorId(vid);
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

    const now = Date.now();
    if (visitorId && now - lastPingRef.current > ACTIVITY_PING_INTERVAL_MS) {
      lastPingRef.current = now;
      void fetch("/api/track-activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: visitorId }),
      }).catch(() => {
        /* ignore */ 
      });
    }
  };

  const autoSave = async (partialText: string) => {
    if (!partialText) return;
    const canUseCloud = user && isPro;
    // Always keep a local copy
    onLocalSave(partialText, !canUseCloud ? imageData : null);
    if (visitorId) {
      const now = Date.now();
      if (now - lastSavePingRef.current > 5000) {
        lastSavePingRef.current = now;
        void fetch("/api/track-save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: visitorId, kind: canUseCloud ? "cloud" : "local" }),
        }).catch(() => {
          /* ignore */
        });
      }
    }
    if (!canUseCloud) return;
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
      const canUseCloud = user && isPro;
      // Always save locally
      onLocalSave(text, !canUseCloud ? imageData : null);
      if (visitorId) {
        const now = Date.now();
        if (now - lastSavePingRef.current > 5000) {
          lastSavePingRef.current = now;
          void fetch("/api/track-save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ clientId: visitorId, kind: canUseCloud ? "cloud" : "local" }),
          }).catch(() => {
            /* ignore */
          });
        }
      }

      if (canUseCloud) {
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
      setImageData(null);
    } catch (err: any) {
      alert(`Error saving note: ${err.message ?? "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };


  const startCheckout = async () => {
    if (!user) {
      setFlashMessage("Please sign in first.");
      setTimeout(() => setFlashMessage(null), 3000);
      return;
    }

    if (proCheckoutUrl) {
      window.open(proCheckoutUrl, "_blank", "noopener");
      return;
    }

    setCheckoutLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not logged in");

      const res = await fetch("/api/checkout/pro", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.url) {
        throw new Error(body?.error || "Failed to start checkout");
      }
      window.location.href = body.url as string;
    } catch (err: any) {
      setFlashMessage(`Upgrade failed: ${err?.message || "Unknown error"}`);
      setTimeout(() => setFlashMessage(null), 4000);
    } finally {
      setCheckoutLoading(false);
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
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {user ? (
          <span className={`px-2 py-1 text-xs rounded ${isPro ? "bg-emerald-100 text-emerald-700 border border-emerald-200" : "bg-orange-50 text-orange-700 border border-orange-200"}`}>
            {isPro ? "Cloud sync now available" : "Cloud sync is a Pro feature"}
          </span>
        ) : (
          <span className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-700 border border-gray-200">
            Local mode
          </span>
        )}
        {!isPro && user ? (
          <button
            type="button"
            onClick={startCheckout}
            disabled={checkoutLoading}
            className={`px-3 py-1 text-xs font-semibold rounded text-white transition shadow-sm ${
              checkoutLoading ? "bg-blue-400 cursor-wait" : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {checkoutLoading ? "Loading..." : "Upgrade to Pro"}
          </button>
        ) : null}
      </div>

      <label className="block text-sm font-medium text-gray-700 mb-1">
        Your note (max {MAX_CHARACTERS} chars). Auto-saves when limit is reached.
      </label>
      <p className="text-[12px] text-gray-600 mb-2">
        Saving while signed in also stores an encrypted copy in the cloud (Pro). Logged out saves stay on this device.
      </p>
      <textarea
        value={text}
        onChange={handleChange}
        placeholder="What's on your mind?"
        className="w-full min-h-[120px] p-3 text-base border border-gray-300 rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <div className="mt-4 space-y-2 rounded-lg border border-dashed border-gray-300 bg-gray-50/80 p-4">
        <label className="block text-sm font-semibold text-gray-800">
          Optional image
        </label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-md border-2 border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 shadow-sm ring-1 ring-gray-200 transition filter grayscale hover:grayscale-0 hover:bg-gray-100 hover:shadow-md"
          >
            {imageName ? "Change image" : "Choose image"}
          </button>
          <span className="text-xs text-gray-600">
            {imageName ? imageName : "No image selected"}
          </span>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) {
              setImageData(null);
              setImageName(null);
              return;
            }
            setImageName(file.name);
            const reader = new FileReader();
            reader.onload = () => {
              setImageData(reader.result as string);
            };
            reader.readAsDataURL(file);
          }}
        />
        {imageData && (
          <div className="mt-2">
            <img
              src={imageData}
              alt="Selected"
              className="max-h-32 rounded border border-gray-200"
            />
            <button
              type="button"
              onClick={() => setImageData(null)}
              className="ml-2 text-xs font-semibold text-red-600 underline"
            >
              Remove image
            </button>
          </div>
        )}
        <p className="text-[11px] text-gray-500">
          Images are never uploaded; they remain in your local notes only.
        </p>
      </div>

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
