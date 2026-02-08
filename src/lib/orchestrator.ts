import { db } from '@/db';
import { agents, setupTasks } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { PLATFORM_CONFIGS } from '@/lib/platforms';
import {
  createStagehandSession,
  performSignup,
  navigateToDashboard,
  verifyOnDashboard,
  injectOTP,
  takeScreenshot,
  closeSession,
  getSessionLiveViewUrl,
  type StagehandSession
} from '@/lib/browser';
import { waitForVerification } from '@/lib/agentmail';
import { getCredential } from '@/lib/vault';
import { emitTaskUpdate } from '@/lib/events';
import { registerInstagramAccount, confirmInstagramAccount } from '@/lib/instagram';
import type { Platform } from '@/types';

export async function enqueueSignupTasks(agentId: string, email: string, inboxId: string): Promise<void> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[ORCHESTRATOR] enqueueSignupTasks called`);
  console.log(`[ORCHESTRATOR] agentId: ${agentId}`);
  console.log(`[ORCHESTRATOR] email: ${email}`);
  console.log(`[ORCHESTRATOR] inboxId: ${inboxId}`);
  console.log(`${'='.repeat(60)}\n`);

  const orderedPlatforms: Platform[] = ['vercel', 'sentry', 'mintlify', 'instagram', 'twitter'];

  const nonCaptcha = orderedPlatforms.filter((p) => !PLATFORM_CONFIGS[p]?.captchaLikely);
  const captchaLikely = orderedPlatforms.filter((p) => PLATFORM_CONFIGS[p]?.captchaLikely);

  console.log(`[ORCHESTRATOR] Non-captcha platforms (sequential with delays): ${nonCaptcha.join(', ')}`);
  console.log(`[ORCHESTRATOR] Captcha-likely platforms (sequential): ${captchaLikely.join(', ')}`);

  // Run non-captcha platforms sequentially with delays to avoid rate limits
  for (let i = 0; i < nonCaptcha.length; i++) {
    const platform = nonCaptcha[i]!;
    console.log(`\n[ORCHESTRATOR] Starting signup for ${platform} (${i + 1}/${nonCaptcha.length})...`);
    await executePlatformSignup(agentId, platform, email, inboxId);

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

  // Retrieve the agent name for social signup fields (name, username)
  const [agent] = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
  const agentName = agent?.name ?? 'agent';

  // Retrieve the password from credentials table
  const credential = await getCredential(agentId, platform);
  if (!credential) {
    await markFailed(agentId, platform, 'Credential not found.');
    return;
  }

  // Instagram: deterministic HTTP flow — no browser, no CAPTCHA
  if (platform === 'instagram') {
    const taskId = task?.id ?? '';
    // Progress callback emits SSE updates so the frontend shows each step
    const onProgress = (step: string, detail: string) => {
      emitTaskUpdate({
        taskId,
        agentId,
        platform,
        status: 'in_progress',
        message: `${step}: ${detail}`,
        timestamp: new Date().toISOString()
      });
    };

    try {
      const igUsername = agentName.toLowerCase().replace(/[^a-z0-9]/g, '');

      const { contextToken, machineId } = await registerInstagramAccount(
        email,
        credential.password,
        agentName,
        igUsername,
        onProgress
      );

      await db
        .update(setupTasks)
        .set({ status: 'awaiting_verification', updatedAt: new Date() })
        .where(and(eq(setupTasks.agentId, agentId), eq(setupTasks.platform, platform)));

      emitTaskUpdate({
        taskId,
        agentId,
        platform,
        status: 'awaiting_verification',
        message: 'Registration submitted. Polling AgentMail for Instagram confirmation code...',
        timestamp: new Date().toISOString()
      });

      const verification = await waitForVerification(inboxId, 'instagram');
      const code = verification.type === 'otp' ? verification.value : (verification.otp ?? '');

      if (!code) {
        throw new Error('Could not extract confirmation code from Instagram email');
      }

      emitTaskUpdate({
        taskId,
        agentId,
        platform,
        status: 'in_progress',
        message: `Confirmation code received: ${code}. Submitting to Instagram...`,
        timestamp: new Date().toISOString()
      });

      console.log(`[INSTAGRAM] Got confirmation code: ${code}`);
      await confirmInstagramAccount(contextToken, code, machineId, onProgress);

      await db
        .update(setupTasks)
        .set({ status: 'completed', updatedAt: new Date() })
        .where(and(eq(setupTasks.agentId, agentId), eq(setupTasks.platform, platform)));

      emitTaskUpdate({
        taskId,
        agentId,
        platform,
        status: 'completed',
        message: 'Instagram signup completed successfully via HTTP flow!',
        timestamp: new Date().toISOString()
      });

      return;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[INSTAGRAM] HTTP signup failed:`, errorMsg);
      await markFailed(agentId, platform, errorMsg);
      return;
    }
  }

  let session: StagehandSession | null = null;
  try {
    session = await createStagehandSession();

    // Fetch live view URL for iframe embedding (non-blocking failure)
    let liveViewUrl: string | undefined;
    try {
      liveViewUrl = await getSessionLiveViewUrl(session.sessionId);
    } catch {
      // Live view unavailable — continue without it
    }

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
      liveViewUrl,
      timestamp: new Date().toISOString()
    });

    // Phase 1: Fill and submit the signup form
    const signupResult = await performSignup(
      session.stagehand,
      session.page,
      config,
      email,
      credential.password,
      agentName
    );

    // Screenshot after form submission attempt
    const postSubmitScreenshot = await takeScreenshot(session.page).catch(() => undefined);
    console.log(
      `[${platform.toUpperCase()}] Post-submit screenshot captured (${postSubmitScreenshot ? `${Math.round(postSubmitScreenshot.length / 1024)}KB` : 'failed'})`
    );

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
        screenshot: postSubmitScreenshot,
        timestamp: new Date().toISOString()
      });

      return;
    }

    if (signupResult === 'failed') {
      // The agent didn't actually fill the form — throw to trigger recovery
      throw new Error(`Form submission failed — the signup form was not filled or submitted correctly.`);
    }

    // Phase 2: Wait for verification email via AgentMail SDK
    emitTaskUpdate({
      taskId: task?.id ?? '',
      agentId,
      platform,
      status: 'awaiting_verification',
      message: `Form submitted successfully. Waiting for verification email from ${platform}...`,
      browserSessionId: session.sessionId,
      screenshot: postSubmitScreenshot,
      timestamp: new Date().toISOString()
    });

    await db
      .update(setupTasks)
      .set({ status: 'awaiting_verification', updatedAt: new Date() })
      .where(and(eq(setupTasks.agentId, agentId), eq(setupTasks.platform, platform)));

    const verification = await waitForVerification(inboxId, platform);

    // Phase 3: Enter OTP or follow verification link
    if (verification.type === 'otp') {
      console.log(`[${platform.toUpperCase()}] Injecting OTP: ${verification.value}`);
      await injectOTP(session.stagehand, verification.value, config.fillOtp);
    } else if (verification.type === 'link') {
      console.log(`[${platform.toUpperCase()}] Following verification link: ${verification.value}`);
      await session.page.goto(verification.value, { timeoutMs: 15_000 });
      await session.page.waitForTimeout(3000);

      if (verification.otp) {
        console.log(`[${platform.toUpperCase()}] Link had an accompanying OTP: ${verification.otp} — entering it`);
        await injectOTP(session.stagehand, verification.otp, config.fillOtp);
      } else {
        console.log(`[${platform.toUpperCase()}] No OTP with link — looking for a confirm button on landing page`);
        try {
          await session.stagehand.act(
            'if there is a confirm, continue, verify, or sign in button on this page, click it'
          );
        } catch {
          console.log(`[${platform.toUpperCase()}] No confirm button found on landing page, continuing`);
        }
      }
    }

    await session.page.waitForTimeout(3000);

    // Phase 4: Navigate to dashboard — don't stop until we're actually logged in
    emitTaskUpdate({
      taskId: task?.id ?? '',
      agentId,
      platform,
      status: 'in_progress',
      message: `Verification complete. Navigating to ${platform} dashboard...`,
      browserSessionId: session.sessionId,
      timestamp: new Date().toISOString()
    });

    // First check — maybe we're already on the dashboard after verification
    let onDashboard = await verifyOnDashboard(session.stagehand, session.page, config);

    if (!onDashboard) {
      // Run a dedicated agent pass to navigate through onboarding to dashboard
      onDashboard = await navigateToDashboard(session.stagehand, session.page, config);
    }

    // Final screenshot to confirm where we ended up
    const finalScreenshot = await takeScreenshot(session.page).catch(() => undefined);
    const finalUrl = session.page.url();
    console.log(`[${platform.toUpperCase()}] Final state — URL: ${finalUrl}, onDashboard: ${onDashboard}`);

    if (onDashboard) {
      await db
        .update(setupTasks)
        .set({ status: 'completed', updatedAt: new Date() })
        .where(and(eq(setupTasks.agentId, agentId), eq(setupTasks.platform, platform)));

      emitTaskUpdate({
        taskId: task?.id ?? '',
        agentId,
        platform,
        status: 'completed',
        message: `${platform} signup completed — reached dashboard at ${finalUrl}`,
        browserSessionId: session.sessionId,
        screenshot: finalScreenshot,
        timestamp: new Date().toISOString()
      });
    } else {
      // We verified email but couldn't reach the dashboard
      await markFailed(
        agentId,
        platform,
        `Verification succeeded but could not reach dashboard. Final URL: ${finalUrl}`
      );

      emitTaskUpdate({
        taskId: task?.id ?? '',
        agentId,
        platform,
        status: 'failed',
        message: `${platform} verification done but could not reach dashboard. URL: ${finalUrl}`,
        browserSessionId: session.sessionId,
        screenshot: finalScreenshot,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[${platform}] Signup failed:`, errorMsg);

    // Screenshot on error for debugging
    if (session) {
      const errorScreenshot = await takeScreenshot(session.page).catch(() => undefined);
      if (errorScreenshot) {
        emitTaskUpdate({
          taskId: task?.id ?? '',
          agentId,
          platform,
          status: 'in_progress',
          message: `Error: ${errorMsg}`,
          browserSessionId: session.sessionId,
          screenshot: errorScreenshot,
          timestamp: new Date().toISOString()
        });
      }
    }

    await markFailed(agentId, platform, errorMsg);
  } finally {
    if (session) {
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
