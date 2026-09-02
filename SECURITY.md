# Security Policy

## Reporting a vulnerability

Please report security issues **privately**, not as a public issue.

Use GitHub's private vulnerability reporting: the **Security** tab → **Report a vulnerability**. That
opens a private thread with the maintainers.

Include what you'd need to reproduce it — but see the warning below before pasting anything.

You should get an acknowledgement within a week. This is a small, volunteer-maintained project, so
please be patient with fixes; we'll tell you what we intend to do and when.

## Do not include real student data in a report

Reports about this project tend to involve education records. **Do not paste, attach, or link:**

- HAC HTML dumps (anything from `--dump`)
- Firestore documents or exports from a real family
- Screenshots of a real dashboard
- Real names, student IDs, teacher addresses, or school names

Reproduce the issue with synthetic data and send that instead. A report we can't act on is better
than a child's records sitting in an issue tracker. If you genuinely cannot demonstrate the problem
without real data, say so in the report and we'll work out a safe way to look at it.

## Scope

In scope:

- Firestore security rules that let someone read or write a family's data when they shouldn't
  (`firebase/firestore.rules`)
- The auth and allowlist path in the web app — anything that gets a non-allowlisted account past the
  gate
- Credential handling in the collector: HAC passwords, service-account JSON, IMAP passwords, the
  Graph token cache, and anything that could log or persist them where it shouldn't
- Injection through untrusted input the collector parses — HAC HTML and school email — including
  content reaching the model classifier

Out of scope:

- Vulnerabilities in Firebase, PowerSchool's HAC, Microsoft Graph, or any other upstream service.
  Report those to their vendors.
- Findings that require an attacker to already have your service-account key, `.env`, or HAC
  credentials.
- Issues in a deployment's own configuration — a Firebase project left world-readable, `.env`
  committed to a fork, dumps served from a web root. The runbook covers how to avoid these; we're
  happy to improve those docs, and such reports are welcome as normal issues.

## Deploying it safely

If you self-host this, you own the data. The short list:

- Deploy `firebase/firestore.rules` before writing anything; `pnpm test:rules` proves they hold.
- Keep `.env`, `secrets/`, and the dump directory out of git — the shipped `.gitignore` already
  covers them.
- Keep the service-account JSON and the Graph token cache at mode 0600.
- Put only people who should see a child's records on the allowlist. Both the allowlist entry and the
  `members/<uid>` document are required, and the rules check both.
