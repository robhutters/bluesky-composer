"use client";
import { createContext, useContext } from "react";

type AuthContextType = {
  session: null;
  user: null;
  authMessage?: null;
};

const AuthContext = createContext<AuthContextType>({ session: null, user: null, authMessage: null });

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  return <AuthContext.Provider value={{ session: null, user: null, authMessage: null }}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
