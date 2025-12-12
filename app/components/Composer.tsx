"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const MAX_CHARACTERS = 300;
const LOCAL_DRAFT_KEY = "bsky-composer-draft";
const LOCAL_VISITOR_KEY = "bsky-composer-visitor";
const ACTIVITY_PING_INTERVAL_MS = 30000;
const EMOJIS = ["😀", "😅", "🥳", "🥹", "😄", "😋", "😂", "🤣", "🥲", "☺️", "😊", "😇", "🙂", "🙃", "😉", "😌", "😍", "🥰", "😘", "😙", "😝", "😜", "🤨", "🧐", "🤓", "😎", "🤩", "😏", "😒", "😞", "😔", "😟", "😕", "😭", "🙁", "🥺", "😫", "😤", "😠", "😡", "🤬", "🥵", "😳", "🔥", "✨", "👍", "💡", "📌", "🧠", "🍕", "☕️", "✅", "💬", "🎮", "🕹️", "🧭"];

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
  const [bskyHandle, setBskyHandle] = useState("");
  const [bskyAppPassword, setBskyAppPassword] = useState("");
  const [bskyLinked, setBskyLinked] = useState(false);
  const [showBskyForm, setShowBskyForm] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postMessage, setPostMessage] = useState<string | null>(null);
  const hasBskyCreds = Boolean(bskyHandle && bskyAppPassword);
  const [giftCode, setGiftCode] = useState("");
  const [giftLoading, setGiftLoading] = useState(false);
  const [showEmojis, setShowEmojis] = useState(false);
  const [replyControl, setReplyControl] = useState<
    "anyone" | "no_replies" | "mentions" | "followers" | "following" | "list"
  >("anyone");
  const [replyListUri, setReplyListUri] = useState("");
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const clearBskyCreds = () => {
    setBskyHandle("");
    setBskyAppPassword("");
    setBskyLinked(false);
    setShowBskyForm(true);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("bsky-handle");
      window.localStorage.removeItem("bsky-app-password");
    }
    setPostMessage("Bluesky credentials cleared.");
    setTimeout(() => setPostMessage(null), 2500);
  };

  const sanitizePlainText = (value: unknown) => {
    if (typeof value !== "string") return "";
    // Strip script tags and any HTML-like markup so only plain text is kept
    const withoutScripts = value.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
    const withoutTags = withoutScripts.replace(/<\/?[^>]+>/g, "");
    return withoutTags;
  };

  // Load any locally saved draft on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(LOCAL_DRAFT_KEY);
      if (stored) setText(sanitizePlainText(stored));
      let vid = window.localStorage.getItem(LOCAL_VISITOR_KEY);
      if (!vid) {
        vid = crypto.randomUUID();
        window.localStorage.setItem(LOCAL_VISITOR_KEY, vid);
      }
      setVisitorId(vid);
      const storedHandle = window.localStorage.getItem("bsky-handle");
      const storedPass = window.localStorage.getItem("bsky-app-password");
      if (storedHandle) setBskyHandle(storedHandle);
      if (storedPass) setBskyAppPassword(storedPass);
      if (storedHandle && storedPass) {
        setBskyLinked(true);
        setShowBskyForm(false);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const saveBskyCreds = () => {
    if (!bskyHandle.trim() || !bskyAppPassword.trim()) {
      setPostMessage("Add your Bluesky handle and app password, then save.");
      setTimeout(() => setPostMessage(null), 3000);
      return;
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem("bsky-handle", bskyHandle.trim());
      window.localStorage.setItem("bsky-app-password", bskyAppPassword.trim());
    }
    setBskyLinked(true);
    setShowBskyForm(false);
    setPostMessage("Bluesky credentials saved.");
    setTimeout(() => setPostMessage(null), 3000);
  };

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
    const value = sanitizePlainText(e.target.value);

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

  const insertEmoji = (emoji: string) => {
    setShowEmojis(false);
    setText((prev) => {
      const el = textAreaRef.current;
      if (el) {
        const start = el.selectionStart ?? prev.length;
        const end = el.selectionEnd ?? prev.length;
        const next = prev.slice(0, start) + emoji + prev.slice(end);
        return next.slice(0, MAX_CHARACTERS);
      }
      const next = prev + emoji;
      return next.slice(0, MAX_CHARACTERS);
    });
    // focus back on textarea
    requestAnimationFrame(() => textAreaRef.current?.focus());
  };

  const autoSave = async (partialText: string) => {
    if (!partialText) return;
    const safe = sanitizePlainText(partialText);
    if (!safe) return;
    const canUseCloud = user && isPro;
    // Always keep a local copy
    onLocalSave(safe, imageData);
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
          body: JSON.stringify({ content: safe }),
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
    const safe = sanitizePlainText(text);
    if (!safe) return;
    setLoading(true);
    try {
      const canUseCloud = user && isPro;
      // Always save locally
      onLocalSave(safe, imageData);
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
          body: JSON.stringify({ content: safe }),
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
      setImageName(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err: any) {
      alert(`Error saving note: ${err.message ?? "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const postToBluesky = async () => {
    const safe = sanitizePlainText(text).trim();
    if (!safe) return;
    if (!bskyHandle || !bskyAppPassword) {
      setPostMessage("Add your Bluesky handle and app password first.");
      setTimeout(() => setPostMessage(null), 3000);
      return;
    }
    setPosting(true);
    setPostMessage(null);
    try {
      const res = await fetch("/api/bluesky/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: bskyHandle.trim(),
          appPassword: bskyAppPassword.trim(),
          text: safe,
          imageData: imageData || null,
          replyControl,
          replyListUri,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to post");
      setPostMessage("Posted to Bluesky ✔️");
      setTimeout(() => setPostMessage(null), 4000);
    } catch (err: any) {
      setPostMessage(err?.message || "Failed to post");
      setTimeout(() => setPostMessage(null), 5000);
    } finally {
      setPosting(false);
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
      const visitor =
        typeof window !== "undefined"
          ? window.localStorage.getItem(LOCAL_VISITOR_KEY)
          : null;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not logged in");

      const res = await fetch("/api/checkout/pro", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ clientId: visitor || undefined }),
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
    <div className="w-full max-w-lg mx-auto mt-8 p-4 sm:p-6 border border-gray-200 rounded-lg bg-white shadow-sm">
      <h2 className="text-xl font-semibold mb-4">BlueSky Composer</h2>
      {flashMessage && (
        <div className="fixed top-4 right-4 z-50 rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 shadow-lg">
          {flashMessage}
        </div>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {user ? (
          <>
            <span className={`px-2 py-1 text-xs rounded ${isPro ? "bg-emerald-100 text-emerald-700 border border-emerald-200" : "bg-orange-50 text-orange-700 border border-orange-200"}`}>
              {isPro ? "Cloud sync now available" : "Cloud sync is a Pro feature"}
            </span>
            <span className="px-2 py-1 text-[10px] font-semibold rounded bg-orange-100 text-orange-800 border border-orange-200">
              PRO
            </span>
          </>
        ) : (
          <span className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-700 border border-gray-200">
            Local mode
          </span>
        )}
        {bskyLinked && (
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 text-xs rounded border border-sky-200 bg-sky-50 text-sky-700 font-semibold">
              Bluesky linked
            </span>
            <button
              type="button"
              onClick={() => {
                setShowBskyForm((prev) => !prev);
              }}
              className="px-2 py-1 text-xs rounded border border-sky-200 bg-white text-sky-700 font-semibold hover:bg-sky-50 transition"
            >
              Manage
            </button>
            <button
              type="button"
              onClick={clearBskyCreds}
              className="px-2 py-1 text-xs rounded border border-sky-200 bg-white text-sky-700 font-semibold hover:bg-sky-50 transition"
              title="Clear stored Bluesky credentials"
            >
              Logout
            </button>
          </div>
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

      {(!bskyLinked || showBskyForm) && (
        <div className="mb-3 rounded border border-blue-100 bg-blue-50/70 p-3">
          <div className="flex flex-col gap-2">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                placeholder="your-handle.bsky.social"
                value={bskyHandle}
                onChange={(e) => {
                  setBskyHandle(e.target.value);
                }}
                className="w-full rounded border border-blue-200 px-3 py-2 text-sm"
              />
              <input
                type="password"
                placeholder="Bluesky app password"
                value={bskyAppPassword}
                onChange={(e) => {
                  setBskyAppPassword(e.target.value);
                }}
                className="w-full rounded border border-blue-200 px-3 py-2 text-sm"
              />
            </div>
            <p className="text-[11px] text-blue-700">
              Optional: add your Bluesky handle + <strong>app password</strong> (not your regular login password) to post directly to your timeline. Stored only in your browser; clear the fields to remove.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={saveBskyCreds}
                className="px-3 py-2 text-xs font-semibold rounded bg-sky-600 text-white hover:bg-sky-700 transition"
              >
                Save Bluesky login
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowBskyForm(false);
                }}
                className="text-xs text-sky-700 underline"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 mb-1">
        <label className="block text-sm font-medium text-gray-700">
          Your note (max {MAX_CHARACTERS} chars). Auto-saves when limit is reached.
        </label>
        <button
          type="button"
          onClick={() => setShowEmojis((v) => !v)}
          className="px-2 py-1 text-xs font-semibold rounded border border-gray-200 bg-white hover:bg-gray-100"
        >
          😊 Emoji
        </button>
      </div>
      {showEmojis && (
        <div className="mb-2 rounded border border-gray-200 bg-white p-2 shadow-sm">
          <div className="text-xs text-gray-600 mb-1">Tap to insert:</div>
          <div className="flex flex-wrap gap-2">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => insertEmoji(e)}
                className="h-9 w-9 rounded border border-gray-200 bg-gray-50 text-lg hover:bg-gray-100"
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      )}
      <textarea
        ref={textAreaRef}
        value={text}
        onChange={handleChange}
        placeholder="What's on your mind?"
        className="w-full min-h-[120px] p-3 text-base border border-gray-300 rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <div className="mt-4 space-y-2 rounded-lg border border-dashed border-gray-300 bg-gray-50/80 p-4">
        <label className="block text-sm font-semibold text-gray-800">
          Optional image (png or jpg):
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
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) {
              setImageData(null);
              setImageName(null);
              return;
            }
            const allowedTypes = ["image/png", "image/jpeg"];
            const mime = (file.type || "").toLowerCase();
            const ext = file.name.split(".").pop()?.toLowerCase() || "";
            const extAllowed = ["png", "jpg", "jpeg"].includes(ext);
            if (!allowedTypes.includes(mime) || !extAllowed) {
              setFlashMessage("Only PNG or JPG images are allowed.");
              setTimeout(() => setFlashMessage(null), 4000);
              e.target.value = "";
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
          <div className="mt-2 relative inline-block">
            <img
              src={imageData}
              alt="Selected"
              className="max-h-32 rounded border border-gray-200"
            />
            <button
              type="button"
              onClick={() => {
                setImageData(null);
                setImageName(null);
                if (fileInputRef.current) {
                  fileInputRef.current.value = "";
                }
              }}
              className="absolute -top-2 -right-2 h-7 w-7 rounded-full bg-white border border-red-200 text-red-600 text-xs font-bold shadow hover:bg-red-50"
              aria-label="Remove image"
            >
              ×
            </button>
          </div>
        )}
        <p className="text-[11px] text-gray-500">
          Images stay on this device and are never uploaded to Supabase. If you post to Bluesky, the image is sent along with the text but only the text message is synced to Supabase.
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

        <div className="flex flex-col gap-2 items-end">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-gray-700">Replies</label>
            <select
              value={replyControl}
              onChange={(e) => setReplyControl(e.target.value as any)}
              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-800 shadow-sm"
            >
              <option value="anyone">Anyone</option>
              <option value="no_replies">No replies</option>
              <option value="mentions">Mentions only</option>
              <option value="followers">My followers</option>
              <option value="following">People I follow</option>
              <option value="list">List (AT-URI)</option>
            </select>
            {replyControl === "list" && (
              <input
                value={replyListUri}
                onChange={(e) => setReplyListUri(e.target.value)}
                placeholder="at://did:example/app.bsky.graph.list/..."
                className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-800 shadow-sm"
              />
            )}
          </div>
          <div className="flex gap-2">
          <button
            onClick={postToBluesky}
            disabled={text.length === 0 || posting}
            className={`px-3 py-2 rounded-md text-white transition ${
              text.length === 0 || posting
                ? "bg-sky-400 cursor-not-allowed opacity-60"
                : "bg-sky-600 hover:bg-sky-700"
            }`}
          >
            {posting ? "Posting…" : "Post to Bluesky"}
          </button>
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
      </div>

      {postMessage && (
        <div className="mt-2 text-sm text-blue-700">{postMessage}</div>
      )}

    </div>
  );
}
