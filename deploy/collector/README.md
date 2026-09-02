# Deploying the collector

Runs the collector as a Docker container fired by a systemd timer. Any always-on Linux box works — a
home server, a small VPS, a Raspberry Pi. The job is tiny: one HTTP session every few hours.

Layout on the box (replace `<user>` with the account that owns it; dirs 0750, files 0600):

```
/opt/skoolie/
  repo/                      # git clone of this repo (pull to upgrade)
  .env                       # from services/collector/.env.example
  secrets/firebase-sa.json   # Firebase service account (Firestore write)
  profile/                   # persistent browser profile + Graph token cache
  dumps/                     # raw HTML from --dump (debugging; contains student PII, never sync)
  collector.lock
```

## One-time setup

```bash
sudo mkdir -p /opt/skoolie/{secrets,profile,dumps}
sudo chown -R <user>:<user> /opt/skoolie && chmod 0750 /opt/skoolie
git clone <repo> /opt/skoolie/repo

cp /opt/skoolie/repo/services/collector/.env.example /opt/skoolie/.env
chmod 0600 /opt/skoolie/.env      # then fill it in
# copy the service-account JSON to /opt/skoolie/secrets/firebase-sa.json (0600)

cd /opt/skoolie/repo/deploy/collector
docker compose build
docker compose run --rm collector --adapter hac --dry-run    # prints normalized JSON, writes nothing
```

Then install the timer. As a **system** unit:

The shipped unit carries `User=REPLACE_WITH_YOUR_USER`, so substitute your own account as you install
it — copying it verbatim gets you `217/USER` on the first fire:

```bash
sed "s/^User=.*/User=$USER/" skoolie-collector.service | sudo tee /etc/systemd/system/skoolie-collector.service >/dev/null
sudo cp skoolie-collector.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now skoolie-collector.timer
systemctl list-timers skoolie-collector.timer
```

## Optional adapters

The teacher-link harvester and the inbox adapter need mail credentials in `/opt/skoolie/.env` — see
`services/collector/.env.example` and the "Reading school mail" section of `docs/runbook.md`. Both
are installed here as **user** units, so they need no sudo:

```bash
loginctl enable-linger <user>      # keeps user timers running after logout
mkdir -p ~/.config/systemd/user

# A user instance cannot see system units, so strip the system-only dependencies. Without this the
# timer fails on its first fire with "Unit docker.service not found" / Result: resources.
sed -e '/^User=/d' -e '/docker\.service/d' -e '/network-online/d' skoolie-links.service > ~/.config/systemd/user/skoolie-links.service
cp skoolie-links.timer ~/.config/systemd/user/
systemctl --user daemon-reload && systemctl --user enable --now skoolie-links.timer
docker compose run --rm collector --adapter links --dry-run   # prints what it would add, writes nothing

# Inbox adapter (school mail → families/<id>/messages). Same Graph sign-in as links.
sed -e '/^User=/d' -e '/docker\.service/d' -e '/network-online/d' skoolie-inbox.service > ~/.config/systemd/user/skoolie-inbox.service
cp skoolie-inbox.timer ~/.config/systemd/user/
systemctl --user daemon-reload && systemctl --user enable --now skoolie-inbox.timer
docker compose run --rm collector --adapter outlook --dry-run --limit 3
```

## Operating it

- **Upgrade:** `cd /opt/skoolie/repo && git pull && cd deploy/collector && docker compose build`
- **Logs:** `journalctl -u skoolie-collector.service -n 100` (add `--user` for the user units).
- Every run also writes `families/<id>/runs/<runId>` to Firestore; the dashboard turns a source red
  when its last run is older than twice the interval.
- Keep the `mem_limit` / `cpus` caps in `compose.yml` if the box has other work on it.
