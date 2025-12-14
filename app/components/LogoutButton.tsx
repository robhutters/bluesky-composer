"use client";
import { supabase } from "../lib/supabaseClient";

export default function LogoutButton() {
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut({ scope: "global" });
    } catch (e) {
      // ignore
    }
    // Hard clear Supabase auth entries from localStorage to prevent auto re-login
    if (typeof window !== "undefined") {
      const keysToRemove: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key && (key.includes("supabase.auth.token") || key.startsWith("sb-"))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => window.localStorage.removeItem(k));
    }
    window.location.href = "/";
  };

  return (
    <button
      onClick={handleLogout}
      className="px-4 py-2 bg-red-600 text-white rounded"
    >
      Logout
    </button>
  );
}
