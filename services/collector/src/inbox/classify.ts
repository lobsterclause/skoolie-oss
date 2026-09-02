/**
 * Turn one school email into a parent-facing summary with Claude (Sonnet 5 through the subscription
 * token, Agent SDK `query()`, one turn, no tools). Everything except the network call is pure and tested:
 * prompt building, JSON extraction, validation, and the deterministic fallback.
 */
import { z } from "zod";
import { MessageCategory, type Message } from "@skoolie/shared";
import type { EmailMessage } from "../links/extract.js";
import type { InboxContext, SenderGuess } from "./prefilter.js";
import { bodyText } from "./text.js";

/** yyyy-mm-dd that is a real calendar day (2026-99-99 matches the regex but would crash date parsing in the app). */
export const CalendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => { const d = new Date(`${s}T00:00:00Z`); return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s); }, { message: "not a calendar date" });

export const ClassifierOutput = z.object({
  category: MessageCategory,
  summary: z.string().min(1).max(1200),
  actionItems: z.array(z.object({ text: z.string().min(1).max(200), dueDate: CalendarDate.nullable().default(null) })).default([]),
  linkedStudentId: z.string().nullable().default(null),
  linkedCourseId: z.string().nullable().default(null),
});
export type ClassifierOutput = z.infer<typeof ClassifierOutput>;

export type Classification = Pick<Message, "category" | "summary" | "actionItems" | "linkedStudentId" | "linkedCourseId">;

/** One call to the model: prompt in, raw text out. Injected so tests never touch the network. */
export type ModelCall = (prompt: string) => Promise<string>;

export function buildPrompt(msg: EmailMessage, guess: SenderGuess, ctx: InboxContext): string {
  const students = ctx.students.map((s) => `- ${s.id}: ${s.name}`).join("\n") || "- (none on file)";
  const courses = ctx.courses.map((c) => `- ${c.id}: ${c.name} (student ${c.studentId}${c.teacher ? `, teacher ${c.teacher}` : ""}${c.teacherEmail ? ` <${c.teacherEmail}>` : ""})`).join("\n") || "- (none on file)";
  const contacts = ctx.contacts.map((c) => `- ${c.label}${c.name ? ` (${c.name})` : ""} <${c.email}>`).join("\n") || "- (none on file)";
  const forwarded = guess.forwarded ? `\nThis message was forwarded by ${guess.fromName} <${guess.fromEmail}>, another parent. Judge it by the ORIGINAL sender quoted in the body, not the forwarder.` : "";
  return `You summarize school email for a busy parent. Today is ${ctx.today}.

Students:
${students}

Courses (id: name, student, teacher):
${courses}

School contacts:
${contacts}

Sender pre-classification (may be wrong): ${guess.category}${guess.linkedCourseId ? `, course ${guess.linkedCourseId}` : ""}.${forwarded}

Reply with ONE JSON object and nothing else — no prose, no code fence:
{
  "category": "teacher" | "school" | "district" | "bus" | "classroom" | "hac" | "other",
  "summary": "Markdown, at most 90 words. Lead with what matters to the parent. Keep every date, time, place, amount and deadline explicit (write dates as 'Wed 9/3'). Bold the single most important fact. No greetings, no sign-offs, no 'this email'.",
  "actionItems": [{ "text": "one thing a parent or student must DO (sign, pay, bring, RSVP, study)", "dueDate": "yyyy-mm-dd or null" }],
  "linkedStudentId": "the id of the listed student this email is about (by name, or the only student when the mail concerns a child of this family), else null",
  "linkedCourseId": "a course id from the list when the mail is about one class, else null"
}
actionItems is [] when nothing is required. Never invent dates: dueDate is null unless the email states or clearly implies the day. Resolve relative dates ("this Friday") against today's date.

From: ${msg.from}
Subject: ${msg.subject}
Received: ${msg.date}

${bodyText(msg)}`;
}

/** Pull the first JSON object out of a reply that may carry a code fence or a stray sentence. */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1]! : text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object in reply");
  return JSON.parse(candidate.slice(start, end + 1));
}

/** Validate and pin the model's links to ids that actually exist; prefer the deterministic teacher link. */
export function toClassification(raw: unknown, guess: SenderGuess, ctx: InboxContext): Classification {
  const o = ClassifierOutput.parse(raw);
  const courseIds = new Set(ctx.courses.map((c) => c.id));
  const studentIds = new Set(ctx.students.map((s) => s.id));
  const linkedCourseId = guess.linkedCourseId ?? (o.linkedCourseId && courseIds.has(o.linkedCourseId) ? o.linkedCourseId : undefined);
  const courseStudent = linkedCourseId ? ctx.courses.find((c) => c.id === linkedCourseId)?.studentId : undefined;
  const linkedStudentId = guess.linkedStudentId ?? courseStudent ?? (o.linkedStudentId && studentIds.has(o.linkedStudentId) ? o.linkedStudentId : undefined);
  return {
    category: guess.category === "teacher" && guess.linkedCourseId ? "teacher" : o.category,
    summary: o.summary.trim(),
    actionItems: o.actionItems.map((a) => ({ text: a.text.trim(), dueDate: a.dueDate })),
    ...(linkedStudentId ? { linkedStudentId } : {}),
    ...(linkedCourseId ? { linkedCourseId } : {}),
  };
}

/** No model (no token, error, garbage reply): the sender guess plus the opening of the text. */
export function fallbackClassification(msg: EmailMessage, guess: SenderGuess): Classification {
  const text = bodyText(msg, 2000).replace(/\s+/g, " ").trim();
  const summary = text.length > 300 ? `${text.slice(0, 297).trimEnd()}…` : text || msg.subject || "(no text)";
  return {
    category: guess.category,
    summary,
    actionItems: [],
    ...(guess.linkedStudentId ? { linkedStudentId: guess.linkedStudentId } : {}),
    ...(guess.linkedCourseId ? { linkedCourseId: guess.linkedCourseId } : {}),
  };
}

export interface ClassifyResult {
  classification: Classification;
  /** Set when the fallback was used; the run records it as a warning. */
  fallbackReason?: string;
}

export async function classifyMessage(msg: EmailMessage, guess: SenderGuess, ctx: InboxContext, call: ModelCall | null): Promise<ClassifyResult> {
  if (!call) return { classification: fallbackClassification(msg, guess), fallbackReason: "no model configured (CLAUDE_CODE_OAUTH_TOKEN unset)" };
  try {
    const reply = await call(buildPrompt(msg, guess, ctx));
    return { classification: toClassification(extractJson(reply), guess, ctx) };
  } catch (e) {
    return { classification: fallbackClassification(msg, guess), fallbackReason: (e as Error).message.slice(0, 200) };
  }
}

/** The real thing: Agent SDK `query()` on the subscription token. Lazy import keeps unit tests light. */
export function claudeModelCall(model: string, timeoutMs = 90_000): ModelCall {
  return async (prompt) => {
    const { query } = await import("@anthropic-ai/claude-agent-sdk");
    const abortController = new AbortController();
    const timer = setTimeout(() => abortController.abort(), timeoutMs);
    try {
      let text = "";
      for await (const m of query({ prompt, options: { model, maxTurns: 1, allowedTools: [], abortController } })) {
        if (m.type === "result") text = "result" in m ? String(m.result) : "";
      }
      if (!text.trim()) throw new Error("empty model reply");
      return text;
    } finally {
      clearTimeout(timer);
    }
  };
}
