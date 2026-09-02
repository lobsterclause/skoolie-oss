import { useMemo } from "react";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { List, ListItem } from "@astryxdesign/core/List";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Section } from "@astryxdesign/core/Section";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useStudentData } from "../app/StudentLayout.js";
import { formatScoreDate, groupScores, levelStep, levelTone } from "../lib/scores.js";
import { Num, Page, Region, SkeletonRows } from "../ui/bits.js";

const LEVEL_MARKS = [
  { value: 2, label: "Approaches" },
  { value: 3, label: "Meets" },
  { value: 4, label: "Masters" },
];

export function TestsPage() {
  const { testScores, loading } = useStudentData();
  const groups = useMemo(() => groupScores(testScores), [testScores]);
  return (
    <Page title="Test scores">
      {loading ? (
        <SkeletonRows rows={3} height={80} />
      ) : groups.length === 0 ? (
        <Section padding={4}>
          <EmptyState title="No test scores posted yet" description="STAAR and other state results show up here when HAC publishes them, usually in early summer." />
        </Section>
      ) : (
        groups.map((g) => (
          <Region key={g.subject} title={g.subject}>
            <List hasDividers density="spacious">
              {g.rows.map((r, i) => {
                const step = levelStep(r.level);
                const tone = levelTone(r.level);
                return (
                  <ListItem
                    key={`${r.date ?? "nodate"}|${r.test}|${i}`}
                    label={`${r.test}${r.grade ? ` · grade ${r.grade.replace(/^0/, "")}` : ""}`}
                    description={
                      <VStack gap={2}>
                        <Text type="supporting">
                          {r.description}
                          {r.date ? ` · ${formatScoreDate(r.date)}` : ""}
                          {r.lexile ? ` · Lexile ${r.lexile}` : ""}
                          {r.quantile ? ` · Quantile ${r.quantile}` : ""}
                        </Text>
                        {step !== null && (
                          <ProgressBar
                            label={r.level ?? "Performance level"}
                            value={step}
                            max={4}
                            marks={LEVEL_MARKS}
                            variant={tone === "bad" ? "error" : tone === "warn" ? "warning" : tone === "" ? "neutral" : "success"}
                          />
                        )}
                      </VStack>
                    }
                    endContent={
                      r.scaleScore || r.percentile ? (
                        <VStack gap={0} hAlign="end">
                          {r.scaleScore && (
                            <Num tone={tone === "good" ? "good" : tone === "bad" ? "bad" : tone === "warn" ? "warn" : "ok"} type="large" weight="bold">
                              {r.scaleScore}
                            </Num>
                          )}
                          {r.percentile && <Text type="supporting">{r.percentile} percentile</Text>}
                        </VStack>
                      ) : undefined
                    }
                  />
                );
              })}
            </List>
          </Region>
        ))
      )}
    </Page>
  );
}
