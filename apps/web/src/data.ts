import { collection, doc, limit as limitTo, onSnapshot, orderBy, query, type Unsubscribe } from "firebase/firestore";
import { useEffect, useState } from "react";
import type { Assignment, AttendanceDay, CalendarEvent, ChangeEvent, Course, Member, Message, Run, SchoolContact, TeacherLink, TestScore, Student } from "@skoolie/shared";
import { db, FAMILY_ID } from "./firebase.js";
import { demo, DEMO } from "./demo.js";

export type Loadable<T> = { data: T; loading: boolean; error?: string };

function useCollection<T>(path: string | null, order?: [string, "asc" | "desc"], max?: number): Loadable<T[]> {
  const [state, set] = useState<Loadable<T[]>>({ data: [], loading: true });
  useEffect(() => {
    // A new path (e.g. another student) must not keep showing the previous one's rows as "loaded".
    set({ data: [], loading: true });
    if (!path) return;
    if (DEMO) {
      set({ data: demo.collection<T>(path), loading: false });
      return;
    }
    const ref = collection(db, path);
    const parts = [...(order ? [orderBy(order[0], order[1])] : []), ...(max ? [limitTo(max)] : [])];
    const q = parts.length ? query(ref, ...parts) : ref;
    const unsub: Unsubscribe = onSnapshot(
      q,
      (snap) => set({ data: snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as T), loading: false }),
      (e) => set({ data: [], loading: false, error: e.message }),
    );
    return unsub;
  }, [path, order?.[0], order?.[1], max]);
  return state;
}

function useDoc<T>(path: string | null): Loadable<T | null> {
  const [state, set] = useState<Loadable<T | null>>({ data: null, loading: true });
  useEffect(() => {
    set({ data: null, loading: true });
    if (!path) return;
    if (DEMO) {
      set({ data: demo.doc<T>(path), loading: false });
      return;
    }
    return onSnapshot(
      doc(db, path),
      (snap) => set({ data: snap.exists() ? ({ id: snap.id, ...(snap.data() as object) } as T) : null, loading: false }),
      (e) => set({ data: null, loading: false, error: e.message }),
    );
  }, [path]);
  return state;
}

const fam = `families/${FAMILY_ID}`;

export const useMember = (uid: string | null) => useDoc<Member & { id: string }>(uid ? `${fam}/members/${uid}` : null);
// Family-level listens are gated on the signed-in uid: a listen that starts before auth resolves is denied,
// onSnapshot's error callback is terminal (the listener is dropped, never retried) and nothing re-subscribes
// after sign-in because the path never changes. Live symptom was "No students yet" for a real family.
export const useStudents = (uid: string | null) => useCollection<Student>(uid ? `${fam}/students` : null);
export const useCourses = (sid: string | null) => useCollection<Course>(sid ? `${fam}/students/${sid}/courses` : null, ["period", "asc"]);
export const useAssignments = (sid: string | null) => useCollection<Assignment>(sid ? `${fam}/students/${sid}/assignments` : null, ["dueDate", "desc"]);
export const useAttendance = (sid: string | null) => useCollection<AttendanceDay>(sid ? `${fam}/students/${sid}/attendance` : null, ["date", "desc"]);
export const useTestScores = (sid: string | null) => useCollection<TestScore>(sid ? `${fam}/students/${sid}/testScores` : null, ["date", "desc"]);
export const useChangeEvents = (uid: string | null, max = 200) => useCollection<ChangeEvent>(uid ? `${fam}/changeEvents` : null, ["at", "desc"], max);
export const useRuns = (uid: string | null) => useCollection<Run>(uid ? `${fam}/runs` : null, ["startedAt", "desc"], 50);
export const useEvents = (uid: string | null) => useCollection<CalendarEvent>(uid ? `${fam}/events` : null, ["start", "asc"]);
export const useMessages = (uid: string | null) => useCollection<Message>(uid ? `${fam}/messages` : null, ["receivedAt", "desc"], 100);

export interface FamilyDoc { id: string; allowlist: string[]; contacts?: SchoolContact[]; teacherLinks?: TeacherLink[] }
export const useFamily = (uid: string | null) => useDoc<FamilyDoc>(uid ? fam : null);
