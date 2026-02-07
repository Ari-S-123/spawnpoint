import { randomBytes } from 'crypto';
import { db } from '@/db';
import { credentials } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import type { Platform, PlatformCredential } from '@/types';

const PASSWORD_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*';

export function generatePassword(length = 24): string {
  const bytes = randomBytes(length);
  return Array.from(bytes)
    .map((byte) => PASSWORD_CHARS[byte % PASSWORD_CHARS.length])
    .join('');
}

export async function storeCredential(
  agentId: string,
  platform: Platform,
  credential: PlatformCredential
): Promise<void> {
  await db.insert(credentials).values({
    agentId,
    platform,
    email: credential.email,
    password: credential.password,
    apiKey: credential.apiKey ?? null,
    additionalData: credential.additionalTokens ?? null
  });
}

export async function getCredential(agentId: string, platform: Platform): Promise<PlatformCredential | undefined> {
  const [row] = await db
    .select()
    .from(credentials)
    .where(and(eq(credentials.agentId, agentId), eq(credentials.platform, platform)))
    .limit(1);

  if (!row) return undefined;

  return {
    email: row.email,
    password: row.password,
    apiKey: row.apiKey ?? undefined,
    additionalTokens: (row.additionalData as Record<string, string>) ?? undefined,
    createdAt: row.createdAt.toISOString()
  };
}

export async function listAgentCredentials(agentId: string): Promise<string[]> {
  const rows = await db
    .select({ platform: credentials.platform })
    .from(credentials)
    .where(eq(credentials.agentId, agentId));

  return rows.map((r) => r.platform);
}
