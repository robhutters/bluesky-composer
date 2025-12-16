"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { dataUrlSizeBytes } from "../lib/imageUtils";

const MAX_CHARACTERS = 300;
const LOCAL_DRAFT_KEY = "bsky-composer-draft";
const LOCAL_VISITOR_KEY = "bsky-composer-visitor";
const ACTIVITY_PING_INTERVAL_MS = 30000;
const EMOJIS = ["😀", "😅", "🥳", "🥹", "😄", "😋", "😂", "🤣", "🥲", "☺️", "😊", "😇", "🙂", "🙃", "😉", "😌", "😍", "🥰", "😘", "😙", "😝", "😜", "🤨", "🧐", "🤓", "😎", "🤩", "😏", "😒", "😞", "😔", "😟", "😕", "😭", "🙁", "🥺", "😫", "😤", "😠", "😡", "🤬", "🥵", "😳", "🔥", "✨", "👍", "💡", "📌", "🧠", "🍕", "☕️", "✅", "💬", "🎮", "🕹️", "🧭", "👀", "🐈" , "🐈‍⬛" , "👇", "👎" , "🖕", "👉" , "🤌" ];

export default function Composer({
  onNoteSaved,
  onLocalSave,
  user,
  isPro,
  proCheckoutUrl,
  replyTarget,
}: {
  onNoteSaved: () => void;
  onLocalSave: (content: string, images?: { data: string; alt: string }[]) => void;
  user: any;
  isPro: boolean;
  proCheckoutUrl?: string;
  replyTarget?: { uri: string; cid: string } | null;
}) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [hasAutoSaved, setHasAutoSaved] = useState(false);
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const [visitorId, setVisitorId] = useState<string | null>(null);
  const lastPingRef = useRef<number>(0);
  const lastSavePingRef = useRef<number>(0);
  const [images, setImages] = useState<{ data: string; name: string; alt: string; width?: number; height?: number }[]>([]);
  const [video, setVideo] = useState<{
    data?: string;
    bytes?: Uint8Array;
    mime?: string;
    name: string;
    alt: string;
    width?: number;
    height?: number;
    size?: number;
  } | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
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
      window.sessionStorage.removeItem("bsky-handle");
      window.sessionStorage.removeItem("bsky-app-password");
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

  // Clear video selection when not PRO
  useEffect(() => {
    if (!isPro) {
      setVideo(null);
      if (videoInputRef.current) videoInputRef.current.value = "";
    }
  }, [isPro]);

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
    onLocalSave(
      safe,
      images.map((img) => ({ data: img.data, alt: img.alt }))
    );
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
      onLocalSave(
        safe,
        images.map((img) => ({ data: img.data, alt: img.alt }))
      );
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
      setImages([]);
      setVideo(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      if (videoInputRef.current) {
        videoInputRef.current.value = "";
      }
    } catch (err: any) {
      alert(`Error saving note: ${err.message ?? "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const checkBskyAvailability = async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const res = await fetch("https://bsky.social/xrpc/com.atproto.server.describeServer", {
        method: "GET",
        signal: controller.signal,
      });
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  };

  const parseDataUrlToBuffer = (dataUrl: string) => {
    const match = dataUrl.match(/^data:(.*);base64,(.*)$/);
    if (!match) return null;
    const rawMime = match[1] || "";
    const mime = rawMime.split(";")[0]?.trim() || "application/octet-stream";
    const base64 = match[2];
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return { mime, bytes };
  };

  const uploadBlobDirect = async (
    accessJwt: string,
    payload: { bytes?: Uint8Array; dataUrl?: string; mime?: string }
  ) => {
    const parsed =
      payload.bytes && payload.mime
        ? { bytes: payload.bytes, mime: payload.mime }
        : payload.dataUrl
          ? parseDataUrlToBuffer(payload.dataUrl)
          : null;
    if (!parsed) throw new Error("Invalid media data");
    const blobBody =
      parsed.bytes instanceof Uint8Array
        ? new Blob([parsed.bytes.buffer as ArrayBuffer], { type: parsed.mime || "application/octet-stream" })
        : parsed.bytes;
    const res = await fetch("https://bsky.social/xrpc/com.atproto.repo.uploadBlob", {
      method: "POST",
      headers: {
        "Content-Type": parsed.mime || "application/octet-stream",
        Authorization: `Bearer ${accessJwt}`,
      },
      body: blobBody as any,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Upload failed: ${res.status} ${detail}`.trim());
    }
    const json = await res.json();
    return json?.blob;
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
    setPostMessage("Checking Bluesky availability...");
    const ok = await checkBskyAvailability();
    if (!ok) {
      setPostMessage("Bluesky seems unavailable right now. Try again soon.");
      setTimeout(() => setPostMessage(null), 4000);
      setPosting(false);
      return;
    }
    setPostMessage("Processing your request... this may take a moment.");
    try {
      if (video && !isPro) {
        setPostMessage("Video posting is a PRO feature. Remove the video or upgrade to PRO.");
        setTimeout(() => setPostMessage(null), 4000);
        setPosting(false);
        return;
      }
      const totalBytes = images.reduce((sum, img) => sum + dataUrlSizeBytes(img.data), 0);
      if (totalBytes > 3_600_000) {
        setPostMessage("Images are still too large; try fewer or smaller images.");
        setTimeout(() => setPostMessage(null), 4000);
        setPosting(false);
        return;
      }
      if (video?.size && video.size > 10 * 1024 * 1024) {
        setPostMessage("Video too large (limit ~10MB). Please choose a smaller file.");
        setTimeout(() => setPostMessage(null), 4000);
        setPosting(false);
        return;
      }

      if (replyTarget?.uri && typeof window !== "undefined") {
        const confirmReply = window.confirm(
          "You’re about to reply to a post (not post to your own timeline). Continue?"
        );
        if (!confirmReply) {
          setPosting(false);
          setPostMessage(null);
          return;
        }
      }

      if (video) {
        const res = await fetch("/api/bluesky/post", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            identifier: bskyHandle.trim(),
            appPassword: bskyAppPassword.trim(),
            text: safe,
            video: {
              bytes: video.bytes ? Array.from(video.bytes) : undefined,
              data: video.data,
              mime: video.mime,
              alt: video.alt,
              width: video.width,
              height: video.height,
              size: video.size,
              name: video.name,
            },
            images: [],
            replyControl,
            replyListUri,
            replyTarget,
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error || "Failed to post video");
      } else {
        const res = await fetch("/api/bluesky/post", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            identifier: bskyHandle.trim(),
            appPassword: bskyAppPassword.trim(),
            text: safe,
            images: images.map((img) => ({
              data: img.data,
              alt: img.alt || img.name,
              width: img.width,
              height: img.height,
            })),
            replyControl,
            replyListUri,
            replyTarget,
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error || "Failed to post");
      }
      setPostMessage("Posted to Bluesky ✔️");
      setTimeout(() => setPostMessage(null), 4000);
    } catch (err: any) {
      setPostMessage(err?.message || "Failed to post");
      setTimeout(() => setPostMessage(null), 5000);
    } finally {
      setPosting(false);
    }
  };

  const compressFile = (file: File): Promise<{ data: string; name: string; alt: string; width: number; height: number } | null> => {
    return new Promise((resolve) => {
      const mime = (file.type || "").toLowerCase();
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      const allowedTypes = ["image/png", "image/jpeg", "image/jpg"];
      const extAllowed = ["png", "jpg", "jpeg"].includes(ext);
      if (!allowedTypes.includes(mime) || !extAllowed) return resolve(null);

      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const tryRender = (maxDim: number, quality: number) => {
            let { width, height } = img;
            if (width > maxDim || height > maxDim) {
              const scale = Math.min(maxDim / width, maxDim / height);
              width = Math.round(width * scale);
              height = Math.round(height * scale);
            }
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            if (!ctx) return null;
            ctx.drawImage(img, 0, 0, width, height);
            const outMime = mime === "image/png" ? "image/png" : "image/jpeg";
            const dataUrl = canvas.toDataURL(outMime, quality);
            return { dataUrl, width, height };
          };

          // First attempt
          const first = tryRender(900, mime === "image/png" ? 0.75 : 0.55);
          if (!first) return resolve(null);
          let candidate = first;
          let size = dataUrlSizeBytes(first.dataUrl);
          if (size > 900_000) {
            const second = tryRender(750, mime === "image/png" ? 0.65 : 0.4);
            if (!second) return resolve(null);
            candidate = second;
            size = dataUrlSizeBytes(second.dataUrl);
            if (size > 950_000) {
              // still too large; reject
              return resolve(null);
            }
          }
          resolve({ data: candidate.dataUrl, name: file.name, alt: "", width: candidate.width, height: candidate.height });
        };
        img.onerror = () => resolve(null);
        img.src = reader.result as string;
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
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
    <div className="w-full max-w-[600px] mx-auto mt-4 p-4 sm:p-6 border border-gray-200 rounded-lg bg-white shadow-sm">
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
              onClick={() => setShowEmojis((v) => !v)}
              className="px-2 py-1 text-xs font-semibold rounded border border-gray-200 bg-white hover:bg-gray-100"
            >
              😊 Emoji
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
            Add your Bluesky handle + <strong>app password</strong> (not your regular login password) to post directly to your timeline. Get an app password from{" "}
            <a
              href="https://bsky.app/settings/app-passwords"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              bsky.app/settings/app-passwords
            </a>
            . Stored only in your browser; clear the fields to remove.
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
                onClick={clearBskyCreds}
                className="px-3 py-2 text-xs font-semibold rounded border border-sky-200 bg-white text-sky-700 hover:bg-sky-50 transition"
                title="Clear stored Bluesky credentials"
              >
                Logout of Bluesky
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
      <div className="mt-4 space-y-3 rounded-lg border border-dashed border-gray-300 bg-gray-50/80 p-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <label className="block text-sm font-semibold text-gray-800">Media</label>
          <span className="text-[11px] text-gray-600">
            Images (up to 4, png/jpg) {isPro ? " • 1 video (mp4)" : ""}
          </span>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-md border-2 border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 shadow-sm ring-1 ring-gray-200 transition filter grayscale hover:grayscale-0 hover:bg-gray-100 hover:shadow-md"
            >
              {images.length ? "Add/Change images" : "Choose images"}
            </button>
            <span className="text-xs text-gray-600">
              {images.length ? `${images.length} selected` : "No images selected"}
            </span>
          </div>
          {isPro && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => videoInputRef.current?.click()}
                className="rounded-md border-2 border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 shadow-sm ring-1 ring-gray-200 transition hover:bg-gray-100 hover:shadow-md"
              >
                {video ? "Replace video" : "Choose video"}
              </button>
              <span className="text-xs text-gray-600">
                {video ? `${video.name}` : "No video selected"}
              </span>
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            if (!files.length) {
              setImages([]);
              return;
            }
            const max = 4;
            const current = [...images];
            const slots = Math.max(0, max - current.length);
            const chosen = files.slice(0, slots);

            setPostMessage("Processing images, this may take a moment...");
            Promise.all(chosen.map(compressFile)).then((results) => {
              const valid = results.filter(Boolean) as { data: string; name: string; alt: string; width?: number; height?: number }[];
              if (valid.length < chosen.length) {
                setFlashMessage("One or more images were too large to compress under 1MB.");
                setTimeout(() => setFlashMessage(null), 4000);
              }
              setImages([...current, ...valid].slice(0, max));
              setPostMessage(null);
            });
          }}
        />

        {isPro && (
        <input
          ref={videoInputRef}
          type="file"
          accept="video/mp4"
          className="hidden"
          onChange={(e) => {
            const file = (e.target.files || [])[0];
            if (!file) {
              setVideo(null);
              return;
            }
            if (file.size > 10 * 1024 * 1024) {
              setPostMessage("Video too large (limit ~10MB). Please choose a smaller file.");
              setTimeout(() => setPostMessage(null), 4000);
              setVideo(null);
              return;
            }

            const reader = new FileReader();
            reader.onload = () => {
              const arrayBuffer = reader.result as ArrayBuffer;
              const bytes = new Uint8Array(arrayBuffer);
              const vid = document.createElement("video");
              vid.preload = "metadata";
              vid.onloadedmetadata = () => {
                const width = vid.videoWidth;
                const height = vid.videoHeight;
                setVideo({
                  bytes,
                  mime: file.type || "video/mp4",
                  name: file.name,
                  alt: "",
                  width,
                  height,
                  size: file.size,
                });
              };
              vid.onerror = () => {
                setVideo(null);
                setPostMessage("Could not read video metadata.");
                setTimeout(() => setPostMessage(null), 3000);
              };
              const blobUrl = URL.createObjectURL(new Blob([arrayBuffer], { type: file.type || "video/mp4" }));
              vid.src = blobUrl;
            };
            reader.onerror = () => setVideo(null);
            reader.readAsArrayBuffer(file);
          }}
        />
        )}

        {images.length > 0 && (
          <div className="mt-3 grid grid-cols-1 gap-3">
            {images.map((img, idx) => (
              <div key={idx} className="relative space-y-2">
                <img
                  src={img.data}
                  alt={img.alt || img.name || `Image ${idx + 1}`}
                  className="w-full max-h-48 object-cover rounded border border-gray-200"
                />
                <input
                  type="text"
                  value={img.alt}
                  onChange={(e) => {
                    const next = [...images];
                    next[idx] = { ...next[idx], alt: e.target.value };
                    setImages(next);
                  }}
                  placeholder="Alt text"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-800 shadow-sm"
                />
                <button
                  type="button"
                  onClick={() => {
                    const next = images.filter((_, i) => i !== idx);
                    setImages(next);
                    if (fileInputRef.current && next.length === 0) {
                      fileInputRef.current.value = "";
                    }
                  }}
                  className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-white border border-red-200 text-red-600 text-xs font-bold shadow hover:bg-red-50"
                  aria-label="Remove image"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {isPro && video && (
          <div className="space-y-2">
            <div className="text-xs text-gray-600">Selected video: {video.name}</div>
            <input
              type="text"
              value={video.alt}
              onChange={(e) => setVideo((prev) => (prev ? { ...prev, alt: e.target.value } : prev))}
              placeholder="Video description (alt)"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-800 shadow-sm"
            />
            <button
              type="button"
              onClick={() => {
                setVideo(null);
                if (videoInputRef.current) videoInputRef.current.value = "";
              }}
              className="px-3 py-1.5 text-xs font-semibold rounded border border-red-200 text-red-700 bg-white hover:bg-red-50"
            >
              Remove video
            </button>
          </div>
        )}

        <p className="text-[11px] text-gray-500">
          Images stay on this device and are never uploaded to Supabase. If you post to Bluesky, up to 4 images are sent with the text; only the text is synced to Supabase. Video is PRO only and sent directly when you post (kept as original bytes to avoid corruption).
        </p>
      </div>

      <div className="mt-3 space-y-3">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <span
            className={`text-sm ${
              text.length === MAX_CHARACTERS ? "text-red-500" : "text-gray-500"
            }`}
          >
            {text.length}/{MAX_CHARACTERS}
          </span>
          <div className="flex flex-col gap-2 flex-wrap">
            <label className="text-xs font-semibold text-gray-700">Limit replies to post</label>
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
                className="w-full sm:w-auto rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-800 shadow-sm"
              />
            )}
          </div>
        </div>

        <div className="flex gap-2 justify-end flex-wrap">
          <button
            type="button"
          onClick={() => {
            setText("");
            setImages([]);
            setVideo(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
            if (videoInputRef.current) videoInputRef.current.value = "";
          }}
          className="px-3 py-2 rounded-md border border-gray-300 text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50"
        >
          Clear input field
        </button>
          <button
            onClick={postToBluesky}
            disabled={text.length === 0 || posting}
            className={`px-3 py-2 rounded-md text-white text-sm font-semibold transition ${
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
            className={`px-4 py-2 rounded-md text-white text-sm font-semibold transition ${
              text.length === 0 || loading
                ? "bg-blue-400 cursor-not-allowed opacity-50"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {loading ? "Saving..." : "Save note"}
          </button>
        </div>
      </div>

      {postMessage && (
        <div className="mt-2 text-sm text-blue-700">{postMessage}</div>
      )}

    </div>
  );
}
