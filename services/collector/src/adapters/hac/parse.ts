/**
 * Pure HTML -> data parsers for eSchoolPLUS Home Access Center pages.
 * Column positions are NOT assumed: every table is read through its header row, so a
 * district re-ordering or adding a column does not silently shift values.
 * Selectors come from the live Example ISD logon page + community HAC scrapers; the golden fixtures in
 * ../../fixtures/hac are the contract — regenerate them from a real --dump when HAC changes.
 */
import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { collapseWs, parseNumber, parseUsDate } from "../../util.js";

export interface HacStudentInfo {
  name: string;
  grade: string;
  school: string;
  counselor?: string;
  birthDate?: string;
  studentId?: string;
}

export interface HacCourseBlock {
  code: string;
  name: string;
  average: number | null;
  averageLabel: string;
  assignments: HacAssignmentRow[];
}

export interface HacAssignmentRow {
  dueDate: string | null;
  assignedDate: string | null;
  title: string;
  category: string;
  score: string;         // raw cell text, e.g. "95.00", "M", "X", ""
  totalPoints: number | null;
  weight: number | null;
  weightedScore: number | null;
  weightedTotal: number | null;
  percentage: number | null;
  url?: string;
  hacIds?: { classId: string; runId: string; assignmentId: string };
  /** From the link tooltip: "Can Be Dropped: Y", "Extra Credit: N", "Has Attachments: N", "Max Points: 100.00". */
  flags?: { canBeDropped?: boolean; extraCredit?: boolean; hasAttachments?: boolean };
}

/** Cloudflare email-protection: hex string, first byte is the XOR key for the rest. */
export function decodeCfEmail(hex: string): string | null {
  if (!/^[0-9a-f]{4,}$/i.test(hex) || hex.length % 2 !== 0) return null;
  const bytes = Buffer.from(hex, "hex");
  const key = bytes[0]!;
  // HAC pads the encoded address with trailing spaces.
  const out = Buffer.from(bytes.subarray(1).map((b) => b ^ key)).toString("utf8").trim();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(out) ? out : null;
}

export interface HacClassRow {
  code: string;
  name: string;
  period: string;
  teacher: string;
  teacherEmail?: string;
  room: string;
  days: string;
  markingPeriods: string;
  hacClassId?: string;
}

export interface HacAttendanceCell {
  date: string;              // yyyy-mm-dd
  entries: Array<{ code: string; description: string; period?: string }>;
}

export interface HacMarkingPeriodOption {
  value: string;
  label: string;
  selected: boolean;
}

export function parseRegistration(html: string): HacStudentInfo {
  const $ = cheerio.load(html);
  const t = (id: string) => collapseWs($(`#${id}`).text());
  const info: HacStudentInfo = {
    name: t("plnMain_lblRegStudentName"),
    grade: t("plnMain_lblGrade"),
    school: t("plnMain_lblBuildingName"),
  };
  const counselor = t("plnMain_lblCounselor");
  if (counselor) info.counselor = counselor;
  const dob = parseUsDate(t("plnMain_lblBirthDate"));
  if (dob) info.birthDate = dob;
  const sid = t("plnMain_lblRegStudentID") || t("plnMain_lblStudentID");
  if (sid) info.studentId = sid;
  if (!info.name) throw new Error("Registration page: student name not found (#plnMain_lblRegStudentName)");
  return info;
}

/** Splits "MATH6 - 1    Math 6 Advanced" into code + name. Falls back to the whole string as name. */
export function splitCourseHeading(heading: string): { code: string; name: string } {
  const h = collapseWs(heading);
  const m = h.match(/^(\S+(?:\s*-\s*\d+)?)\s{1,}(.+)$/);
  if (m && /\d/.test(m[1]!)) return { code: collapseWs(m[1]!), name: collapseWs(m[2]!) };
  return { code: h, name: h };
}

function headerMap($: cheerio.CheerioAPI, table: AnyNode): Map<string, number> {
  // HAC renders header cells as <td> inside tr.sg-asp-table-header-row (not <th>); accept either.
  const map = new Map<string, number>();
  let headerRow = $(table).find("tr.sg-asp-table-header-row").first();
  if (headerRow.length === 0) headerRow = $(table).find("tr").filter((_, tr) => $(tr).find("th").length > 0).first();
  headerRow.children("td, th").each((i, cell) => {
    map.set(collapseWs($(cell).text()).toLowerCase(), i);
  });
  return map;
}

function dataRows($: cheerio.CheerioAPI, table: AnyNode): cheerio.Cheerio<AnyNode> {
  const classed = $(table).find("tr.sg-asp-table-data-row");
  if (classed.length > 0) return classed;
  return $(table).find("tr").filter((_, tr) => $(tr).find("td").length > 0 && !$(tr).hasClass("sg-asp-table-header-row"));
}

function cell($: cheerio.CheerioAPI, tds: cheerio.Cheerio<AnyNode>, map: Map<string, number>, ...names: string[]): string {
  for (const n of names) {
    const i = map.get(n.toLowerCase());
    if (i !== undefined) return collapseWs($(tds.get(i)).text());
  }
  return "";
}

export function parseAssignments(html: string): HacCourseBlock[] {
  const $ = cheerio.load(html);
  const blocks: HacCourseBlock[] = [];
  $("div.AssignmentClass").each((_, div) => {
    const header = $(div).find(".sg-header").first();
    const heading = collapseWs(header.find("a.sg-header-heading").first().text());
    const averageLabel = collapseWs(header.find("span.sg-header-heading").first().text());
    const avgMatch = averageLabel.match(/(-?\d+(?:\.\d+)?)\s*%?/);
    const { code, name } = splitCourseHeading(heading);
    const assignments: HacAssignmentRow[] = [];
    // The first sg-asp-table in a block is the assignment list; later ones are category summaries.
    const table = $(div).find("table.sg-asp-table").first().get(0);
    if (table) {
      const map = headerMap($, table);
      dataRows($, table).each((_, tr) => {
          const tds = $(tr).children("td");
          const titleCell = map.get("assignment");
          const link = titleCell !== undefined ? $(tds.get(titleCell)).find("a").first() : undefined;
          // Prefer the link text: the cell also holds a hidden "*" label and tooltip noise.
          const title = link && link.length > 0 ? collapseWs(link.text()) : cell($, tds, map, "assignment");
          if (!title) return;
          const row: HacAssignmentRow = {
            dueDate: parseUsDate(cell($, tds, map, "date due")),
            assignedDate: parseUsDate(cell($, tds, map, "date assigned")),
            title,
            category: cell($, tds, map, "category"),
            score: cell($, tds, map, "score"),
            totalPoints: parseNumber(cell($, tds, map, "total points")),
            weight: parseNumber(cell($, tds, map, "weight")),
            weightedScore: parseNumber(cell($, tds, map, "weighted score")),
            weightedTotal: parseNumber(cell($, tds, map, "weighted total points")),
            percentage: parseNumber(cell($, tds, map, "percentage")),
          };
          const href = link?.attr("href");
          if (href && href !== "#" && !href.startsWith("javascript")) row.url = href;
          // onclick="OpenAssignmentPopUp('<classId>', '<runId>', '<assignmentId>')" -> stable HAC ids
          const pop = link?.attr("onclick")?.match(/OpenAssignmentPopUp\('(\d+)',\s*'(\d+)',\s*'(\d+)'\)/);
          if (pop) row.hacIds = { classId: pop[1]!, runId: pop[2]!, assignmentId: pop[3]! };
          const tip = link?.attr("title");
          if (tip) {
            const yn = (label: string) => { const m = tip.match(new RegExp(label + ":\\s*([YN])", "i")); return m ? m[1]!.toUpperCase() === "Y" : undefined; };
            const flags = { canBeDropped: yn("Can Be Dropped"), extraCredit: yn("Extra Credit"), hasAttachments: yn("Has Attachments") };
            if (Object.values(flags).some((v) => v !== undefined)) row.flags = Object.fromEntries(Object.entries(flags).filter(([, v]) => v !== undefined)) as NonNullable<HacAssignmentRow["flags"]>;
          }
          assignments.push(row);
        });
    }
    blocks.push({ code, name, average: avgMatch ? parseNumber(avgMatch[1]) : null, averageLabel, assignments });
  });
  return blocks;
}

export function parseMarkingPeriods(html: string): HacMarkingPeriodOption[] {
  const $ = cheerio.load(html);
  return $("#plnMain_ddlReportCardRuns option")
    .toArray()
    .map((o) => ({
      value: $(o).attr("value") ?? "",
      label: collapseWs($(o).text()),
      selected: $(o).attr("selected") !== undefined,
    }))
    .filter((o) => o.value !== "");
}

/** The ASP.NET WebForms postback fields needed to switch the marking-period dropdown. */
export function postbackFields(html: string): Record<string, string> {
  const $ = cheerio.load(html);
  const out: Record<string, string> = {};
  for (const name of ["__VIEWSTATE", "__VIEWSTATEGENERATOR", "__EVENTVALIDATION", "__VIEWSTATEENCRYPTED", "__RequestVerificationToken"]) {
    const v = $(`input[name="${name}"]`).attr("value");
    if (v !== undefined) out[name] = v;
  }
  return out;
}

export function parseClasses(html: string): HacClassRow[] {
  const $ = cheerio.load(html);
  const table = $("#plnMain_dgSchedule, table.sg-asp-table").first().get(0);
  if (!table) return [];
  const map = headerMap($, table);
  const rows: HacClassRow[] = [];
  dataRows($, table).each((_, tr) => {
      const tds = $(tr).children("td");
      const name = cell($, tds, map, "description");
      const code = cell($, tds, map, "course");
      if (!name && !code) return;
      const pop = $(tds.get(map.get("description") ?? 1)).find("a").attr("onclick")?.match(/OpenClassPopUp\('(\d+)'\)/);
      const teacherCell = $(tds.get(map.get("teacher") ?? -1));
      const teacherLink = teacherCell.find("a").first();
      const href = teacherLink.attr("href") ?? "";
      // Cloudflare serves two obfuscation variants depending on the client: href="#<hex>" or data-cfemail="<hex>".
      const cfHref = href.match(/email-protection#([0-9a-f]+)/i);
      const cfData = teacherCell.find("[data-cfemail]").first().attr("data-cfemail") ?? teacherLink.attr("data-cfemail");
      const mailto = href.match(/^mailto:([^?]+)/i);
      const teacherEmail = cfHref ? decodeCfEmail(cfHref[1]!) : cfData ? decodeCfEmail(cfData) : mailto ? mailto[1]! : null;
      rows.push({
        ...(pop ? { hacClassId: pop[1]! } : {}),
        ...(teacherEmail ? { teacherEmail: teacherEmail.toLowerCase() } : {}),
        code,
        name,
        period: cell($, tds, map, "periods", "period"),
        teacher: cell($, tds, map, "teacher"),
        room: cell($, tds, map, "room"),
        days: cell($, tds, map, "days"),
        markingPeriods: cell($, tds, map, "marking periods"),
      });
    });
  return rows;
}

/**
 * Monthly attendance: an ASP.NET Calendar (#plnMain_cldAttendance). Each school day cell carries a
 * title of "period: NN\nAttendance: <status>" pairs and a <span aria-label="<day>, ..."> with the day
 * number. Only non-"Present" periods are returned; days with nothing notable are omitted, as are
 * "School Closed" cells and the greyed-out neighbouring-month cells.
 */
export function parseAttendance(html: string, monthHint?: { year: number; month: number }): HacAttendanceCell[] {
  const $ = cheerio.load(html);
  const cal = $("#plnMain_cldAttendance");
  if (cal.length === 0) return [];
  const monthNames = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const headerText = collapseWs(cal.find(".sg-asp-calendar-header td").filter((_, td) => /[A-Za-z]+\s+\d{4}/.test($(td).text())).first().text());
  const hm = headerText.match(/([A-Za-z]+)\s+(\d{4})/);
  const year = monthHint?.year ?? (hm ? Number(hm[2]) : new Date().getFullYear());
  const month = monthHint?.month ?? (hm ? monthNames.indexOf(hm[1]!.toLowerCase()) + 1 : new Date().getMonth() + 1);
  const cells: HacAttendanceCell[] = [];
  cal.find("td[title]").each((_, td) => {
    const title = $(td).attr("title") ?? "";
    if (!/period:/i.test(title)) return;
    const span = $(td).find("span[aria-label]").first();
    const dayText = (span.attr("aria-label") ?? span.text() ?? collapseWs($(td).text())).match(/^\s*(\d{1,2})\b/);
    if (!dayText) return;
    const day = Number(dayText[1]);
    const entries: HacAttendanceCell["entries"] = [];
    const re = /period:\s*(\S+)\s*Attendance:\s*([^\n]+?)\s*(?=period:|$)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(title)) !== null) {
      const description = collapseWs(m[2]!);
      if (/^present$/i.test(description)) continue;
      entries.push({ code: description, description, period: m[1]! });
    }
    if (entries.length === 0) return;
    cells.push({ date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, entries });
  });
  return cells;
}

export interface HacTestScore {
  index: number;
  description: string;
  test: string;
  level?: string;
  form?: string;
  date: string | null;     // yyyy-mm-dd
  grade?: string;
  age?: string;
  building?: string;
  subtests: Array<{ name: string; fields: Record<string, string> }>;
}

/**
 * "Reading Score Code: S Reading Scale Score: 1743 Raw Score: 41 Percentile: 076 ..." -> {key: value}.
 * A key is the run of Capitalised/numeric tokens immediately before a colon; the value is whatever sits
 * between that colon and the next key. Blank values are dropped.
 */
export function parseScoreFields(text: string): Record<string, string> {
  const tokens = collapseWs(text).split(" ").filter(Boolean);
  // Key words are Capitalised words (contain a lowercase letter) or all-caps acronyms of 2+ letters (EL, STAAR).
  // Values are short codes/numbers (S, O, 1743, 076, 1120L, 3M) and never match this.
  const isKeyToken = (w: string) => /^[A-Z][A-Za-z]*[a-z][A-Za-z0-9./'\-]*$/.test(w) || /^[A-Z]{2,}$/.test(w) || /^[A-Z][A-Za-z]*\/[A-Za-z]+$/.test(w);
  const keys: Array<{ start: number; end: number; key: string }> = [];
  let lastEnd = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (!tokens[i]!.endsWith(":")) continue;
    let start = i;
    while (start - 1 >= lastEnd && isKeyToken(tokens[start - 1]!) && !tokens[start - 1]!.endsWith(":")) start--;
    keys.push({ start, end: i + 1, key: tokens.slice(start, i + 1).join(" ").replace(/:$/, "") });
    lastEnd = i + 1;
  }
  const out: Record<string, string> = {};
  keys.forEach((k, idx) => {
    const value = tokens.slice(k.end, keys[idx + 1]?.start ?? tokens.length).join(" ");
    if (value) out[k.key] = value;
  });
  return out;
}

export function parseTestScores(html: string): HacTestScore[] {
  const $ = cheerio.load(html);
  const tests: HacTestScore[] = [];
  const t = (name: string, i: number) => collapseWs($(`#plnMain_rptTestScores_lbl${name}Value_${i}`).text());
  for (let i = 0; i < 50; i++) {
    const test = t("Test", i);
    if (!test) break;
    const opt = (k: keyof HacTestScore, v: string) => (v ? { [k]: v } : {});
    const subtests: HacTestScore["subtests"] = [];
    const table = $(`#plnMain_rptTestScores_dgSubtests_${i}`).get(0);
    if (table) {
      dataRows($, table).each((_, tr) => {
        const tds = $(tr).children("td");
        const name = collapseWs($(tds.get(0)).text());
        if (!name) return;
        subtests.push({ name, fields: parseScoreFields($(tds.get(1)).text()) });
      });
    }
    tests.push({
      index: i,
      description: t("Description", i),
      test,
      ...opt("level", t("Level", i)),
      ...opt("form", t("Form", i)),
      date: parseUsDate(t("Date", i)),
      ...opt("grade", t("Grade", i)),
      ...opt("age", t("Age", i)),
      ...opt("building", t("Building", i)),
      subtests,
    });
  }
  return tests;
}

/** "August 2026" — the calendar header's month label (used to detect HAC clamping at the school-year start). */
export function attendanceMonthLabel(html: string): string {
  const $ = cheerio.load(html);
  return $("#plnMain_cldAttendance .sg-asp-calendar-header td[align='center']").first().text().trim();
}

/** The __doPostBack argument for the attendance calendar's previous-month link, if present. */
export function attendancePrevMonthArg(html: string): { target: string; argument: string } | null {
  const $ = cheerio.load(html);
  const href = $("#plnMain_cldAttendance a[title='Go to the previous month']").attr("href") ?? "";
  const m = href.match(/__doPostBack\('([^']+)',\s*'([^']+)'\)/);
  return m ? { target: m[1]!, argument: m[2]! } : null;
}
