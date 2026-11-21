Tiếng Việt: [install-agent.vi.md](install-agent.vi.md)

# Install AgentSync for your agent

Takes about 5 minutes. You need: your company's AgentSync address (for example `https://agentsync.example.com`) and an account you can sign in with.

## 0. Get the plugin folder

The `plugins/agentsync` folder is part of the AgentSync source. Ask your admin for the download link: `<LINK_FROM_YOUR_ADMIN>`. Two ways:

- Clone: `git clone <LINK_FROM_YOUR_ADMIN> ~/agentsync`; the plugin folder is `~/agentsync/plugins/agentsync`.
- Or download the zip from the link and unpack it into `~/agentsync`.

The examples below assume the plugin is at `/Users/your-name/agentsync/plugins/agentsync` (macOS). Replace `your-name` with your account name (run `echo $HOME` to see it) and use the full absolute path.

## 1. Get a token

1. Sign in to AgentSync and open the **Settings** page. You can also pick your language (en/vi) and theme (system/light/dark) there.
2. Create a new agent token. It looks like `ags_...` and is shown only once: copy it right away.
3. Add two lines to `~/.zshrc`, then open a new terminal:

```bash
export AGENTSYNC_URL="https://agentsync.example.com"   # no trailing /
export AGENTSYNC_TOKEN="ags_..."
```

Never paste the token into a chat or commit it to a repo.

Note: variables in `~/.zshrc` only apply to programs started from a terminal. Desktop apps opened by clicking their icon (Claude Desktop, the Codex app) will NOT see them. Workarounds: open the app from a terminal (for example `open -a "Claude"` after the `export`), or use the CLI (`claude`, `codex`) in a terminal. Setting the variables permanently for desktop apps has not been verified; ask your admin if you need it.

## 2. Claude Code

Main way: load the plugin with `--plugin-dir` (absolute path) every time you start from a terminal, so the environment variables are present:

```bash
claude --plugin-dir /Users/your-name/agentsync/plugins/agentsync
```

Check: type `/mcp` and confirm the AgentSync server is connected. Its name may show as `agentsync` or `plugin:agentsync:agentsync`.

Alternative (not manually verified): skip `--plugin-dir`, copy each skill into your personal skills folder and add the MCP server with a command:

```bash
mkdir -p ~/.claude/skills
cp -R /Users/your-name/agentsync/plugins/agentsync/skills/* ~/.claude/skills/
claude mcp add --transport http agentsync https://agentsync.example.com/api/mcp --header "Authorization: Bearer $AGENTSYNC_TOKEN"
```

## 3. Codex

See `plugins/agentsync/codex/README.md`. In short: copy `/Users/your-name/agentsync/plugins/agentsync/skills/*` into `~/.agents/skills/` and add this to `~/.codex/config.toml`:

```toml
[mcp_servers.agentsync]
url = "https://agentsync.example.com/api/mcp"
bearer_token_env_var = "AGENTSYNC_TOKEN"
```

## 4. Use it

- After a discussion with your manager, say "make a plan for adding API X, due Friday". The task appears as "Pending confirmation" on your manager's web page.
- At the start of a session, the agent reminds you of pending feedback and recognizes the task you are working on.
- At the end of a session, say "done"; the agent summarizes and sends an update.
- The agent always replies in the language you use. What it reads from AgentSync follows the language chosen in Settings (or the install's default language).
- The default send mode is `review`: the agent lets you approve every submission first. Switch to `auto` on the Settings page.
- The agent only sends summaries, never code, secrets or customer data.

## Verified

Done:
- Automated test (`tests/server/plugin-files.test.ts`): skill frontmatter; every tool and field name mentioned in the skills matches `registerTools`; `.mcp.json` is valid JSON.
- Read the Claude Code docs (plugin layout, `.mcp.json`, `--plugin-dir`) and the Codex docs (the `url` and `bearer_token_env_var` keys, the `--url` flag, the skills folder) while writing.

Not done (waiting on a person):
- A real end-to-end install and run in Claude Code and Codex (install the plugin, say "make a plan for adding API X, due Friday", see the "Pending confirmation" task on the manager's web page).
- Not tried with Codex. `claude plugin validate` not run. `${VAR}` expansion in `.mcp.json` headers not checked on a real machine.
