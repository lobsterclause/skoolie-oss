/**
 * Identity colours. Categorical hues are assigned deterministically and never collide with status
 * colours: red / yellow / green are error / warning / success, blue is the accent, gray is neutral.
 */
export type Hue = "orange" | "purple" | "teal" | "pink" | "cyan";

export const HUES: readonly Hue[] = ["orange", "purple", "teal", "pink", "cyan"];

/** Students take hues in the family's fixed order, so a kid keeps their colour when another is added. */
export function studentHue(index: number): Hue {
  return HUES[((index % HUES.length) + HUES.length) % HUES.length]!;
}

/** Courses hash their stable id over the same five hues. */
export function courseHue(courseId: string): Hue {
  let h = 0;
  for (let i = 0; i < courseId.length; i++) h = (h * 31 + courseId.charCodeAt(i)) >>> 0;
  return HUES[h % HUES.length]!;
}

/** Inline style for an Avatar / dot using the theme's categorical tokens. */
export function hueStyle(hue: Hue): { backgroundColor: string; color: string } {
  return { backgroundColor: `var(--color-background-${hue})`, color: `var(--color-text-${hue})` };
}
