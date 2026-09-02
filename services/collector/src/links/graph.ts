/**
 * Microsoft Graph mailbox source for the link harvester (Microsoft 365 / Outlook: password IMAP is disabled there).
 * Auth: public-client device-code flow once (`--graph-login`), refresh token cached on disk, delegated `Mail.Read` only.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { PublicClientApplication, type ICachePlugin, type TokenCacheContext } from "@azure/msal-node";
import type { EmailMessage } from "./extract.js";

export interface GraphConfig {
  clientId: string;
  /** Tenant id, or "organizations" / "common". */
  tenantId: string;
  cachePath: string;
  days: number;
  fromDomains: string[];
  /** Exact addresses to accept besides the domains (e.g. a parent who forwards teacher mail). */
  fromAddresses?: string[];
  seenIds?: ReadonlySet<string>;
  log?: (m: string) => void;
}

export interface GraphMessage extends EmailMessage {
  id: string;
}

const SCOPES = ["Mail.Read", "User.Read", "offline_access"];

function fileCache(path: string): ICachePlugin {
  return {
    async beforeCacheAccess(ctx: TokenCacheContext) {
      try {
        ctx.tokenCache.deserialize(await readFile(path, "utf8"));
      } catch {
        /* first run */
      }
    },
    async afterCacheAccess(ctx: TokenCacheContext) {
      if (!ctx.cacheHasChanged) return;
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, ctx.tokenCache.serialize(), { mode: 0o600 });
    },
  };
}

function app(cfg: GraphConfig): PublicClientApplication {
  return new PublicClientApplication({
    auth: { clientId: cfg.clientId, authority: `https://login.microsoftonline.com/${cfg.tenantId}` },
    cache: { cachePlugin: fileCache(cfg.cachePath) },
  });
}

/** Interactive one-time sign-in: prints the device code, waits, caches the refresh token. */
export async function graphLogin(cfg: GraphConfig): Promise<string> {
  const pca = app(cfg);
  const r = await pca.acquireTokenByDeviceCode({
    scopes: SCOPES,
    deviceCodeCallback: (info) => console.log(`\n${info.message}\n`),
  });
  if (!r?.account) throw new Error("device code sign-in returned no account");
  return r.account.username;
}

/** Silent token from the cache; throws with a clear hint when `--graph-login` is needed. */
export async function graphToken(cfg: GraphConfig): Promise<string> {
  const pca = app(cfg);
  const accounts = await pca.getTokenCache().getAllAccounts();
  const account = accounts[0];
  if (!account) throw new Error(`no cached Microsoft account in ${cfg.cachePath}; run: --adapter links --graph-login`);
  try {
    const r = await pca.acquireTokenSilent({ account, scopes: SCOPES });
    return r.accessToken;
  } catch (e) {
    throw new Error(`Microsoft token refresh failed (${(e as Error).message}); run: --adapter links --graph-login`);
  }
}

interface GraphMail {
  id: string;
  subject?: string;
  receivedDateTime: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  body?: { contentType?: string; content?: string };
}

/** Recent mail from the school domains. Client-side sender filter: Graph's $filter can't do "contains" on from. */
export async function fetchSchoolMailGraph(cfg: GraphConfig, fetchImpl: typeof fetch = fetch, tokenOverride?: string): Promise<GraphMessage[]> {
  const log = cfg.log ?? (() => {});
  const token = tokenOverride ?? (await graphToken(cfg));
  const since = new Date(Date.now() - cfg.days * 86_400_000).toISOString();
  const domains = cfg.fromDomains.map((d) => d.toLowerCase());
  const addresses = new Set((cfg.fromAddresses ?? []).map((a) => a.toLowerCase()));
  let url: string | undefined =
    `https://graph.microsoft.com/v1.0/me/messages?$filter=receivedDateTime ge ${since}&$orderby=receivedDateTime desc&$top=50` +
    `&$select=id,subject,receivedDateTime,from,body`;
  const out: GraphMessage[] = [];
  let scanned = 0;
  while (url) {
    // IdType=ImmutableId: default Graph ids change when a message moves folders, which would defeat the
    // per-message dedup in the link harvester and the inbox adapter.
    const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.body-content-type="html", IdType="ImmutableId"' } });
    if (!res.ok) throw new Error(`graph ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const page = (await res.json()) as { value: GraphMail[]; "@odata.nextLink"?: string };
    for (const m of page.value) {
      scanned++;
      const addr = (m.from?.emailAddress?.address ?? "").toLowerCase();
      if (!addresses.has(addr) && !domains.some((d) => addr.endsWith(`@${d}`) || addr.endsWith(`.${d}`))) continue;
      if (cfg.seenIds?.has(m.id)) continue;
      const from = m.from?.emailAddress?.name ? `${m.from.emailAddress.name} <${addr}>` : addr;
      const body = m.body?.content ?? "";
      out.push({
        id: m.id,
        from,
        subject: m.subject ?? "",
        date: m.receivedDateTime,
        ...(m.body?.contentType?.toLowerCase() === "html" ? { html: body } : { text: body }),
      });
    }
    url = page["@odata.nextLink"];
  }
  log(`graph: scanned ${scanned} messages since ${since.slice(0, 10)}, ${out.length} new from ${domains.join(",")}`);
  return out;
}
