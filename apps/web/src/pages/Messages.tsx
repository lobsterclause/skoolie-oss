import { useNavigate, useParams } from "react-router";
import { format, parseISO } from "date-fns";
import { Badge } from "@astryxdesign/core/Badge";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Link } from "@astryxdesign/core/Link";
import { List, ListItem } from "@astryxdesign/core/List";
import { Markdown } from "@astryxdesign/core/Markdown";
import { Section } from "@astryxdesign/core/Section";
import { Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import type { Message } from "@skoolie/shared";
import { useMessages } from "../data.js";
import { useUid } from "../app/context.js";
import { Page, SkeletonRows } from "../ui/bits.js";
import { Sheet } from "../ui/Sheet.js";

const CATEGORY: Record<Message["category"], string> = { teacher: "Teacher", school: "School", district: "District", bus: "Bus", classroom: "Classroom", hac: "HAC", other: "Other" };

/** Deep link back to the original mailbox item, when we have a raw mailbox id to build one from. */
function sourceLink(m: Message): string | undefined {
  if (!m.sourceId) return undefined;
  if (m.source === "outlook") return `https://outlook.office.com/mail/deeplink/read/${encodeURIComponent(m.sourceId)}`;
  return undefined;
}

/** School mail summaries. A badge only when a message still needs something from a parent. */
export function MessagesPage() {
  const messages = useMessages(useUid());
  const { messageId } = useParams();
  const navigate = useNavigate();
  const selected = messageId ? messages.data.find((m) => m.id === messageId) : undefined;
  const selectedSourceLink = selected ? sourceLink(selected) : undefined;
  return (
    <Page title="Messages">
      {messages.loading ? (
        <SkeletonRows rows={5} />
      ) : messages.data.length === 0 ? (
        <Section padding={4}>
          <EmptyState title="No school messages yet" description="Summaries of school and teacher email appear here once the mail collector is running." />
        </Section>
      ) : (
        <List hasDividers density="balanced">
          {messages.data.map((m) => (
            <ListItem
              key={m.id}
              label={m.subject}
              description={`${m.from} · ${CATEGORY[m.category]}`}
              href={`/messages/${m.id}`}
              startContent={!m.read ? <StatusDot variant="accent" label="Unread" /> : undefined}
              endContent={
                <VStack gap={0.5} hAlign="end">
                  {m.actionItems.length > 0 && <Badge variant="warning" label="Action needed" />}
                  <Timestamp value={m.receivedAt} format="auto" />
                </VStack>
              }
            />
          ))}
        </List>
      )}
      <Sheet isOpen={Boolean(selected)} onOpenChange={(o) => !o && navigate("/messages", { replace: true })} label="Message" title={selected?.subject ?? "Message"} height="capped" width={560}>
        {selected && (
          <VStack gap={3}>
            <HStack gap={2} hAlign="between">
              <Text type="supporting">{selected.from}</Text>
              <Timestamp value={selected.receivedAt} format="date_time" />
            </HStack>
            <Markdown headingLevelStart={3}>{selected.summary}</Markdown>
            {selectedSourceLink && (
              <Link href={selectedSourceLink} isExternalLink isStandalone>
                View original message
              </Link>
            )}
            {selected.actionItems.length > 0 && (
              <List hasDividers density="compact" header={<Text type="label">To do</Text>}>
                {selected.actionItems.map((it) => (
                  <ListItem key={it.text} label={it.text} description={it.dueDate ? `Due ${format(parseISO(it.dueDate), "EEE M/d")}` : undefined} startContent={<StatusDot variant="warning" label="Action item" />} />
                ))}
              </List>
            )}
          </VStack>
        )}
      </Sheet>
    </Page>
  );
}
