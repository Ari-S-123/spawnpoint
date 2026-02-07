import { generateText, Output } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { db } from '@/db';
import { setupTasks } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { PLATFORM_CONFIGS } from '@/lib/platforms';
import { createBrowserSession, performSignup, injectOTP, takeScreenshot } from '@/lib/browser';
import { waitForVerification } from '@/lib/agentmail';
import { getCredential } from '@/lib/vault';
import { emitTaskUpdate } from '@/lib/events';
import type { Platform } from '@/types';

const model = anthropic('claude-opus-4-6-20250414');

const NextActionSchema = z.object({
  action: z.enum([
    'fill_form',
    'click_element',
    'wait_for_email',
    'inject_otp',
    'navigate_link',
    'take_screenshot',
    'report_captcha',
    'report_success',
    'report_failure'
  ]),
  selector: z.string().optional(),
  value: z.string().optional(),
  reasoning: z.string()
});

export async function enqueueSignupTasks(agentId: string, email: string, inboxId: string): Promise<void> {
  const orderedPlatforms: Platform[] = ['vercel', 'sentry', 'mintlify', 'instagram', 'tiktok', 'twitter'];

  const nonCaptcha = orderedPlatforms.filter((p) => !PLATFORM_CONFIGS[p]?.captchaLikely);
  const captchaLikely = orderedPlatforms.filter((p) => PLATFORM_CONFIGS[p]?.captchaLikely);

  await Promise.allSettled(nonCaptcha.map((platform) => executePlatformSignup(agentId, platform, email, inboxId)));

  for (const platform of captchaLikely) {
    await executePlatformSignup(agentId, platform, email, inboxId);
  }
}

async function executePlatformSignup(
  agentId: string,
  platform: Platform,
  email: string,
  inboxId: string
): Promise<void> {
  const config = PLATFORM_CONFIGS[platform];
  if (!config) {
    console.error(`No config for platform: ${platform}`);
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

  let browser;
  try {
    const session = await createBrowserSession();
    browser = session.browser;

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

    // Attempt deterministic signup
    const signupResult = await performSignup(session.page, config, email, credential.password);

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
      await injectOTP(session.page, verification.value);
    } else if (verification.type === 'link') {
      await session.page.goto(verification.value, { timeout: 15_000 });
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
      await aiGuidedRecovery(agentId, platform, errorMsg);
    } catch {
      await markFailed(agentId, platform, errorMsg);
    }
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

async function aiGuidedRecovery(agentId: string, platform: Platform, errorContext: string): Promise<void> {
  const session = await createBrowserSession();

  try {
    const screenshot = await takeScreenshot(session.page);

    const { output } = await generateText({
      model,
      providerOptions: {
        anthropic: {
          thinking: {
            type: 'enabled',
            budgetTokens: 8000
          }
        }
      },
      output: Output.object({ schema: NextActionSchema }),
      messages: [
        {
          role: 'system',
          content: `You are an expert web automation agent. You are helping to sign up for ${platform}.
The previous automated attempt failed with error: "${errorContext}".
Analyze the current page screenshot and determine the next best action to recover the signup flow.
Be specific about CSS selectors and values.`
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Here is the current state of the browser. What should I do next?'
            },
            {
              type: 'image',
              image: `data:image/png;base64,${screenshot}`
            }
          ]
        }
      ]
    });

    if (output) {
      emitTaskUpdate({
        taskId: '',
        agentId,
        platform,
        status: 'in_progress',
        message: `AI Recovery: ${output.reasoning}`,
        timestamp: new Date().toISOString()
      });
    }
  } finally {
    await session.browser.close().catch(() => {});
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
