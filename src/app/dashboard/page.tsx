import { db } from '@/db';
import { agents, setupTasks } from '@/db/schema';
import { auth } from '@/lib/auth/server';
import { eq, desc, count, inArray } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { CreateAgentForm } from '@/components/agents/create-agent-form';
import { AgentListTable } from '@/components/agents/agent-list-table';

export default async function DashboardPage() {
  const { data: session } = await auth.getSession();
  if (!session?.user) {
    redirect('/auth/sign-in');
  }

  const [agentList, countResult] = await Promise.all([
    db
      .select()
      .from(agents)
      .where(eq(agents.operatorId, session.user.id))
      .orderBy(desc(agents.createdAt)),
    db.select({ value: count() }).from(agents)
  ]);
  const agentCount = countResult[0]?.value ?? 0;

  const agentIds = agentList.map((a) => a.id);

  const allTasks =
    agentIds.length > 0
      ? await db
          .select({
            agentId: setupTasks.agentId,
            platform: setupTasks.platform,
            status: setupTasks.status
          })
          .from(setupTasks)
          .where(inArray(setupTasks.agentId, agentIds))
      : [];

  const tasksByAgent = new Map<string, { platform: string; status: string }[]>();
  for (const task of allTasks) {
    const existing = tasksByAgent.get(task.agentId) ?? [];
    existing.push({ platform: task.platform, status: task.status });
    tasksByAgent.set(task.agentId, existing);
  }

  const serialized = agentList.map((a) => ({
    id: a.id,
    name: a.name,
    email: a.email,
    createdAt: a.createdAt.toISOString(),
    tasks: tasksByAgent.get(a.id) ?? []
  }));

  return (
    <>
      <Header breadcrumbs={[{ label: 'Agents' }]} />
      <div className="flex flex-col gap-6 p-6">
        <CreateAgentForm agentCount={agentCount} />
        <div>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Your Agents</h2>
              {agentList.length > 0 && (
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {agentList.length} agent{agentList.length !== 1 ? 's' : ''} configured
                </p>
              )}
            </div>
          </div>
          <AgentListTable agents={serialized} />
        </div>
      </div>
    </>
  );
}
