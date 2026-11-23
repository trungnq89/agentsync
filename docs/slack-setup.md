Tiếng Việt: [slack-setup.vi.md](slack-setup.vi.md)

# Set up the Slack digest

The Slack digest sends each person a daily direct message listing what needs their attention. It is off until an admin turns it on. This takes about 10 minutes. You need: Slack workspace admin rights (or an admin who can approve the app), an AgentSync admin account, and `APP_URL` plus `SETTINGS_ENCRYPTION_KEY` set on the server.

> **Privacy:** the digest contains task titles, blocker text and notes from AgentSync. Once Slack is on, this content is sent to Slack, an external service. Turn it on only if your company allows that.

## 1. Set the server variables

- `APP_URL`: the public address of AgentSync (for example `https://agentsync.example.com`). The digest links to tasks with it. Slack cannot be turned on without it.
- `SETTINGS_ENCRYPTION_KEY`: generate with `openssl rand -base64 32`. The bot token is stored encrypted with it. Without it the Slack tab is locked. If you lose or change it, paste the token again.
- `DEFAULT_TIMEZONE` (optional): IANA zone used until an admin or a user picks another one. Default `Asia/Ho_Chi_Minh`.

Restart the app after changing them.

## 2. Create an internal Slack app

1. Open <https://api.slack.com/apps> and choose **Create New App** > **From scratch**.
2. Name it (for example `AgentSync`) and pick your workspace.
3. Open **OAuth & Permissions** and, under **Bot Token Scopes**, add:
   - `chat:write` (send the direct message),
   - `users:read.email` (find each person by their AgentSync email).
4. Choose **Install to Workspace** and approve.
5. Copy the **Bot User OAuth Token**. It starts with `xoxb-`.

The app does not need to be added to any channel: it only sends direct messages.

## 3. Connect it in AgentSync

1. Sign in as an admin and open **Admin > Slack**.
2. Paste the token in **Bot token** and press **Save token**. It is stored encrypted and never shown again.
3. Press **Test connection**. You should see the workspace name and the bot name.
4. Adjust the **Company defaults** (on or off, send time in 15-minute steps, days, time zone) and save.
5. Press **Send test to me**. You should receive a direct message marked as a test. It does not count as today's digest.
6. Read the notice about data leaving AgentSync, then press **Turn on**.

## 4. How people are matched

Each person is matched to Slack by the email on their AgentSync account (case and surrounding spaces are ignored). Make sure every user's email equals the one they use in Slack. People without an email, or whose email Slack does not know, appear in **Not matched to Slack**; fix the email in **Admin > Users** and press **Match again**. A changed email is matched again automatically.

Each person can change their own digest in **Settings > Slack digest** (on or off, time, days, time zone) or press **Use defaults** to follow the company defaults again.

## Troubleshooting

- **Last error** on the Slack tab shows the latest problem. `The bot token was rejected` means the token is wrong, revoked or missing a scope: reinstall the app and save the new token. Sending pauses for a while after such an error (the tab shows "paused until"), and saving a new token clears it.
- **Slack is rate limiting**: sending pauses automatically and resumes on its own.
- Nothing is sent when there is nothing to show (the history records it as skipped).
- Delivery history on the tab lists the last 50 sends with the Slack error code, never the message text or token.
