import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { List, ListItem } from "@astryxdesign/core/List";
import { Link } from "@astryxdesign/core/Link";
import { Section } from "@astryxdesign/core/Section";
import { Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { useStudentData } from "../app/StudentLayout.js";
import { useChangeEvents } from "../data.js";
import { bucket, gradeTone, thisWeek, todayLocal } from "../lib/buckets.js";
import { describeChange } from "../lib/changes.js";
import { courseHue } from "../lib/colors.js";
import { runningAverage, sparkValues, weekLoad } from "../lib/trend.js";
import { AssignmentRow } from "../ui/AssignmentRow.js";
import { CheckMark, Dot, Page, Region, SkeletonRows, ToneNumber } from "../ui/bits.js";
import { LoadStrip } from "../charts/LoadStrip.js";
import { Sparkline } from "../charts/Sparkline.js";
import { useUid } from "../app/context.js";

export function HomePage() {
  const { student, courses, assignments, loading, error, base } = useStudentData();
  const changes = useChangeEvents(useUid(), 50);
  const today = todayLocal();
  const b = useMemo(() => bucket(assignments, today), [assignments, today]);
  const week = useMemo(() => thisWeek(b), [b]);
  const load = useMemo(() => weekLoad(assignments, today), [assignments, today]);
  // A missing assignment due today sits in both buckets — show it once.
  const attention = [...b.missing, ...b.dueToday.filter((a) => a.status !== "missing")];
  const graded = courses.filter((c) => c.currentAverage !== null);
  const mine = changes.data.filter((e) => e.studentId === student.id).slice(0, 5);
  const href = (id: string) => `${base}/assignments/${id}`;

  return (
    <Page title={`${student.firstName}'s week`} {...(error ? { error } : {})}>
      <Region title="Needs attention" count={attention.length}>
        {loading ? (
          <SkeletonRows rows={3} />
        ) : attention.length === 0 ? (
          <Section padding={4} paddingBlockStart={0}>
            <EmptyState isCompact icon={<CheckMark />} title="All caught up" description="Nothing missing or due today 🎉" />
          </Section>
        ) : (
          <List hasDividers density="balanced">
            {attention.map((a) => (
              <AssignmentRow key={a.id} a={a} href={href(a.id)} today={today} />
            ))}
          </List>
        )}
      </Region>

      <Region title="This week" count={week.reduce((n, g) => n + g.items.length, 0)}>
        <Section padding={4} paddingBlockStart={0}>
          <LoadStrip days={load} />
        </Section>
        {loading ? (
          <SkeletonRows rows={4} />
        ) : week.length === 0 ? (
          <Section padding={4} paddingBlockStart={0}>
            <EmptyState isCompact title="Nothing due this week" description="Anything new shows up here as soon as HAC posts it." />
          </Section>
        ) : (
          week.map((g) => (
            <VStack key={g.date} gap={0}>
              <Section padding={4} paddingBlock={1} variant="muted">
                <Text type="label" color="secondary">
                  {g.date === today ? "Today" : format(parseISO(g.date), "EEE M/d")}
                </Text>
              </Section>
              <List hasDividers density="compact">
                {g.items.map((a) => (
                  <AssignmentRow key={a.id} a={a} href={href(a.id)} today={today} />
                ))}
              </List>
            </VStack>
          ))
        )}
      </Region>

      <Region title="Grades" action={<Link href={`${base}/grades`}>All grades</Link>}>
        {loading ? (
          <SkeletonRows rows={2} height={88} />
        ) : graded.length === 0 ? (
          <Section padding={4} paddingBlockStart={0}>
            <EmptyState isCompact title="No averages yet this marking period" description="Averages appear once a teacher posts the first grade." />
          </Section>
        ) : (
          <Section padding={4} paddingBlockStart={0}>
            <Grid columns={{ minWidth: 150 }} gap={3}>
              {graded.map((c) => {
                const trend = sparkValues(runningAverage(assignments.filter((a) => a.courseId === c.id)));
                const tone = gradeTone(c.currentAverage!);
                return (
                  <ClickableCard key={c.id} href={`${base}/grades/${c.id}`} label={`${c.name}, average ${c.currentAverage!.toFixed(1)}`} variant="muted" padding={3}>
                      <VStack gap={1}>
                        <HStack gap={1.5} vAlign="center">
                          <Dot hue={courseHue(c.id)} />
                          <Text type="supporting" maxLines={1} hasTruncateTooltip={false}>
                            {c.name}
                          </Text>
                        </HStack>
                        <HStack hAlign="between" vAlign="end">
                          <ToneNumber tone={tone} value={c.currentAverage!} type="large" />
                          <Sparkline values={trend} label={`${c.name} trend`} />
                        </HStack>
                      </VStack>
                  </ClickableCard>
                );
              })}
            </Grid>
          </Section>
        )}
      </Region>

      <Region title="What changed" action={<Link href="/activity">See all</Link>}>
        {changes.loading ? (
          <SkeletonRows rows={3} />
        ) : mine.length === 0 ? (
          <Section padding={4} paddingBlockStart={0}>
            <EmptyState isCompact title="Nothing has changed since the last check" />
          </Section>
        ) : (
          <List hasDividers density="compact">
            {mine.map((e) => (
              <ListItem key={e.id} label={e.title} description={describeChange(e)} endContent={<Timestamp value={e.at} format="relative" isLive />} />
            ))}
          </List>
        )}
      </Region>

      {b.overdueUngraded.length > 0 && (
        <Section padding={4} paddingBlockStart={0}>
          <Collapsible defaultIsOpen={false} trigger={<Heading level={2}>Past due, not graded ({b.overdueUngraded.length})</Heading>}>
            <List hasDividers density="compact">
              {b.overdueUngraded.map((a) => (
                <AssignmentRow key={a.id} a={a} href={href(a.id)} today={today} />
              ))}
            </List>
          </Collapsible>
        </Section>
      )}
    </Page>
  );
}
