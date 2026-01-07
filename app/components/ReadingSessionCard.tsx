"use client";

import { useEffect, useState } from "react";

type SessionRecord = {
  id: number;
  durationMs: number;
  thoughts: string;
  bookTitle: string;
};

const THOUGHT_LIMIT = 240;
const STORAGE_KEY = "reading-sessions";
const BG_KEY = "reading-sessions-bg";
const SHOW_TIME_KEY = "reading-sessions-show-time";

function formatMs(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

export default function ReadingSessionCard() {
  const [sessionActive, setSessionActive] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [thoughts, setThoughts] = useState("");
  const [bookTitle, setBookTitle] = useState("");
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [exporting, setExporting] = useState(false);
  const [postMessage, setPostMessage] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [backgroundSrc, setBackgroundSrc] = useState<string | null>(null);
  const [showSessionTime, setShowSessionTime] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setSessions(JSON.parse(stored));
      } catch {
        setSessions([]);
      }
    }
    const storedBg = window.localStorage.getItem(BG_KEY);
    if (storedBg) {
      setBackgroundSrc(storedBg);
    }
    const storedShow = window.localStorage.getItem(SHOW_TIME_KEY);
    if (storedShow) {
      setShowSessionTime(storedShow === "true");
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (backgroundSrc) {
      window.localStorage.setItem(BG_KEY, backgroundSrc);
    } else {
      window.localStorage.removeItem(BG_KEY);
    }
  }, [backgroundSrc]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SHOW_TIME_KEY, String(showSessionTime));
  }, [showSessionTime]);

  useEffect(() => {
    if (!sessionActive || !startTime) return;
    const t = setInterval(() => setElapsed(Date.now() - startTime), 300);
    return () => clearInterval(t);
  }, [sessionActive, startTime]);

  const latest = sessions.at(0);

  const startSession = () => {
    setSessionActive(true);
    setStartTime(Date.now());
    setElapsed(0);
    setThoughts("");
  };

  const endSession = () => {
    if (!startTime) return;
    const durationMs = Date.now() - startTime;
    const record: SessionRecord = {
      id: Date.now(),
      durationMs,
      thoughts,
      bookTitle,
    };
    setSessions((prev) => [record, ...prev]);
    setSessionActive(false);
    setStartTime(null);
    setElapsed(0);
  };

  const loadImage = (src: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });

  const drawCard = async (session: SessionRecord) => {
    const width = 900;
    const height = 1600;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // Paint the provided (or default) background image; fall back to a soft gradient.
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, width, height);
    try {
      const img = await loadImage(backgroundSrc || "/assets/mood-background.png");
      const scale = Math.max(width / img.width, height / img.height);
      const drawW = img.width * scale;
      const drawH = img.height * scale;
      const dx = (width - drawW) / 2;
      const dy = (height - drawH) / 2;
      ctx.drawImage(img, dx, dy, drawW, drawH);
    } catch {
      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, "#111827");
      grad.addColorStop(1, "#1f2937");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    }

    // Overlay to keep text legible
    const overlay = ctx.createLinearGradient(0, 0, 0, height);
    overlay.addColorStop(0, "rgba(0,0,0,0.15)");
    overlay.addColorStop(0.5, "rgba(0,0,0,0.35)");
    overlay.addColorStop(1, "rgba(0,0,0,0.6)");
    ctx.fillStyle = overlay;
    ctx.fillRect(0, 0, width, height);

    // Typography
    const quoteText = session.thoughts || "Your quote goes here";
    const subtitle = session.bookTitle ? `— ${session.bookTitle}` : "";
    const maxWidth = width - 220;
    ctx.textAlign = "center";
    ctx.fillStyle = "white";

    // playful serif script feel
    ctx.font = "400 64px 'Viaoda Libre', 'Playfair Display', 'Georgia', serif";
    const lines: string[] = [];
    const words = quoteText.split(" ");
    let line = "";
    for (const w of words) {
      const test = line + w + " ";
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line.trim());
        line = w + " ";
      } else {
        line = test;
      }
    }
    if (line.trim()) lines.push(line.trim());

    const lineHeight = 80;
    const blockHeight = lines.length * lineHeight;
    let startY = height / 2 - blockHeight / 2;

    lines.forEach((ln, idx) => {
      ctx.fillText(ln, width / 2, startY + idx * lineHeight);
    });

    if (subtitle) {
      ctx.font = "italic 32px 'Viaoda Libre', 'Playfair Display', 'Georgia', serif";
      const subY = startY + lines.length * lineHeight + 36;
      ctx.fillText(subtitle, width / 2, subY);
    }

    if (showSessionTime) {
      const timeText = `Session: ${formatMs(session.durationMs)}`;
      ctx.font = "600 26px 'Inter', 'Helvetica Neue', Arial, sans-serif";
      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.fillText(timeText, width - 40, height - 40);
    }

    return canvas.toDataURL("image/png");
  };

  const postToBluesky = async () => {
    if (!latest) return;
    const handle = typeof window !== "undefined" ? window.localStorage.getItem("bsky-handle") : "";
    const appPassword = typeof window !== "undefined" ? window.localStorage.getItem("bsky-app-password") : "";
    if (!handle || !appPassword) {
      setPostMessage("Add your Bluesky handle + app password in the Composer first.");
      return;
    }
    setPostMessage("Preparing image…");
    const dataUrl = await drawCard(latest);
    if (!dataUrl) {
      setPostMessage("Could not render the card.");
      return;
    }
    try {
      setPostMessage("Posting to Bluesky…");
      const res = await fetch("/api/bluesky/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: handle,
          appPassword,
          text: latest.thoughts || "Shared a reading quote.",
          images: [
            {
              data: dataUrl,
              alt: latest.thoughts || "Reading quote",
              width: 900,
              height: 1600,
            },
          ],
          replyControl: "anyone",
          replyListUri: "",
          replyTarget: null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to post");
      setPostMessage("Posted to Bluesky ✔️");
    } catch (err: any) {
      setPostMessage(err?.message || "Failed to post");
    } finally {
      setTimeout(() => setPostMessage(null), 3500);
    }
  };

  const exportImage = async () => {
    if (!latest) return;
    setExporting(true);
    const dataUrl = await drawCard(latest);
    if (dataUrl) {
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = "session.png";
      a.click();
    }
    setExporting(false);
  };

  const generatePreview = async () => {
    if (!latest) return;
    const url = await drawCard(latest);
    setPreviewUrl(url);
  };

  const handleBackgroundUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result;
      if (typeof result === "string") {
        setBackgroundSrc(result);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-700">Capture a quote, add a book title, preview, then export.</p>
        <button
          onClick={sessionActive ? endSession : startSession}
          className={`rounded-full px-3 py-2 text-xs font-semibold ${
            sessionActive
              ? "border border-amber-300 bg-amber-50 text-amber-800"
              : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          {sessionActive ? "End session" : "Start session"}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-3">
          {!sessionActive && (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Start a session to edit the fields below.
            </div>
          )}
          <label className="block text-sm text-slate-800">
            Quote to share
            <textarea
              className={`mt-2 w-full rounded-xl border px-3 py-2 text-sm text-slate-900 ${
                sessionActive ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed"
              }`}
              rows={4}
              maxLength={THOUGHT_LIMIT}
              value={thoughts}
              onChange={(e) => setThoughts(e.target.value)}
              disabled={!sessionActive}
              placeholder="Write the line you want to share..."
            />
            <div className="mt-1 text-right text-[11px] text-slate-600">
              {thoughts.length}/{THOUGHT_LIMIT}
            </div>
          </label>
          <label className="block text-sm text-slate-800">
            Book title (optional)
            <input
              className={`mt-2 w-full rounded-xl border px-3 py-2 text-sm text-slate-900 ${
                sessionActive ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed"
              }`}
              placeholder="e.g. The Midnight Library"
              value={bookTitle}
              onChange={(e) => setBookTitle(e.target.value)}
              disabled={!sessionActive}
            />
          </label>
          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-xs font-semibold text-slate-800">Background image</p>
            <p className="text-[11px] text-slate-600">
              Use your own image for the card. Defaults to the built-in blur if none is set.
            </p>
            <div className="flex items-center gap-2">
              <label className="flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleBackgroundUpload(file);
                  }}
                />
                Upload image
              </label>
              <button
                type="button"
                className="text-xs font-semibold text-slate-600 hover:text-slate-800"
                onClick={() => setBackgroundSrc(null)}
              >
                Use default
              </button>
            </div>
            {backgroundSrc ? (
              <p className="text-[11px] text-slate-600">Custom image selected</p>
            ) : (
              <p className="text-[11px] text-slate-600">Using default background</p>
            )}
          </div>
          <div className="flex items-center justify-between text-sm text-slate-700">
            <span>Timer: {sessionActive ? formatMs(elapsed) : "00:00"}</span>
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4 accent-slate-800"
                checked={showSessionTime}
                onChange={(e) => setShowSessionTime(e.target.checked)}
              />
              Include session time on export
            </label>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            {previewUrl ? (
              <img src={previewUrl} alt="Preview" className="w-full rounded-xl border border-slate-100 object-cover" />
            ) : (
              <p className="text-sm text-slate-500">Generate a preview to see it here.</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <button
              className="w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
              onClick={generatePreview}
              disabled={!latest}
            >
              Preview image
            </button>
            <button
              className="w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
              onClick={exportImage}
              disabled={!latest || exporting}
            >
              {exporting ? "Exporting…" : "Export image"}
            </button>
            <button
              className="w-full rounded-full border border-sky-300 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-800 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
              onClick={postToBluesky}
              disabled={!latest || exporting}
            >
              Post to Bluesky
            </button>
            {postMessage && <p className="text-xs text-slate-600">{postMessage}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
