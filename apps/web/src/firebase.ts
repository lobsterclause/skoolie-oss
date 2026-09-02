import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, GoogleAuthProvider, signInWithCustomToken, signInWithPopup, signOut, type User } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";

// In demo mode (VITE_DEMO=1) nothing talks to Firebase; a placeholder key keeps getAuth() from throwing at import time.
const cfg = {
  apiKey: (import.meta.env.VITE_FIREBASE_API_KEY as string) || (import.meta.env.VITE_DEMO === "1" ? "demo-key" : ""),
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID as string) || "demo-skoolie",
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
};

export const app = initializeApp(cfg);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const FAMILY_ID = (import.meta.env.VITE_SKOOLIE_FAMILY_ID as string) || "family";

if (import.meta.env.VITE_USE_EMULATORS === "1") {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}

/**
 * Auth abstraction. In a browser: Google sign-in. Inside Telegram (Phase 3): the mini-app's
 * signed initData is exchanged for a Firebase custom token by a Cloud Function.
 */
export interface AuthProvider {
  kind: "google" | "telegram";
  signIn(): Promise<User>;
  signOut(): Promise<void>;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: { initData: string; ready(): void; expand(): void; colorScheme: "light" | "dark" } };
  }
}

export function detectProvider(): AuthProvider {
  const tg = window.Telegram?.WebApp;
  if (tg && tg.initData) {
    return {
      kind: "telegram",
      async signIn() {
        tg.ready();
        tg.expand();
        const r = await fetch("/api/telegramToken", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ initData: tg.initData }) });
        if (!r.ok) throw new Error(`telegram auth failed: ${r.status}`);
        const { token } = (await r.json()) as { token: string };
        return (await signInWithCustomToken(auth, token)).user;
      },
      signOut: () => signOut(auth),
    };
  }
  return {
    kind: "google",
    async signIn() {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      return (await signInWithPopup(auth, provider)).user;
    },
    signOut: () => signOut(auth),
  };
}
