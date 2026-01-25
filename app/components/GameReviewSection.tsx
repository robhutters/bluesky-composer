"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

type Review = {
  id: number;
  title: string;
  thoughts: string[];
  background: string | null;
};

const STORAGE_KEY = "game-reviews";
const THOUGHT_LIMIT = 150;
const MAX_THOUGHTS = 6;
const CANVAS_WIDTH = 720;
const CANVAS_HEIGHT = 1280;

export default function GameReviewSection() {
  const [title, setTitle] = useState("");
  const [thoughtInput, setThoughtInput] = useState("");
  const [thoughts, setThoughts] = useState<string[]>([]);
  const [backgroundSrc, setBackgroundSrc] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [editingThoughtIndex, setEditingThoughtIndex] = useState<number | null>(null);
  const [editingThoughtValue, setEditingThoughtValue] = useState("");
  const [editingReviewId, setEditingReviewId] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) setReviews(parsed);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(reviews));
    } catch {
      /* ignore */
    }
  }, [reviews]);

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

  const loadImage = (src: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });

  const drawPreview = async (review: Review) => {
    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // Background
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    const bgSrc = review.background || "/assets/mood-background.png";
    try {
      const img = await loadImage(bgSrc);
      const scale = Math.max(CANVAS_WIDTH / img.width, CANVAS_HEIGHT / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      const dx = (CANVAS_WIDTH - dw) / 2;
      const dy = (CANVAS_HEIGHT - dh) / 2;
      ctx.drawImage(img, dx, dy, dw, dh);
    } catch {
      const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
      grad.addColorStop(0, "#111827");
      grad.addColorStop(1, "#1f2937");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }

    // Overlay
    const overlay = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    overlay.addColorStop(0, "rgba(0,0,0,0.25)");
    overlay.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = overlay;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.fillStyle = "white";
    ctx.textAlign = "left";

    // Title + label
    ctx.font = "700 52px 'Viaoda Libre', 'Playfair Display', 'Georgia', serif";
    ctx.fillText(review.title, 60, 160, CANVAS_WIDTH - 120);
    ctx.font = "600 20px 'Inter','Helvetica Neue',Arial,sans-serif";
    ctx.fillText("review", 60, 190);

    // Thoughts list
    ctx.font = "400 28px 'Inter','Helvetica Neue',Arial,sans-serif";
    let y = 260;
    const lineHeight = 48;
    review.thoughts.forEach((t) => {
      const text = `✅ ${t}`;
      const words = text.split(" ");
      let line = "";
      words.forEach((w) => {
        const test = line + w + " ";
        if (ctx.measureText(test).width > CANVAS_WIDTH - 120) {
          ctx.fillText(line.trim(), 60, y);
          y += lineHeight;
          line = w + " ";
        } else {
          line = test;
        }
      });
      if (line.trim()) {
        ctx.fillText(line.trim(), 60, y);
        y += lineHeight;
      }
    });

    return canvas.toDataURL("image/jpeg", 0.86);
  };

  const addThought = () => {
    const val = thoughtInput.trim();
    if (!val) return;
    if (val.length > THOUGHT_LIMIT) return;
    if (thoughts.length >= MAX_THOUGHTS) return;
    setThoughts((prev) => [...prev, val]);
    setThoughtInput("");
  };

  const moveThought = (idx: number, direction: -1 | 1) => {
    setThoughts((prev) => {
      const next = [...prev];
      const target = idx + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const startEditThought = (idx: number) => {
    setEditingThoughtIndex(idx);
    setEditingThoughtValue(thoughts[idx]);
  };

  const saveEditThought = () => {
    if (editingThoughtIndex === null) return;
    const val = editingThoughtValue.trim().slice(0, THOUGHT_LIMIT);
    if (!val) {
      setEditingThoughtIndex(null);
      setEditingThoughtValue("");
      return;
    }
    setThoughts((prev) => prev.map((t, i) => (i === editingThoughtIndex ? val : t)));
    setEditingThoughtIndex(null);
    setEditingThoughtValue("");
  };

  const saveReview = () => {
    if (!title.trim()) {
      setMessage("Title is required.");
      return;
    }
    if (thoughts.length === 0) {
      setMessage("Add at least one thought.");
      return;
    }
    const reviewId = editingReviewId ?? Date.now();
    const review: Review = {
      id: reviewId,
      title: title.trim(),
      thoughts: [...thoughts],
      background: backgroundSrc,
    };
    setReviews((prev) => {
      if (editingReviewId === null) {
        return [review, ...prev];
      }
      return prev.map((r) => (r.id === editingReviewId ? review : r));
    });
    setTitle("");
    setThoughtInput("");
    setThoughts([]);
    setEditingReviewId(null);
    setEditingThoughtIndex(null);
    setEditingThoughtValue("");
    setMessage("Review saved.");
    setTimeout(() => setMessage(null), 2000);

    // Best-effort sync to Supabase
    void (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          if (editingReviewId === null) {
            await supabase.from("game_reviews").insert({
              user_id: session.user.id,
              title: review.title,
              thoughts: review.thoughts,
              background: review.background,
              created_at: new Date(review.id).toISOString(),
            });
          } else {
            await supabase
              .from("game_reviews")
              .update({
                title: review.title,
                thoughts: review.thoughts,
                background: review.background,
              })
              .eq("user_id", session.user.id)
              .eq("created_at", new Date(review.id).toISOString());
          }
        }
      } catch {
        /* ignore sync errors */
      }
    })();
  };

  const handlePreview = async () => {
    if (!title.trim() || thoughts.length === 0) {
      setMessage("Add a title and at least one thought first.");
      return;
    }
    const review: Review = {
      id: Date.now(),
      title: title.trim(),
      thoughts,
      background: backgroundSrc,
    };
    const dataUrl = await drawPreview(review);
    if (dataUrl) setPreviewUrl(dataUrl);
  };

  const postToBluesky = async () => {
    if (!previewUrl) {
      await handlePreview();
    }
    const handle = typeof window !== "undefined" ? window.localStorage.getItem("bsky-handle") : "";
    const appPassword = typeof window !== "undefined" ? window.localStorage.getItem("bsky-app-password") : "";
    if (!handle || !appPassword) {
      setMessage("Add your Bluesky handle + app password first.");
      setTimeout(() => setMessage(null), 2500);
      return;
    }
    const currentPreview = previewUrl;
    if (!currentPreview) {
      setMessage("Preview failed. Try again.");
      return;
    }
    setPosting(true);
    try {
      const alt = `Review for ${title}: ${thoughts.join(" | ").slice(0, 1000)}`;
      const res = await fetch("/api/bluesky/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: handle,
          appPassword,
          text: `Review: ${title}`,
          images: [{ data: currentPreview, alt, width: CANVAS_WIDTH, height: CANVAS_HEIGHT }],
          replyControl: "anyone",
          replyListUri: "",
          replyTarget: null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to post");
      setMessage("Posted to Bluesky ✔️");
    } catch (err: any) {
      setMessage(err?.message || "Failed to post.");
    } finally {
      setPosting(false);
      setTimeout(() => setMessage(null), 2500);
    }
  };

  return (
    <div className="w-full max-w-5xl rounded-xl border border-slate-200 bg-white/80 p-4 sm:p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Reviews</p>
          <h3 className="text-lg font-semibold text-slate-900">Share quick game reviews</h3>
          <p className="text-sm text-slate-600">Up to 6 thoughts per review, 150 characters each. Uses the same background as session exports.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="md:col-span-2 space-y-3">
          <label className="block text-sm text-slate-800">
            Title (required)
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
              placeholder="Game title or headline"
            />
          </label>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-800">Thoughts</span>
              <span className="text-xs text-slate-600">
                {thoughts.length}/{MAX_THOUGHTS}
              </span>
            </div>
            <div className="flex gap-2">
              <input
                value={thoughtInput}
                onChange={(e) => setThoughtInput(e.target.value.slice(0, THOUGHT_LIMIT))}
                placeholder="Add a thought (max 150 chars)"
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800"
              />
              <button
                type="button"
                onClick={addThought}
                disabled={!thoughtInput.trim() || thoughtInput.length > THOUGHT_LIMIT || thoughts.length >= MAX_THOUGHTS}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
              >
                Add
              </button>
            </div>
            <div className="space-y-2">
              {thoughts.map((t, idx) => {
                const isEditing = editingThoughtIndex === idx;
                return (
                  <div
                    key={`${t}-${idx}`}
                    className="flex items-start justify-between gap-2 rounded-lg bg-white px-3 py-2 text-sm text-slate-800"
                  >
                    <div className="flex-1 space-y-1">
                      {isEditing ? (
                        <input
                          value={editingThoughtValue}
                          onChange={(e) => setEditingThoughtValue(e.target.value.slice(0, THOUGHT_LIMIT))}
                          className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                        />
                      ) : (
                        <span className="line-clamp-2">✅ {t}</span>
                      )}
                      <div className="flex items-center gap-2 text-[11px] text-slate-600">
                        <button
                          type="button"
                          onClick={() => moveThought(idx, -1)}
                          disabled={idx === 0}
                          className="rounded border border-slate-200 px-2 py-0.5 disabled:opacity-50"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveThought(idx, 1)}
                          disabled={idx === thoughts.length - 1}
                          className="rounded border border-slate-200 px-2 py-0.5 disabled:opacity-50"
                        >
                          ↓
                        </button>
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              onClick={saveEditThought}
                              className="text-indigo-700 font-semibold"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingThoughtIndex(null);
                                setEditingThoughtValue("");
                              }}
                              className="text-slate-600"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startEditThought(idx)}
                            className="text-indigo-700 font-semibold"
                          >
                            Edit
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setThoughts((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-rose-600 font-semibold"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {thoughts.length === 0 && <p className="text-xs text-slate-500">Add up to six concise thoughts.</p>}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={saveReview}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
              disabled={!title.trim() || thoughts.length === 0}
            >
              {editingReviewId ? "Update review" : "Save review"}
            </button>
            {editingReviewId && (
              <button
                type="button"
                onClick={() => {
                  setEditingReviewId(null);
                  setTitle("");
                  setThoughtInput("");
                  setThoughts([]);
                  setEditingThoughtIndex(null);
                  setEditingThoughtValue("");
                  setBackgroundSrc(null);
                  setMessage("Edit canceled.");
                  setTimeout(() => setMessage(null), 2000);
                }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
              >
                Cancel edit
              </button>
            )}
            <button
              type="button"
              onClick={handlePreview}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
              disabled={!title.trim() || thoughts.length === 0}
            >
              Preview
            </button>
            <button
              type="button"
              onClick={postToBluesky}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
              disabled={!title.trim() || thoughts.length === 0 || posting}
            >
              {posting ? "Posting…" : "Post to Bluesky"}
            </button>
            {message && <span className="text-sm text-slate-700">{message}</span>}
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-800">Background image</p>
                <p className="text-[11px] text-slate-600">Same background used for session exports.</p>
              </div>
              <div className="h-12 w-12 rounded-lg border border-slate-200 overflow-hidden bg-slate-100">
                {backgroundSrc ? (
                  <img src={backgroundSrc} alt="Background preview" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full bg-[url('/assets/mood-background.png')] bg-cover bg-center opacity-80" />
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 shadow-sm">
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
            <p className="text-[11px] text-slate-600">{backgroundSrc ? "Custom image selected" : "Using default background"}</p>
          </div>
        </div>
      </div>

      {previewUrl && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm font-semibold text-slate-800 mb-2">Preview</p>
          <img src={previewUrl} alt="Review preview" className="w-full max-w-md rounded-lg shadow-sm border border-slate-200" />
        </div>
      )}

      {reviews.length > 0 && (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {reviews.map((r) => (
            <div
              key={r.id}
              className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-900 text-white shadow-sm min-h-[240px]"
              style={{
                backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.6) 100%), url('${r.background || "/assets/mood-background.png"}')`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            >
              <div className="p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <h4 className="text-xl font-semibold">{r.title}</h4>
                  <span className="text-xs uppercase tracking-[0.25em] text-slate-200">review</span>
                </div>
                <div className="space-y-3">
                  {r.thoughts.map((t, idx) => (
                    <p key={`${t}-${idx}`} className="text-sm leading-relaxed">
                      ✅ {t}
                    </p>
                  ))}
                </div>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingReviewId(r.id);
                      setTitle(r.title);
                      setThoughts(r.thoughts);
                      setThoughtInput("");
                      setEditingThoughtIndex(null);
                      setEditingThoughtValue("");
                      setBackgroundSrc(r.background);
                      setMessage("Loaded review for editing.");
                      setTimeout(() => setMessage(null), 2000);
                    }}
                    className="text-xs font-semibold text-white underline"
                  >
                    Edit
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
