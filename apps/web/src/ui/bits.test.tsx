import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Dot, MailIcon } from "./bits.js";

// Proves the component-test harness itself: a DOM environment exists, React renders into it,
// and the StyleX plugin runs over .tsx under vitest (Dot's class comes from stylex.props).
describe("component test harness", () => {
  it("renders a DOM element and applies the stylex class", () => {
    const { container } = render(<Dot hue="teal" />);
    const dot = container.querySelector("span");
    expect(dot).not.toBeNull();
    expect(dot!.getAttribute("aria-hidden")).toBe("true");
    expect(dot!.className).not.toBe("");
    expect(dot!.style.background).toContain("--color-icon-teal");
  });

  it("renders an accessible-name-free decorative icon", () => {
    render(<MailIcon data-testid="mail" />);
    expect(screen.getByTestId("mail").tagName.toLowerCase()).toBe("svg");
  });
});
