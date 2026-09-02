import { DEFAULT_SCHOOL_TZ, isValidTimeZone, localDate } from "@skoolie/shared";

/**
 * The school's timezone, and the one definition of "what day is it there".
 *
 * Attendance and "due today" are calendar-day questions about the school, not about whoever is
 * holding the phone: a parent checking from another zone, or late at night, must see the same day
 * the gradebook does. Every date bucket in the app goes through `schoolLocalDate`, so `buckets.ts`,
 * `changes.ts` and `attendance.ts` cannot drift apart.
 *
 * The zone itself, its default, and the validity rule live in `@skoolie/shared` alongside the
 * collector's `SKOOLIE_TZ`, so the two halves agree by construction. What differs is the *policy*:
 * the collector refuses to start on a bad zone, while here a typo warns and degrades — blanking a
 * parent's dashboard over a config typo is the worse failure.
 */
function resolveSchoolTz(): string {
  const tz = (import.meta.env.VITE_SKOOLIE_TZ as string | undefined)?.trim();
  if (!tz) return DEFAULT_SCHOOL_TZ;
  if (!isValidTimeZone(tz)) {
    console.warn(`VITE_SKOOLIE_TZ="${tz}" is not a valid IANA timezone — falling back to ${DEFAULT_SCHOOL_TZ}`);
    return DEFAULT_SCHOOL_TZ;
  }
  return tz;
}

export const SCHOOL_TZ = resolveSchoolTz();

/**
 * Today's calendar date at the school, as yyyy-mm-dd.
 *
 * Note the deliberate argument swap: this takes `(now, tz)` because callers almost always want the
 * school's own zone and pass nothing, while the shared `localDate(tz, now)` requires the zone.
 */
export function schoolLocalDate(now = new Date(), tz = SCHOOL_TZ): string {
  return localDate(tz, now);
}

export { isValidTimeZone };
