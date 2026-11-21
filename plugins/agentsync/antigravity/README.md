# AgentSync checkpoint hook for Antigravity

Status: **not tested**. This is a template written from the Antigravity docs (antigravity.google/docs/build-plugins), not tried with a real Antigravity.

## What the docs say

- A plugin defines synchronous lifecycle hooks in `<plugin-root>/hooks.json`. Each top-level key is a named hook group; `Stop` is a flat array of handlers (`type`, `command`, `timeout`). The `hooks.json` here follows that shape.
- Command hooks receive event context as JSON on stdin. The docs do not describe the `Stop` payload fields.
- To keep the agent running, a hook exits 0 and prints JSON on stdout. The docs show `{"decision": "continue", "reason": "..."}` to prevent completion and `{}` to allow the stop.

## Output

`agentsync-hook.mjs --agent antigravity` prints `{"decision":"continue","reason":"..."}` to keep the agent running, and `{}` (allow the stop) when there is nothing to say, because the docs require a JSON object on stdout with exit 0. The `Stop` stdin payload fields are not documented, so payload parsing is a best guess. The skills remain the primary mechanism: they tell the agent to send `update_progress` right after each step.

## Use it (at your own risk)

1. Copy the `plugins/agentsync` folder from the AgentSync source and put `antigravity/hooks.json` at that copy's root as `hooks.json`. Antigravity runs hook commands from the plugin root, so the relative `node ./hooks/agentsync-hook.mjs` works.
2. Install it per the Antigravity docs, for example `agy plugin install ./<dir>`.
3. Set `AGENTSYNC_URL` and `AGENTSYNC_TOKEN` in the environment Antigravity starts with. Node 20 or newer is required.

Set `AGENTSYNC_HOOK=off` to disable. State and logs are in `~/.agentsync`.
