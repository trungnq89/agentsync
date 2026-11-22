Tiếng Việt: [README.vi.md](README.vi.md)

# AgentSync

A self-hosted app for managers to follow their team's work progress, while each member's AI agent (Claude Code, Codex) syncs plans and progress automatically over MCP.

## Architecture

- One Next.js 16 (App Router) app + Postgres 16, run with Docker Compose.
- All business logic is plain functions in `src/server/` (taking `db, actor, input`); every permission check goes through `src/server/authz.ts`.
- The web UI (RSC + server actions, English and Vietnamese) and MCP (`POST /api/mcp`, Streamable HTTP, authenticated with `ags_...` tokens) are thin layers over it.
- Schema and migrations use Drizzle (`src/db/schema.ts`, `drizzle/`).
- The agent skill bundle lives in `plugins/agentsync` (Claude Code + Codex).

## Language & theme

- **Language:** the UI and MCP output support `en` and `vi`. Set the install-wide default with the `DEFAULT_LOCALE` environment variable (`en` or `vi`, default `en`). An invalid value falls back to `en` with a one-time warning. Each user can pick their own language in the UI, and that choice wins over the default. On the web the order is: the user's saved choice, then the `locale` cookie, then the browser's `Accept-Language`, then `DEFAULT_LOCALE`. For MCP it is the token owner's saved choice, then `DEFAULT_LOCALE`.
- **Theme:** `system` (follows the OS, default), `light` or `dark`. Each user picks one with the theme switcher; it is stored per user and applied on every device after sign-in. There is no install-wide theme setting.

## Run for development

```bash
cp .env.example .env          # edit DB_PORT and the DATABASE_URL* values if port 5432 is taken
pnpm install
docker compose up -d db       # Postgres (with two test DBs: agentsync_test, agentsync_e2e)
pnpm db:migrate
SEED_ADMIN_PASSWORD='a-password-longer-than-12-chars' pnpm seed:admin --username admin
pnpm dev                      # http://localhost:3000
```

Checks: `pnpm vitest run`, `pnpm playwright test`, `pnpm typecheck`, `pnpm lint`.

## Deploy (Docker Compose)

```bash
export POSTGRES_PASSWORD='change-this-password'        # letters, digits, - and _ only (it is spliced into DATABASE_URL)
export APP_URL='https://agentsync.example.com'         # public address, shown in the MCP setup snippet
export DEFAULT_LOCALE=en                               # optional: en | vi
docker compose -f docker-compose.prod.yml up -d --build
```

- The `app` container runs migrations on startup, then starts the server. The db port is not exposed; data lives in the `pgdata` volume.
- Required: `POSTGRES_PASSWORD`. Optional: `APP_URL`, `APP_PORT` (default 3000), `ALLOWED_ORIGINS`, `DEFAULT_LOCALE`, `SETTINGS_ENCRYPTION_KEY` (Odoo sync). No `SESSION_SECRET` is needed (sessions are random ids stored in the database).
- HTTPS is strongly recommended. The session cookie gets the `Secure` flag when `APP_URL` starts with `https://`. Set `COOKIE_SECURE=false` only for internal testing over plain HTTP (otherwise the browser drops the cookie and sign-in loops), or `COOKIE_SECURE=true` to force it on.
- No external services at runtime: no CDN, no analytics; the Inter font is bundled in the build.
- Behind a reverse proxy (nginx, Caddy, ...): terminate HTTPS at the proxy and forward to the app port. If the proxy changes the `Host` header relative to the browser's `Origin`, server actions are rejected; then set `ALLOWED_ORIGINS` (comma-separated hosts, for example `agentsync.example.com`). This variable is baked in at build time: after changing it, run `docker compose -f docker-compose.prod.yml up -d --build` again.
- The container runs as the non-root `node` user and has a healthcheck. If `app` keeps restarting, check the logs: `docker compose -f docker-compose.prod.yml logs app`.

## Create the first admin

```bash
docker compose -f docker-compose.prod.yml exec -e SEED_ADMIN_PASSWORD='a-password-longer-than-12-chars' app \
  sh -c 'cd /tools && node_modules/.bin/tsx scripts/seed-admin.ts --username admin'
```

If `SEED_ADMIN_PASSWORD` is not set, the script asks for the password on stdin. The `--password` flag still works but is discouraged (the password leaks into shell history and the process list).

Sign in to the web app with this account, open **Admin** to create users and assign managers, and have each person open **Settings** to create an agent token.

## Odoo HR sync

Admin > **Odoo** keeps AgentSync accounts and the org chart in step with the employees of Odoo HR. It only ever reads from Odoo.

**Set up**

1. Generate an encryption key for the stored API key and pass it to the app as an environment variable: `openssl rand -base64 32` (put it in `.env` as `SETTINGS_ENCRYPTION_KEY`, or export it before `docker compose -f docker-compose.prod.yml up -d`). Without it the Odoo page is locked. Keep it safe: if it is lost or changed, re-enter the API key.
2. In Odoo, create a dedicated user with read-only access to Employees, then create an API key for it (Preferences > Account Security > New API Key). **This user must have access to all companies** that should sync: Odoo only returns employees of the user's current company, so with a single company selected the other companies' employees are not synced.
3. In Admin > Odoo enter the Odoo address, database, login and API key, save, and press **Test connection** (it shows the number of employees found).
4. Existing accounts are matched to Odoo employees by work email: in Admin, fill in the email of every existing account first (an account with no email whose username is the work email is also matched). Then run a **Review** preview and apply what you accept. Only after that switch to Incremental or Full; Incremental refuses to run until at least one account is linked to Odoo, so it cannot create duplicates of existing people.

**Modes** (set under "Mode and schedule")

- **Review** (default): Preview, tick the changes you want, then Apply.
- **Full**: Preview, then Apply every change. This overwrites names, managers and levels of linked accounts with the Odoo values and disables accounts that are no longer active in Odoo. Admin accounts are never disabled and keep their admin role; local accounts that do not match anyone in Odoo are left alone.
- **Incremental**: only creates accounts for new employees, on a schedule of 1, 6 or 24 hours (or off), plus a **Run now** button. The scheduler runs inside the app server process (no cron job needed); it only runs while the app is up. It also links existing accounts to employees by email. A user who was disabled and is hired again in Odoo stays disabled: re-enable them manually.

**Accounts and passwords.** New accounts use the work email as username and get a 16-character temporary password. Passwords are shown once after you apply (copy or download as CSV); for scheduled runs they are kept encrypted under "Pending passwords" until you view them, then deleted. A user with a temporary password can sign in with their email, but is sent to Settings and must change the password before using anything else.

**Job titles.** Optionally map the Odoo job title to a level (first matching row wins, otherwise member). When mapping is off, new people are members and existing levels are kept.

## MCP smoke test

Run from a checkout on the host after `pnpm install`. The script creates a real task, so use a throwaway member account, not a real one.

```bash
AGENTSYNC_URL=http://localhost:3000 AGENTSYNC_TOKEN=ags_... pnpm smoke:mcp
```

It creates a new task (title with a timestamp), sends an update, reads feedback and lists tasks; it prints `SMOKE OK` on success and exits non-zero on any `isError`.

## Install for agents

See [docs/install-agent.md](docs/install-agent.md).
