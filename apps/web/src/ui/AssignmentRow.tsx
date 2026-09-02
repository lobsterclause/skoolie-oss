import * as stylex from "@stylexjs/stylex";
import { format, parseISO } from "date-fns";
import { Badge } from "@astryxdesign/core/Badge";
import { ListItem } from "@astryxdesign/core/List";
import { Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { VStack } from "@astryxdesign/core/VStack";
import { useAppShellMobile } from "@astryxdesign/core/AppShell";
import { useEntryAnimation } from "@astryxdesign/core/hooks";
import type { Assignment } from "@skoolie/shared";
import { scoreLabel } from "../lib/grades.js";
import { todayLocal } from "../lib/buckets.js";
import { Dot, Num } from "./bits.js";
import { courseHue } from "../lib/colors.js";

const KIND_SHORT: Partial<Record<NonNullable<Assignment["kind"]>, string>> = { homework: "HW", assessment: "Test", project: "Project", classwork: "Classwork" };

/**
 * One assignment as a List row. Only exceptions get a Badge (missing / late / due today); the kind is
 * supporting text, graded work shows its score in tabular figures. Rows that arrive from a live
 * snapshot after first paint slide in (useEntryAnimation animates only post-paint inserts).
 */
export function AssignmentRow({ a, href, showCourse = true, today = todayLocal() }: { a: Assignment; href: string; showCourse?: boolean; today?: string }) {
  const { isMobile } = useAppShellMobile();
  const entry = useEntryAnimation("slideDown");
  const kind = a.kind && a.kind !== "other" ? KIND_SHORT[a.kind] : undefined;
  const desc = [showCourse ? a.courseName : undefined, kind, a.category].filter(Boolean).join(" · ");
  const dueToday = a.dueDate === today && a.status !== "graded" && a.status !== "excused";
  const badge = a.status === "missing" ? <Badge variant="error" label="Missing" /> : a.status === "late" ? <Badge variant="error" label="Late" /> : dueToday ? <Badge variant="warning" label="Due today" /> : null;
  // Weekday + date on desktop; a 390px row only has room for "Thu 9/3" beside a score.
  const due = !a.dueDate ? <Text type="supporting">No due date</Text> : isMobile ? <Num type="supporting">{format(parseISO(a.dueDate), "EEE M/d")}</Num> : <Timestamp value={`${a.dueDate}T12:00:00`} format="date_weekday" hasTooltip={false} />;
  return (
    <ListItem
      {...stylex.props(entry)}
      label={a.title}
      description={desc || undefined}
      href={href}
      startContent={showCourse ? <Dot hue={courseHue(a.courseId)} /> : undefined}
      endContent={
        <VStack gap={0.5} hAlign="end">
          {badge ?? due}
          {a.status === "graded" && <Num type="label">{scoreLabel(a)}</Num>}
          {a.status === "excused" && <Text type="supporting">Excused</Text>}
          {a.status === "submitted" && <Text type="supporting">Turned in</Text>}
        </VStack>
      }
    />
  );
}
