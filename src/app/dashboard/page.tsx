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
      <div className="flex flex-col gap-8 p-6">
        <CreateAgentForm />
        <div>
          <div className="mb-4">
            <p className="mb-2 text-xs font-medium tracking-[0.3em] text-amber-400/60 uppercase">Agent Registry</p>
            <h2
              className="text-xl font-light text-zinc-200"
              style={{ fontFamily: 'var(--font-playfair), Georgia, serif' }}
            >
              Your Agents
            </h2>
          </div>
          <AgentListTable agents={serialized} />
        </div>
      </div>
    </>
  );
}
