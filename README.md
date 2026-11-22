Tiếng Việt: [README.vi.md](README.vi.md)

# AgentSync

Stop asking "how's it going?". AgentSync is a self-hosted app where managers follow their team's work on one board, while each member's AI agent (Claude Code, Codex, Antigravity) writes the plan, reports progress at every checkpoint and asks for help over MCP. It is not a to-do list or a kanban board: people keep working in their agent, and the status comes from the agent's own reports.

![Manager home: attention list and team tiers](docs/screenshots/en/home-manager-light.png)

<table>
  <tr>
    <td><img src="docs/screenshots/en/task-detail-project.png" alt="Task awaiting review with the solution summary"><br><sub>A finished code task awaiting review, with the agent's solution summary.</sub></td>
    <td><img src="docs/screenshots/en/person-timeline.png" alt="Person timeline"><br><sub>One person's timeline: progress and health per task.</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/en/home-dark.png" alt="Dark mode"><br><sub>Dark mode (light, dark or follow the system, per user).</sub></td>
    <td><img src="docs/screenshots/en/mobile-home.png" alt="Mobile home" width="280"><br><sub>Works on a phone.</sub></td>
  </tr>
  <tr>
    <td colspan="2"><img src="docs/screenshots/en/admin-odoo.png" alt="Odoo HR sync settings"><br><sub>Optional Odoo HR sync keeps accounts and the org chart up to date.</sub></td>
  </tr>
</table>

Screenshots show generated demo data (see [Try it with demo data](#try-it-with-demo-data)).

## Features

- **Manager board:** people grouped by level, a "needs your attention" list (pending confirmation, awaiting review, blocked, overdue, not updated for a while) and a per-person timeline.
- **Plans written by agents, confirmed by managers:** the member's agent drafts the plan; the direct manager confirms it or asks for changes. Later plan changes are kept as revisions.
- **Checkpoint Stop hook:** after each agent turn, a hook nudges the agent to report finished steps. Works with Claude Code, Codex and Antigravity.
- **MCP for members and managers:** members' agents sync plans, progress and questions; managers' agents can read the board and give feedback.
- **Solution review for code tasks:** finishing a project task sends a solution summary (problem, solution, alternatives, risks, testing, PR link) to the manager for review.
- **Direct-manager permissions and private tasks:** only a person's direct manager sees their tasks; a task can be private to its owner.
- **Vietnamese and English, light and dark:** each user picks their own.
- **Odoo HR sync (optional):** read-only sync of accounts and the org chart from Odoo HR.
- **Self-hosted with Docker:** one app plus Postgres; no external services at runtime.

## Quick start (Docker)

1. Clone the repository and enter it.
2. Create your environment file and fill it in:

   ```bash
   cp .env.example .env
   ```

   Set at least these values in `.env` (the development entries in the file can stay as they are):

   - `POSTGRES_PASSWORD`: letters, digits, `-` and `_` only (it is spliced into the database URL).
   - `APP_URL`: the public address, for example `https://agentsync.example.com` (shown in the MCP setup snippet).
   - `SETTINGS_ENCRYPTION_KEY`: generate with `openssl rand -base64 32` (needed for Odoo sync; keep it safe).
   - `DEFAULT_LOCALE`: `en` or `vi`.
   - `COOKIE_SECURE`: leave unset when `APP_URL` is `https://`. For internal testing over plain `http://`, set `COOKIE_SECURE=false`, otherwise the browser drops the cookie and sign-in loops.

3. Start the stack:

   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   ```

4. Create the first admin (see [Create the first admin](#create-the-first-admin)).
5. Open the app (http://localhost:3000, or your `APP_URL`), sign in, and in **Admin** create users and assign each person's manager.
6. Each person opens **Settings** and creates an agent token.
7. Install the agent plugin and connect your agent: [docs/install-agent.md](docs/install-agent.md).

## Try it with demo data

You can explore a populated board without touching a real database. The seed script refuses to wipe any database whose name does not contain `demo`.

```bash
cp .env.example .env
docker compose up -d db                                    # development Postgres (port DB_PORT, default 5432)
docker compose exec db createdb -U agentsync agentsync_demo
pnpm install
export DATABASE_URL=postgres://agentsync:agentsync@localhost:5432/agentsync_demo   # use your DB_PORT
pnpm db:migrate
pnpm seed:demo --lang en --reset                           # or --lang vi
pnpm dev                                                   # http://localhost:3000
```

Sign in as `linh.tran` (a manager) or `quan.nguyen` (director and admin) with the shared demo password `demo-password-123`. This password is for demo data only. The README screenshots are produced from this data with `pnpm screenshots --lang en|vi` while the app runs on port 3200.

## Connect your agents

Each user creates an agent token in **Settings** and installs the plugin from `plugins/agentsync` (skills, MCP configuration and the checkpoint hook). Step-by-step instructions for Claude Code, Codex and Antigravity: [docs/install-agent.md](docs/install-agent.md) ([Tiếng Việt](docs/install-agent.vi.md)).

## Checkpoint hook

An optional `Stop` hook runs after every agent turn. When the agent printed `AGENTSYNC-CHECKPOINT: <step title>` for a step AgentSync does not yet show as done, the hook asks it to send the progress update (your send mode still applies: in `review` mode you see the draft first). It is a safety net on top of the skills, which already tell the agent to report each step. Details: section 5 of [docs/install-agent.md](docs/install-agent.md).

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

## Language & theme

- **Language:** the UI and MCP output support `en` and `vi`. Set the install-wide default with the `DEFAULT_LOCALE` environment variable (`en` or `vi`, default `en`). An invalid value falls back to `en` with a one-time warning. Each user can pick their own language in the UI, and that choice wins over the default. On the web the order is: the user's saved choice, then the `locale` cookie, then the browser's `Accept-Language`, then `DEFAULT_LOCALE`. For MCP it is the token owner's saved choice, then `DEFAULT_LOCALE`.
- **Theme:** `system` (follows the OS, default), `light` or `dark`. Each user picks one with the theme switcher; it is stored per user and applied on every device after sign-in. There is no install-wide theme setting.

## Configuration reference

| Variable | Used by | Description |
| --- | --- | --- |
| `DATABASE_URL` | app, scripts | Postgres connection string. In `docker-compose.prod.yml` it is built from `POSTGRES_PASSWORD`; in development it comes from `.env`. |
| `POSTGRES_PASSWORD` | production compose | Required. Password of the bundled Postgres (letters, digits, `-`, `_`). |
| `APP_URL` | app | Public base URL; shown in the MCP snippet and decides the default cookie `Secure` flag. Default `http://localhost:3000`. |
| `APP_PORT` | production compose | Host port of the app. Default `3000`. |
| `DEFAULT_LOCALE` | app, MCP | Install-wide default language: `en` or `vi` (default `en`). |
| `COOKIE_SECURE` | app | `true` or `false`. Default: on when `APP_URL` starts with `https://`. |
| `ALLOWED_ORIGINS` | build time | Comma-separated hosts allowed to call Server Actions behind a proxy that changes `Host`. Rebuild after changing it. |
| `SETTINGS_ENCRYPTION_KEY` | app | 32 bytes, base64. Encrypts the stored Odoo API key. Without it the Odoo page is locked. |
| `DB_PORT` | development compose | Host port of the development Postgres. Default `5432`. |

## Create the first admin

```bash
docker compose -f docker-compose.prod.yml exec -e SEED_ADMIN_PASSWORD='a-password-longer-than-12-chars' app \
  sh -c 'cd /tools && node_modules/.bin/tsx scripts/seed-admin.ts --username admin'
```

If `SEED_ADMIN_PASSWORD` is not set, the script asks for the password on stdin. The `--password` flag still works but is discouraged (the password leaks into shell history and the process list).

Sign in to the web app with this account, open **Admin** to create users and assign managers, and have each person open **Settings** to create an agent token.

## Development

```bash
cp .env.example .env          # edit DB_PORT and the DATABASE_URL* values if port 5432 is taken
pnpm install
docker compose up -d db       # Postgres (with two test DBs: agentsync_test, agentsync_e2e)
pnpm db:migrate
SEED_ADMIN_PASSWORD='a-password-longer-than-12-chars' pnpm seed:admin --username admin
pnpm dev                      # http://localhost:3000
```

Checks: `pnpm test` (vitest), `pnpm e2e` (Playwright), `pnpm typecheck`, `pnpm lint`.

MCP smoke test (creates a real task, so use a throwaway member account):

```bash
AGENTSYNC_URL=http://localhost:3000 AGENTSYNC_TOKEN=ags_... pnpm smoke:mcp
```

It prints `SMOKE OK` on success and exits non-zero on any error.

## Architecture

- One Next.js 16 (App Router) app + Postgres 16, run with Docker Compose.
- All business logic is plain functions in `src/server/` (taking `db, actor, input`); every permission check goes through `src/server/authz.ts`.
- The web UI (RSC + server actions, English and Vietnamese) and MCP (`POST /api/mcp`, Streamable HTTP, authenticated with `ags_...` tokens) are thin layers over it.
- Schema and migrations use Drizzle (`src/db/schema.ts`, `drizzle/`).
- The agent skill bundle lives in `plugins/agentsync` (Claude Code + Codex).

## Security notes

- Use HTTPS in production (a reverse proxy such as nginx or Caddy is fine). The session cookie gets the `Secure` flag when `APP_URL` starts with `https://`.
- Behind a proxy that rewrites `Host`, set `ALLOWED_ORIGINS` (build time).
- Never commit `.env` (it is git-ignored). Agent tokens (`ags_...`) are shown once; never paste them into chats or commit them.
- Keep `SETTINGS_ENCRYPTION_KEY` secret and backed up: without it the stored Odoo API key cannot be read.
- The container runs as the non-root `node` user. The database port is not published in the production compose file.

## License

MIT — see [LICENSE](LICENSE).
