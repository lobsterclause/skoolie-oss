import { useCallback, useEffect, useSyncExternalStore } from "react";
import { doc, updateDoc } from "firebase/firestore";
import type { Member, ThemeMode } from "@skoolie/shared";
import { db, FAMILY_ID } from "../firebase.js";
import { DEMO } from "../demo.js";

export type { ThemeMode };

/**
 * Member preferences. The source of truth is `Member.prefs` in Firestore (the rules let a member update
 * their own `prefs` and nothing else); localStorage holds a copy so the first paint uses the right
 * colour mode before the member doc arrives, and so demo mode has somewhere to keep them.
 * Telegram's colour scheme wins over the stored mode when the app runs as a Mini App.
 */
export interface Prefs {
  mode: ThemeMode;
  lastStudentId: string | null;
}

const KEY = "skoolie.prefs";
const DEFAULTS: Prefs = { mode: "system", lastStudentId: null };
const listeners = new Set<() => void>();
let cache: Prefs | null = null;
let uid: string | null = null;

function read(): Prefs {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) } : DEFAULTS;
  } catch {
    cache = DEFAULTS;
  }
  return cache;
}

function setLocal(next: Prefs) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode — keep the in-memory copy */
  }
  for (const l of listeners) l();
}

/** Update prefs locally and, when signed in, on the member doc (dotted paths keep the write inside `prefs`). */
export function writePrefs(patch: Partial<Prefs>): void {
  const next = { ...read(), ...patch };
  if (next.mode === cache?.mode && next.lastStudentId === cache?.lastStudentId) return;
  setLocal(next);
  if (!uid || DEMO) return;
  const fields: Record<string, unknown> = {};
  if (patch.mode !== undefined) fields["prefs.theme"] = patch.mode;
  if (patch.lastStudentId !== undefined) fields["prefs.lastStudentId"] = patch.lastStudentId;
  if (Object.keys(fields).length) {
    updateDoc(doc(db, `families/${FAMILY_ID}/members/${uid}`), fields).catch((e: unknown) => console.warn("prefs sync failed", e));
  }
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function usePrefs(): [Prefs, (patch: Partial<Prefs>) => void] {
  const prefs = useSyncExternalStore(subscribe, read, () => DEFAULTS);
  const update = useCallback((patch: Partial<Prefs>) => writePrefs(patch), []);
  return [prefs, update];
}

/** Adopt the member doc's prefs whenever it changes (it is the source of truth once loaded). */
export function useMemberPrefsSync(memberUid: string | null, member: Member | null): void {
  // Set during render, not in an effect: descendants' effects (StudentLayout's first writePrefs) run
  // before this hook's effect would, and they must already see the uid to sync to Firestore.
  uid = memberUid;
  useEffect(() => {
    if (!member) return;
    const next: Prefs = { mode: member.prefs.theme ?? read().mode, lastStudentId: member.prefs.lastStudentId ?? read().lastStudentId };
    if (next.mode !== read().mode || next.lastStudentId !== read().lastStudentId) setLocal(next);
  }, [memberUid, member]);
}
