"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type SessionRecord = {
  id: number;
  title: string;
  durationMs: number;
  mood: string;
  moodColor: string;
  thoughts: string;
  coverData: string | null;
};

const EMOTIONS = [
  "Joy",
  "Trust",
  "Fear",
  "Surprise",
  "Sadness",
  "Anger",
  "Happy",
  "Content",
  "Optimistic",
  "Excited",
  "Enthusiastic",
  "Affectionate",
  "Passionate",
  "Sentimental",
  "Frustrated",
  "Jealous",
  "Resentful",
  "Disappointed",
  "Regretful",
  "Guilty",
  "Lonely",
  "Confused",
  "Amazed",
  "Inspired",
  "Anxious",
  "Worried",
  "Helpless",
  "Scared",
  "Mad",
];

const THOUGHT_LIMIT = 240;
const STORAGE_KEY = "reading-sessions";
const COVER_KEY = "reading-cover";

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
  const [title, setTitle] = useState("");
  const [mood, setMood] = useState("Joy");
  const [moodColor, setMoodColor] = useState("#f5c542");
  const [thoughts, setThoughts] = useState("");
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [coverData, setCoverData] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [postMessage, setPostMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
    const cover = window.localStorage.getItem(COVER_KEY);
    if (cover) setCoverData(cover);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (coverData) window.localStorage.setItem(COVER_KEY, coverData);
  }, [coverData]);

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
    setTitle("");
  };

  const endSession = () => {
    if (!startTime) return;
    const durationMs = Date.now() - startTime;
    const record: SessionRecord = {
      id: Date.now(),
      title: title || "Untitled session",
      durationMs,
      mood,
      moodColor,
      thoughts,
      coverData,
    };
    setSessions((prev) => [record, ...prev]);
    setSessionActive(false);
    setStartTime(null);
    setElapsed(0);
  };

  const handleCoverUpload = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setCoverData(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const drawCard = async (session: SessionRecord) => {
    const width = 900;
    const height = 420;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = "#0b1020";
    ctx.fillRect(0, 0, width, height);

    const cardX = 36;
    const cardY = 36;
    const cardW = width - 72;
    const cardH = height - 72;
    const radius = 26;
    ctx.fillStyle = session.moodColor || "#1f2937";
    ctx.beginPath();
    ctx.moveTo(cardX + radius, cardY);
    ctx.lineTo(cardX + cardW - radius, cardY);
    ctx.quadraticCurveTo(cardX + cardW, cardY, cardX + cardW, cardY + radius);
    ctx.lineTo(cardX + cardW, cardY + cardH - radius);
    ctx.quadraticCurveTo(cardX + cardW, cardY + cardH, cardX + cardW - radius, cardY + cardH);
    ctx.lineTo(cardX + radius, cardY + cardH);
    ctx.quadraticCurveTo(cardX, cardY + cardH, cardX, cardY + cardH - radius);
    ctx.lineTo(cardX, cardY + radius);
    ctx.quadraticCurveTo(cardX, cardY, cardX + radius, cardY);
    ctx.closePath();
    ctx.fill();

    // title strip
    const stripH = 70;
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath();
    ctx.moveTo(cardX + radius, cardY);
    ctx.lineTo(cardX + cardW - radius, cardY);
    ctx.quadraticCurveTo(cardX + cardW, cardY, cardX + cardW, cardY + radius);
    ctx.lineTo(cardX + cardW, cardY + stripH);
    ctx.lineTo(cardX, cardY + stripH);
    ctx.lineTo(cardX, cardY + radius);
    ctx.quadraticCurveTo(cardX, cardY, cardX + radius, cardY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#0b1020";
    ctx.font = "bold 28px 'Georgia'";
    ctx.textAlign = "center";
    ctx.fillText(session.title, cardX + cardW / 2, cardY + stripH / 2 + 10);

    // center content
    const coverW = 170;
    const coverH = 230;
    const coverX = cardX + 32;
    const contentH = cardH - stripH;
    const startY = cardY + stripH + (contentH - coverH) / 2;
    const coverY = startY;
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.fillRect(coverX, coverY, coverW, coverH);
    if (session.coverData) {
      const img = new Image();
      await new Promise((res) => {
        img.onload = res;
        img.onerror = res;
        img.src = session.coverData!;
      });
      ctx.drawImage(img, coverX, coverY, coverW, coverH);
    } else {
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(coverX, coverY, coverW, coverH);
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.font = "12px Arial";
      ctx.textAlign = "center";
      ctx.fillText("Cover", coverX + coverW / 2, coverY + coverH / 2);
    }

    const infoX = coverX + coverW + 24;
    const infoW = cardX + cardW - infoX - 24;
    const infoH = 150;
    const infoY = coverY + (coverH - infoH) / 2;
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath();
    ctx.moveTo(infoX + 14, infoY);
    ctx.lineTo(infoX + infoW - 14, infoY);
    ctx.quadraticCurveTo(infoX + infoW, infoY, infoX + infoW, infoY + 14);
    ctx.lineTo(infoX + infoW, infoY + infoH - 14);
    ctx.quadraticCurveTo(infoX + infoW, infoY + infoH, infoX + infoW - 14, infoY + infoH);
    ctx.lineTo(infoX + 14, infoY + infoH);
    ctx.quadraticCurveTo(infoX, infoY + infoH, infoX, infoY + infoH - 14);
    ctx.lineTo(infoX, infoY + 14);
    ctx.quadraticCurveTo(infoX, infoY, infoX + 14, infoY);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#0b1020";
    ctx.font = "15px 'Georgia'";
    ctx.textAlign = "left";
    const chip = (label: string, value: string, cx: number, cy: number) => {
      const text = `${label}: ${value}`;
      const paddingX = 10;
      const metrics = ctx.measureText(text);
      const w = metrics.width + paddingX * 2;
      const h = 24;
      const r = 12;
      ctx.fillStyle = "rgba(0,0,0,0.08)";
      ctx.beginPath();
      ctx.moveTo(cx + r, cy);
      ctx.lineTo(cx + w - r, cy);
      ctx.quadraticCurveTo(cx + w, cy, cx + w, cy + r);
      ctx.lineTo(cx + w, cy + h - r);
      ctx.quadraticCurveTo(cx + w, cy + h, cx + w - r, cy + h);
      ctx.lineTo(cx + r, cy + h);
      ctx.quadraticCurveTo(cx, cy + h, cx, cy + h - r);
      ctx.lineTo(cx, cy + r);
      ctx.quadraticCurveTo(cx, cy, cx + r, cy);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#0b1020";
      ctx.fillText(text, cx + paddingX, cy + h / 2 + 5);
      return w;
    };
    const timeX = infoX + 14;
    const timeW = chip("Time", formatMs(session.durationMs), timeX, infoY + 18);
    const moodX = timeX + timeW + 6;
    chip("Mood", session.mood, moodX, infoY + 18);

    // thoughts
    const thoughtBoxX = infoX + 12;
    const thoughtBoxY = infoY + 52;
    const thoughtBoxW = infoW - 24;
    const thoughtBoxH = 60;
    ctx.fillStyle = "rgba(0,0,0,0.06)";
    ctx.beginPath();
    ctx.moveTo(thoughtBoxX + 10, thoughtBoxY);
    ctx.lineTo(thoughtBoxX + thoughtBoxW - 10, thoughtBoxY);
    ctx.quadraticCurveTo(thoughtBoxX + thoughtBoxW, thoughtBoxY, thoughtBoxX + thoughtBoxW, thoughtBoxY + 10);
    ctx.lineTo(thoughtBoxX + thoughtBoxW, thoughtBoxY + thoughtBoxH - 10);
    ctx.quadraticCurveTo(
      thoughtBoxX + thoughtBoxW,
      thoughtBoxY + thoughtBoxH,
      thoughtBoxX + thoughtBoxW - 10,
      thoughtBoxY + thoughtBoxH,
    );
    ctx.lineTo(thoughtBoxX + 10, thoughtBoxY + thoughtBoxH);
    ctx.quadraticCurveTo(thoughtBoxX, thoughtBoxY + thoughtBoxH, thoughtBoxX, thoughtBoxY + thoughtBoxH - 10);
    ctx.lineTo(thoughtBoxX, thoughtBoxY + 10);
    ctx.quadraticCurveTo(thoughtBoxX, thoughtBoxY, thoughtBoxX + 10, thoughtBoxY);
    ctx.closePath();
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.rect(thoughtBoxX, thoughtBoxY, thoughtBoxW, thoughtBoxH);
    ctx.clip();
    ctx.strokeStyle = "#0b1020";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(thoughtBoxX + 8, thoughtBoxY + 8);
    ctx.lineTo(thoughtBoxX + 8, thoughtBoxY + thoughtBoxH - 8);
    ctx.stroke();
    ctx.fillStyle = "#0b1020";
    ctx.font = "italic 14px 'Georgia'";
    const firstLineY = thoughtBoxY + thoughtBoxH / 2 - 2;
    const wrapText = (text: string, maxWidth: number, lineHeight: number, startY: number) => {
      const words = text.split(" ");
      let line = "";
      let y = startY;
      for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + " ";
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && n > 0) {
          ctx.fillText(line, thoughtBoxX + 18, y);
          line = words[n] + " ";
          y += lineHeight;
        } else {
          line = testLine;
        }
      }
      if (line.trim()) ctx.fillText(line, thoughtBoxX + 18, y);
    };
    wrapText(session.thoughts || "No thoughts added.", thoughtBoxW - 32, 18, firstLineY);
    ctx.restore();

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
          text: `${latest.title} • ${formatMs(latest.durationMs)} • Mood: ${latest.mood}`,
          images: [
            {
              data: dataUrl,
              alt: latest.title,
              width: 900,
              height: 420,
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

  return (
    <div className="rounded-3xl border border-slate-800/60 bg-slate-900/70 p-6 shadow-inner shadow-black/40">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Reading sessions</p>
          <p className="text-xl font-semibold text-slate-50">Log & share</p>
        </div>
        <button
          onClick={sessionActive ? endSession : startSession}
          className={`rounded-full px-3 py-2 text-xs font-semibold ${
            sessionActive
              ? "border border-amber-200/60 bg-amber-100/10 text-amber-50"
              : "border border-white/30 bg-white/10 text-white"
          }`}
        >
          {sessionActive ? "End session" : "Start session"}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <label className="block text-sm text-slate-300">
            Session title
            <input
              className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm"
              placeholder="Chapter or section title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!sessionActive}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm text-slate-300">
              Mood
              <select
                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm"
                value={mood}
                onChange={(e) => setMood(e.target.value)}
                disabled={!sessionActive}
              >
                {EMOTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-slate-300">
              Mood color
              <div className="mt-2 flex items-center gap-3">
                <input
                  type="color"
                  className="h-10 w-16 cursor-pointer rounded-lg border border-white/10 bg-transparent p-1"
                  value={moodColor}
                  onChange={(e) => setMoodColor(e.target.value)}
                  disabled={!sessionActive}
                />
                <span className="text-[11px] text-slate-400">{moodColor}</span>
              </div>
            </label>
          </div>
          <label className="block text-sm text-slate-300">
            Thoughts (optional)
            <textarea
              className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm"
              rows={3}
              maxLength={THOUGHT_LIMIT}
              value={thoughts}
              onChange={(e) => setThoughts(e.target.value)}
              disabled={!sessionActive}
              placeholder="Notes or a short quote from this session..."
            />
            <div className="mt-1 text-right text-[11px] text-slate-400">
              {thoughts.length}/{THOUGHT_LIMIT}
            </div>
          </label>
          <div className="flex items-center justify-between text-sm text-slate-300">
            <span>Timer: {sessionActive ? formatMs(elapsed) : "00:00"}</span>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-300">Book cover</p>
              <p className="text-xs text-slate-400">Stored locally</p>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="rounded-full border border-white/20 px-3 py-2 text-xs font-semibold text-slate-50 transition hover:border-white/50 hover:bg-white/10"
            >
              Upload
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleCoverUpload(e.target.files?.[0])}
            />
          </div>
          <div className="flex items-center justify-center rounded-2xl border border-dashed border-white/20 bg-slate-900/60 p-4">
            {coverData ? (
              <img
                src={coverData}
                alt="Book cover"
                className="max-h-[220px] w-auto rounded-xl border border-white/10 object-contain"
              />
            ) : (
              <p className="text-sm text-slate-400">No cover saved yet</p>
            )}
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            {latest ? (
              <div
                className="flex flex-col gap-3 rounded-xl border border-white/10 p-4"
                style={{ backgroundColor: latest.moodColor }}
              >
                <div className="rounded-lg bg-white/85 px-3 py-2 text-center text-black">
                  <p className="text-lg font-semibold">{latest.title}</p>
                </div>
                <div className="flex items-start gap-3 rounded-lg bg-white/90 px-3 py-2 text-black">
                  <div className="h-24 w-16 overflow-hidden rounded-md border border-black/10 bg-black/10">
                    {latest.coverData ? (
                      <img
                        src={latest.coverData}
                        alt="Book cover"
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] text-black/60">
                        Cover
                      </div>
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap gap-2 text-xs text-black/80">
                      <span className="rounded-full bg-black/10 px-2 py-1">
                        Time: {formatMs(latest.durationMs)}
                      </span>
                      <span className="rounded-full bg-black/10 px-2 py-1">
                        Mood: {latest.mood}
                      </span>
                    </div>
                    <div
                      className="flex items-start gap-2 rounded-lg bg-black/5 px-2 py-2 text-xs italic text-black"
                      style={{ borderLeft: "3px solid #0b1020" }}
                    >
                      <span className="sr-only">Quote</span>
                      <p className="line-clamp-2">{latest.thoughts || "No thoughts added."}</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400">Finish a session to see it here.</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <button
              className="w-full rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-slate-50 transition hover:border-white/50 hover:bg-white/10 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-slate-500"
              onClick={exportImage}
              disabled={!latest || exporting}
            >
              {exporting ? "Exporting…" : "Export image"}
            </button>
            <button
              className="w-full rounded-full border border-sky-400/40 bg-sky-500/20 px-4 py-2 text-sm font-semibold text-sky-50 transition hover:border-sky-400 hover:bg-sky-500/30 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-slate-500"
              onClick={postToBluesky}
              disabled={!latest || exporting}
            >
              Post to Bluesky
            </button>
            {postMessage && <p className="text-xs text-slate-300">{postMessage}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
