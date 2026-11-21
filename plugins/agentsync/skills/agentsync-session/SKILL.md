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
   Once you know which task this session is about, print this marker on its own line: `AGENTSYNC-TASK: <taskId>` (keep the English text exactly, whatever language you reply in).
3. If the manager asked for plan changes, draft a new plan and call `revise_plan` (following the `sendMode` rule).
4. If the review verdict is `changes_needed`: make the changes from the note, then run `submit_solution_summary` again (resubmitting overwrites the old one) and `set_task_status` with `action` set to `complete`.

## After each finished plan step

When you finish a step of the task's plan, do both of these right away:

1. Print this marker on its own line: `AGENTSYNC-CHECKPOINT: <exact step title>`. Use the step title exactly as written in the plan (see `task_detail` if needed) and keep the English text `AGENTSYNC-CHECKPOINT:` as is. Print one marker per finished step.
2. Call `update_progress` for that step now, with `stepsCompleted` set to that exact title (following the `sendMode` rule: with `review`, show the draft and wait for the member to agree first).

A stop hook reads these markers and reminds you if the step is still not reported on the server. It is only a safety net: do not wait for the reminder. If a reminder arrives, follow it, still respecting `sendMode`.

Never print a marker as an example or quote; print it only when it is true.

## When the member says they are done or ends the session

1. Summarize in 2-4 sentences: what was done, which steps finished, what was newly discovered, any blockers. Put the summary in `body`.
2. Steps just finished: fill `stepsCompleted`, using the exact step names from the task's plan (see `task_detail` if needed; do not invent other names).
3. Evidence (`evidence`): `branch` from `git branch --show-current`; `commits` is the result of `git rev-list --count <base>..HEAD`, where `<base>` is the result of `git merge-base HEAD origin/main` (try `origin/master` if missing). If you cannot determine the base, omit `commits`. Add `prUrl` if there is a PR.
4. Call `update_progress`: `source` is `reviewed` if the member approved the draft, `auto` if `sendMode` is `auto`.
5. If there is a blocker the manager must decide, call `report_blocker`. For an ordinary question, call `ask_manager`.

## When a project-mode task is finished

1. Write a solution summary with: `problem`, `solution`, `rejectedAlternatives`, `keyChanges`, `risks`, `testing`, plus `prUrl` if there is a PR.
2. Call `submit_solution_summary`, then `set_task_status` with `action` set to `complete` (following the `sendMode` rule: with `review`, let the member approve first).

## Rules

- NEVER send code, secrets (tokens, passwords, API keys) or customer data to the server. Send only a written summary.
- Dates are always YYYY-MM-DD.
- An invalid task (someone else's, closed, wrong id) returns an error with a hint to use `list_my_tasks`: call that tool; never invent an id.
