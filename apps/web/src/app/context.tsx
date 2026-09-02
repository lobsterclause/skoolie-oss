import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import type { Member, Student } from "@skoolie/shared";
import { auth, detectProvider, type AuthProvider } from "../firebase.js";
import { useFamily, useMember, useRuns, useStudents, type FamilyDoc, type Loadable } from "../data.js";
import { DEMO, demo } from "../demo.js";
import type { Run } from "@skoolie/shared";
import { studentHue, type Hue } from "../lib/colors.js";

export interface StudentWithHue extends Student {
  hue: Hue;
  firstName: string;
}

export interface FamilyContextValue {
  /** undefined = auth still resolving; null = signed out */
  user: User | null | undefined;
  provider: AuthProvider;
  member: Loadable<(Member & { id: string }) | null>;
  students: StudentWithHue[];
  studentsLoading: boolean;
  /** Why the students list could not load (rules, network); undefined when fine. */
  studentsError?: string;
  family: FamilyDoc | null;
  runs: Run[];
  runsLoading: boolean;
}

const Ctx = createContext<FamilyContextValue | null>(null);

/** Auth + family-wide documents, loaded once for every route. Per-student collections load in the pages. */
export function FamilyProvider({ children }: { children: ReactNode }) {
  const provider = useMemo(detectProvider, []);
  const [user, setUser] = useState<User | null | undefined>(DEMO ? ({ uid: "demo", email: "demo@example.org" } as User) : undefined);
  useEffect(() => {
    if (DEMO) return;
    return onAuthStateChanged(auth, setUser);
  }, []);

  const uid = user?.uid ?? null;
  const member = useMember(uid);
  const students = useStudents(uid);
  const family = useFamily(uid);
  const runs = useRuns(uid);

  const ordered = useMemo<StudentWithHue[]>(() => {
    const ids = member.data?.studentIds ?? (DEMO ? demo.member.studentIds : []);
    const byId = new Map(students.data.map((s) => [s.id, s]));
    const list = ids.length ? ids.map((id) => byId.get(id)).filter((s): s is Student => Boolean(s)) : students.data;
    // Anyone in the students collection but not in member.studentIds still shows, after the member's own order.
    for (const s of students.data) if (!list.includes(s)) list.push(s);
    return list.map((s, i) => ({ ...s, hue: studentHue(i), firstName: firstNameOf(s.name) }));
  }, [member.data, students.data]);

  const value = useMemo<FamilyContextValue>(
    () => ({ user, provider, member, students: ordered, studentsLoading: students.loading, ...(students.error ? { studentsError: students.error } : {}), family: family.data, runs: runs.data, runsLoading: runs.loading }),
    [user, provider, member, ordered, students.loading, students.error, family.data, runs.data, runs.loading],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFamilyContext(): FamilyContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useFamilyContext outside FamilyProvider");
  return v;
}

/**
 * The signed-in uid, or null while auth is still resolving. Every family-collection listen must be
 * gated on this: a listen that starts before auth resolves is denied, and `onSnapshot`'s error
 * callback is terminal — the listener is dropped and nothing re-subscribes once sign-in completes.
 */
export function useUid(): string | null {
  return useFamilyContext().user?.uid ?? null;
}

/** HAC names are "Last, First"; the pill and switcher use the first name only. */
export function firstNameOf(name: string): string {
  const natural = name.includes(",") ? name.split(",")[1]! : name.split(" ")[0]!;
  return natural.trim().split(/\s+/)[0] ?? name;
}
