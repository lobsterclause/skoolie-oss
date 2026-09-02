import { describe, expect, it } from "vitest";
import { courseHue, HUES, studentHue } from "./colors.js";

describe("identity hues", () => {
  it("assigns students in fixed order and wraps", () => {
    expect([0, 1, 2, 3, 4, 5].map(studentHue)).toEqual(["orange", "purple", "teal", "pink", "cyan", "orange"]);
  });
  it("hashes courses deterministically onto the safe set", () => {
    expect(courseHue("math-6")).toBe(courseHue("math-6"));
    for (const id of ["math-6", "science-6", "ela-6", "social-studies-6", "band", "pe"]) expect(HUES).toContain(courseHue(id));
  });
  it("never uses a status hue", () => {
    expect(HUES).not.toContain("red");
    expect(HUES).not.toContain("green");
    expect(HUES).not.toContain("yellow");
    expect(HUES).not.toContain("blue");
  });
});
