/**
 * Email body → plain text for the classifier. Pure. HTML mail from school systems is table soup with
 * tracking pixels and quoted signatures; we keep the words, collapse whitespace, and cap the length so a
 * single message never blows the prompt budget.
 */
import { load } from "cheerio";
import type { EmailMessage } from "../links/extract.js";

export const MAX_BODY_CHARS = 6000;

const BLOCK = "p,div,li,tr,h1,h2,h3,h4,h5,h6,blockquote,pre,table,section,article,header,footer";

export function htmlToText(html: string): string {
  const $ = load(html);
  $("script,style,head,noscript,template").remove();
  $("img").remove();
  // Keep link targets when the anchor text isn't the URL itself — "sign here" without the URL is useless.
  $("a[href]").each((_, el) => {
    const a = $(el);
    const href = (a.attr("href") ?? "").trim();
    const text = a.text().trim();
    if (/^https?:/i.test(href) && text && !text.includes(href) && !/^(https?:|www\.)/i.test(text)) a.text(`${text} (${href})`);
  });
  $("br").replaceWith("\n"); // void element: prepend/append would be dropped
  $(BLOCK).each((_, el) => {
    $(el).prepend("\n").append("\n");
  });
  return normalize($.root().text());
}

/** Collapse runs of blank lines / spaces; strip zero-width and nbsp characters mail clients sprinkle in. */
export function normalize(text: string): string {
  return text
    .replace(/[ ​‌‍﻿]/g, " ")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The text the model sees: html if present (mail clients send both, html is the authored one), else text. */
export function bodyText(msg: EmailMessage, max = MAX_BODY_CHARS): string {
  const raw = msg.html ? htmlToText(msg.html) : normalize(msg.text ?? "");
  return raw.length > max ? `${raw.slice(0, max)}\n[… truncated ${raw.length - max} characters]` : raw;
}

/** "Rivera, Ana <ana_rivera@example-isd.org>" → { name: "Rivera, Ana", email: "ana_rivera@example-isd.org" } */
export function parseSender(from: string): { name: string; email: string } {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: tidyName(m[1]!), email: m[2]!.trim().toLowerCase() };
  const bare = from.trim();
  return bare.includes("@") ? { name: "", email: bare.toLowerCase() } : { name: tidyName(bare), email: "" };
}

/** District mail carries HAC-style padded names ("RAMESH                      , PRIYA"). */
export function tidyName(name: string): string {
  return name.replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ").trim();
}
