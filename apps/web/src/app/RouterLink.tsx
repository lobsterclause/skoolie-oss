import { forwardRef, type AnchorHTMLAttributes } from "react";
import { Link } from "react-router";

/** Schemes a plain anchor may carry. Anything else with a scheme (javascript:, data:, vbscript:…) is refused. */
const SAFE_EXTERNAL = /^(?:https?:|mailto:|tel:|\/\/)/i;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const HTTP = /^(?:https?:|\/\/)/i;

/**
 * Normalize an href the way the URL parser will before it looks at the scheme: ASCII tab/newline are
 * removed anywhere ("java\nscript:" is javascript:), then leading C0 controls and spaces are stripped.
 * Every decision AND the rendered destination use this form, never the raw string.
 */
export function normalizeHref(href: string): string {
  return href.replace(/[\t\n\r]/g, "").replace(/^[\u0000-\u0020]+/, "");
}

/** True when `href` may be rendered as a link at all. Exported for tests. */
export function isSafeHref(href: string): boolean {
  const h = normalizeHref(href);
  return !HAS_SCHEME.test(h) || SAFE_EXTERNAL.test(h);
}

/**
 * The one link component every Astryx `href` renders through (via LinkProvider): in-app paths go
 * through react-router; http(s), mailto: and tel: are plain anchors. Hrefs come from Firestore data
 * (harvested teacher links, attachments, event URLs), so unknown schemes render without an href.
 */
export const RouterLink = forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement>>(function RouterLink({ href, rel, ...rest }, ref) {
  if (!href) return <a ref={ref} {...rest} />;
  const h = normalizeHref(href);
  if (!isSafeHref(h)) return <a ref={ref} {...rest} aria-disabled="true" />;
  if (SAFE_EXTERNAL.test(h)) return <a ref={ref} href={h} rel={HTTP.test(h) ? (rel ?? "noopener noreferrer") : rel} {...rest} />;
  return <Link ref={ref} to={h} {...(rel ? { rel } : {})} {...rest} />;
});
