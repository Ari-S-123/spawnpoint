import { notFound, redirect } from 'next/navigation';
import { db } from '@/db';
import { agents, setupTasks } from '@/db/schema';
import { auth } from '@/lib/auth/server';
import { and, eq } from 'drizzle-orm';
import { formatDistanceToNow } from 'date-fns';
import { Header } from '@/components/layout/header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AgentStatusGrid } from '@/components/agents/agent-status-grid';
import { CredentialsTable } from '@/components/vault/credentials-table';
import { InboxViewer } from '@/components/inbox/inbox-viewer';
import { TaskActivityLog } from '@/components/agents/task-activity-log';
import { Bot, Shield, Activity } from 'lucide-react';

const tabTriggerClass = 'data-[state=active]:text-amber-300';

export default async function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { data: session } = await auth.getSession();
  if (!session?.user) {
    redirect('/auth/sign-in');
  }

  const { id } = await params;

  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, id), eq(agents.operatorId, session.user.id)))
    .limit(1);

  if (!agent) {
    notFound();
  }

  const tasks = await db.select().from(setupTasks).where(eq(setupTasks.agentId, id));

  const serializedTasks = tasks.map((t) => ({
    id: t.id,
    platform: t.platform,
    status: t.status,
    browserSessionId: t.browserSessionId,
    errorMessage: t.errorMessage
  }));

  return (
    <>
      <Header breadcrumbs={[{ label: 'Agents', href: '/dashboard' }, { label: agent.name }]} />
      <div className="p-6">
        {/* Agent identity card */}
        <div className="mb-6 flex items-center gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-500/15 bg-amber-500/10 text-amber-400">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{agent.name}</h1>
            <p className="font-mono text-xs text-muted-foreground">{agent.email}</p>
          </div>
          <span className="ml-auto text-xs text-muted-foreground">
            Created {formatDistanceToNow(agent.createdAt, { addSuffix: true })}
          </span>
        </div>

        <Tabs defaultValue="overview">
          <TabsList className="mb-6">
            <TabsTrigger value="overview" className={`gap-1.5 ${tabTriggerClass}`}>
              <Activity className="h-3.5 w-3.5" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="vault" className={`gap-1.5 ${tabTriggerClass}`}>
              <Shield className="h-3.5 w-3.5" />
              Credentials
            </TabsTrigger>
            <TabsTrigger value="activity" className={`gap-1.5 ${tabTriggerClass}`}>
              <Bot className="h-3.5 w-3.5" />
              Activity
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-0">
            <div className="grid gap-6 lg:grid-cols-[1fr_220px]">
              {/* Inbox — main content */}
              <div>
                <InboxViewer inboxId={agent.inboxId} />
              </div>

              {/* Compact connection status */}
              <div>
                <AgentStatusGrid agentId={agent.id} initialTasks={serializedTasks} />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="vault" className="mt-0">
            <CredentialsTable agentId={agent.id} />
          </TabsContent>

          <TabsContent value="activity" className="mt-0">
            <TaskActivityLog agentId={agent.id} />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
