"use client";
import React, { useEffect, useState } from "react";

type Project = { name: string; url: string };

const fallbackProjects: Project[] = [
  { name: "Choose your next 8bitdo controller", url: "https://controllerpicker.com" },
  { name: "Respond instantly to targeted keywords", url: "https://socialcmd.app" },
  { name: "Long-form BlueSky posting made enjoyable", url: "https://blueskycomposer.com" },
  { name: "Swipe. Choose. Cook. (Dutch)", url: "https://deluiechef.nl" },
  { name: "Buy Limited Edition Merchandise (Dutch)", url: "https://shop.deluiechef.nl" },
];

export function FloatingProfile() {
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [projects, setProjects] = useState<Project[]>(fallbackProjects);
  const [showPulse, setShowPulse] = useState(false);
  const [showTip, setShowTip] = useState(false);

  useEffect(() => {
    const loadProjects = async () => {
      try {
        const res = await fetch("https://www.socialcmd.app/api/projects", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load projects");
        const data = await res.json();
        if (Array.isArray(data.projects) && data.projects.length) {
          setProjects(data.projects);
        }
      } catch {
        setProjects(fallbackProjects);
      }
    };
    loadProjects();

    const seen = typeof window !== "undefined" && window.sessionStorage.getItem("fp_seen");
    if (!seen) {
      setShowPulse(true);
      setShowTip(true);
      window.sessionStorage.setItem("fp_seen", "1");
      setTimeout(() => setShowPulse(false), 4000);
      setTimeout(() => setShowTip(false), 5000);
    }

    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const panelClasses = isMobile
    ? `fixed left-0 right-0 bottom-24 mx-4 origin-bottom rounded-xl border border-zinc-200 bg-white shadow-lg transition-all duration-200 ${
        open ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0 pointer-events-none"
      }`
    : `fixed bottom-28 right-6 w-80 origin-right rounded-xl border border-zinc-200 bg-white shadow-lg transition-all duration-200 ${
        open ? "translate-x-0 opacity-100" : "translate-x-4 opacity-0 pointer-events-none"
      }`;

  const btnSize = isMobile ? "h-14 w-14" : "h-16 w-16";

  return (
    <>
      <div className={`fixed bottom-4 right-4 z-50 ${btnSize}`}>
        <div className="relative h-full w-full">
          {showPulse && (
            <span className="absolute inset-0 rounded-full border-2 border-purple-400/70 animate-ping" aria-hidden="true"></span>
          )}
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label="Open project menu"
            className={`relative h-full w-full overflow-hidden rounded-full border-2 border-white shadow-lg transition hover:scale-105 ${btnSize}`}
            onMouseEnter={() => setShowTip(true)}
            onMouseLeave={() => setShowTip(false)}
          >
            <img
              src="https://robhutters.com/assets/images/headshot/rob_profile_picture_headshot_small_low_kb.jpeg"
              alt="Rob Hutters headshot"
              className="h-full w-full object-cover"
            />
          </button>
          {showTip && (
            <div className="absolute -left-48 bottom-full mb-2 w-48 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-zinc-800 shadow-lg border border-zinc-200">
              Click to explore more projects
              <span className="absolute right-6 bottom-1.5 h-3 w-3 rotate-45 bg-white border-r border-b border-zinc-200"></span>
            </div>
          )}
        </div>
      </div>

      <div className={`z-50 ${panelClasses}`}>
        <div className="p-3 text-sm font-semibold text-zinc-800">My projects</div>
        <ul className="divide-y divide-zinc-200 text-sm text-zinc-700">
          {projects.map((p) => (
            <li key={p.url}>
              <a
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block px-3 py-2 hover:bg-zinc-50"
                onClick={() => setOpen(false)}
              >
                {p.name}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
