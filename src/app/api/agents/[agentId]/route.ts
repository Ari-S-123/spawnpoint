import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { agents, setupTasks } from '@/db/schema';
import { auth } from '@/lib/auth/server';
import { and, eq } from 'drizzle-orm';

export async function GET(
  _request: NextRequest,
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

  const tasks = await db.select().from(setupTasks).where(eq(setupTasks.agentId, agentId));

  return NextResponse.json({ agent, tasks });
}
