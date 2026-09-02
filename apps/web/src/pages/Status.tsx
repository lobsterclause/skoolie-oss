import { useMemo } from "react";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { List, ListItem } from "@astryxdesign/core/List";
import { Section } from "@astryxdesign/core/Section";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { VStack } from "@astryxdesign/core/VStack";
import { useFamilyContext } from "../app/context.js";
import { ADAPTER_LABEL, DEFAULT_INTERVALS, humanMinutes, summarizeRuns } from "../lib/freshness.js";
import { Page, Region, SkeletonRows } from "../ui/bits.js";

/** Every collector adapter, worst first — the page the header chip and banners link to. */
export function StatusPage() {
  const { runs, runsLoading } = useFamilyContext();
  const summary = useMemo(() => summarizeRuns(runs), [runs]);
  const recent = runs.slice(0, 20);
  return (
    <Page title="Collector status">
      <Region title="Adapters">
        {runsLoading ? (
          <SkeletonRows rows={3} />
        ) : summary.perAdapter.length === 0 ? (
          <Section padding={4} paddingBlockStart={0}>
            <EmptyState isCompact title="Collector has not run yet" description="The first run fills in students, courses and assignments." />
          </Section>
        ) : (
          <List hasDividers density="spacious">
            {summary.perAdapter.map((a) => {
              const counts = Object.entries(a.run.counts).map(([k, v]) => `${v} ${k}`).join(" · ");
              const every = DEFAULT_INTERVALS[a.adapter];
              return (
                <ListItem
                  key={a.adapter}
                  label={ADAPTER_LABEL[a.adapter]}
                  description={
                    <VStack gap={0.5}>
                      <Text type="supporting">{a.reason ?? counts ?? "ok"}</Text>
                      {a.reason && counts && <Text type="supporting">{counts}</Text>}
                      {a.run.warnings.length > 0 && <Text type="supporting">{a.run.warnings.join(" · ")}</Text>}
                      {every && <Text type="supporting">Runs every {humanMinutes(every)}</Text>}
                    </VStack>
                  }
                  startContent={<StatusDot variant={a.health === "good" ? "success" : a.health === "stale" ? "warning" : "error"} label={a.health === "good" ? "Fresh" : a.health === "stale" ? "Stale" : "Failed"} />}
                  endContent={<Timestamp value={a.run.startedAt} format="relative" isLive />}
                />
              );
            })}
          </List>
        )}
      </Region>
      {recent.length > 0 && (
        <Region title="Recent runs" count={recent.length}>
          <List hasDividers density="compact">
            {recent.map((r) => (
              <ListItem
                key={r.id}
                label={`${ADAPTER_LABEL[r.adapter]} · ${r.ok ? "ok" : "failed"}`}
                description={r.error ?? (Object.entries(r.counts).map(([k, v]) => `${v} ${k}`).join(" · ") || undefined)}
                startContent={<StatusDot variant={r.ok ? "success" : "error"} label={r.ok ? "Succeeded" : "Failed"} />}
                endContent={<Timestamp value={r.startedAt} format="auto" />}
              />
            ))}
          </List>
        </Region>
      )}
    </Page>
  );
}
