---
name: agentsync-session
description: Use when starting or resuming work on an existing AgentSync task, and when the member says they are done or ends the session. Checks pending feedback, identifies the current task, then reports progress, blockers or the solution summary.
---

# Working session with AgentSync

Always reply to the member in the language they use.

## First rule: send mode

Call `get_my_settings` to read `sendMode`. If `sendMode` is `review`, EVERY member-side send (`create_task`, `update_progress`, `revise_plan`, `report_blocker`, `ask_manager`, `answer_question`, `resolve_question`, `submit_solution_summary`, `set_task_status`) must show a draft and WAIT for the member to agree before you call the tool. If it is `auto`, send right away, then tell the member what was sent.

## When starting or resuming a task

1. Call `get_pending_feedback` and remind the member of pending items (plan change requests, questions, answers, review results). If there is a question for the member, ask them and reply with `answer_question`. After you have passed the manager's answer on to the member, call `resolve_question` (with `questionId`) so the question no longer shows up in `get_pending_feedback`.
2. Identify the current task: call `list_my_tasks` first. Match the current branch (`git branch --show-current`) against `repoRef.branch`; if that does not match, match the current directory against `cwdHint`. If there is not exactly one matching task (none or several), ask the member to choose. Never guess from task titles.
   Once you know which task this session is about, print the task marker (see "Marker format" below).
   Also read `rejectedCheckpoints` in that result: each is a step the manager marked "not yet" with a note. Tell the member the step and the manager's note, then rework those steps. The step is back to `doing`; when it is done again, follow "After each finished plan step" (the member confirms again, or it goes to the manager again).
3. If the manager asked for plan changes, draft a new plan and call `revise_plan` (following the `sendMode` rule).
4. If the review verdict is `changes_needed`: make the changes from the note, then run `submit_solution_summary` again (resubmitting overwrites the old one) and `set_task_status` with `action` set to `complete`.

## After each finished plan step

First find out who confirms checkpoints for this task: `effectiveConfirmer` in `list_my_tasks` or `task_detail` (`member` or `manager`). It already accounts for private tasks and members without a manager. `get_my_settings` shows the member's general `checkpointConfirmer`, but `effectiveConfirmer` of the task is what counts.

When you finish a step of the task's plan:

**If `effectiveConfirmer` is `member`:**

1. Do NOT print the marker yet. Summarize what you did for that step and ASK the member: "Is step X done?" (use the exact step title; reply in the member's language).
2. If the member says no or wants changes: keep working. Print no marker and do not call `update_progress` for that step.
3. Only after the member says yes: print the checkpoint marker (see "Marker format" below) with the step title exactly as written in the plan, then call `update_progress` with `stepsCompleted` set to that exact title and `memberConfirmed` set to `true` (following the `sendMode` rule: with `review`, show the draft and wait for the member to agree first). Never set `memberConfirmed` to `true` without the member's explicit yes in this conversation.

**If `effectiveConfirmer` is `manager`:**

1. Print the checkpoint marker with the exact step title, then call `update_progress` with `stepsCompleted` for that step and WITHOUT `memberConfirmed` (following the `sendMode` rule).
2. Tell the member: step X was sent to the manager for approval and is waiting. Keep working on other steps; the step shows as pending until the manager approves or rejects it.

Print one marker per finished step. A stop hook reads these markers and reminds you if the step is still not reported on the server. It is only a safety net: do not wait for the reminder. If a reminder arrives, follow it, still respecting `sendMode` and the confirmation rule above.

Never print a marker as an example or quote; print it only when it is true (in member mode, only after the member confirmed).

## Marker format

Print each marker as plain text on its own line: no backticks, bullets, bold or quotes around it. Keep the English label exactly, whatever language you reply in. The fence below only illustrates the instruction; do not print the fence:

```
AGENTSYNC-TASK: <taskId>
AGENTSYNC-CHECKPOINT: <exact step title>
```

## When the member says they are done or ends the session

1. Summarize in 2-4 sentences: what was done, which steps finished, what was newly discovered, any blockers. Put the summary in `body`.
2. Steps finished but not yet reported: fill `stepsCompleted` with only those, using the exact step names from the task's plan (see `task_detail` if needed; do not invent other names). Do not re-send steps you already reported right after their checkpoint. In member mode only include steps the member confirmed, and set `memberConfirmed` to `true`; ask first if they have not confirmed yet.
3. Evidence (`evidence`): `branch` from `git branch --show-current`; `commits` is the result of `git rev-list --count <base>..HEAD`, where `<base>` is the result of `git merge-base HEAD origin/main` (try `origin/master` if missing). If you cannot determine the base, omit `commits`. Add `prUrl` if there is a PR.
4. Call `update_progress` (completing the task via `set_task_status` needs every step confirmed `done`; steps still waiting for the manager must be approved first): `source` is `reviewed` if the member approved the draft, `auto` if `sendMode` is `auto`.
5. If there is a blocker the manager must decide, call `report_blocker`. For an ordinary question, call `ask_manager`.

## When a project-mode task is finished

1. Write a solution summary with: `problem`, `solution`, `rejectedAlternatives`, `keyChanges`, `risks`, `testing`, plus `prUrl` if there is a PR.
2. Call `submit_solution_summary`, then `set_task_status` with `action` set to `complete` (following the `sendMode` rule: with `review`, let the member approve first).

## Rules

- NEVER send code, secrets (tokens, passwords, API keys) or customer data to the server. Send only a written summary.
- Dates are always YYYY-MM-DD.
- An invalid task (someone else's, closed, wrong id) returns an error with a hint to use `list_my_tasks`: call that tool; never invent an id.
