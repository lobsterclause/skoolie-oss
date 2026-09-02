import { describe, expect, it } from "vitest";
import { localDate } from "./util.js";

describe("localDate", () => {
  it("gives the family's calendar day, not UTC's", () => {
    // 2026-08-28 23:30 in Chicago (CDT, UTC-5) is already 2026-08-29 in UTC.
    const lateEvening = new Date("2026-08-29T04:30:00Z");
    expect(localDate("America/Chicago", lateEvening)).toBe("2026-08-28");
    expect(localDate("UTC", lateEvening)).toBe("2026-08-29");
  });
});
