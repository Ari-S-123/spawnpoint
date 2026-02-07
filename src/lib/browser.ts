import { Stagehand, type Page } from '@browserbasehq/stagehand';
import type { PlatformConfig } from '@/types';

export type StagehandSession = {
  stagehand: Stagehand;
  page: Page;
  sessionId: string;
};

export async function createStagehandSession(): Promise<StagehandSession> {
  const stagehand = new Stagehand({
    env: 'BROWSERBASE',
    apiKey: process.env.BROWSERBASE_API_KEY!,
    projectId: process.env.BROWSERBASE_PROJECT_ID!,
    model: 'anthropic/claude-opus-4-5-20251101',
    verbose: 0
  });

  await stagehand.init();

  const page = stagehand.context.pages()[0];
  if (!page) {
    throw new Error('Stagehand session has no default page.');
  }

  return {
    stagehand,
    page,
    sessionId: stagehand.browserbaseSessionID ?? ''
  };
}

export async function performSignup(
  stagehand: Stagehand,
  page: Page,
  config: PlatformConfig,
  email: string,
  password: string
): Promise<'completed' | 'captcha'> {
  await page.goto(config.signupUrl, {
    timeoutMs: 30_000,
    waitUntil: 'domcontentloaded'
  });

  // Check for CAPTCHA before filling
  const captchaElements = await stagehand.observe(
    'find any CAPTCHA challenges, reCAPTCHA widgets, or "I am not a robot" checkboxes'
  );
  if (captchaElements.length > 0) {
    return 'captcha';
  }

  await stagehand.act(config.instructions.fillEmail, {
    variables: { email }
  });

  await stagehand.act(config.instructions.fillPassword, {
    variables: { password }
  });

  await stagehand.act(config.instructions.submit);

  await page.waitForTimeout(3000);

  // Check for CAPTCHA after submit
  const postSubmitCaptcha = await stagehand.observe(
    'find any CAPTCHA challenges, reCAPTCHA widgets, or "I am not a robot" checkboxes'
  );
  if (postSubmitCaptcha.length > 0) {
    return 'captcha';
  }

  return 'completed';
}

export async function injectOTP(stagehand: Stagehand, otp: string, instruction?: string): Promise<void> {
  await stagehand.act(instruction ?? 'type %otp% into the verification code field', {
    variables: { otp }
  });

  await stagehand.act('click the verify or confirm or submit button');
}

export async function takeScreenshot(page: Page): Promise<string> {
  const buffer = await page.screenshot({ type: 'png', fullPage: false });
  return buffer.toString('base64');
}

export async function closeSession(stagehand: Stagehand): Promise<void> {
  await stagehand.close();
}
