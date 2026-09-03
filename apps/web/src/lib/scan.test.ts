import { describe, expect, it } from "vitest";
import { buildMime, bytesToBase64, documentFileName, encodeHeader, fitOnPage, gmailErrorMessage, isEmail, pageFormat, utf8ToBase64, wrap76 } from "./scan.js";

describe("page layout", () => {
  it("picks the page orientation from the scan", () => {
    expect(pageFormat(800, 1000).orientation).toBe("portrait");
    expect(pageFormat(1000, 800)).toEqual({ orientation: "landscape", width: 792, height: 612 });
  });
  it("fits a tall scan to the page height and centres it", () => {
    const r = fitOnPage(1000, 2000, 612, 792, 18);
    expect(r.height).toBeCloseTo(756);
    expect(r.width).toBeCloseTo(378);
    expect(r.x).toBeCloseTo((612 - 378) / 2);
    expect(r.y).toBeCloseTo(18);
  });
  it("fits a wide scan to the page width", () => {
    const r = fitOnPage(2000, 1000, 612, 792);
    expect(r.width).toBeCloseTo(576);
    expect(r.height).toBeCloseTo(288);
  });
});

describe("documentFileName", () => {
  it("uses First-Last and the date", () => {
    expect(documentFileName("Phoenix, Kepler", "2026-09-03T14:00:00Z")).toBe("Kepler-Phoenix-2026-09-03.pdf");
  });
  it("strips accents and punctuation", () => {
    expect(documentFileName("O'Brien, Zoë", "2026-09-03")).toBe("Zoe-OBrien-2026-09-03.pdf");
  });
  it("falls back when the name is all punctuation", () => {
    expect(documentFileName("???", "2026-09-03")).toBe("document-2026-09-03.pdf");
  });
});

describe("encoding", () => {
  it("base64-encodes bytes in chunks", () => {
    const big = new Uint8Array(100_000).map((_, i) => i % 251);
    expect(bytesToBase64(big)).toBe(Buffer.from(big).toString("base64"));
    expect(bytesToBase64(new Uint8Array([]))).toBe("");
  });
  it("wraps at 76 columns with CRLF and no trailing break", () => {
    const b64 = "A".repeat(200);
    const wrapped = wrap76(b64);
    expect(wrapped.split("\r\n").map((l) => l.length)).toEqual([76, 76, 48]);
    expect(wrapped.endsWith("\r\n")).toBe(false);
  });
  it("leaves ASCII headers alone and encodes the rest", () => {
    expect(encodeHeader("Kepler Phoenix")).toBe("Kepler Phoenix");
    expect(encodeHeader("Zoë — permiso")).toBe(`=?UTF-8?B?${utf8ToBase64("Zoë — permiso")}?=`);
  });
  it("recognises addresses", () => {
    expect(isEmail(" ana_rivera@roundrockisd.org ")).toBe(true);
    expect(isEmail("ana@")).toBe(false);
    expect(isEmail("not an email")).toBe(false);
  });
});

describe("buildMime", () => {
  const mail = {
    from: "parent@gmail.com",
    to: ["ana_rivera@roundrockisd.org", "office@roundrockisd.org"],
    subject: "Kepler Phoenix — permission slip",
    text: "Hi Ms. Rivera,\n\nSigned slip attached.\n",
    attachment: { filename: "Kepler-Phoenix-2026-09-03.pdf", mimeType: "application/pdf", base64: bytesToBase64(new Uint8Array(120).fill(37)) },
  };
  it("produces a multipart/mixed message with CRLF endings", () => {
    const mime = buildMime(mail);
    expect(mime).toMatch(/^From: parent@gmail\.com\r\nTo: ana_rivera@roundrockisd\.org, office@roundrockisd\.org\r\nSubject: =\?UTF-8\?B\?/);
    expect(mime.includes("\n") && !mime.replace(/\r\n/g, "").includes("\n")).toBe(true);
    const boundary = /boundary="([^"]+)"/.exec(mime)![1]!;
    expect(mime.split(`--${boundary}`).length).toBe(4); // header, text part, attachment, closing
    expect(mime.endsWith(`--${boundary}--\r\n`)).toBe(true);
    expect(mime).toContain('Content-Disposition: attachment; filename="Kepler-Phoenix-2026-09-03.pdf"');
    expect(mime).toContain("Content-Type: application/pdf; name=");
  });
  it("carries the note as base64 text/plain", () => {
    const mime = buildMime(mail);
    const part = mime.split('Content-Type: text/plain; charset="UTF-8"')[1]!.split("--")[0]!;
    const body = part.split("\r\n\r\n")[1]!.trim().replace(/\r\n/g, "");
    expect(Buffer.from(body, "base64").toString("utf8")).toBe(mail.text);
  });
  it("never reuses a boundary that appears in the attachment", () => {
    const a = buildMime(mail);
    const b = buildMime(mail);
    expect(/boundary="([^"]+)"/.exec(a)![1]).not.toBe(/boundary="([^"]+)"/.exec(b)![1]);
  });
});

describe("gmailErrorMessage", () => {
  it("explains a disabled API", () => {
    const body = JSON.stringify({ error: { code: 403, message: "Gmail API has not been used in project 123 before or it is disabled.", errors: [{ reason: "accessNotConfigured" }] } });
    expect(gmailErrorMessage(403, body)).toMatch(/Gmail API is not enabled.*docs\/scan-and-send\.md/);
  });
  it("explains a missing scope", () => {
    const body = JSON.stringify({ error: { code: 403, message: "Request had insufficient authentication scopes.", errors: [{ reason: "insufficientPermissions" }] } });
    expect(gmailErrorMessage(403, body)).toMatch(/Send email.*permission/);
  });
  it("handles an expired token, an oversize message and plain-text bodies", () => {
    expect(gmailErrorMessage(401, "")).toMatch(/expired/);
    expect(gmailErrorMessage(413, "Request Entity Too Large")).toMatch(/too large/);
    expect(gmailErrorMessage(500, "<html>boom</html>")).toBe("Gmail refused the message (HTTP 500) (<html>boom</html>)");
  });
});
