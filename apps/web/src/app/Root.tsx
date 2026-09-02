import { useEffect, useMemo, type ReactNode } from "react";
import { Outlet } from "react-router";
import { Theme } from "@astryxdesign/core/theme";
import { LinkProvider } from "@astryxdesign/core/Link";
import { skoolieTheme } from "../skoolie.js";
import { RouterLink } from "./RouterLink.js";
import { FamilyProvider, useFamilyContext } from "./context.js";
import { useMemberPrefsSync, usePrefs } from "./prefs.js";
import { Gate } from "./Gate.js";
import { AppFrame } from "./AppFrame.js";

/** Family data + prefs + theme + router link + auth gate + shell. Every route renders inside this. */
export function Root() {
  return (
    <FamilyProvider>
      <Themed>
        <LinkProvider component={RouterLink}>
          <Gate>
            <AppFrame>
              <Outlet />
            </AppFrame>
          </Gate>
        </LinkProvider>
      </Themed>
    </FamilyProvider>
  );
}

/** Colour mode: Telegram's scheme when running as a Mini App, else Member.prefs.theme (cached locally). */
function Themed({ children }: { children: ReactNode }) {
  const { user, member } = useFamilyContext();
  useMemberPrefsSync(user?.uid ?? null, member.data);
  const [prefs] = usePrefs();
  const tg = typeof window !== "undefined" ? window.Telegram?.WebApp : undefined;
  const mode = useMemo(() => (tg?.initData ? tg.colorScheme : prefs.mode), [tg, prefs.mode]);
  useEffect(() => {
    if (tg?.initData) {
      tg.ready();
      tg.expand();
    }
  }, [tg]);
  return (
    <Theme theme={skoolieTheme} mode={mode}>
      {children}
    </Theme>
  );
}
