import { AgentMailClient } from 'agentmail';

const apiKey = process.env.AGENTMAIL_API_KEY;
if (!apiKey) {
  console.error('Missing AGENTMAIL_API_KEY — set it in .env.local');
  process.exit(1);
}

const client = new AgentMailClient({ apiKey });

try {
  const { inboxes } = await client.inboxes.list();
  const existing = inboxes?.[0];

  if (existing) {
    console.log('Found existing inbox:');
    console.log(`  Inbox ID: ${existing.inboxId}`);
    console.log(`  Email:    ${existing.inboxId}`);
  } else {
    console.log('No existing inboxes — creating a test inbox...');
    const inbox = await client.inboxes.create({
      username: 'test-agent',
      domain: 'agentmail.to'
    });
    console.log('Created inbox:');
    console.log(`  Inbox ID: ${inbox.inboxId}`);
    console.log(`  Email:    ${inbox.inboxId}`);
  }

  process.exit(0);
} catch (err) {
  console.error('AgentMail test failed:', err);
  process.exit(1);
}
