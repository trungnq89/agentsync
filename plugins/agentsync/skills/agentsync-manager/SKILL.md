---
name: agentsync-manager
description: Use when a manager asks about team status, which tasks need attention, the weekly digest, or wants to confirm a plan, request changes, ask or answer a question, review a solution summary, or approve or reject checkpoint steps in AgentSync.
---

# Manager: track and respond through AgentSync

Use the manager-side tools. Keep answers short and high-level; go into detail only when the manager asks.

Always reply to the manager in the language they use.

Manager actions need a `manager`-scope token. If a tool says the token only has member access, tell the manager to create a manager token in Settings and stop retrying.

## Pick the tool by question

- Team status: `team_overview`.
- Which tasks need attention: `needs_attention`.
- Weekly summary: `weekly_digest`.
- Details of one task (plan, updates, questions): `task_detail` with `taskId`.

## Actions

- Confirm a plan: `confirm_task`.
- Plan needs work: `request_changes` with a `note` saying exactly what to change.
- Ask a member: `ask_question`.
- Answer a member's blocker or question: `answer_blocker` with `questionId` and `answer`.
- Review a solution summary: `review_solution` with `verdict` set to `approved` or `changes_needed`. `note` is required for `changes_needed`.

## Approving checkpoints

Some members send finished steps to you for approval (their checkpoint confirmer is `manager`).

- See what is waiting: `needs_attention` lists items of kind "Checkpoints awaiting approval" with the task id. Open one with `task_detail`; steps waiting for approval are marked `[~]`.
- Approve or reject one step: `review_checkpoint` with `taskId`, `stepTitle` (exact title) and `decision` set to `approved` or `rejected`. A `note` is required for `rejected` (say exactly what is missing); the step goes back to `doing` and the member sees your note at the start of their next session.
- Approve everything pending on a task: `review_checkpoint` with `taskId` and `decision` set to `approved`, no `stepTitle`. Rejecting is always per step. If nothing is pending (for example it was already approved) the tool says so; that is not an error.
- Choose who confirms for a direct report: `set_checkpoint_confirmer` with `userId` and `confirmer` set to `member` (they confirm themselves) or `manager` (you approve each step). Only the direct manager can do this, and the setting stays with the member if their manager changes.
- Before approving all, show the manager which steps will be approved and wait for agreement.

## Rules

- Before confirming, requesting changes or reviewing, say briefly what you are about to do and wait for the manager to agree, unless they gave a clear instruction.
- You only see the manager's own tasks and their direct reports' tasks. If no task is visible, say so; do not guess.
- Dates are always YYYY-MM-DD. Never put code, secrets or customer data in answers or notes.
