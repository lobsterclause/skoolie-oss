import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { format } from "date-fns";
import * as stylex from "@stylexjs/stylex";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Section } from "@astryxdesign/core/Section";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Selector } from "@astryxdesign/core/Selector";
import type { SelectorOptionType } from "@astryxdesign/core/Selector";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Thumbnail } from "@astryxdesign/core/Thumbnail";
import { VStack } from "@astryxdesign/core/VStack";
import { useStudentData } from "../app/StudentLayout.js";
import { useFamilyContext } from "../app/context.js";
import { groupTeachers, isSkippedCourse, naturalName } from "../lib/contacts.js";
import { sendWithGmail } from "../lib/gmail.js";
import { documentFileName, isEmail } from "../lib/scan.js";
import { buildPdf, canShareFiles, downloadPdf, scanPhoto, sharePdf, type PageImage, type PageMode, type ScanResult } from "../lib/scanner.js";
import { CameraIcon, Page, Region } from "../ui/bits.js";
import { Sheet } from "../ui/Sheet.js";
import { styles } from "../ui/styles.js";

interface ScannedPage {
  id: string;
  name: string;
  mode: PageMode;
  result?: ScanResult;
  error?: string;
}

const OTHER = "__other__";
const MODE_LABEL: Record<PageMode, string> = { scan: "Scan", color: "Colour", photo: "Photo" };
const imageOf = (p: ScannedPage): PageImage | undefined => p.result?.[p.mode];
let seq = 0;

/**
 * Photograph a paper form, flatten each page into a scan, and email the PDF to a teacher from the
 * parent's own Gmail — or hand it to another app through the share sheet.
 */
export function ScanPage() {
  const { student, courses, base } = useStudentData();
  const { family, user } = useFamilyContext();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  const teachers = useMemo(() => groupTeachers(courses.filter((c) => !isSkippedCourse(c))).filter((t) => t.email), [courses]);
  const contacts = family?.contacts ?? [];
  const options = useMemo<SelectorOptionType[]>(() => {
    const list: SelectorOptionType[] = [];
    if (teachers.length) list.push({ type: "section", title: "Teachers", options: teachers.map((t) => ({ value: t.email!, label: naturalName(t.teacher), description: t.courses.map((c) => c.name).join(" · ") })) });
    if (contacts.length) list.push({ type: "section", title: "School contacts", options: contacts.map((c) => ({ value: c.email, label: c.label, description: c.name })) });
    list.push({ value: OTHER, label: "Someone else…" });
    return list;
  }, [teachers, contacts]);
  // lower-cased address → the option value (the address as the roster spells it)
  const known = useMemo(() => new Map([...teachers.map((t) => t.email!), ...contacts.map((c) => c.email)].map((e) => [e.toLowerCase(), e])), [teachers, contacts]);

  // `?to=` from a teacher's sheet preselects them; an address not on the roster goes in the free field.
  const requested = params.get("to")?.trim() ?? "";
  const [to, setTo] = useState<string>(() => known.get(requested.toLowerCase()) ?? (requested ? OTHER : ""));
  const [other, setOther] = useState(requested && !known.has(requested.toLowerCase()) ? requested : "");
  const [subject, setSubject] = useState(`${naturalName(student.name)} — document`);
  const [note, setNote] = useState(`Hi,\n\nPlease find attached the document for ${student.firstName}.\n\nThank you,\n${user?.displayName ?? ""}`.trimEnd());
  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [status, setStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const recipients = useMemo(() => (to === OTHER ? [other.trim()] : to ? [to] : []), [to, other]);
  const recipientOk = recipients.length > 0 && recipients.every(isEmail);
  const processing = pages.some((p) => !p.result && !p.error);
  const images = pages.map(imageOf).filter((i): i is PageImage => Boolean(i));
  const ready = images.length > 0 && !processing;
  const filename = documentFileName(student.name, format(new Date(), "yyyy-MM-dd"));
  const open = openId ? pages.find((p) => p.id === openId) : undefined;
  const openIndex = open ? pages.indexOf(open) : -1;

  const patch = (id: string, f: (p: ScannedPage) => ScannedPage) => setPages((ps) => ps.map((p) => (p.id === id ? f(p) : p)));

  async function addFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // so the same photo can be picked again after a remove
    if (!files.length) return;
    setStatus(null);
    const added = files.map((f) => ({ id: `p${++seq}`, name: f.name, mode: "scan" as PageMode }));
    setPages((ps) => [...ps, ...added]);
    // One at a time: OpenCV is single-threaded and a phone has little to spare while the camera is warm.
    for (const [i, file] of files.entries()) {
      const id = added[i]!.id;
      try {
        const result = await scanPhoto(file);
        patch(id, (p) => ({ ...p, result }));
      } catch (err) {
        patch(id, (p) => ({ ...p, error: err instanceof Error ? err.message : String(err) }));
      }
    }
  }

  const remove = (id: string) => {
    setPages((ps) => ps.filter((p) => p.id !== id));
    if (openId === id) setOpenId(null);
  };

  const send = async () => {
    setStatus(null);
    try {
      const pdf = await buildPdf(images);
      await sendWithGmail({ to: recipients, subject, text: note, pdf, filename });
      setStatus({ type: "success", text: `Sent ${images.length} page${images.length === 1 ? "" : "s"} to ${recipients.join(", ")}.` });
    } catch (err) {
      setStatus({ type: "error", text: err instanceof Error ? err.message : String(err) });
    }
  };
  const share = async () => {
    setStatus(null);
    try {
      await sharePdf(await buildPdf(images), filename, subject, note);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return; // the user closed the share sheet
      setStatus({ type: "error", text: err instanceof Error ? err.message : String(err) });
    }
  };
  const save = async () => {
    setStatus(null);
    try {
      downloadPdf(await buildPdf(images), filename);
    } catch (err) {
      setStatus({ type: "error", text: err instanceof Error ? err.message : String(err) });
    }
  };

  const pickers = (
    <HStack gap={2} wrap="wrap">
      <Button variant="primary" label={pages.length ? "Add a page" : "Take a photo"} icon={<Icon icon={CameraIcon} />} onClick={() => cameraRef.current?.click()} />
      <Button label="Choose photos" onClick={() => libraryRef.current?.click()} />
    </HStack>
  );

  return (
    <Page title="Scan & send">
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={addFiles} data-testid="scan-camera-input" />
      <input ref={libraryRef} type="file" accept="image/*" multiple hidden onChange={addFiles} data-testid="scan-library-input" />

      <Section padding={4} paddingBlockStart={0}>
        <Text type="supporting">Photograph each page of a form. The page is straightened and brightened like a scan, then every page goes out as one PDF.</Text>
      </Section>

      <Region title="Pages" count={pages.length}>
        <Section padding={4} paddingBlockStart={0}>
          {pages.length === 0 ? (
            <EmptyState isCompact title="No pages yet" description="Lay the paper flat on a dark surface and fill the frame with it." actions={pickers} />
          ) : (
            <VStack gap={3}>
              <Grid columns={{ minWidth: 104 }} gap={3}>
                {pages.map((p, i) => {
                  const img = imageOf(p);
                  const label = `Page ${i + 1}${p.result && !p.result.cropped ? " (whole photo)" : ""}${p.error ? " (failed)" : ""}`;
                  // Open only: a remove control on the tile would sit under the same tap, so removal lives in the page sheet.
                  return <Thumbnail key={p.id} {...(img ? { src: img.dataUrl } : {})} alt={label} label={label} isLoading={!p.result && !p.error} onClick={() => setOpenId(p.id)} data-testid="scan-page" />;
                })}
              </Grid>
              {pages.some((p) => p.error) && <Banner status="error" title="A photo could not be scanned" description={pages.find((p) => p.error)?.error} collapsible={false} />}
              {pickers}
            </VStack>
          )}
        </Section>
      </Region>

      <Region title="Send">
        <Section padding={4} paddingBlockStart={0}>
          <VStack gap={3}>
            <Selector label="To" options={options} value={to} onChange={(v) => setTo(v)} placeholder="Choose a teacher" hasSearch={teachers.length + contacts.length > 6} width="100%" />
            {to === OTHER && <TextInput type="email" label="Email address" value={other} onChange={setOther} width="100%" {...(other && !isEmail(other) ? { status: { type: "error" as const, message: "That does not look like an email address" } } : {})} />}
            <TextInput label="Subject" value={subject} onChange={setSubject} width="100%" />
            <TextArea label="Message" value={note} onChange={setNote} rows={5} width="100%" />
            {status && <Banner status={status.type} title={status.type === "success" ? "Sent" : "Not sent"} description={status.text} collapsible={false} isDismissable onDismiss={() => setStatus(null)} />}
            <Button variant="primary" width="100%" label={processing ? "Scanning…" : "Send with Gmail"} clickAction={send} isDisabled={!ready || !recipientOk} />
            <HStack gap={2} wrap="wrap">
              {canShareFiles() && <Button label="Share PDF…" clickAction={share} isDisabled={!ready} />}
              <Button variant="ghost" label="Save PDF" clickAction={save} isDisabled={!ready} />
            </HStack>
            <Text type="supporting">Sent from {user?.email ?? "your Google account"}; a copy lands in your Sent mail. Google asks once per send for permission to send on your behalf.</Text>
          </VStack>
        </Section>
      </Region>

      <Sheet isOpen={Boolean(open)} onOpenChange={(o) => !o && setOpenId(null)} label="Page" title={open ? `Page ${openIndex + 1}` : "Page"} height="tall">
        {open && (
          <VStack gap={3}>
            {open.result && (
              <SegmentedControl label="How this page is shown" value={open.mode} onChange={(v) => patch(open.id, (p) => ({ ...p, mode: v as PageMode }))} layout="fill">
                {(Object.keys(MODE_LABEL) as PageMode[]).map((m) => (
                  <SegmentedControlItem key={m} value={m} label={MODE_LABEL[m]} />
                ))}
              </SegmentedControl>
            )}
            {open.result && !open.result.cropped && <Text type="supporting">No page outline was found, so the whole photo is used. Retake on a darker background for a cleaner crop.</Text>}
            {imageOf(open) ? <img {...stylex.props(styles.scanPreview)} src={imageOf(open)!.dataUrl} alt={`Page ${openIndex + 1}, ${MODE_LABEL[open.mode].toLowerCase()}`} /> : open.error ? <Text>{open.error}</Text> : <Text type="supporting">Scanning…</Text>}
            <Button variant="destructive" width="100%" label="Remove this page" onClick={() => remove(open.id)} />
          </VStack>
        )}
      </Sheet>
      {pages.length === 0 && requested && (
        <Section padding={4}>
          <Button variant="ghost" label="Back to teachers" onClick={() => navigate(`${base}/teachers`)} />
        </Section>
      )}
    </Page>
  );
}
