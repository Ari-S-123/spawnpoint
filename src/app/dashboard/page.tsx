import { db } from '@/db';
import { agents } from '@/db/schema';
import { auth } from '@/lib/auth/server';
import { eq, desc } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { CreateAgentForm } from '@/components/agents/create-agent-form';
import { AgentListTable } from '@/components/agents/agent-list-table';

export default async function DashboardPage() {
  const { data: session } = await auth.getSession();
  if (!session?.user) {
    redirect('/auth/sign-in');
  }

  const agentList = await db
    .select()
    .from(agents)
    .where(eq(agents.operatorId, session.user.id))
    .orderBy(desc(agents.createdAt));

  const serialized = agentList.map((a) => ({
    ...a,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString()
  }));

  return (
    <>
      <Header title="Dashboard" />
      <div className="flex flex-col gap-6 p-6">
        <CreateAgentForm />
        <div>
          <h2 className="mb-4 text-lg font-semibold">Your Agents</h2>
          <AgentListTable agents={serialized} />
        </div>
      </div>
    </>
  );
}
