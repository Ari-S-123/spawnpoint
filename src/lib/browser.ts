import { chromium, type Page, type Browser } from 'playwright-core';
import Browserbase from '@browserbasehq/sdk';

const bb = new Browserbase({
  apiKey: process.env.BROWSERBASE_API_KEY!
});

export async function createBrowserSession(): Promise<{
  browser: Browser;
  page: Page;
  sessionId: string;
}> {
  const session = await bb.sessions.create({
    projectId: process.env.BROWSERBASE_PROJECT_ID!
  });

  const browser = await chromium.connectOverCDP(session.connectUrl);
  const defaultContext = browser.contexts()[0];

  if (!defaultContext) {
    throw new Error('Browserbase session has no default context.');
  }

  const page = defaultContext.pages()[0];

  if (!page) {
    throw new Error('Browserbase session has no default page.');
  }

  return {
    browser,
    page,
    sessionId: session.id
  };
}

export async function performSignup(
  page: Page,
  config: {
    signupUrl: string;
    selectors: {
      emailInput: string;
      passwordInput: string;
      submitButton: string;
    };
  },
  email: string,
  password: string
): Promise<'completed' | 'captcha'> {
  await page.goto(config.signupUrl, {
    timeout: 120_000,
    waitUntil: 'domcontentloaded'
  });

  const captchaFrame = await page.$(
    'iframe[src*="captcha"], iframe[src*="recaptcha"], [class*="captcha"], [id*="captcha"]'
  );
  if (captchaFrame) {
    return 'captcha';
  }

  await page.waitForSelector(config.selectors.emailInput, { timeout: 120_000 });
  await page.fill(config.selectors.emailInput, email);
  await page.fill(config.selectors.passwordInput, password);
  await page.click(config.selectors.submitButton);

  await page.waitForTimeout(3000);

  const postSubmitCaptcha = await page.$('iframe[src*="captcha"], iframe[src*="recaptcha"], [class*="captcha"]');
  if (postSubmitCaptcha) {
    return 'captcha';
  }

  return 'completed';
}

export async function injectOTP(
  page: Page,
  otp: string,
  selector = 'input[name="code"], input[name="confirmationCode"], input[name="otp"], input[type="tel"]'
): Promise<void> {
  await page.waitForSelector(selector, { timeout: 120_000 });
  await page.fill(selector, otp);

  const verifyButton = await page.$(
    'button:has-text("Verify"), button:has-text("Confirm"), button:has-text("Submit"), button[type="submit"]'
  );
  if (verifyButton) {
    await verifyButton.click();
  }
}

export async function getSessionLiveViewUrl(sessionId: string): Promise<string> {
  const debugInfo = await bb.sessions.debug(sessionId);
  return debugInfo.debuggerFullscreenUrl;
}

export async function takeScreenshot(page: Page): Promise<string> {
  const buffer = await page.screenshot({ type: 'png', fullPage: false });
  return buffer.toString('base64');
}
