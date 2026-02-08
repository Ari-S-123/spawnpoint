import { z } from 'zod';

export const CreateAgentSchema = z.object({
  name: z
    .string()
    .min(2, 'Agent name must be at least 2 characters.')
    .max(48, 'Agent name must be at most 48 characters.')
    .regex(/^[a-zA-Z0-9-]+$/, 'Only alphanumeric characters and hyphens allowed.')
});

export type CreateAgentInput = z.infer<typeof CreateAgentSchema>;

export const PLATFORMS = ['instagram', 'tiktok', 'twitter', 'mintlify', 'vercel', 'sentry'] as const;

export type Platform = (typeof PLATFORMS)[number];

export type TaskStatusEvent = {
  taskId: string;
  agentId: string;
  platform: Platform;
  status: 'pending' | 'in_progress' | 'awaiting_verification' | 'needs_human' | 'completed' | 'failed';
  message: string;
  browserSessionId?: string;
  liveViewUrl?: string;
  timestamp: string;
};

export type PlatformConfig = {
  platform: Platform;
  signupUrl: string;
  captchaLikely: boolean;
  selectors: {
    emailInput: string;
    passwordInput: string;
    submitButton: string;
    otpInput?: string;
    dashboardUrl?: string;
  };
};

export type PlatformCredential = {
  email: string;
  password: string;
  apiKey?: string;
  additionalTokens?: Record<string, string>;
  createdAt: string;
};
