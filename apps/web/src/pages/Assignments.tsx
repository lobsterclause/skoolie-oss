import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { List, ListItem } from "@astryxdesign/core/List";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { RadioList, RadioListItem } from "@astryxdesign/core/RadioList";
import { Section } from "@astryxdesign/core/Section";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { Assignment, Course } from "@skoolie/shared";
import { useStudentData } from "../app/StudentLayout.js";
import { todayLocal, gradeTone } from "../lib/buckets.js";
import { courseHue } from "../lib/colors.js";
import { activeFilterCount, applyFilters, DEFAULT_FILTERS, groupByWeek, KIND_VALUES, parseFilters, PRESETS, serializeFilters, STATUS_VALUES, type Filters } from "../lib/filters.js";
import { assignmentLink, detailRows, KIND_LABEL, percentOf } from "../lib/grades.js";
import { mailto, naturalName } from "../lib/contacts.js";
import { AssignmentRow } from "../ui/AssignmentRow.js";
import { Dot, Num, Page, SkeletonRows } from "../ui/bits.js";
import { Sheet } from "../ui/Sheet.js";

const PRESET_LABEL: Record<(typeof PRESETS)[number], string> = { all: "All", open: "Open", missing: "Missing", graded: "Graded" };

export function AssignmentsPage() {
  const { student, courses, assignments, loading, error, base } = useStudentData();
  const [params, setParams] = useSearchParams();
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const filters = useMemo(() => parseFilters(params), [params]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState<Filters>(filters);
  const today = todayLocal();

  const filtered = useMemo(() => applyFilters(assignments, filters), [assignments, filters]);
  const weeks = useMemo(() => groupByWeek(filtered), [filtered]);
  const setFilters = (f: Filters) => setParams(serializeFilters(f), { replace: true });
  const preset = PRESETS.includes(filters.status as (typeof PRESETS)[number]) ? filters.status : "custom";
  const extra = activeFilterCount(filters);
  const selected = assignmentId ? assignments.find((a) => a.id === assignmentId) : undefined;
  const listHref = `${base}/assignments${params.toString() ? `?${params}` : ""}`;

  return (
    <Page title="Assignments" {...(error ? { error } : {})}>
      <Section padding={4} paddingBlockStart={0}>
        <VStack gap={2}>
          <HStack gap={2} vAlign="center">
            <SegmentedControl label="Status" layout="fill" value={preset} onChange={(v) => setFilters({ ...filters, status: v as Filters["status"] })}>
              {PRESETS.map((p) => (
                <SegmentedControlItem key={p} value={p} label={PRESET_LABEL[p]} />
              ))}
              {preset === "custom" && <SegmentedControlItem value="custom" label={filters.status} />}
            </SegmentedControl>
            <Button
              label="Filters"
              onClick={() => {
                setDraft(filters);
                setSheetOpen(true);
              }}
              {...(extra > 0 ? { endContent: <Badge variant="neutral" label={String(extra)} /> } : {})}
            />
          </HStack>
          <Num type="supporting">
            {loading ? "Loading" : `${filtered.length} of ${assignments.length}`}
          </Num>
        </VStack>
      </Section>

      {loading ? (
        <SkeletonRows rows={8} />
      ) : filtered.length === 0 ? (
        <Section padding={4}>
          <EmptyState title="No assignments match" description="Try widening the status or course filter." actions={<Button label="Reset filters" onClick={() => setFilters(DEFAULT_FILTERS)} />} />
        </Section>
      ) : (
        weeks.map((w) => (
          <VStack key={w.week} gap={0}>
            <Section padding={4} paddingBlock={1} variant="muted">
              <Text type="label" color="secondary">
                {w.week === "undated" ? "No due date" : `Week of ${format(parseISO(w.week), "MMM d")}`}
              </Text>
            </Section>
            <List hasDividers density="compact">
              {w.items.map((a) => (
                <AssignmentRow key={a.id} a={a} href={`${base}/assignments/${a.id}${params.toString() ? `?${params}` : ""}`} today={today} />
              ))}
            </List>
          </VStack>
        ))
      )}

      <Sheet isOpen={sheetOpen} onOpenChange={setSheetOpen} label="Filters" title="Filters" purpose="form" height="capped">
        <RadioList label="Course" value={draft.course} onChange={(course) => setDraft({ ...draft, course })}>
          <RadioListItem value="all" label="All courses" />
          {courses.map((c) => (
            <RadioListItem key={c.id} value={c.id} label={c.name} />
          ))}
        </RadioList>
        <RadioList label="Kind" value={draft.kind} onChange={(kind) => setDraft({ ...draft, kind: kind as Filters["kind"] })} orientation="horizontal">
          <RadioListItem value="all" label="Any" />
          {KIND_VALUES.map((k) => (
            <RadioListItem key={k} value={k} label={KIND_LABEL[k]} />
          ))}
        </RadioList>
        <RadioList label="Status" value={draft.status} onChange={(status) => setDraft({ ...draft, status: status as Filters["status"] })} orientation="horizontal">
          <RadioListItem value="all" label="Any" />
          <RadioListItem value="open" label="Open" />
          {STATUS_VALUES.map((s) => (
            <RadioListItem key={s} value={s} label={s} />
          ))}
        </RadioList>
        <HStack gap={2} hAlign="end">
          <Button label="Reset" variant="ghost" onClick={() => setDraft(DEFAULT_FILTERS)} />
          <Button
            label={`Show ${applyFilters(assignments, draft).length}`}
            variant="primary"
            onClick={() => {
              setFilters(draft);
              setSheetOpen(false);
            }}
          />
        </HStack>
      </Sheet>

      <Sheet isOpen={Boolean(selected)} onOpenChange={(o) => !o && navigate(listHref, { replace: true })} label="Assignment" title={selected?.title ?? "Assignment"} snapPoints={[0.5]} height="capped">
        {selected && <AssignmentDetail a={selected} course={courses.find((c) => c.id === selected.courseId)} studentName={naturalName(student.name)} />}
      </Sheet>
    </Page>
  );
}

function AssignmentDetail({ a, course, studentName }: { a: Assignment; course: Course | undefined; studentName: string }) {
  const pct = percentOf(a);
  const link = assignmentLink(a);
  return (
    <VStack gap={4}>
      <HStack gap={1.5} vAlign="center">
        <Dot hue={courseHue(a.courseId)} />
        <Text type="supporting">
          {a.courseName}
          {course?.teacher ? ` · ${course.teacher}` : ""}
        </Text>
      </HStack>
      {a.status === "graded" && pct !== null && (
        <ProgressBar label="Score" value={pct} max={100} hasValueLabel formatValueLabel={() => `${pct.toFixed(0)}%`} variant={gradeTone(pct) === "bad" ? "error" : gradeTone(pct) === "warn" ? "warning" : "success"} marks={[{ value: 90, label: "Good" }]} />
      )}
      <MetadataList>
        {detailRows(a).map(([k, v]) => (
          <MetadataListItem key={k} label={k}>{v}</MetadataListItem>
        ))}
      </MetadataList>
      {a.attachments.length > 0 && (
        <List hasDividers density="compact" header={<Text type="label">Attachments</Text>}>
          {a.attachments.map((f) => (
            <ListItem key={f.url} label={f.title} href={f.url} target="_blank" />
          ))}
        </List>
      )}
      <Text type="supporting">HAC doesn't publish assignment descriptions; instructions live in Google Classroom.</Text>
      <HStack gap={2} wrap="wrap">
        {course?.teacherEmail && <Button label="Email teacher" variant="primary" href={mailto([course.teacherEmail], { subject: `${studentName} — ${a.title}` })} />}
        {link && <Button label={link.label} href={link.href} target="_blank" />}
      </HStack>
    </VStack>
  );
}
