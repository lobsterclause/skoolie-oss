/**
 * Send the scan from the parent's own Google account, straight from the browser. Firebase Auth's
 * Google provider re-prompts with the gmail.send scope, the popup's OAuth access token goes to the
 * Gmail REST upload endpoint with the raw RFC 822 message, and the mail shows in the sender's Sent
 * folder. No server, no third-party mailer, no second sign-in method.
 */
import { GoogleAuthProvider, reauthenticateWithPopup, signInWithPopup } from "firebase/auth";
import { auth } from "../firebase.js";
import { DEMO } from "../demo.js";
import { buildMime, bytesToBase64, gmailErrorMessage, GMAIL_SEND_SCOPE, GMAIL_UPLOAD_URL, MAX_ATTACHMENT_BYTES } from "./scan.js";

export interface SendRequest {
  to: string[];
  subject: string;
  text: string;
  pdf: Blob;
  filename: string;
}

/** A short-lived Google access token that carries the send scope. Always a popup: the token lasts an hour and is never stored. */
async function gmailAccessToken(): Promise<{ token: string; email: string }> {
  const provider = new GoogleAuthProvider();
  provider.addScope(GMAIL_SEND_SCOPE);
  const user = auth.currentUser;
  if (user?.email) provider.setCustomParameters({ login_hint: user.email });
  const result = user ? await reauthenticateWithPopup(user, provider) : await signInWithPopup(auth, provider);
  const cred = GoogleAuthProvider.credentialFromResult(result);
  if (!cred?.accessToken) throw new Error("Google did not return an access token for Gmail");
  return { token: cred.accessToken, email: result.user.email ?? user?.email ?? "" };
}

export async function sendWithGmail(req: SendRequest): Promise<{ id: string }> {
  if (req.pdf.size > MAX_ATTACHMENT_BYTES) throw new Error(`The PDF is ${(req.pdf.size / 1048576).toFixed(1)} MB; Gmail attachments must stay under ${MAX_ATTACHMENT_BYTES / 1048576} MB. Remove a page or retake in better light.`);
  if (DEMO) {
    await new Promise((r) => setTimeout(r, 600));
    return { id: "demo" };
  }
  const { token, email } = await gmailAccessToken();
  const base64 = bytesToBase64(new Uint8Array(await req.pdf.arrayBuffer()));
  const mime = buildMime({ from: email, to: req.to, subject: req.subject, text: req.text, attachment: { filename: req.filename, mimeType: "application/pdf", base64 } });
  const res = await fetch(GMAIL_UPLOAD_URL, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "message/rfc822" }, body: mime });
  if (!res.ok) throw new Error(gmailErrorMessage(res.status, await res.text()));
  return (await res.json()) as { id: string };
}
