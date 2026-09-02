import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Section } from "@astryxdesign/core/Section";
import { Page } from "../ui/bits.js";

export function NotFound() {
  return (
    <Page title="Not found">
      <Section padding={4}>
        <EmptyState title="That page doesn't exist" description="The link may be from an older version of the app." actions={<Button label="Go home" href="/" variant="primary" />} />
      </Section>
    </Page>
  );
}
