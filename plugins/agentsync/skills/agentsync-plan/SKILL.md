---
name: agentsync-plan
description: Use when a member wants to draft a plan or create a task in AgentSync after discussing work with their manager (e.g. "make a plan for X, due Friday", "create a new task"). Creates the task with its plan so the manager can confirm it.
---

# Draft a plan and create a task in AgentSync

Use when the member has just discussed work with their manager and wants to draft a plan or create a new task.

Always reply to the member in the language they use.

## First rule: send mode

Call `get_my_settings` to read `sendMode`. If `sendMode` is `review`, EVERY member-side send (`create_task`, `update_progress`, `revise_plan`, `report_blocker`, `ask_manager`, `answer_question`, `resolve_question`, `submit_solution_summary`, `set_task_status`) must show a draft and WAIT for the member to agree before you call the tool. If it is `auto`, send right away, then tell the member what was sent.

## Steps

1. Ask for what is missing, and only what is unclear:
   - Task title (`title`): take it from the member's words; if none, propose a short one and ask for confirmation.
   - The outcome agreed with the manager (`agreedOutcome`).
   - Start date (`startDate`) and the agreed due date (`agreedDueDate`).
   - Whether the task is private (`isPrivate`).
2. Guess `mode`: `project` if you are inside a git repo, otherwise `executive`. Tell the member your choice so they can correct it.
3. Draft a plan of 3-8 steps (`steps`), one short, verifiable line each.
4. Call `get_my_settings`.
   - `review`: show the draft (title, mode, outcome, dates, steps) and WAIT for the member to agree. Do not call `create_task` until they do.
   - `auto`: go straight to step 5.
5. Call `create_task` with `cwdHint` set to the absolute path of the current directory and `repoRef.branch` set to the current branch (`git branch --show-current`, if in a git repo).
6. Once `create_task` succeeds, print this marker as plain text on its own line (no backticks, bullets, bold or quotes), using the returned task id, keeping the English label exactly; a hook reads it to link this session to the task. The fence only illustrates the instruction; do not print it:

```
AGENTSYNC-TASK: <taskId>
```

7. Tell the member the task was created and is now "Pending confirmation" for the manager to confirm.

## Revising a plan later

Step status is owned by the server. When you call `revise_plan`, resend the existing steps unchanged by title and set each to `todo` or `doing` only; the server keeps confirmed (`done` or waiting for approval) steps as they are. A step you rename or add starts again from `todo` and must be confirmed again. You cannot mark a step `done` through the plan: steps become done only through the confirmation flow in `update_progress`.

## Rules

- Dates are always YYYY-MM-DD (for example 2026-11-27). Convert "Friday" or "next week" to a concrete date and repeat it to the member for confirmation.
- Never send code, secrets or customer data. Send only step names and summaries.
- If a tool returns an error, read the error message to the member; do not silently retry.
