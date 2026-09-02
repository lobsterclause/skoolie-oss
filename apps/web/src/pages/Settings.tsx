import { Avatar } from "@astryxdesign/core/Avatar";
import { Button } from "@astryxdesign/core/Button";
import { List, ListItem } from "@astryxdesign/core/List";
import { RadioList, RadioListItem } from "@astryxdesign/core/RadioList";
import { Section } from "@astryxdesign/core/Section";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useFamilyContext } from "../app/context.js";
import { usePrefs, type ThemeMode } from "../app/prefs.js";
import { hueStyle } from "../lib/colors.js";
import { gradeLabel } from "../app/StudentSwitcher.js";
import { Page, Region } from "../ui/bits.js";
import { DEMO } from "../demo.js";

export function SettingsPage() {
  const [prefs, update] = usePrefs();
  const { students, provider, user } = useFamilyContext();
  const inTelegram = Boolean(window.Telegram?.WebApp?.initData);
  return (
    <Page title="Settings">
      <Section padding={4} paddingBlockStart={0}>
        <VStack gap={2}>
          <RadioList label="Appearance" value={prefs.mode} onChange={(v) => update({ mode: v as ThemeMode })} isDisabled={inTelegram} {...(inTelegram ? { disabledMessage: "Telegram sets the colour scheme" } : {})}>
            <RadioListItem value="system" label="Match device" />
            <RadioListItem value="light" label="Light" />
            <RadioListItem value="dark" label="Dark" />
          </RadioList>
          <Text type="supporting">Saved on this device only.</Text>
        </VStack>
      </Section>
      <Region title="Students">
        <List hasDividers density="balanced">
          {students.map((s) => (
            <ListItem key={s.id} label={s.firstName} description={`${gradeLabel(s.grade)} · ${s.school}${s.counselor ? ` · counselor ${s.counselor}` : ""}`} startContent={<Avatar name={s.firstName} size="md" style={hueStyle(s.hue)} tooltip={false} />} href={`/s/${s.id}`} />
          ))}
        </List>
        <Section padding={4} paddingBlock={2}>
          <Text type="supporting">Each student keeps their colour in the order the family lists them.</Text>
        </Section>
      </Region>
      {!inTelegram && !DEMO && (
        <Section padding={4}>
          <VStack gap={2}>
            <Text type="supporting">Signed in as {user?.email ?? "unknown"}</Text>
            <Button label="Sign out" onClick={() => provider.signOut()} />
          </VStack>
        </Section>
      )}
    </Page>
  );
}
