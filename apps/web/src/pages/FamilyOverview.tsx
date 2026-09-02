import { Navigate, useSearchParams } from "react-router";
import { Avatar } from "@astryxdesign/core/Avatar";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Section } from "@astryxdesign/core/Section";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useFamilyContext, type StudentWithHue } from "../app/context.js";
import { usePrefs } from "../app/prefs.js";
import { useAssignments, useCourses } from "../data.js";
import { bucket, gradeTone, todayLocal } from "../lib/buckets.js";
import { hueStyle } from "../lib/colors.js";
import { gradeLabel } from "../app/StudentSwitcher.js";
import { Num, Page, ToneNumber } from "../ui/bits.js";

/** One tile per kid. With a single student this route just forwards to their Home. */
export function FamilyOverview() {
  const { students, studentsLoading, studentsError } = useFamilyContext();
  const [prefs] = usePrefs();
  const [params] = useSearchParams();
  if (studentsLoading && students.length === 0) {
    return (
      <Page title="Family">
        <Section padding={4}>
          <Skeleton height={120} />
        </Section>
      </Page>
    );
  }
  if (students.length === 1) return <Navigate to={`/s/${students[0]!.id}`} replace />;
  if (students.length > 1 && prefs.lastStudentId && !params.has("all")) {
    // A bare "/" returns to the last kid; the overview stays reachable from the drawer as "/?all".
    const last = students.find((s) => s.id === prefs.lastStudentId);
    if (last) return <Navigate to={`/s/${last.id}`} replace />;
  }
  return (
    <Page title="Family" {...(studentsError ? { error: studentsError } : {})}>
      {students.length === 0 ? (
        <Section padding={4}>
          <EmptyState
            title={studentsError ? "Could not load your students" : "No students yet"}
            description={studentsError ? "Reload the page; if it keeps happening, check the family allowlist." : "The collector adds students on its first HAC run."}
          />
        </Section>
      ) : (
        <Section padding={4} paddingBlockStart={0}>
          <Grid columns={{ minWidth: 280 }} gap={3}>
            {students.map((s) => (
              <StudentTile key={s.id} s={s} />
            ))}
          </Grid>
        </Section>
      )}
    </Page>
  );
}

function StudentTile({ s }: { s: StudentWithHue }) {
  const assignments = useAssignments(s.id);
  const courses = useCourses(s.id);
  const b = bucket(assignments.data, todayLocal());
  const graded = courses.data.filter((c) => c.currentAverage !== null);
  const mean = graded.length ? graded.reduce((n, c) => n + c.currentAverage!, 0) / graded.length : null;
  return (
    <ClickableCard href={`/s/${s.id}`} label={`${s.firstName}: ${b.missing.length} missing, ${b.dueToday.length} due today`} padding={4}>
        <VStack gap={3}>
          <HStack gap={3} vAlign="center">
            <Avatar name={s.firstName} size="lg" style={hueStyle(s.hue)} tooltip={false} />
            <VStack gap={0}>
              <Heading level={2}>{s.firstName}</Heading>
              <Text type="supporting">
                {gradeLabel(s.grade)} · {s.school}
              </Text>
            </VStack>
          </HStack>
          {assignments.loading ? (
            <Skeleton height={20} />
          ) : (
            <HStack gap={4} wrap="wrap">
              <HStack gap={1.5} vAlign="center">
                <StatusDot variant={b.missing.length ? "error" : "success"} label={b.missing.length ? "Missing work" : "Nothing missing"} />
                <Num type="supporting">
                  {b.missing.length} missing
                </Num>
              </HStack>
              <HStack gap={1.5} vAlign="center">
                <StatusDot variant={b.dueToday.length ? "warning" : "neutral"} label="Due today" />
                <Num type="supporting">
                  {b.dueToday.length} due today
                </Num>
              </HStack>
              {mean !== null && (
                <HStack gap={1.5} vAlign="end">
                  <Text type="supporting">avg</Text>
                  <ToneNumber tone={gradeTone(mean)} value={mean} />
                </HStack>
              )}
            </HStack>
          )}
        </VStack>
    </ClickableCard>
  );
}
