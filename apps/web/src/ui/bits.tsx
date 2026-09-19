import { useEffect, useRef, useState, type ReactNode, type SVGProps } from "react";
import * as stylex from "@stylexjs/stylex";
import { Heading } from "@astryxdesign/core/Heading";
import { Section } from "@astryxdesign/core/Section";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { Banner } from "@astryxdesign/core/Banner";
import { useTheme } from "@astryxdesign/core/theme";
import type { GradeTone } from "../lib/buckets.js";
import { type Hue } from "../lib/colors.js";
import { styles } from "./styles.js";

/** Page wrapper: h1 + optional error banner + content, capped at 1100px on desktop. */
export function Page({ title, error, children, actions }: { title: string; error?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <VStack xstyle={styles.page} gap={0}>
      <Section padding={4} paddingBlockEnd={2}>
        <HStack hAlign="between" vAlign="center" gap={3}>
          <Heading level={1}>{title}</Heading>
          {actions}
        </HStack>
      </Section>
      {error && (
        <Section padding={4} paddingBlock={0}>
          <Banner status="error" title="Could not load data" description={error} collapsible={false} />
        </Section>
      )}
      {children}
    </VStack>
  );
}

/** A titled page region. `count` is plain supporting text, never a badge. */
export function Region({ title, count, children, action, padding = 0 }: { title: string; count?: number; children: ReactNode; action?: ReactNode; padding?: 0 | 4 }) {
  return (
    <Section padding={padding} paddingBlockEnd={4}>
      <HStack hAlign="between" vAlign="center" paddingInline={4} paddingBlock={2}>
        <HStack gap={2} vAlign="end">
          <Heading level={2}>{title}</Heading>
          {count !== undefined && count > 0 && (
            <Text type="supporting" xstyle={styles.num}>
              {count}
            </Text>
          )}
        </HStack>
        {action}
      </HStack>
      {children}
    </Section>
  );
}

/** Staggered row skeletons that match a List's rhythm. */
export function SkeletonRows({ rows = 5, height = 48 }: { rows?: number; height?: number }) {
  return (
    <VStack gap={2} paddingInline={4}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={height} index={i} />
      ))}
    </VStack>
  );
}

/** Course / student identity dot; identity comes with a label next to it, never from colour alone. */
export function Dot({ hue }: { hue: Hue }) {
  return <span {...stylex.props(styles.dot)} style={{ background: `var(--color-icon-${hue})` }} aria-hidden="true" />;
}

const TONE = { good: styles.toneGood, ok: styles.toneOk, warn: styles.toneWarn, bad: styles.toneBad } as const;

/** Tabular figures in a tone colour; the digits carry the meaning, colour just reinforces. */
export function Num({ tone, children, type = "body", weight = "normal" }: { tone?: GradeTone | "good" | "bad"; children: ReactNode; type?: "body" | "large" | "label" | "supporting"; weight?: "normal" | "bold" | "semibold" }) {
  return (
    <Text type={type} weight={weight} xstyle={[styles.num, tone ? TONE[tone] : null]} {...(tone ? { color: "inherit" as const } : {})}>
      {children}
    </Text>
  );
}

/**
 * A grade average that tweens from its previous value to the new one when a live snapshot changes it
 * (medium motion token; instant under reduced motion or on first paint), with the tone colour easing.
 */
export function ToneNumber({ tone, value, digits = 1, type = "body", weight = "bold" }: { tone: GradeTone; value: number; digits?: number; type?: "body" | "large" | "label"; weight?: "normal" | "bold" | "semibold" }) {
  const shown = useTween(value);
  return (
    <Text type={type} weight={weight} xstyle={[styles.num, styles.tween, TONE[tone]]} color="inherit">
      {shown.toFixed(digits)}
    </Text>
  );
}

/** Animate a number towards `target` over the theme's medium duration. First render is instant. */
export function useTween(target: number): number {
  const { token } = useTheme();
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      from.current = target;
      return;
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reduced ? 0 : parseInt(token("--duration-medium"), 10) || 400;
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (now: number) => {
      const t = duration === 0 ? 1 : Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(a + (target - a) * eased);
      if (t < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, token]);
  return shown;
}

/** Self-drawing check mark for the "all caught up" empty state. Decorative; the title carries the meaning. */
export function CheckMark() {
  return (
    <svg className="sk-check" viewBox="0 0 40 40" aria-hidden="true">
      <path className="sk-check-path" d="M8 21l8 8L32 12" />
    </svg>
  );
}

export const MailIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </svg>
);
export const CameraIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1" />
    <circle cx="12" cy="13" r="3.5" />
  </svg>
);
export const PhoneIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
  </svg>
);
