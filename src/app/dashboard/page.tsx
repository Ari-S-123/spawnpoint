import { db } from '@/db';
import { agents } from '@/db/schema';
import { getCachedSession } from '@/lib/auth/session';
import { eq, desc } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { CreateAgentForm } from '@/components/agents/create-agent-form';
import { AgentListTable } from '@/components/agents/agent-list-table';

export default async function DashboardPage() {
  const { data: session } = await getCachedSession();
  if (!session?.user) {
    redirect('/auth/sign-in');
  }

  const agentList = await db
    .select()
    .from(agents)
    .where(eq(agents.operatorId, session.user.id))
    .orderBy(desc(agents.createdAt));
  const agentCount = agentList.length;

  const serialized = agentList.map((a) => ({
    id: a.id,
    name: a.name,
    email: a.email,
    createdAt: a.createdAt.toISOString()
  }));

  return (
    <>
      <Header breadcrumbs={[{ label: 'Agents' }]} />
      <div className="flex flex-col gap-6 p-6">
        <CreateAgentForm agentCount={agentCount} />
        <div>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2
                className="text-lg font-semibold tracking-tight"
                style={{ fontFamily: 'var(--font-playfair), Georgia, serif' }}
              >
                Your Agents
              </h2>
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
