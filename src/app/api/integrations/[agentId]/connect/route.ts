import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { agents } from '@/db/schema';
import { auth } from '@/lib/auth/server';
import { and, eq } from 'drizzle-orm';
import { initiateConnection } from '@/lib/composio';
import { COMPOSIO_APPS, type ComposioApp } from '@/types';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
): Promise<NextResponse> {
  const { data: session } = await auth.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { agentId } = await params;

  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.operatorId, session.user.id)))
    .limit(1);

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  const body = await request.json();
  const app = body.app as string;

  if (!COMPOSIO_APPS.includes(app as ComposioApp)) {
    return NextResponse.json({ error: 'Invalid app' }, { status: 400 });
  }

  const result = await initiateConnection(agentId, app as ComposioApp);

  return NextResponse.json(result);
}
