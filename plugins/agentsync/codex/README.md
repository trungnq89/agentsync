# AgentSync for Codex

The skill bundle shares the `SKILL.md` format with Claude Code. The MCP configuration is done separately for Codex, as below.

## 1. Install the skills

Current Codex docs (learn.chatgpt.com/docs/build-skills, formerly developers.openai.com/codex/skills) list the user-level skills location as `$HOME/.agents/skills` and the repo-level one as `$REPO_ROOT/.agents/skills`. They do not mention `~/.codex/skills`.

The `plugins/agentsync` folder comes from the AgentSync source (see `docs/install-agent.md`, section 0). Use absolute paths, for example on macOS:

```bash
mkdir -p ~/.agents/skills
cp -R /Users/your-name/agentsync/plugins/agentsync/skills/* ~/.agents/skills/
```

If your Codex version still reads `~/.codex/skills/` (older versions), copy there too:

```bash
mkdir -p ~/.codex/skills
cp -R /Users/your-name/agentsync/plugins/agentsync/skills/* ~/.codex/skills/
```

Not verified: whether `~/.codex/skills` is still read by newer Codex versions. Restart Codex and check the skill list.

## 2. Add the MCP server

Get a token on AgentSync's Settings page, then set an environment variable (add it to `~/.zshrc` or equivalent):

```bash
export AGENTSYNC_TOKEN="ags_..."
```

Variables in `~/.zshrc` only apply to programs started from a terminal. The Codex desktop app opened by clicking its icon will not see them: run `codex` in a terminal, or open the app from a terminal after the `export`. Setting the variable permanently for the desktop app has not been verified.

### Option A: `~/.codex/config.toml` (recommended, uses a bearer token)

```toml
[mcp_servers.agentsync]
url = "https://agentsync.example.com/api/mcp"
bearer_token_env_var = "AGENTSYNC_TOKEN"
```

Change `url` to your AgentSync address. Codex reads the token from the environment variable and sends it in the `Authorization: Bearer ...` header.

### Option B: `codex mcp add`

```bash
codex mcp add agentsync --url https://agentsync.example.com/api/mcp
```

According to the docs, this command only has the `--url` flag (and OAuth flags). The docs list no flag for a bearer token, so after running it, open `~/.codex/config.toml` and add the line `bearer_token_env_var = "AGENTSYNC_TOKEN"` under `[mcp_servers.agentsync]`.

## 3. Checkpoint hook (optional)

A `Stop` hook reminds the agent to report finished plan steps. It needs Node 20 or newer and the same `AGENTSYNC_URL` and `AGENTSYNC_TOKEN` environment variables (set `AGENTSYNC_URL` to your AgentSync address, for example `https://agentsync.example.com`; the hook does not read `config.toml`).

Add this to `~/.codex/hooks.json` (or `$CODEX_HOME/hooks.json`), using the absolute path to your copy of AgentSync:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node /Users/your-name/agentsync/plugins/agentsync/hooks/agentsync-hook.mjs --agent codex",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

Then run `/hooks` in Codex, review the hook and trust it. Codex skips new or changed hooks until you do. Set `AGENTSYNC_HOOK=off` to disable the hook. State and logs live in `~/.agentsync`. The `Stop` format comes from learn.chatgpt.com/docs/hooks.md; not tried with a real Codex. Not verified: that `AGENTSYNC_URL` / `AGENTSYNC_TOKEN` are inherited by the hook process.

## Not verified

Written from the Codex docs only: the `url`, `bearer_token_env_var` and `http_headers` keys, the `--url` flag, and the `$HOME/.agents/skills` skills folder. Not tried with a real Codex.
