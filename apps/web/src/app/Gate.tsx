import { useState, type ReactNode } from "react";
import { AppShell } from "@astryxdesign/core/AppShell";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { Center } from "@astryxdesign/core/Center";
import { useFamilyContext } from "./context.js";

/** Signed-out, not-allow-listed and still-resolving states. Everything else falls through to the shell. */
export function Gate({ children }: { children: ReactNode }) {
  const { user, member, provider } = useFamilyContext();
  const [err, setErr] = useState<string | null>(null);

  if (user === undefined) {
    return (
      <Wash>
        <VStack gap={3} width={320}>
          <Skeleton height={28} width="60%" index={0} />
          <Skeleton height={18} index={1} />
          <Skeleton height={18} width="80%" index={2} />
        </VStack>
      </Wash>
    );
  }

  if (!user) {
    return (
      <Wash>
        <VStack gap={4} hAlign="center" maxWidth={420}>
          {err && <Banner status="error" title="Sign-in failed" description={err} isDismissable onDismiss={() => setErr(null)} />}
          <Heading level={1}>skoolie</Heading>
          <EmptyState
            title="Your family's school dashboard"
            description="Grades, homework, attendance and teacher contacts for every kid, in one place."
            actions={
              <Button
                variant="primary"
                size="lg"
                label={provider.kind === "telegram" ? "Continue with Telegram" : "Continue with Google"}
                clickAction={() => provider.signIn().then(() => undefined).catch((e: unknown) => setErr(String(e)))}
              />
            }
          />
        </VStack>
      </Wash>
    );
  }

  // The rules deny reading /members/{uid} to anyone outside the allowlist, so "permission denied"
  // IS the not-on-the-list case — only other errors are real load failures.
  if (member.error && !/permission|insufficient/i.test(member.error)) {
    return (
      <Wash>
        <VStack gap={4} maxWidth={480}>
          <Banner status="error" title="Could not load your family" description={member.error} collapsible={false} />
          <Button label="Sign out" onClick={() => provider.signOut()} />
        </VStack>
      </Wash>
    );
  }

  if (!member.loading && (!member.data || member.error)) {
    return (
      <Wash>
        <VStack gap={4} hAlign="center" maxWidth={420}>
          <Heading level={1}>skoolie</Heading>
          <EmptyState
            title="This account isn't on the family list"
            description={`You're signed in as ${user.email ?? "an unknown account"}. Ask the family admin to add you, then sign in again.`}
            actions={<Button label="Sign out" onClick={() => provider.signOut()} />}
          />
          <Text type="supporting">Access is granted per family; there is nothing to request here.</Text>
        </VStack>
      </Wash>
    );
  }

  return <>{children}</>;
}

function Wash({ children }: { children: ReactNode }) {
  return (
    <AppShell variant="wash" height="fill" contentPadding={6}>
      <Center height="100%">{children}</Center>
    </AppShell>
  );
}
