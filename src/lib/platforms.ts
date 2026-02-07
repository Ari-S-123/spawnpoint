import type { PlatformConfig } from '@/types';

export const PLATFORM_CONFIGS: Record<string, PlatformConfig> = {
  vercel: {
    platform: 'vercel',
    signupUrl: 'https://vercel.com/signup',
    captchaLikely: false,
    instructions: {
      fillEmail: 'type %email% into the email input field',
      fillPassword: 'type %password% into the password input field',
      submit: 'click the sign up button'
    }
  },
  sentry: {
    platform: 'sentry',
    signupUrl: 'https://sentry.io/signup/',
    captchaLikely: true,
    instructions: {
      fillEmail: 'type %email% into the email input field',
      fillPassword: 'type %password% into the password input field',
      submit: 'click the create your account button'
    }
  },
  mintlify: {
    platform: 'mintlify',
    signupUrl: 'https://dashboard.mintlify.com/signup',
    captchaLikely: false,
    instructions: {
      fillEmail: 'type %email% into the email input field',
      fillPassword: 'type %password% into the password input field',
      submit: 'click the sign up button'
    }
  },
  instagram: {
    platform: 'instagram',
    signupUrl: 'https://www.instagram.com/accounts/emailsignup/',
    captchaLikely: true,
    instructions: {
      fillEmail: 'type %email% into the email or phone number input field',
      fillPassword: 'type %password% into the password input field',
      submit: 'click the sign up button',
      fillOtp: 'type %otp% into the confirmation code input field'
    }
  },
  tiktok: {
    platform: 'tiktok',
    signupUrl: 'https://www.tiktok.com/signup',
    captchaLikely: true,
    instructions: {
      fillEmail: 'type %email% into the email input field',
      fillPassword: 'type %password% into the password input field',
      submit: 'click the sign up button'
    }
  },
  twitter: {
    platform: 'twitter',
    signupUrl: 'https://x.com/i/flow/signup',
    captchaLikely: true,
    instructions: {
      fillEmail: 'type %email% into the email input field',
      fillPassword: 'type %password% into the password input field',
      submit: 'click the next or sign up button'
    }
  }
};
