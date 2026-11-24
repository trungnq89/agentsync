import { startFakeSlack } from './fake-slack';

/** Standalone fake Slack for the Playwright web server (SLACK_API_BASE points here). */
const port = Number(process.env.FAKE_SLACK_PORT ?? 3199);
void startFakeSlack({
  port,
  token: 'xoxb-e2e-token',
  usersByEmail: { 'admin@e2e.test': 'UADMIN' },
});
