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
    experimental: true,
    verbose: 2
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

/** Generate a random birthday for an agent (age 21-30). */
function generateBirthday(): { month: string; day: string; year: string } {
  const currentYear = new Date().getFullYear();
  const year = currentYear - Math.floor(Math.random() * 10 + 21);
  const month = Math.floor(Math.random() * 12 + 1);
  const day = Math.floor(Math.random() * 28 + 1);
  return {
    month: String(month),
    day: String(day),
    year: String(year)
  };
}

/**
 * Check whether the current page has moved past the signup form.
 * Uses stagehand.observe to visually verify the page changed.
 * Returns true if we're no longer on the initial signup form.
 */
async function hasLeftSignupPage(stagehand: Stagehand, page: Page, signupUrl: string): Promise<boolean> {
  const currentUrl = page.url();

  // If the URL has changed from the signup URL, that's a good sign
  if (currentUrl !== signupUrl && !currentUrl.includes('signup')) {
    console.log(`[BROWSER] URL changed from signup page: ${currentUrl}`);
    return true;
  }

  // Visually check if there are still empty form fields on the page
  const emptyFields = await stagehand.observe(
    'find any empty text input fields or email input fields that have no value typed into them on this page'
  );

  if (emptyFields.length === 0) {
    console.log(`[BROWSER] No empty form fields found — form appears to be filled`);
    return true;
  }

  console.log(`[BROWSER] Still see ${emptyFields.length} empty form fields — signup form not completed`);
  return false;
}

/**
 * Verify we've reached the platform dashboard / logged-in state.
 * Uses stagehand.observe with the platform's success indicator.
 */
export async function verifyOnDashboard(
  stagehand: Stagehand,
  page: Page,
  config: PlatformConfig
): Promise<boolean> {
  const currentUrl = page.url();
  console.log(`[BROWSER] [${config.platform}] Verifying dashboard — current URL: ${currentUrl}`);

  // Ask the agent to visually check if the success indicator is met
  const dashboardElements = await stagehand.observe(
    `Check if this page looks like a logged-in dashboard, onboarding page, or home feed. ` +
    `Success criteria: ${config.successIndicator}. ` +
    `Find any elements that indicate the user is logged in (dashboard nav, user avatar, project list, feed content, onboarding wizard).`
  );

  const isOnDashboard = dashboardElements.length > 0;
  console.log(
    `[BROWSER] [${config.platform}] Dashboard verification: ${isOnDashboard ? 'YES — on dashboard' : 'NO — not on dashboard yet'} ` +
    `(found ${dashboardElements.length} dashboard indicators)`
  );

  return isOnDashboard;
}

export async function performSignup(
  stagehand: Stagehand,
  page: Page,
  config: PlatformConfig,
  email: string,
  password: string,
  agentName: string
): Promise<'form_submitted' | 'captcha' | 'failed'> {
  const birthday = generateBirthday();
  const displayName = agentName
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  const username = agentName.replace(/-/g, '_');

  console.log(
    `[BROWSER] [${config.platform}] Agent signup — name="${displayName}" username="${username}" ` +
    `birthday=${birthday.month}/${birthday.day}/${birthday.year}`
  );

  await page.goto(config.signupUrl, {
    timeoutMs: 30_000,
    waitUntil: 'domcontentloaded'
  });

  // Wait a moment for the page to fully render
  await page.waitForTimeout(2000);

  // Check for CAPTCHA before starting
  const captchaElements = await stagehand.observe(
    'find any CAPTCHA challenges, reCAPTCHA widgets, or "I am not a robot" checkboxes'
  );
  if (captchaElements.length > 0) {
    return 'captcha';
  }

  // Build the system prompt with all credentials context — CUA mode uses vision/screenshots
  const systemPrompt =
    `You are an autonomous signup agent for ${config.platform}. ` +
    `You operate in Computer Use Agent (CUA) mode — you see screenshots of the browser ` +
    `and interact by clicking at precise coordinates and typing text.\n\n` +
    `Use EXACTLY the following credentials to complete the signup form:\n` +
    `- Email: ${email}\n` +
    `- Password: ${password}\n` +
    `- Full Name: ${displayName}\n` +
    `- Username: ${username}\n` +
    `- Birth Month: ${birthday.month}\n` +
    `- Birth Day: ${birthday.day}\n` +
    `- Birth Year: ${birthday.year}\n\n` +
    `CRITICAL INSTRUCTIONS:\n` +
    `- Take a screenshot first to see the current page state before doing anything.\n` +
    `- Click on each input field FIRST to focus it, then type the value.\n` +
    `- After typing in each field, take a screenshot to verify the text was entered correctly.\n` +
    `- For dropdowns, click to open them, then click the correct option from the list.\n` +
    `- After clicking a button, wait and take a screenshot to see what happened.\n` +
    `- Do NOT claim success until you can visually confirm the form was submitted and the page changed.\n` +
    `- If the page still shows an empty signup form, you have NOT succeeded.\n` +
    `- If you encounter a CAPTCHA, stop immediately — do NOT try to solve it.`;

  const agent = stagehand.agent({
    model: 'anthropic/claude-opus-4-5-20251101',
    mode: 'cua',
    systemPrompt
  });

  console.log(`[BROWSER] [${config.platform}] Starting CUA agent with goal: "${config.goal}"`);

  const result = await agent.execute({
    instruction: config.goal,
    maxSteps: 50
  });

  console.log(`[BROWSER] [${config.platform}] Agent finished — success=${result.success}, message="${result.message}"`);

  await page.waitForTimeout(3000);

  // Check for CAPTCHA after agent execution
  const postSubmitCaptcha = await stagehand.observe(
    'find any CAPTCHA challenges, reCAPTCHA widgets, or "I am not a robot" checkboxes'
  );
  if (postSubmitCaptcha.length > 0) {
    return 'captcha';
  }

  // Verify the page actually changed — don't trust the agent's self-reported success
  const leftSignup = await hasLeftSignupPage(stagehand, page, config.signupUrl);
  if (!leftSignup) {
    console.log(`[BROWSER] [${config.platform}] Agent claimed success but page didn't change — marking as failed`);
    return 'failed';
  }

  return 'form_submitted';
}

/**
 * After OTP injection or verification link, run a second agent pass
 * to navigate from the verification page to the actual dashboard.
 */
export async function navigateToDashboard(
  stagehand: Stagehand,
  page: Page,
  config: PlatformConfig
): Promise<boolean> {
  console.log(`[BROWSER] [${config.platform}] Running post-verification agent to reach dashboard...`);

  const agent = stagehand.agent({
    model: 'anthropic/claude-opus-4-5-20251101',
    mode: 'cua',
    systemPrompt:
      `You are navigating a ${config.platform} account after email verification. ` +
      `The account has been verified. Your job is to navigate through any remaining ` +
      `onboarding screens, welcome pages, or setup wizards until you reach the main ` +
      `dashboard or home page. Click "Continue", "Next", "Skip", "Get Started", or ` +
      `similar buttons. If you are already on a dashboard or home feed, you are done.`
  });

  const result = await agent.execute({
    instruction:
      `Navigate to the ${config.platform} dashboard. Click through any onboarding, ` +
      `welcome, or setup screens. Stop when you reach the main dashboard or home page. ` +
      `Success criteria: ${config.successIndicator}`,
    maxSteps: 20
  });

  console.log(`[BROWSER] [${config.platform}] Dashboard navigation — success=${result.success}, message="${result.message}"`);

  // Verify we actually made it
  const onDashboard = await verifyOnDashboard(stagehand, page, config);
  return onDashboard;
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
