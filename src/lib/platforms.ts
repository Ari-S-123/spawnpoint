import type { PlatformConfig } from '@/types';

export const PLATFORM_CONFIGS: Record<string, PlatformConfig> = {
  vercel: {
    platform: 'vercel',
    signupUrl: 'https://vercel.com/signup',
    captchaLikely: false,
    goal:
      'Sign up for a Vercel account. You should see a signup page. Do the following steps:\n' +
      '1. Select the "Hobby" plan (toggle for personal projects)\n' +
      '2. Type the provided name into the name field\n' +
      '3. IMPORTANT: Click "Continue with Email" — do NOT use GitHub/GitLab/Bitbucket. You MUST click the "Sign in with Email" or "Continue with Email" link/button to proceed with email-based signup.\n' +
      '4. Type the provided email into the email field\n' +
      '5. Click the Continue/Submit button to send the verification code\n' +
      'Stop when the page says a verification email has been sent or asks for a code.',
    successIndicator:
      'The URL contains "vercel.com/new" or "vercel.com/dashboard" or the page shows a project creation wizard or dashboard overview.'
  },
  sentry: {
    platform: 'sentry',
    signupUrl: 'https://sentry.io/signup/',
    captchaLikely: true,
    goal:
      'Create a new Sentry account. You should see a signup form. Do the following steps:\n' +
      '1. Type the provided email into the "Email" field\n' +
      '2. Type the provided password into the "Password" field\n' +
      '3. Click the "CREATE YOUR ACCOUNT" button\n' +
      'Stop when either a verification email prompt appears or you reach the Sentry onboarding/dashboard.',
    successIndicator:
      'The URL contains "sentry.io/onboarding" or "sentry.io/organizations" or the page shows onboarding steps or a dashboard.'
  },
  mintlify: {
    platform: 'mintlify',
    signupUrl: 'https://dashboard.mintlify.com/signup',
    captchaLikely: false,
    goal:
      'Sign up for a Mintlify account. You should see a signup form. Do the following steps:\n' +
      '1. Type the provided email into the email field\n' +
      '2. Type the provided password into the password field\n' +
      '3. Click the "Sign up" button\n' +
      'Stop when a verification prompt appears or you reach the Mintlify dashboard.',
    successIndicator:
      'The URL contains "dashboard.mintlify.com" and the page shows a dashboard, project list, or onboarding wizard (not the signup form).'
  },
  instagram: {
    platform: 'instagram',
    signupUrl: 'https://www.instagram.com/accounts/emailsignup/',
    captchaLikely: false,
    goal:
      'Create an Instagram account. You should see a signup form. Do the following steps:\n' +
      '1. Type the provided email into the "Mobile Number or Email" field\n' +
      '2. Type the provided full name into the "Full Name" field\n' +
      '3. Type the provided username into the "Username" field\n' +
      '4. Type the provided password into the "Password" field\n' +
      '5. Click the "Sign up" button\n' +
      '6. If a birthday screen appears, select the provided birth month, day, and year from the dropdowns and click "Next"\n' +
      'Stop when a confirmation code entry screen appears or you see a prompt to enter a code.',
    successIndicator:
      'The page shows the Instagram feed, profile setup, or the URL contains "instagram.com/accounts/onetap" or similar logged-in state.',
    fillOtp: 'type %otp% into the confirmation code input field'
  },
  twitter: {
    platform: 'twitter',
    signupUrl: 'https://x.com/i/flow/signup',
    captchaLikely: true,
    goal:
      'Create a new X (Twitter) account. You should see a signup flow. Do the following steps:\n' +
      '1. Click "Create account" if that button is visible\n' +
      '2. Type the provided name into the "Name" field\n' +
      '3. Type the provided email into the email field\n' +
      '4. Select the provided birth month from the month dropdown\n' +
      '5. Select the provided birth day from the day dropdown\n' +
      '6. Select the provided birth year from the year dropdown\n' +
      '7. Click "Next" to proceed\n' +
      '8. If a "Customize your experience" screen appears, click "Next"\n' +
      '9. If a confirmation screen appears, click "Sign up"\n' +
      '10. If a password field appears, type the provided password and click "Next"\n' +
      'Stop when a verification code input appears or you reach the X home feed.',
    successIndicator: 'The URL is "x.com/home" or the page shows the X/Twitter feed, or profile setup flow.',
    fillOtp: 'type %otp% into the verification code input field'
  }
};
