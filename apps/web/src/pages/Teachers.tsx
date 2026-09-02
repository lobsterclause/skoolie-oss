import { useMemo } from "react";
import { useNavigate, useParams } from "react-router";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Icon } from "@astryxdesign/core/Icon";
import { Link } from "@astryxdesign/core/Link";
import { List, ListItem } from "@astryxdesign/core/List";
import { Section } from "@astryxdesign/core/Section";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { TeacherLink } from "@skoolie/shared";
import { useStudentData } from "../app/StudentLayout.js";
import { useFamilyContext } from "../app/context.js";
import { courseHue, hueStyle } from "../lib/colors.js";
import { courseLabel, findSiteUrl, groupTeachers, initials, isSkippedCourse, linkLabel, linksFor, mailto, naturalName, type TeacherRow } from "../lib/contacts.js";
import { MailIcon, Page, PhoneIcon, Region, SkeletonRows } from "../ui/bits.js";
import { Sheet } from "../ui/Sheet.js";

const keyOf = (t: TeacherRow) => (t.email ?? t.teacher).toLowerCase();

export function TeachersPage() {
  const { student, courses, loading, base } = useStudentData();
  const { family } = useFamilyContext();
  const { teacherKey } = useParams();
  const navigate = useNavigate();
  const links = family?.teacherLinks ?? [];
  const contacts = family?.contacts ?? [];
  const teachers = useMemo(() => groupTeachers(courses.filter((c) => !isSkippedCourse(c))), [courses]);
  const everyone = useMemo(() => groupTeachers(courses), [courses]);
  const extras = everyone.filter((t) => !teachers.some((x) => x.teacher === t.teacher));
  const emails = teachers.map((t) => t.email).filter((e): e is string => Boolean(e));
  const subject = naturalName(student.name);
  const office = contacts.find((c) => /office/i.test(c.label));
  const selected = teacherKey ? everyone.find((t) => keyOf(t) === decodeURIComponent(teacherKey)) : undefined;

  return (
    <Page title="Teachers & contacts">
      <Section padding={4} paddingBlockStart={0}>
        <VStack gap={2}>
          <Button variant="primary" width="100%" label={`Email all teachers (${emails.length})`} href={mailto(emails, { subject, bcc: true })} isDisabled={emails.length === 0} />
          {office && <Button width="100%" label={`Email ${office.label.toLowerCase()}`} href={mailto([office.email], { subject })} />}
          {office?.phone && <Button width="100%" variant="ghost" label={`Call ${office.phone}`} href={`tel:${office.phone.replace(/[^\d+]/g, "")}`} />}
        </VStack>
      </Section>

      <Region title="Teachers" count={teachers.length}>
        {loading ? (
          <SkeletonRows rows={5} height={64} />
        ) : teachers.length === 0 ? (
          <Section padding={4} paddingBlockStart={0}>
            <EmptyState isCompact title="No courses yet" description="Teachers appear after the first HAC run." />
          </Section>
        ) : (
          <List hasDividers density="spacious">
            {teachers.map((t) => (
              <TeacherItem key={keyOf(t)} t={t} school={student.school} links={linksFor(links, t.email)} subject={subject} onOpen={() => navigate(`${base}/teachers/${encodeURIComponent(keyOf(t))}`)} />
            ))}
          </List>
        )}
      </Region>

      {extras.length > 0 && (
        <Section padding={4} paddingBlockStart={0}>
          <Collapsible defaultIsOpen={false} trigger={<Heading level={2}>Advisory & lunch</Heading>}>
            <List hasDividers density="compact">
              {extras.map((t) => (
                <ListItem key={keyOf(t)} label={t.teacher} description={t.courses.map((c) => c.name).join(" · ")} endContent={t.email ? <IconButton label={`Email ${t.teacher}`} icon={<Icon icon={MailIcon} />} variant="ghost" onClick={() => (window.location.href = mailto([t.email!], { subject }))} /> : undefined} />
              ))}
            </List>
          </Collapsible>
        </Section>
      )}

      {contacts.length > 0 && (
        <Region title="School contacts">
          <List hasDividers density="balanced">
            {contacts.map((c) => (
              <ListItem
                key={c.email}
                label={c.label}
                description={[c.name, c.phone].filter(Boolean).join(" · ") || undefined}
                endContent={
                  <HStack gap={1}>
                    {c.phone && <IconButton label={`Call ${c.label}`} icon={<Icon icon={PhoneIcon} />} variant="ghost" onClick={() => (window.location.href = `tel:${c.phone!.replace(/[^\d+]/g, "")}`)} />}
                    <IconButton label={`Email ${c.label}`} icon={<Icon icon={MailIcon} />} variant="ghost" onClick={() => (window.location.href = mailto([c.email], { subject }))} />
                  </HStack>
                }
              />
            ))}
          </List>
        </Region>
      )}

      <Sheet isOpen={Boolean(selected)} onOpenChange={(o) => !o && navigate(`${base}/teachers`, { replace: true })} label="Teacher" title={selected ? naturalName(selected.teacher) : "Teacher"} height="hug">
        {selected && <TeacherSheet t={selected} links={linksFor(links, selected.email)} subject={subject} school={student.school} />}
      </Sheet>
    </Page>
  );
}

function TeacherItem({ t, links, subject, school, onOpen }: { t: TeacherRow; links: TeacherLink[]; subject: string; school?: string; onOpen: () => void }) {
  const hue = courseHue(t.courses[0]!.id);
  return (
    <ListItem
      label={t.teacher}
      description={
        <VStack gap={1}>
          <Text type="supporting">{t.courses.map(courseLabel).join(" · ")}</Text>
          <HStack gap={3} wrap="wrap">
            {links.length === 0 ? (
              <Link href={findSiteUrl(t.teacher, school)} isExternalLink color="secondary">
                Find site
              </Link>
            ) : (
              links.map((l) => (
                <Link key={l.url} href={l.url} isExternalLink>
                  {linkLabel(l)}
                </Link>
              ))
            )}
          </HStack>
        </VStack>
      }
      startContent={<Avatar name={initials(t.teacher)} alt={t.teacher} size="md" style={hueStyle(hue)} tooltip={false} onClick={onOpen} />}
      endContent={
        <HStack gap={1}>
          <IconButton label={`About ${t.teacher}`} icon={<Icon icon="info" />} variant="ghost" onClick={onOpen} />
          {t.email ? <IconButton label={`Email ${t.teacher}`} icon={<Icon icon={MailIcon} />} variant="secondary" onClick={() => (window.location.href = mailto([t.email!], { subject }))} /> : <Text type="supporting">no email</Text>}
        </HStack>
      }
    />
  );
}

function TeacherSheet({ t, links, subject, school }: { t: TeacherRow; links: TeacherLink[]; subject: string; school?: string }) {
  return (
    <VStack gap={4}>
      <List hasDividers density="compact" header={<Text type="label">Courses</Text>}>
        {t.courses.map((c) => (
          <ListItem key={c.id} label={c.name} description={courseLabel(c)} />
        ))}
      </List>
      <List hasDividers density="compact" header={<Text type="label">Links</Text>}>
        {links.length === 0 && <ListItem label="Find site" description="No site on file — searches Google Sites for this teacher" href={findSiteUrl(t.teacher, school)} target="_blank" />}
        {links.map((l) => (
          <ListItem
            key={l.url}
            label={linkLabel(l)}
            description={l.evidence ? `Seen in: ${l.evidence}` : l.url.replace(/^https?:\/\//, "")}
            href={l.url}
            target="_blank"
            endContent={l.source === "manual" ? <Badge variant="neutral" label="manual" /> : <Icon icon="externalLink" size="sm" color="secondary" />}
          />
        ))}
      </List>
      {t.email && (
        <VStack gap={1}>
          <Button variant="primary" width="100%" label={`Email ${naturalName(t.teacher)}`} href={mailto([t.email], { subject })} />
          <Text type="supporting" justify="center">
            {t.email}
          </Text>
        </VStack>
      )}
    </VStack>
  );
}
