import type { ReactNode } from "react";
import { BottomSheet } from "@astryxdesign/core/BottomSheet";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { useAppShellMobile } from "@astryxdesign/core/AppShell";
import { Heading } from "@astryxdesign/core/Heading";
import { VStack } from "@astryxdesign/core/VStack";

/**
 * One detail surface for both form factors: a BottomSheet on phones (swipe to dismiss), a Dialog on
 * desktop. Deep-linkable screens keep their URL while it is open.
 */
export function Sheet({
  isOpen,
  onOpenChange,
  label,
  title,
  height = "capped",
  purpose = "info",
  snapPoints,
  width = 480,
  children,
}: {
  isOpen: boolean;
  onOpenChange: (o: boolean) => void;
  label: string;
  title?: string;
  height?: "hug" | "capped" | "tall";
  purpose?: "info" | "form";
  snapPoints?: ReadonlyArray<number>;
  width?: number;
  children: ReactNode;
}) {
  const { isMobile } = useAppShellMobile();
  if (isMobile) {
    return (
      <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange} label={label} height={height} purpose={purpose} {...(snapPoints ? { snapPoints } : {})}>
        <VStack gap={3} paddingInline={4} paddingBlockStart={3} paddingBlockEnd={6}>
          {title && <Heading level={2}>{title}</Heading>}
          {children}
        </VStack>
      </BottomSheet>
    );
  }
  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} width={width} purpose={purpose}>
      <DialogHeader title={title ?? label} onOpenChange={onOpenChange} />
      <VStack gap={3} padding={4}>
        {children}
      </VStack>
    </Dialog>
  );
}
