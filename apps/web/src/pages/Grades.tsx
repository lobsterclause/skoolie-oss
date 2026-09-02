import { lazy, Suspense, useMemo } from "react";
import { useNavigate, useParams } from "react-router";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { List, ListItem } from "@astryxdesign/core/List";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Section } from "@astryxdesign/core/Section";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { Assignment, Course } from "@skoolie/shared";
import { useStudentData } from "../app/StudentLayout.js";
import { useChangeEvents } from "../data.js";
import { gradeTone } from "../lib/buckets.js";
import { averageDeltas } from "../lib/changes.js";
import { courseHue } from "../lib/colors.js";
import { categoryAverages, runningAverage, sparkValues } from "../lib/trend.js";
import { AssignmentRow } from "../ui/AssignmentRow.js";
import { Dot, Num, Page, SkeletonRows, ToneNumber } from "../ui/bits.js";
import { Sheet } from "../ui/Sheet.js";
import { Sparkline } from "../charts/Sparkline.js";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { FAMILY_ID } from "../firebase.js";
import { useUid } from "../app/context.js";

// Recharts is ~100 kB gz and only the course sheet needs it, so it loads on first open.
const TrendChart = lazy(() => import("../charts/TrendChart.js").then((m) => ({ default: m.TrendChart })));

export function GradesPage() {
  const { student, courses, assignments, loading, error, base } = useStudentData();
  const { courseId } = useParams();
  const navigate = useNavigate();
  const changes = useChangeEvents(useUid(), 200);
  const deltas = useMemo(() => averageDeltas(changes.data), [changes.data]);
  const graded = courses.filter((c) => c.currentAverage !== null);
  const mp = graded.find((c) => c.markingPeriod)?.markingPeriod;
  const selected = courseId ? courses.find((c) => c.id === courseId) : undefined;
  const byCourse = (c: Course) => assignments.filter((a) => a.courseId === c.id);

  return (
    <Page title="Grades">
      {error && <Text type="supporting">{error}</Text>}
      {mp && (
        <Section padding={4} paddingBlock={0}>
          <Text type="supporting">Marking period {mp.replace(/^MP/, "")} · tap a course for its trend</Text>
        </Section>
      )}
      {loading ? (
        <SkeletonRows rows={6} height={64} />
      ) : graded.length === 0 ? (
        <Section padding={4}>
          <EmptyState title="No averages yet this marking period" description="Averages appear once a teacher posts the first grade." />
        </Section>
      ) : (
        <List hasDividers density="spacious">
          {graded.map((c) => {
            const avg = c.currentAverage!;
            const delta = deltas.get(`families/${FAMILY_ID}/students/${student.id}/courses/${c.id}`);
            const trend = sparkValues(runningAverage(byCourse(c)));
            return (
              <ListItem
                key={c.id}
                label={c.name}
                description={c.teacher ?? undefined}
                href={`${base}/grades/${c.id}`}
                startContent={<Dot hue={courseHue(c.id)} />}
                endContent={
                  <HStack gap={3} vAlign="center">
                    <Sparkline values={trend} label={`${c.name} trend`} />
                    <VStack gap={0} hAlign="end">
                      <ToneNumber tone={gradeTone(avg)} value={avg} type="large" />
                      {delta !== undefined && Math.abs(delta) >= 0.05 && (
                        <Num type="supporting" tone={delta > 0 ? "good" : "bad"}>
                          {delta > 0 ? "+" : "−"}
                          {Math.abs(delta).toFixed(1)}
                        </Num>
                      )}
                    </VStack>
                  </HStack>
                }
              />
            );
          })}
        </List>
      )}

      <Sheet isOpen={Boolean(selected)} onOpenChange={(o) => !o && navigate(`${base}/grades`, { replace: true })} label="Course detail" title={selected?.name ?? "Course"} height="tall" width={640}>
        {selected && <CourseDetail course={selected} assignments={byCourse(selected)} base={base} />}
      </Sheet>
    </Page>
  );
}

function CourseDetail({ course, assignments, base }: { course: Course; assignments: Assignment[]; base: string }) {
  const points = runningAverage(assignments);
  const cats = categoryAverages(assignments);
  const graded = assignments.filter((a) => a.status === "graded").sort((x, y) => ((x.dueDate ?? "") < (y.dueDate ?? "") ? 1 : -1));
  const avg = course.currentAverage;
  return (
    <VStack gap={4}>
      <HStack gap={3} vAlign="center" hAlign="between">
        <Text type="supporting">
          {course.teacher ?? ""}
          {course.period ? ` · P${course.period.replace(/^0/, "")}` : ""}
        </Text>
        {avg !== null && (
          <ToneNumber tone={gradeTone(avg)} value={avg} type="large" />
        )}
      </HStack>
      {points.length >= 2 ? (
        <Suspense fallback={<Skeleton height={200} />}>
          <TrendChart points={points} title={course.name} />
        </Suspense>
      ) : (
        <Text type="supporting">The trend line appears after two graded assignments.</Text>
      )}
      {cats.length > 0 && (
        <VStack gap={2}>
          <Text type="label">By category</Text>
          {cats.map((k) => (
            <ProgressBar
              key={k.category}
              label={`${k.category} (${k.count})`}
              value={k.average}
              max={100}
              hasValueLabel
              formatValueLabel={(v) => v.toFixed(0)}
              variant={gradeTone(k.average) === "bad" ? "error" : gradeTone(k.average) === "warn" ? "warning" : "success"}
              marks={[{ value: 90, label: "Good" }]}
            />
          ))}
        </VStack>
      )}
      <HStack gap={2}>
        <Button label="All assignments" href={`${base}/assignments?course=${course.id}`} />
        <Button label="Open work" variant="ghost" href={`${base}/assignments?course=${course.id}&status=open`} />
      </HStack>
      {graded.length > 0 && (
        <List hasDividers density="compact" header={<Text type="label">Graded ({graded.length})</Text>}>
          {graded.map((a) => (
            <AssignmentRow key={a.id} a={a} href={`${base}/assignments/${a.id}`} showCourse={false} />
          ))}
        </List>
      )}
    </VStack>
  );
}
