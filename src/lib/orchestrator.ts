import { db } from '@/db';
import { setupTasks } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { PLATFORM_CONFIGS } from '@/lib/platforms';
import { createStagehandSession, performSignup, injectOTP, closeSession, type StagehandSession } from '@/lib/browser';
import { waitForVerification } from '@/lib/agentmail';
import { getCredential } from '@/lib/vault';
import { emitTaskUpdate } from '@/lib/events';
import type { Platform } from '@/types';

export async function enqueueSignupTasks(agentId: string, email: string, inboxId: string): Promise<void> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[ORCHESTRATOR] enqueueSignupTasks called`);
  console.log(`[ORCHESTRATOR] agentId: ${agentId}`);
  console.log(`[ORCHESTRATOR] email: ${email}`);
  console.log(`[ORCHESTRATOR] inboxId: ${inboxId}`);
  console.log(`${'='.repeat(60)}\n`);

  const orderedPlatforms: Platform[] = ['vercel', 'sentry', 'mintlify', 'instagram', 'tiktok', 'twitter'];

  const nonCaptcha = orderedPlatforms.filter((p) => !PLATFORM_CONFIGS[p]?.captchaLikely);
  const captchaLikely = orderedPlatforms.filter((p) => PLATFORM_CONFIGS[p]?.captchaLikely);

  console.log(`[ORCHESTRATOR] Non-captcha platforms (sequential with delays): ${nonCaptcha.join(', ')}`);
  console.log(`[ORCHESTRATOR] Captcha-likely platforms (sequential): ${captchaLikely.join(', ')}`);

  // Run non-captcha platforms sequentially with delays to avoid rate limits
  for (let i = 0; i < nonCaptcha.length; i++) {
    const platform = nonCaptcha[i]!;
    console.log(`\n[ORCHESTRATOR] Starting signup for ${platform} (${i + 1}/${nonCaptcha.length})...`);
    await executePlatformSignup(agentId, platform, email, inboxId);

    // Add delay between signups to avoid rate limits (skip delay after last one)
    if (i < nonCaptcha.length - 1) {
      console.log(`[ORCHESTRATOR] Waiting 5 seconds before next signup to avoid rate limits...`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  console.log(`\n[ORCHESTRATOR] Non-captcha signups complete. Starting captcha platforms...\n`);

  for (const platform of captchaLikely) {
    await executePlatformSignup(agentId, platform, email, inboxId);
  }

  console.log(`\n[ORCHESTRATOR] All signup tasks complete.\n`);
}

async function executePlatformSignup(
  agentId: string,
  platform: Platform,
  email: string,
  inboxId: string
): Promise<void> {
  const startTime = new Date().toISOString();
  console.log(`[${startTime}] [${platform.toUpperCase()}] Starting signup attempt...`);

  const config = PLATFORM_CONFIGS[platform];
  if (!config) {
    console.error(`[${platform}] No config for platform: ${platform}`);
    return;
  }

  // Update task status to in_progress
  const [task] = await db
    .update(setupTasks)
    .set({ status: 'in_progress', updatedAt: new Date() })
    .where(and(eq(setupTasks.agentId, agentId), eq(setupTasks.platform, platform)))
    .returning();

  emitTaskUpdate({
    taskId: task?.id ?? '',
    agentId,
    platform,
    status: 'in_progress',
    message: `Starting ${platform} signup...`,
    timestamp: new Date().toISOString()
  });

  // Retrieve the password from credentials table
  const credential = await getCredential(agentId, platform);
  if (!credential) {
    await markFailed(agentId, platform, 'Credential not found.');
    return;
  }

  let session: StagehandSession | null = null;
  try {
    session = await createStagehandSession();

    // Store session ID for live view
    await db
      .update(setupTasks)
      .set({ browserSessionId: session.sessionId })
      .where(and(eq(setupTasks.agentId, agentId), eq(setupTasks.platform, platform)));

    emitTaskUpdate({
      taskId: task?.id ?? '',
      agentId,
      platform,
      status: 'in_progress',
      message: `Browser session created. Navigating to ${config.signupUrl}...`,
      browserSessionId: session.sessionId,
      timestamp: new Date().toISOString()
    });

    // Attempt Stagehand-driven signup
    const signupResult = await performSignup(session.stagehand, session.page, config, email, credential.password);

    if (signupResult === 'captcha') {
      await db
        .update(setupTasks)
        .set({ status: 'needs_human', updatedAt: new Date() })
        .where(and(eq(setupTasks.agentId, agentId), eq(setupTasks.platform, platform)));

      emitTaskUpdate({
        taskId: task?.id ?? '',
        agentId,
        platform,
        status: 'needs_human',
        message: `CAPTCHA detected on ${platform}. Manual intervention required.`,
        browserSessionId: session.sessionId,
        timestamp: new Date().toISOString()
      });

      return;
    }

    // Wait for verification email
    emitTaskUpdate({
      taskId: task?.id ?? '',
      agentId,
      platform,
      status: 'awaiting_verification',
      message: `Form submitted. Waiting for verification email from ${platform}...`,
      timestamp: new Date().toISOString()
    });

    await db
      .update(setupTasks)
      .set({ status: 'awaiting_verification', updatedAt: new Date() })
      .where(and(eq(setupTasks.agentId, agentId), eq(setupTasks.platform, platform)));

    const verification = await waitForVerification(inboxId, platform);

    if (verification.type === 'otp') {
      await injectOTP(session.stagehand, verification.value, config.instructions.fillOtp);
    } else if (verification.type === 'link') {
      await session.page.goto(verification.value, { timeoutMs: 15_000 });
    }

    await session.page.waitForTimeout(3000);

    // Mark as completed
    await db
      .update(setupTasks)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(and(eq(setupTasks.agentId, agentId), eq(setupTasks.platform, platform)));

    emitTaskUpdate({
      taskId: task?.id ?? '',
      agentId,
      platform,
      status: 'completed',
      message: `${platform} signup completed successfully!`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[${platform}] Signup failed:`, errorMsg);

    try {
      await aiGuidedRecovery(agentId, platform, errorMsg, session);
    } catch {
      await markFailed(agentId, platform, errorMsg);
    }
  } finally {
    if (session) {
      await closeSession(session.stagehand).catch(() => {});
    }
  }
}

async function aiGuidedRecovery(
  agentId: string,
  platform: Platform,
  errorContext: string,
  existingSession: StagehandSession | null
): Promise<void> {
  // Reuse the existing session if available, otherwise create a new one
  const session = existingSession ?? (await createStagehandSession());

  try {
    emitTaskUpdate({
      taskId: '',
      agentId,
      platform,
      status: 'in_progress',
      message: `AI recovery agent starting for ${platform}...`,
      timestamp: new Date().toISOString()
    });

    const agent = session.stagehand.agent({
      model: 'anthropic/claude-opus-4-5-20251101',
      systemPrompt: `You are recovering from a signup failure on ${platform}. The previous automated attempt failed with error: "${errorContext}". Analyze the current page state, identify any error messages or issues, fix any form fields if needed, and attempt to complete the signup process. Do NOT enter any credentials — focus on navigating past errors and completing the flow.`
    });

    const result = await agent.execute({
      instruction: `Look at the current page for ${platform}. Identify what went wrong and try to recover the signup flow. If you see error messages, try to resolve them. If the form needs to be resubmitted, do so.`,
      maxSteps: 10
    });

    emitTaskUpdate({
      taskId: '',
      agentId,
      platform,
      status: 'in_progress',
      message: `AI Recovery: ${result.message}`,
      timestamp: new Date().toISOString()
    });

    if (result.success) {
      await db
        .update(setupTasks)
        .set({ status: 'completed', updatedAt: new Date() })
        .where(and(eq(setupTasks.agentId, agentId), eq(setupTasks.platform, platform)));

      emitTaskUpdate({
        taskId: '',
        agentId,
        platform,
        status: 'completed',
        message: `${platform} signup recovered successfully via AI agent!`,
        timestamp: new Date().toISOString()
      });
    } else {
      await markFailed(agentId, platform, `AI recovery failed: ${result.message}`);
    }
  } finally {
    // Only close if we created a new session for recovery
    if (!existingSession) {
      await closeSession(session.stagehand).catch(() => {});
    }
  }
}

async function markFailed(agentId: string, platform: Platform, message: string): Promise<void> {
  await db
    .update(setupTasks)
    .set({ status: 'failed', errorMessage: message, updatedAt: new Date() })
    .where(and(eq(setupTasks.agentId, agentId), eq(setupTasks.platform, platform)));

  emitTaskUpdate({
    taskId: '',
    agentId,
    platform,
    status: 'failed',
    message: `${platform} signup failed: ${message}`,
    timestamp: new Date().toISOString()
  });
}
