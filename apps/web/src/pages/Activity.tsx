import { useMemo, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { useEntryAnimation } from "@astryxdesign/core/hooks";
import { format, parseISO } from "date-fns";
import { Avatar } from "@astryxdesign/core/Avatar";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { List, ListItem } from "@astryxdesign/core/List";
import { Section } from "@astryxdesign/core/Section";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { VStack } from "@astryxdesign/core/VStack";
import type { ChangeEvent } from "@skoolie/shared";
import { useFamilyContext, useUid } from "../app/context.js";
import { useChangeEvents } from "../data.js";
import { ACTIVITY_FILTERS, changeTone, describeChange, groupByDay, matchesActivityFilter, type ActivityFilter } from "../lib/changes.js";
import { hueStyle } from "../lib/colors.js";
import { todayLocal } from "../lib/buckets.js";
import { Page, SkeletonRows } from "../ui/bits.js";

/** Family-wide change feed. This is the Telegram Mini App's landing screen. */
export function ActivityPage() {
  const { students } = useFamilyContext();
  const changes = useChangeEvents(useUid(), 200);
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const groups = useMemo(() => groupByDay(changes.data.filter((e) => matchesActivityFilter(e, filter))), [changes.data, filter]);
  const today = todayLocal();
  const byId = new Map(students.map((s) => [s.id, s]));
  const hrefFor = (e: ChangeEvent): string | undefined => {
    const msg = e.ref.match(/\/messages\/([^/]+)$/);
    if (msg) return `/messages/${msg[1]}`;
    const m = e.ref.match(/students\/([^/]+)\/(assignments|courses)\/([^/]+)$/);
    if (!m) return e.type === "run_failed" || e.type === "reauth_needed" ? "/status" : undefined;
    const [, sid, kind, id] = m as [string, string, string, string];
    return kind === "assignments" ? `/s/${sid}/assignments/${id}` : `/s/${sid}/grades/${id}`;
  };

  return (
    <Page title="Activity">
      <Section padding={4} paddingBlockStart={0}>
        <SegmentedControl label="Show" layout="fill" value={filter} onChange={(v) => setFilter(v as ActivityFilter)}>
          {ACTIVITY_FILTERS.map((f) => (
            <SegmentedControlItem key={f.value} value={f.value} label={f.label} />
          ))}
        </SegmentedControl>
      </Section>
      {changes.loading ? (
        <SkeletonRows rows={8} />
      ) : groups.length === 0 ? (
        <Section padding={4}>
          <EmptyState title="Nothing has changed since the last check" description="New grades, missing work and messages show up here as the collector finds them." />
        </Section>
      ) : (
        groups.map((g) => (
          <VStack key={g.day} gap={0}>
            <Section padding={4} paddingBlock={1} variant="muted">
              <Text type="label" color="secondary">
                {g.day === today ? "Today" : format(parseISO(g.day), "EEEE, MMM d")}
              </Text>
            </Section>
            <List hasDividers density="compact">
              {g.items.map((e) => (
                <ActivityRow key={e.id} e={e} student={e.studentId ? byId.get(e.studentId) : undefined} showStudent={students.length > 1} href={hrefFor(e)} />
              ))}
            </List>
          </VStack>
        ))
      )}
    </Page>
  );
}

/** One change event. Rows inserted by a live snapshot after first paint slide in. */
function ActivityRow({ e, student: s, showStudent, href }: { e: ChangeEvent; student: { firstName: string; hue: import("../lib/colors.js").Hue } | undefined; showStudent: boolean; href: string | undefined }) {
  const entry = useEntryAnimation("slideDown");
  const tone = changeTone(e.type);
  return (
    <ListItem
      {...stylex.props(entry)}
      label={e.title}
      description={`${describeChange(e)}${s && showStudent ? ` · ${s.firstName}` : ""}`}
      {...(href ? { href } : {})}
      startContent={
        tone === "error" ? (
          <StatusDot variant="error" label={e.type === "missing" ? "Missing" : "System error"} />
        ) : s ? (
          <Avatar name={s.firstName} size="sm" style={hueStyle(s.hue)} tooltip={false} />
        ) : (
          <StatusDot variant="neutral" label="Family" />
        )
      }
      endContent={<Timestamp value={e.at} format="relative" isLive />}
    />
  );
}
