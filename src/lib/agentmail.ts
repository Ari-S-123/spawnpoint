import { AgentMailClient } from 'agentmail';

const client = new AgentMailClient({ apiKey: process.env.AGENTMAIL_API_KEY! });

export async function createAgentEmail(agentName: string): Promise<{ inbox_id: string; username: string }> {
  const inbox = await client.inboxes.create({
    username: agentName,
    domain: 'agentmail.to'
  });

  return {
    inbox_id: inbox.inboxId,
    username: inbox.inboxId
  };
}

export async function deleteInbox(inboxId: string): Promise<void> {
  await client.inboxes.delete(inboxId);
}

export async function waitForVerification(
  inboxId: string,
  platform: string,
  maxAttempts = 40
): Promise<{ type: 'otp'; value: string } | { type: 'link'; value: string }> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await client.inboxes.messages.list(inboxId);

    const verificationEmail = response.messages?.find(
      (msg) => msg.from?.toLowerCase().includes(platform) || msg.subject?.match(/verify|confirm|code|welcome|activate/i)
    );

    if (verificationEmail) {
      const message = await client.inboxes.messages.get(inboxId, verificationEmail.messageId);

      const textContent = message.text ?? message.html ?? '';

      // Try OTP extraction first (4-8 digit codes)
      const otpMatch = textContent.match(/\b\d{4,8}\b/);
      if (otpMatch?.[0]) {
        return { type: 'otp', value: otpMatch[0] };
      }

      // Try verification link extraction
      const linkMatch = textContent.match(/https?:\/\/[^\s"'<>]+(?:verify|confirm|activate|token|code)[^\s"'<>]*/i);
      if (linkMatch?.[0]) {
        return { type: 'link', value: linkMatch[0] };
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  throw new Error(`No verification email from ${platform} after ${maxAttempts} attempts.`);
}

export async function listInboxMessages(inboxId: string): Promise<
  Array<{
    message_id: string;
    from: string;
    subject: string;
    date: string;
    snippet: string;
  }>
> {
  const response = await client.inboxes.messages.list(inboxId);
  return (response.messages ?? []).map((msg) => ({
    message_id: msg.messageId ?? '',
    from: msg.from ?? 'Unknown',
    subject: msg.subject ?? '(No subject)',
    date: msg.timestamp ? msg.timestamp.toISOString() : '',
    snippet: msg.preview ?? ''
  }));
}
