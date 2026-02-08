import { Composio } from 'composio-core';
import { db } from '@/db';
import { integrations } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import type { ComposioApp } from '@/types';

let _composio: Composio | null = null;

function getClient(): Composio {
  if (!_composio) {
    _composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY! });
  }
  return _composio;
}

export async function initiateConnection(
  agentId: string,
  app: ComposioApp
): Promise<{ redirectUrl: string | null; integrationId: string }> {
  const entity = getClient().getEntity(agentId);

  const connectionRequest = await entity.initiateConnection({
    appName: app
  });

  console.log(`[composio] initiateConnection: connectedAccountId=${connectionRequest.connectedAccountId}, status=${connectionRequest.connectionStatus}, redirectUrl=${connectionRequest.redirectUrl}`);

  const rows = await db
    .insert(integrations)
    .values({
      agentId,
      app,
      connectedAccountId: connectionRequest.connectedAccountId,
      status: 'pending'
    })
    .returning();

  const row = rows[0]!;

  // Poll in the background for completion using SDK's waitUntilActive + manual fallback
  waitForConnection(row.id, connectionRequest).catch(
    (err) => console.error(`[composio] waitForConnection failed for ${row.id}:`, err)
  );

  return {
    redirectUrl: connectionRequest.redirectUrl ?? null,
    integrationId: row.id
  };
}

async function waitForConnection(
  integrationRowId: string,
  connectionRequest: { connectedAccountId: string; waitUntilActive: (timeout?: number) => Promise<unknown> }
) {
  // First try the SDK's built-in wait (timeout 180s)
  try {
    console.log(`[composio] waitForConnection: waiting via SDK for ${connectionRequest.connectedAccountId}`);
    await connectionRequest.waitUntilActive(180);
    console.log(`[composio] waitForConnection: SDK reports active for ${connectionRequest.connectedAccountId}`);
    await db
      .update(integrations)
      .set({ status: 'connected', updatedAt: new Date() })
      .where(eq(integrations.id, integrationRowId));
    return;
  } catch (sdkErr) {
    console.log(`[composio] waitUntilActive threw, falling back to manual polling:`, sdkErr);
  }

  // Fallback: manual polling with status logging
  const maxAttempts = 60;
  const intervalMs = 3000;

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));

    try {
      const account = await getClient().connectedAccounts.get({
        connectedAccountId: connectionRequest.connectedAccountId
      });

      const status = String(account.status ?? '').toUpperCase();
      console.log(`[composio] poll ${i + 1}/${maxAttempts}: account status="${status}" (raw="${account.status}")`);

      if (status === 'ACTIVE') {
        await db
          .update(integrations)
          .set({ status: 'connected', updatedAt: new Date() })
          .where(eq(integrations.id, integrationRowId));
        return;
      }

      if (status === 'FAILED' || status === 'EXPIRED') {
        await db
          .update(integrations)
          .set({ status: 'failed', updatedAt: new Date() })
          .where(eq(integrations.id, integrationRowId));
        return;
      }
    } catch (err) {
      console.warn(`[composio] poll ${i + 1} error:`, err);
    }
  }

  // Timed out
  console.warn(`[composio] waitForConnection timed out for ${integrationRowId}`);
  await db
    .update(integrations)
    .set({ status: 'failed', updatedAt: new Date() })
    .where(eq(integrations.id, integrationRowId));
}

export async function getAgentIntegrations(agentId: string) {
  const rows = await db.select().from(integrations).where(eq(integrations.agentId, agentId));

  // Reconcile: check Composio for any non-connected rows
  const needsReconcile = rows.filter((r) => r.status !== 'connected');
  if (needsReconcile.length === 0) return rows;

  try {
    // Fetch all entity connections from Composio in one call
    const entity = getClient().getEntity(agentId);
    const connections = await entity.getConnections();

    for (const row of needsReconcile) {
      // Match by connectedAccountId or by app name
      const match = connections.find(
        (c) =>
          (row.connectedAccountId && c.id === row.connectedAccountId) ||
          c.appName?.toLowerCase() === row.app
      );

      if (!match) continue;

      const status = String(match.status ?? '').toUpperCase();

      if (status === 'ACTIVE') {
        await db
          .update(integrations)
          .set({
            status: 'connected',
            connectedAccountId: match.id,
            updatedAt: new Date()
          })
          .where(eq(integrations.id, row.id));
        (row as { status: string }).status = 'connected';
        (row as { connectedAccountId: string | null }).connectedAccountId = match.id;
      } else if (status === 'FAILED' || status === 'EXPIRED') {
        await db
          .update(integrations)
          .set({ status: 'failed', updatedAt: new Date() })
          .where(eq(integrations.id, row.id));
      }
    }
  } catch (err) {
    console.warn('[composio] reconciliation error:', err);
  }

  return rows;
}

export async function getIntegration(agentId: string, integrationId: string) {
  const [row] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.id, integrationId), eq(integrations.agentId, agentId)))
    .limit(1);
  return row ?? null;
}

export async function getComposioTools(agentId: string, apps?: string[]) {
  const rows = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.agentId, agentId), eq(integrations.status, 'connected')));

  const connectedApps = apps ?? rows.map((r) => r.app);
  if (connectedApps.length === 0) return [];

  const result = await getClient().actions.list({
    apps: connectedApps.join(','),
    filterImportantActions: true
  });

  return (result.items ?? []).map((a) => ({
    name: a.name,
    displayName: a.displayName,
    description: a.description,
    appName: a.appName,
    tags: a.tags,
    parameters: a.parameters
  }));
}

export async function executeComposioTool(
  agentId: string,
  actionName: string,
  args: Record<string, unknown>
) {
  const entity = getClient().getEntity(agentId);

  const result = await entity.execute({
    actionName,
    params: args
  });

  return result;
}
