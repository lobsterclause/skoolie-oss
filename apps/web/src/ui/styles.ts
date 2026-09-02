import * as stylex from "@stylexjs/stylex";

/**
 * App-level StyleX styles, compiled by @stylexjs/unplugin. These are the few layout rules Astryx
 * components cannot express through props; everything references theme tokens, never raw values.
 * Spread `stylex.props(styles.x)` onto a component (every Astryx component accepts className/style)
 * or pass the style object to `xstyle`.
 */
export const styles = stylex.create({
  /** Primary phone navigation: pinned directly under the compact top bar. */
  tabs: {
    position: "sticky",
    top: 0,
    zIndex: 2,
    backgroundColor: "var(--color-background-surface)",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--color-border)",
    paddingInlineStart: "env(safe-area-inset-left)",
    paddingInlineEnd: "env(safe-area-inset-right)",
  },
  page: {
    maxWidth: 1100,
    marginInline: "auto",
    paddingBottom: "calc(var(--spacing-8) + env(safe-area-inset-bottom))",
  },
  /** Identity pill in the top bar — a ghost Button carrying an Avatar; the caret is the menu affordance. */
  pill: { display: "inline-flex", alignItems: "center", gap: "var(--spacing-2)", minHeight: 44 },
  /** Grade numbers and score columns line up. */
  num: { fontVariantNumeric: "tabular-nums" },
  /** Tone colours are only ever paired with the number or a label, never alone. */
  toneGood: { color: "var(--color-success)" },
  toneOk: { color: "var(--color-text-primary)" },
  toneWarn: { color: "var(--color-warning)" },
  toneBad: { color: "var(--color-error)" },
  /** Colour eases when a grade crosses a tone threshold; the value itself is tweened by useTween. */
  tween: { transitionProperty: "color", transitionDuration: "var(--duration-medium)", transitionTimingFunction: "var(--ease-standard, ease)" },
  /** Course / student identity dot; identity always comes with a label next to it. */
  dot: { display: "inline-block", width: 10, height: 10, borderRadius: "var(--radius-full)", flexShrink: 0 },
});
