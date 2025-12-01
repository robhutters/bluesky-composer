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

  useEffect(() => {
    const loadProjects = async () => {
      try {
        const res = await fetch("https://www.socialcmd.app/api/projects");
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
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Open project menu"
        className={`fixed bottom-4 right-4 z-50 overflow-hidden rounded-full border-2 border-white shadow-lg transition hover:scale-105 ${btnSize}`}
      >
        <img
          src="https://robhutters.com/assets/images/headshot/rob_profile_picture_headshot_small_low_kb.jpeg"
          alt="Rob Hutters headshot"
          className="h-full w-full object-cover"
        />
      </button>

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
