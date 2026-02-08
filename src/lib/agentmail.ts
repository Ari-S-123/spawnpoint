import { AgentMailClient } from 'agentmail';

const client = new AgentMailClient({ apiKey: process.env.AGENTMAIL_API_KEY! });

export async function createAgentEmail(agentName: string): Promise<{ inbox_id: string; username: string }> {
  const inbox = await client.inboxes.create({
    username: agentName,
    domain: 'agentmail.to'
  });

  console.log(
    `[AGENTMAIL] Created inbox — inboxId: "${inbox.inboxId}", displayName: "${inbox.displayName}", podId: "${inbox.podId}"`
  );

  // Always use the agentName we passed in - inbox.displayName returns a generic value
  return {
    inbox_id: inbox.inboxId,
    username: agentName
  };
}

export type VerificationResult = { type: 'otp'; value: string } | { type: 'link'; value: string; otp?: string };

export async function waitForVerification(
  inboxId: string,
  platform: string,
  maxAttempts = 30
): Promise<VerificationResult> {
  console.log(`[AGENTMAIL] waitForVerification called — inboxId: "${inboxId}", platform: "${platform}"`);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await client.inboxes.messages.list(inboxId, { includeSpam: true });

    if (attempt % 5 === 0) {
      console.log(
        `[AGENTMAIL] Poll attempt ${attempt + 1}/${maxAttempts} — ${response.messages?.length ?? 0} messages in inbox`
      );
      if (response.messages?.length) {
        for (const msg of response.messages) {
          console.log(`[AGENTMAIL]   from="${msg.from}" subject="${msg.subject ?? '(none)'}"`);
        }
      }
    }

    const verificationEmail = response.messages?.find(
      (msg) => msg.from?.toLowerCase().includes(platform) || msg.subject?.match(/verify|confirm|code|welcome|activate/i)
    );

    if (verificationEmail) {
      console.log(
        `[AGENTMAIL] Found verification email from "${verificationEmail.from}" subject="${verificationEmail.subject}"`
      );
      const message = await client.inboxes.messages.get(inboxId, verificationEmail.messageId);

      const textContent = message.text ?? message.html ?? '';
      console.log(`[AGENTMAIL] Email body length: ${textContent.length} chars`);
      console.log(`[AGENTMAIL] Email body preview: ${textContent.slice(0, 500)}`);

      // Extract both OTP and link — some emails contain both
      const otpMatch = textContent.match(/\b\d{4,8}\b/);
      const linkMatch = textContent.match(
        /https?:\/\/[^\s"'<>]+(?:verify|confirm|activate|token|code|sign-in|login|auth)[^\s"'<>]*/i
      );

      if (otpMatch?.[0]) {
        console.log(`[AGENTMAIL] Extracted OTP: ${otpMatch[0]}`);
      }
      if (linkMatch?.[0]) {
        console.log(`[AGENTMAIL] Extracted link: ${linkMatch[0]}`);
      }

      // If we only have an OTP and no link, return OTP-only
      if (otpMatch?.[0] && !linkMatch?.[0]) {
        return { type: 'otp', value: otpMatch[0] };
      }

      // If we have a link (with or without an OTP), return the link + attach the OTP
      if (linkMatch?.[0]) {
        return { type: 'link', value: linkMatch[0], otp: otpMatch?.[0] };
      }

      console.warn(
        `[AGENTMAIL] Verification email found but could not extract OTP or link. Body preview: ${textContent.slice(0, 300)}`
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  // Final dump of all messages for debugging
  const finalResponse = await client.inboxes.messages.list(inboxId, { includeSpam: true });
  console.error(
    `[AGENTMAIL] FAILED — No verification from ${platform} after ${maxAttempts} attempts. Inbox has ${finalResponse.messages?.length ?? 0} total messages:`
  );
  for (const msg of finalResponse.messages ?? []) {
    console.error(`[AGENTMAIL]   from="${msg.from}" subject="${msg.subject ?? '(none)'}"`);
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
