---
name: agentsync-manager
description: Use when a manager asks about team status, which tasks need attention, the weekly digest, or wants to confirm a plan, request changes, ask or answer a question, or review a solution summary in AgentSync.
---

# Manager: track and respond through AgentSync

Use the manager-side tools. Keep answers short and high-level; go into detail only when the manager asks.

Always reply to the manager in the language they use.

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

## Rules

- Before confirming, requesting changes or reviewing, say briefly what you are about to do and wait for the manager to agree, unless they gave a clear instruction.
- You only see the manager's own tasks and their direct reports' tasks. If no task is visible, say so; do not guess.
- Dates are always YYYY-MM-DD. Never put code, secrets or customer data in answers or notes.
