import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { List, ListItem } from "@astryxdesign/core/List";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Section } from "@astryxdesign/core/Section";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useStudentData } from "../app/StudentLayout.js";
import { attendanceRate, calendarCells, dayTone, periodsLabel, periodsTitle, schoolYearOf, summarizeAttendance, type MonthSummary } from "../lib/attendance.js";
import { schoolLocalDate } from "../lib/tz.js";
import { Num, Page, Region, SkeletonRows } from "../ui/bits.js";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

export function AttendancePage() {
  const { attendance, loading } = useStudentData();
  const months = useMemo(() => summarizeAttendance(attendance), [attendance]);
  const today = schoolLocalDate();
  const year = schoolYearOf(today);
  const rate = useMemo(() => attendanceRate(months, year, today), [months, year, today]);

  return (
    <Page title="Attendance">
      <Section padding={4} paddingBlockStart={0}>
        <VStack gap={2}>
          <ProgressBar
            label={`${year} attendance ≈ ${rate.rate.toFixed(0)}%`}
            value={rate.rate}
            max={100}
            variant={rate.rate >= 90 ? "success" : "warning"}
            marks={[{ value: 90, label: "90% — state truancy threshold" }]}
          />
          <HStack gap={4}>
            <HStack gap={1.5} vAlign="center">
              <StatusDot variant="error" label="Absent days" />
              <Num type="supporting">
                {rate.absent} absent
              </Num>
            </HStack>
            <HStack gap={1.5} vAlign="center">
              <StatusDot variant="warning" label="Tardy days" />
              <Num type="supporting">
                {rate.tardy} tardy
              </Num>
            </HStack>
            <Num type="supporting">
              ≈ {rate.schoolDays} school days so far
            </Num>
          </HStack>
        </VStack>
      </Section>
      {loading ? (
        <SkeletonRows rows={2} height={220} />
      ) : months.length === 0 ? (
        <Section padding={4}>
          <EmptyState title="No absences recorded" description="HAC only records absences, tardies and nurse visits — an empty page is a good sign 🎉" />
        </Section>
      ) : (
        months.map((m) => <Month key={m.month} month={m} today={today} />)
      )}
    </Page>
  );
}

function Month({ month, today }: { month: MonthSummary; today: string }) {
  const byDate = new Map(month.days.map((d) => [d.date, d]));
  const cells = calendarCells(month.month);
  const summary = [month.absent > 0 && `${month.absent} absent`, month.tardy > 0 && `${month.tardy} tardy`, month.other > 0 && `${month.other} other`].filter(Boolean).join(" · ");
  return (
    <Region title={month.label} action={<Text type="supporting">{summary}</Text>}>
      <Section padding={4} paddingBlockStart={0}>
        <div className="sk-month" role="grid" aria-label={`${month.label} calendar`}>
          {WEEKDAYS.map((w, i) => (
            <div key={`wd-${i}`} className="sk-month-wd" role="columnheader" aria-label={["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][i]}>
              {w}
            </div>
          ))}
          {cells.map((cell, i) => {
            if (!cell) return <div key={`e-${i}`} aria-hidden="true" />;
            const day = byDate.get(cell.date);
            return (
              <div key={cell.date} className="sk-month-day" role="gridcell" data-tone={day ? dayTone(day) : undefined} data-today={cell.date === today || undefined} title={day ? periodsTitle(day) : undefined} aria-label={day ? `${cell.day}: ${periodsLabel(day)}` : String(cell.day)}>
                {cell.day}
              </div>
            );
          })}
        </div>
      </Section>
      <List hasDividers density="compact">
        {month.days.map((d) => {
          const tone = dayTone(d);
          return (
            <ListItem
              key={d.date}
              label={format(parseISO(d.date), "EEE, MMM d")}
              description={periodsLabel(d)}
              startContent={<StatusDot variant={tone === "bad" ? "error" : tone === "warn" ? "warning" : "neutral"} label={tone === "bad" ? "Absent" : tone === "warn" ? "Tardy" : "Other"} />}
            />
          );
        })}
      </List>
    </Region>
  );
}
