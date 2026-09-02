import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { HAC_PATHS, type HacHttp } from "./client.js";
import { localDate } from "../../util.js";
import { normalizeHac, type Normalized } from "./normalize.js";
import { attendanceMonthLabel, attendancePrevMonthArg, parseAssignments, parseAttendance, parseClasses, parseMarkingPeriods, parseRegistration, parseTestScores, postbackFields } from "./parse.js";

export interface HacCollectOptions {
  familyId: string;
  studentId: string;
  baseUrl: string;
  /** Fetch every marking period, not just the current one (slower; default false). */
  allMarkingPeriods?: boolean;
  /**
   * How many attendance months to read, current month first (default 2). HAC clamps the calendar at the
   * school-year start: a prev-month postback before then re-renders the same month, which the loop detects
   * via the header label and stops (verified 2026-08-27: next-month navigates fine, prev-month is clamped in August).
   */
  attendanceMonths?: number;
  /** The school's IANA timezone — decides what "today" is (default America/Chicago). */
  timeZone?: string;
  /** Also read the Test Scores page (default true; changes rarely, cheap). */
  testScores?: boolean;
  /** Directory to dump raw HTML into (for fixtures/debugging). */
  dumpDir?: string;
  now?: () => Date;
  log?: (msg: string) => void;
}

export interface HacCollectResult extends Normalized {
  warnings: string[];
  pagesFetched: number;
}

/** "Today" for HAC is the calendar date at the school, not in UTC — a late-evening run must not roll over. */
const localSchoolDate = (d: Date, timeZone: string): string => localDate(timeZone, d);

export async function collectHac(http: HacHttp, opts: HacCollectOptions): Promise<HacCollectResult> {
  const log = opts.log ?? (() => {});
  const nowDate = (opts.now ?? (() => new Date()))();
  const now = nowDate.toISOString();
  const today = localSchoolDate(nowDate, opts.timeZone ?? "America/Chicago");
  const warnings: string[] = [];
  let pagesFetched = 0;

  const dump = async (name: string, html: string) => {
    if (!opts.dumpDir) return;
    await mkdir(opts.dumpDir, { recursive: true });
    await writeFile(path.join(opts.dumpDir, `${now.replace(/[:.]/g, "-")}-${name}.html`), html, "utf8");
  };
  const fetchPage = async (name: string, p: string) => {
    const html = await http.get(p);
    pagesFetched++;
    await dump(name, html);
    return html;
  };

  log("hac: registration");
  const info = parseRegistration(await fetchPage("registration", HAC_PATHS.registration));

  log("hac: classes");
  let classes: ReturnType<typeof parseClasses> = [];
  try {
    classes = parseClasses(await fetchPage("classes", HAC_PATHS.classes));
    if (classes.length === 0) warnings.push("classes: schedule table empty or selector drift");
  } catch (e) {
    warnings.push(`classes: ${(e as Error).message}`);
  }

  log("hac: assignments");
  const firstHtml = await fetchPage("assignments", HAC_PATHS.assignments);
  const periods = parseMarkingPeriods(firstHtml);
  const current = periods.find((p) => p.selected) ?? periods[periods.length - 1];
  const blocks: Array<{ markingPeriod: string; courses: ReturnType<typeof parseAssignments> }> = [];
  const firstBlocks = parseAssignments(firstHtml);
  if (firstBlocks.length === 0) warnings.push("assignments: no div.AssignmentClass blocks (empty gradebook or selector drift)");

  if (opts.allMarkingPeriods && periods.length > 1) {
    const fields = postbackFields(firstHtml);
    for (const p of periods) {
      if (p.value === current?.value) {
        blocks.push({ markingPeriod: p.label, courses: firstBlocks });
        continue;
      }
      try {
        const html = await http.post(HAC_PATHS.assignments, {
          ...fields,
          __EVENTTARGET: "ctl00$plnMain$ddlReportCardRuns",
          __EVENTARGUMENT: "",
          "ctl00$plnMain$ddlReportCardRuns": p.value,
          "ctl00$plnMain$ddlOrderBy": "Class",
        });
        pagesFetched++;
        await dump(`assignments-${p.value}`, html);
        blocks.push({ markingPeriod: p.label, courses: parseAssignments(html) });
      } catch (e) {
        warnings.push(`assignments[${p.label}]: ${(e as Error).message}`);
      }
    }
  } else {
    blocks.push({ markingPeriod: current?.label ?? "current", courses: firstBlocks });
  }

  log("hac: attendance");
  let attendance: ReturnType<typeof parseAttendance> = [];
  try {
    let html = await fetchPage("attendance", HAC_PATHS.attendance);
    attendance = parseAttendance(html);
    const months = Math.max(1, opts.attendanceMonths ?? 2);
    let label = attendanceMonthLabel(html);
    for (let m = 1; m < months; m++) {
      const prev = attendancePrevMonthArg(html);
      if (!prev) break;
      html = await http.post(HAC_PATHS.attendance, { ...postbackFields(html), __EVENTTARGET: prev.target, __EVENTARGUMENT: prev.argument });
      pagesFetched++;
      await dump(`attendance-prev${m}`, html);
      const next = attendanceMonthLabel(html);
      if (!next || next === label) {
        log(`hac: attendance calendar clamped at ${label} (school-year start); stopping`);
        break;
      }
      label = next;
      attendance.push(...parseAttendance(html));
    }
  } catch (e) {
    warnings.push(`attendance: ${(e as Error).message}`);
  }

  let testScores: ReturnType<typeof parseTestScores> = [];
  if (opts.testScores ?? true) {
    log("hac: test scores");
    try {
      testScores = parseTestScores(await fetchPage("testscores", HAC_PATHS.testScores));
    } catch (e) {
      warnings.push(`testScores: ${(e as Error).message}`);
    }
  }

  const normalized = normalizeHac({
    familyId: opts.familyId,
    studentId: opts.studentId,
    info,
    classes,
    blocks,
    attendance,
    testScores,
    baseUrl: opts.baseUrl,
    now,
    today,
  });
  return { ...normalized, warnings, pagesFetched };
}
