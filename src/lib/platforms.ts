import type { PlatformConfig } from '@/types';

export const PLATFORM_CONFIGS: Record<string, PlatformConfig> = {
  vercel: {
    platform: 'vercel',
    signupUrl: 'https://vercel.com/signup',
    captchaLikely: false,
    selectors: {
      emailInput: 'input[name="email"]',
      passwordInput: 'input[name="password"]',
      submitButton: 'button[type="submit"]',
      dashboardUrl: '**/dashboard**'
    }
  },
  sentry: {
    platform: 'sentry',
    signupUrl: 'https://sentry.io/signup/',
    captchaLikely: false,
    selectors: {
      emailInput: '#id_username',
      passwordInput: '#id_password',
      submitButton: 'button[type="submit"]',
      dashboardUrl: '**/organizations/**'
    }
  },
  mintlify: {
    platform: 'mintlify',
    signupUrl: 'https://dashboard.mintlify.com/signup',
    captchaLikely: false,
    selectors: {
      emailInput: 'input[type="email"]',
      passwordInput: 'input[type="password"]',
      submitButton: 'button[type="submit"]'
    }
  },
  instagram: {
    platform: 'instagram',
    signupUrl: 'https://www.instagram.com/accounts/emailsignup/',
    captchaLikely: true,
    selectors: {
      emailInput: 'input[name="emailOrPhone"]',
      passwordInput: 'input[name="password"]',
      submitButton: 'button[type="submit"]',
      otpInput: 'input[name="confirmationCode"]'
    }
  },
  tiktok: {
    platform: 'tiktok',
    signupUrl: 'https://www.tiktok.com/signup',
    captchaLikely: true,
    selectors: {
      emailInput: 'input[name="email"]',
      passwordInput: 'input[name="password"]',
      submitButton: 'button[type="submit"]'
    }
  },
  twitter: {
    platform: 'twitter',
    signupUrl: 'https://x.com/i/flow/signup',
    captchaLikely: true,
    selectors: {
      emailInput: 'input[name="email"]',
      passwordInput: 'input[name="password"]',
      submitButton: 'button[data-testid="LoginForm_Login_Button"]'
    }
  }
};
