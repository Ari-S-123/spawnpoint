import { z } from 'zod';

export const CreateAgentSchema = z.object({
  name: z
    .string()
    .min(2, 'Agent name must be at least 2 characters.')
    .max(48, 'Agent name must be at most 48 characters.')
    .regex(/^[a-zA-Z0-9-]+$/, 'Only alphanumeric characters and hyphens allowed.')
});

export type CreateAgentInput = z.infer<typeof CreateAgentSchema>;

export const PLATFORMS = ['instagram', 'twitter', 'mintlify', 'vercel', 'sentry'] as const;

export type Platform = (typeof PLATFORMS)[number];

export type TaskStatusEvent = {
  taskId: string;
  agentId: string;
  platform: Platform;
  status: 'pending' | 'in_progress' | 'awaiting_verification' | 'needs_human' | 'completed' | 'failed';
  message: string;
  browserSessionId?: string;
  screenshot?: string;
  liveViewUrl?: string;
  timestamp: string;
};

export type PlatformConfig = {
  platform: Platform;
  signupUrl: string;
  captchaLikely: boolean;
  /** High-level goal description for the autonomous agent. */
  goal: string;
  /** What the agent should look for to confirm signup is truly done (e.g. dashboard URL pattern, page text). */
  successIndicator: string;
  /** Optional instruction for entering an OTP code after email verification. */
  fillOtp?: string;
};

export const COMPOSIO_APPS = [
  'gmail',
  'instagram',
  'tiktok',
  'twitter',
  'sentry',
  'vercel',
  'mintlify',
  'github'
] as const;
export type ComposioApp = (typeof COMPOSIO_APPS)[number];

export type Integration = {
  id: string;
  agentId: string;
  app: ComposioApp;
  status: 'pending' | 'connected' | 'failed';
  connectedAccountId: string | null;
  createdAt: string;
  updatedAt: string;
};

export const COMPOSIO_APP_CONFIG: Record<ComposioApp, { name: string; color: string }> = {
  gmail: { name: 'Gmail', color: 'from-red-500 to-red-600' },
  instagram: { name: 'Instagram', color: 'from-pink-500 to-purple-500' },
  tiktok: { name: 'TikTok', color: 'from-zinc-900 to-zinc-600' },
  twitter: { name: 'X / Twitter', color: 'from-zinc-600 to-zinc-400' },
  sentry: { name: 'Sentry', color: 'from-purple-500 to-violet-600' },
  vercel: { name: 'Vercel', color: 'from-zinc-200 to-zinc-500' },
  mintlify: { name: 'Mintlify', color: 'from-green-400 to-emerald-600' },
  github: { name: 'GitHub', color: 'from-zinc-700 to-zinc-900' }
};

export type PlatformCredential = {
  email: string;
  password: string;
  apiKey?: string;
  additionalTokens?: Record<string, string>;
  createdAt: string;
};
