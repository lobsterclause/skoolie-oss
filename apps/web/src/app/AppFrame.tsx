import { useMemo, useState, type ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { useLocation, useMatch, useNavigate } from "react-router";
import { AppShell } from "@astryxdesign/core/AppShell";
import { useAppShellMobile } from "@astryxdesign/core/AppShell";
import { TopNav } from "@astryxdesign/core/TopNav";
import { SideNav, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Avatar } from "@astryxdesign/core/Avatar";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { useFamilyContext, type StudentWithHue } from "./context.js";
import { usePrefs } from "./prefs.js";
import { hueStyle } from "../lib/colors.js";
import { humanMinutes, summarizeRuns, type Health } from "../lib/freshness.js";
import { StudentSwitcher } from "./StudentSwitcher.js";
import { DEMO } from "../demo.js";
import { styles } from "../ui/styles.js";

const PRIMARY = [
  { key: "", label: "Home" },
  { key: "assignments", label: "Assignments" },
  { key: "grades", label: "Grades" },
  { key: "activity", label: "Activity", family: true },
  { key: "teachers", label: "Teachers" },
] as const;

/** Which student the shell is scoped to: the URL wins, then the last one used, then the first kid. */
export function useCurrentStudent(): StudentWithHue | null {
  const match = useMatch("/s/:studentId/*");
  const { students } = useFamilyContext();
  const [prefs] = usePrefs();
  return students.find((s) => s.id === match?.params.studentId) ?? students.find((s) => s.id === prefs.lastStudentId) ?? students[0] ?? null;
}

export function AppFrame({ children }: { children: ReactNode }) {
  const { runs, runsLoading, provider, user } = useFamilyContext();
  const student = useCurrentStudent();
  const base = student ? `/s/${student.id}` : "";
  const summary = useMemo(() => summarizeRuns(runs), [runs]);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const inTelegram = Boolean(window.Telegram?.WebApp?.initData);

  const banner = summary.reauth ? (
    <Banner
      status="error"
      container="section"
      collapsible={false}
      title="HAC sign-in expired"
      description="Sign in again on the collector to resume grade updates."
      endContent={<Button size="sm" label="Details" href="/status" />}
    />
  ) : summary.worst !== "good" && !runsLoading && summary.perAdapter.length > 0 ? (
    <Banner
      status="warning"
      container="section"
      title={summary.worst === "bad" ? "The last check failed" : "Updates are running late"}
      description={`Last successful check ${summary.latestAgeMinutes === null ? "unknown" : humanMinutes(summary.latestAgeMinutes) + " ago"}.`}
      endContent={<Button size="sm" label="Status" href="/status" />}
    />
  ) : undefined;

  const pill = student ? (
    <Button variant="ghost" xstyle={styles.pill} label={`${student.firstName}, switch student`} onClick={() => setSwitcherOpen(true)} tooltip="Switch student">
      <Avatar name={student.firstName} size="sm" style={hueStyle(student.hue)} tooltip={false} />
      <Text type="label" weight="bold" color="inherit">{student.firstName}</Text>
      <Icon icon="chevronDown" size="sm" />
    </Button>
  ) : (
    <Text type="label" weight="bold">skoolie</Text>
  );

  const fresh = <FreshnessChip health={summary.worst} age={summary.latestAgeMinutes} running={summary.running} loading={runsLoading} />;

  const sideNav = (
    <SideNav>
      {student && (
        <SideNavSection title={student.firstName}>
          <NavItem href={`${base}`} end label="Home" />
          <NavItem href={`${base}/assignments`} label="Assignments" />
          <NavItem href={`${base}/grades`} label="Grades" />
          <NavItem href={`${base}/attendance`} label="Attendance" />
          <NavItem href={`${base}/tests`} label="Test scores" />
          <NavItem href={`${base}/calendar`} label="Calendar" />
          <NavItem href={`${base}/teachers`} label="Teachers & contacts" />
          <NavItem href={`${base}/scan`} label="Scan & send" />
        </SideNavSection>
      )}
      <SideNavSection title="Family">
        <NavItem href="/?all" end label="Overview" />
        <NavItem href="/activity" label="Activity" />
        <NavItem href="/messages" label="Messages" />
        <NavItem href="/status" label="Status" />
        <NavItem href="/settings" label="Settings" />
        {!inTelegram && !DEMO && <SideNavItem label="Sign out" onClick={() => provider.signOut()} endContent={<Text type="supporting">{user?.email ?? ""}</Text>} />}
      </SideNavSection>
    </SideNav>
  );

  return (
    <AppShell
      height="auto"
      variant="surface"
      contentPadding={0}
      banner={banner}
      topNav={<TopNav label="Skoolie" heading={pill} endContent={fresh} />}
      sideNav={sideNav}
      style={student ? ({ "--student-accent": `var(--color-icon-${student.hue})` } as React.CSSProperties) : undefined}
    >
      <PrimaryTabs base={base} />
      {children}
      <StudentSwitcher isOpen={switcherOpen} onOpenChange={setSwitcherOpen} />
    </AppShell>
  );
}

function NavItem({ href, label, end }: { href: string; label: string; end?: boolean }) {
  const { pathname, search } = useLocation();
  // An href that carries a query (Overview is "/?all") must be matched against pathname + search.
  const current = href.includes("?") ? pathname + search : pathname;
  const selected = end ? current === href : current === href || pathname.startsWith(href + "/");
  return <SideNavItem href={href} label={label} isSelected={selected} />;
}

/** The five daily destinations, pinned under the compact bar on phones only. Desktop uses the SideNav. */
function PrimaryTabs({ base }: { base: string }) {
  const { isMobile } = useAppShellMobile();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  if (!isMobile) return null;
  const hrefFor = (t: (typeof PRIMARY)[number]) => ("family" in t && t.family ? `/${t.key}` : `${base}${t.key ? `/${t.key}` : ""}`);
  const current = PRIMARY.filter((t) => pathname === hrefFor(t) || (t.key && pathname.startsWith(hrefFor(t) + "/"))).map(hrefFor)[0] ?? "";
  return (
    <nav {...stylex.props(styles.tabs)} aria-label="Primary">
      <TabList value={current} onChange={(v) => navigate(v)} layout="fill" size="sm">
        {PRIMARY.map((t) => (
          <Tab key={t.key} value={hrefFor(t)} href={hrefFor(t)} label={t.label} />
        ))}
      </TabList>
    </nav>
  );
}

function FreshnessChip({ health, age, running, loading }: { health: Health; age: number | null; running: boolean; loading: boolean }) {
  if (loading) return null;
  const variant = health === "good" ? "success" : health === "stale" ? "warning" : "error";
  const label = running ? "Updating" : health === "bad" ? "Error" : health === "stale" ? `Stale · ${age === null ? "–" : humanMinutes(age)}` : `Fresh · ${age === null ? "–" : humanMinutes(age)}`;
  return (
    <Button variant="ghost" size="sm" href="/status" label={`Collector ${label}. Open status`} tooltip="Collector status">
      <HStack gap={1.5} vAlign="center">
        <StatusDot variant={variant} label={label} isPulsing={running} />
        <Text type="supporting" color="inherit">{label}</Text>
      </HStack>
    </Button>
  );
}
