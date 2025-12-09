"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

type AuthContextType = {
  session: any;
  user: any;
  authMessage?: string | null;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<any>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    // Handle magic-link/email confirmation redirects
    const handleCodeExchange = async () => {
      if (typeof window === "undefined") return;
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      if (!code) return;
      try {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          console.error("Code exchange failed", error);
          setAuthMessage("Email confirmation failed. Please try signing in.");
        } else if (data.session) {
          setSession(data.session);
          setAuthMessage("Email confirmed. You are now signed in.");
        }
      } catch (err) {
        console.error("Code exchange error", err);
      } finally {
        url.searchParams.delete("code");
        url.searchParams.delete("type");
        window.history.replaceState({}, "", url.toString());
      }
    };
    void handleCodeExchange();

    // Listen for changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const value: AuthContextType = {
    session,
    user: session?.user ?? null,
    authMessage,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Custom hook for easy access
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
