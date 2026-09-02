import { createContext, useContext, useEffect, useMemo } from "react";
import { Navigate, Outlet, useParams } from "react-router";
import type { Assignment, AttendanceDay, Course, TestScore } from "@skoolie/shared";
import { useAssignments, useAttendance, useCourses, useTestScores } from "../data.js";
import { useFamilyContext, type StudentWithHue } from "./context.js";
import { writePrefs } from "./prefs.js";

export interface StudentData {
  student: StudentWithHue;
  courses: Course[];
  assignments: Assignment[];
  attendance: AttendanceDay[];
  testScores: TestScore[];
  loading: boolean;
  error?: string;
  base: string;
}

const Ctx = createContext<StudentData | null>(null);

/** Loads one student's collections for every `/s/:studentId/*` page and remembers the choice. */
export function StudentLayout() {
  const { studentId } = useParams();
  const { students, studentsLoading } = useFamilyContext();
  const student = students.find((s) => s.id === studentId) ?? null;
  const sid = student?.id ?? null;
  const courses = useCourses(sid);
  const assignments = useAssignments(sid);
  const attendance = useAttendance(sid);
  const testScores = useTestScores(sid);

  useEffect(() => {
    if (sid) writePrefs({ lastStudentId: sid });
  }, [sid]);

  const value = useMemo<StudentData | null>(() => {
    if (!student) return null;
    const error = assignments.error ?? courses.error ?? attendance.error ?? testScores.error;
    return {
      student,
      courses: courses.data,
      assignments: assignments.data,
      attendance: attendance.data,
      testScores: testScores.data,
      loading: courses.loading || assignments.loading || attendance.loading || testScores.loading,
      ...(error ? { error } : {}),
      base: `/s/${student.id}`,
    };
  }, [student, courses, assignments, attendance, testScores]);

  if (!student) {
    if (studentsLoading) return null;
    return <Navigate to="/" replace />;
  }
  return (
    <Ctx.Provider value={value}>
      <Outlet />
    </Ctx.Provider>
  );
}

export function useStudentData(): StudentData {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStudentData outside a /s/:studentId route");
  return v;
}
