import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { agents } from '@/db/schema';
import { auth } from '@/lib/auth/server';
import { and, eq } from 'drizzle-orm';
import { getIntegration } from '@/lib/composio';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ agentId: string; integrationId: string }> }
): Promise<NextResponse> {
  const { data: session } = await auth.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { agentId, integrationId } = await params;

  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.operatorId, session.user.id)))
    .limit(1);

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  const integration = await getIntegration(agentId, integrationId);

  if (!integration) {
    return NextResponse.json({ error: 'Integration not found' }, { status: 404 });
  }

  return NextResponse.json({ integration });
}
