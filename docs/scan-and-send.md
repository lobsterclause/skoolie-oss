# Scan & send — paper forms to a teacher's inbox

`/s/<student>/scan` (Teachers tab → "Scan & send a document", or a teacher's sheet → "Send a scanned
document"). Photograph each page, skoolie straightens and brightens it, and the pages go out as one PDF
from the parent's own Gmail. Nothing is uploaded to skoolie: the photos, the PDF and the Google token
live in the browser tab and are gone when it closes.

## How it works

| Step | Where | What |
|---|---|---|
| Capture | `<input type="file" accept="image/*" capture="environment">` | The phone's camera app (PWA or Safari/Chrome). "Choose photos" picks from the library instead; on a laptop both are the file picker. |
| Detect + flatten | `apps/web/src/lib/paper.ts` on OpenCV.js | Canny edges → largest convex quadrilateral → perspective warp. Then the "scan" look: grayscale divided by a blurred background estimate, which evens out lighting without binarising. No outline found (≥ 12 % of the frame) → the whole photo is kept and the page says so. |
| Per-page choice | page sheet | Scan (default) / Colour (cropped, colours kept) / Photo (untouched). |
| PDF | `scanner.ts` + jsPDF (lazy chunk) | One US-Letter page per scan, oriented like the scan, JPEG 0.85, long side ≤ 2000 px. |
| Send | `gmail.ts` | Firebase Google provider re-prompts with `gmail.send`; the popup's OAuth access token posts the raw RFC 822 message (`scan.ts#buildMime`) to `gmail.googleapis.com/upload/.../messages/send`. Lands in the parent's Sent folder. |
| Fallbacks | page | "Share PDF…" (Web Share API with files: iOS/Android hand the PDF to Mail, Gmail, Files…) and "Save PDF". |

OpenCV.js (`@techstark/opencv-js`, ~13 MB, wasm inlined) is shipped as a hashed static asset via a Vite
`?url` import, **not** bundled: it loads with a `<script>` tag the first time a photo is added and is
cached by the browser afterwards. Firebase Hosting serves it compressed (~3 MB on the wire).

## One-time Google Cloud setup (the Firebase project)

The Gmail call is made with the parent's Google sign-in, so the Firebase project's OAuth client needs the
Gmail API and the send scope:

1. Google Cloud console → your Firebase project → **APIs & Services → Library** →
   enable **Gmail API**. Without it the send fails with "The Gmail API is not enabled for this Firebase
   project".
2. **APIs & Services → OAuth consent screen**: keep the app in **Testing** (it is a private family app)
   and add every parent's Google address under **Test users**. `gmail.send` is a *restricted* scope;
   in Testing mode Google shows an "unverified app" interstitial to test users but lets them through.
   Publishing the app to *Production* would require Google's restricted-scope verification.
3. Same page → **Scopes** → add `https://www.googleapis.com/auth/gmail.send`.
4. Nothing to configure in Firebase Auth or the web app: the scope is requested at send time by
   `apps/web/src/lib/gmail.ts` and the access token is never persisted. Parents see a Google popup on
   every send (the token lasts an hour and skoolie does not keep it).

## Failure messages and what they mean

| Banner | Cause | Fix |
|---|---|---|
| "The Gmail API is not enabled for this Firebase project" | step 1 skipped | enable the API |
| "Google did not allow sending mail from this account — approve the *Send email* permission" | the parent unticked the scope in the consent popup, or is not a test user | re-send and tick it / add them as a test user |
| "Google sign-in expired" | token older than an hour between popup and send | send again |
| "The scan is too large to email" | PDF over 18 MB | remove a page or retake (dark background → smaller JPEG) |
| "Could not load the document scanner (OpenCV.js)" | the 13 MB asset failed to download (offline, captive portal) | retry with a connection |
| "A photo could not be scanned" + "(whole photo)" thumbnails | no page outline found | the photo is still usable; retake on a darker surface for a crop |

## Tests

- `apps/web/src/lib/paper.test.ts` runs the real OpenCV.js build in Node on a synthetic angled page
  (`// @vitest-environment node`): corners within 6 px, warp size, whitening under a lighting gradient.
- `apps/web/src/lib/scan.test.ts` covers page layout, the MIME message, filenames and error mapping.
- `apps/web/e2e/scan.spec.ts` drives the built demo app in Chromium: a canvas-drawn "photo" goes through
  the file input, OpenCV loads as an asset, the thumbnail is cropped, the PDF downloads, and the demo
  send succeeds. Real Gmail sending is not exercised in CI (it needs a Google account).
- Mutation testing skips `paper.ts`, `scanner.ts` and `gmail.ts` (browser / OpenCV bound, no signal).
