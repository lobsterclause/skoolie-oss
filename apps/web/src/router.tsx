import { lazy, Suspense, type ComponentType } from "react";
import { createBrowserRouter } from "react-router";
import { Root } from "./app/Root.js";
import { StudentLayout } from "./app/StudentLayout.js";
import { FamilyOverview } from "./pages/FamilyOverview.js";
import { HomePage } from "./pages/Home.js";
import { AssignmentsPage } from "./pages/Assignments.js";
import { GradesPage } from "./pages/Grades.js";
import { ActivityPage } from "./pages/Activity.js";
import { NotFound } from "./pages/NotFound.js";
import { SkeletonRows } from "./ui/bits.js";

// The five daily destinations load eagerly; everything reachable only from the drawer is its own chunk.
const page = (load: () => Promise<{ default: ComponentType }>) => {
  const C = lazy(load);
  return () => (
    <Suspense fallback={<SkeletonRows rows={6} />}>
      <C />
    </Suspense>
  );
};
const AttendancePage = page(() => import("./pages/Attendance.js").then((m) => ({ default: m.AttendancePage })));
const TestsPage = page(() => import("./pages/Tests.js").then((m) => ({ default: m.TestsPage })));
const CalendarPage = page(() => import("./pages/Calendar.js").then((m) => ({ default: m.CalendarPage })));
const TeachersPage = page(() => import("./pages/Teachers.js").then((m) => ({ default: m.TeachersPage })));
const MessagesPage = page(() => import("./pages/Messages.js").then((m) => ({ default: m.MessagesPage })));
const StatusPage = page(() => import("./pages/Status.js").then((m) => ({ default: m.StatusPage })));
const SettingsPage = page(() => import("./pages/Settings.js").then((m) => ({ default: m.SettingsPage })));

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Root,
    children: [
      { index: true, Component: FamilyOverview },
      {
        path: "s/:studentId",
        Component: StudentLayout,
        children: [
          { index: true, Component: HomePage },
          { path: "assignments", Component: AssignmentsPage },
          { path: "assignments/:assignmentId", Component: AssignmentsPage },
          { path: "grades", Component: GradesPage },
          { path: "grades/:courseId", Component: GradesPage },
          { path: "attendance", Component: AttendancePage },
          { path: "tests", Component: TestsPage },
          { path: "calendar", Component: CalendarPage },
          { path: "teachers", Component: TeachersPage },
          { path: "teachers/:teacherKey", Component: TeachersPage },
        ],
      },
      { path: "activity", Component: ActivityPage },
      { path: "messages", Component: MessagesPage },
      { path: "messages/:messageId", Component: MessagesPage },
      { path: "status", Component: StatusPage },
      { path: "settings", Component: SettingsPage },
      { path: "*", Component: NotFound },
    ],
  },
]);
