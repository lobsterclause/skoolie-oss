/**
 * Pure helpers for the scan-and-send flow: PDF page layout, the RFC 822 message that goes to the
 * Gmail API, and the messages shown when that call fails. No DOM, no Firebase — everything here is
 * unit-tested; the browser-only glue lives in scanner.ts and gmail.ts.
 */

/** US Letter in PDF points. */
export const LETTER = { width: 612, height: 792 } as const;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Page orientation follows the scan, so a landscape form does not land sideways in a portrait page. */
export function pageFormat(imgW: number, imgH: number): { orientation: "portrait" | "landscape"; width: number; height: number } {
  return imgW > imgH ? { orientation: "landscape", width: LETTER.height, height: LETTER.width } : { orientation: "portrait", width: LETTER.width, height: LETTER.height };
}

/** Fit an image inside a page, preserving aspect ratio, centred, with a small margin. */
export function fitOnPage(imgW: number, imgH: number, pageW: number, pageH: number, margin = 18): Rect {
  const maxW = pageW - margin * 2;
  const maxH = pageH - margin * 2;
  const s = Math.min(maxW / imgW, maxH / imgH);
  const width = imgW * s;
  const height = imgH * s;
  return { x: (pageW - width) / 2, y: (pageH - height) / 2, width, height };
}

/** "Phoenix, Kepler" + 2026-09-03 → "Kepler-Phoenix-2026-09-03.pdf"; anything odd in the name is dropped. */
export function documentFileName(studentName: string, isoDate: string): string {
  const natural = studentName.includes(",") ? studentName.split(",").reverse().map((s) => s.trim()).join(" ") : studentName;
  const slug = natural
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return `${slug || "document"}-${isoDate.slice(0, 10)}.pdf`;
}

export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
export const GMAIL_UPLOAD_URL = "https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=media";
/** Gmail rejects messages over 25 MB; leave headroom for base64 (+33%) and headers. */
export const MAX_ATTACHMENT_BYTES = 18 * 1024 * 1024;

/** Standard base64 of raw bytes, in chunks so a multi-megabyte PDF does not blow the call stack. */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}

/** Base64 of a UTF-8 string. */
export function utf8ToBase64(s: string): string {
  return bytesToBase64(new TextEncoder().encode(s));
}

/** MIME bodies are wrapped at 76 characters per line (RFC 2045). */
export function wrap76(b64: string): string {
  return b64.replace(/(.{76})/g, "$1\r\n").replace(/\r\n$/, "");
}

/** Header value: plain when ASCII, RFC 2047 encoded-word otherwise (accents in a student's name). */
export function encodeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${utf8ToBase64(value)}?=`;
}

/** An address is valid enough to send to when it looks like one mailbox at one domain. */
export function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

export interface OutgoingMail {
  from: string;
  to: string[];
  subject: string;
  text: string;
  attachment: { filename: string; mimeType: string; base64: string };
}

/**
 * The raw RFC 822 message the Gmail upload endpoint accepts as `message/rfc822`: a multipart/mixed
 * body with the note as text/plain and the scan as a base64 attachment. CRLF line endings throughout.
 */
export function buildMime(m: OutgoingMail): string {
  const boundary = `skoolie_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
  const lines = [
    `From: ${m.from}`,
    `To: ${m.to.join(", ")}`,
    `Subject: ${encodeHeader(m.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(utf8ToBase64(m.text)),
    `--${boundary}`,
    `Content-Type: ${m.attachment.mimeType}; name="${m.attachment.filename}"`,
    `Content-Disposition: attachment; filename="${m.attachment.filename}"`,
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(m.attachment.base64),
    `--${boundary}--`,
    "",
  ];
  return lines.join("\r\n");
}

/** Turn a Gmail API failure into one sentence a parent can act on; the raw reason follows in brackets. */
export function gmailErrorMessage(status: number, body: string): string {
  let reason = "";
  try {
    const j = JSON.parse(body) as { error?: { message?: string; errors?: { reason?: string }[]; status?: string } };
    reason = j.error?.errors?.[0]?.reason ?? j.error?.status ?? "";
    body = j.error?.message ?? body;
  } catch {
    /* not JSON */
  }
  const detail = body.trim() ? ` (${body.trim().slice(0, 200)})` : "";
  if (status === 401) return `Google sign-in expired — try sending again${detail}`;
  if (status === 403 && /accessNotConfigured|SERVICE_DISABLED|has not been used|is disabled/i.test(reason + body)) return `The Gmail API is not enabled for this Firebase project — see docs/scan-and-send.md${detail}`;
  if (status === 403) return `Google did not allow sending mail from this account — approve the "Send email" permission when signing in${detail}`;
  if (status === 413 || /too large/i.test(body)) return `The scan is too large to email — remove a page or retake in better light${detail}`;
  return `Gmail refused the message (HTTP ${status})${detail}`;
}
