import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { List, ListItem } from "@astryxdesign/core/List";
import { Section } from "@astryxdesign/core/Section";
import { Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { VStack } from "@astryxdesign/core/VStack";
import type { CalendarEvent } from "@skoolie/shared";
import { useEvents } from "../data.js";
import { useUid } from "../app/context.js";
import { Page, SkeletonRows } from "../ui/bits.js";

/** Family/campus events, upcoming first, grouped by day. Lights up when the campus collector ships. */
export function CalendarPage() {
  const events = useEvents(useUid());
  const groups = useMemo(() => groupEvents(events.data), [events.data]);
  return (
    <Page title="Calendar">
      {events.loading ? (
        <SkeletonRows rows={5} />
      ) : groups.length === 0 ? (
        <Section padding={4}>
          <EmptyState title="No upcoming events" description="Campus and district events appear here once the events collector is running." />
        </Section>
      ) : (
        groups.map((g) => (
          <VStack key={g.day} gap={0}>
            <Section padding={4} paddingBlock={1} variant="muted">
              <Text type="label" color="secondary">
                {format(parseISO(g.day), "EEEE, MMM d")}
              </Text>
            </Section>
            <List hasDividers density="compact">
              {g.items.map((e) => (
                <ListItem
                  key={e.id}
                  label={e.title}
                  description={[e.location, e.description].filter(Boolean).join(" · ") || undefined}
                  {...(e.url ? { href: e.url, target: "_blank" } : {})}
                  endContent={e.allDay ? <Text type="supporting">All day</Text> : <Timestamp value={e.start} format="time" />}
                />
              ))}
            </List>
          </VStack>
        ))
      )}
    </Page>
  );
}

export function groupEvents(events: CalendarEvent[], now = new Date()): Array<{ day: string; items: CalendarEvent[] }> {
  const cutoff = new Date(now);
  cutoff.setHours(0, 0, 0, 0);
  const upcoming = events.filter((e) => parseISO(e.end ?? e.start) >= cutoff).sort((a, b) => (a.start < b.start ? -1 : 1));
  const groups: Array<{ day: string; items: CalendarEvent[] }> = [];
  for (const e of upcoming) {
    const day = format(parseISO(e.start), "yyyy-MM-dd");
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(e);
    else groups.push({ day, items: [e] });
  }
  return groups;
}
