import { notFound, redirect } from 'next/navigation';
import { db } from '@/db';
import { agents, setupTasks } from '@/db/schema';
import { auth } from '@/lib/auth/server';
import { and, eq } from 'drizzle-orm';
import { Header } from '@/components/layout/header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { AgentStatusGrid } from '@/components/agents/agent-status-grid';
import { CredentialsTable } from '@/components/vault/credentials-table';
import { InboxViewer } from '@/components/inbox/inbox-viewer';
import { TaskActivityLog } from '@/components/agents/task-activity-log';
import { ActionsPanel } from '@/components/agents/actions-panel';
import { IntegrationsPanel } from '@/components/agents/integrations-panel';

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

  const completedCount = tasks.filter((t) => t.status === 'completed').length;

  return (
    <>
      <Header title={`Agent: ${agent.name}`} />
      <div className="p-6">
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{agent.name}</h1>
            <Badge variant="secondary">
              {completedCount}/{tasks.length} complete
            </Badge>
          </div>
          <p className="mt-2 text-muted-foreground">
            <span className="font-medium text-foreground">Email:</span>{' '}
            <code className="rounded bg-muted px-2 py-1 font-mono text-sm">{agent.email}</code>
          </p>
        </div>

        <Tabs defaultValue="status">
          <TabsList>
            <TabsTrigger value="status">Status</TabsTrigger>
            <TabsTrigger value="inbox">Inbox</TabsTrigger>
            <TabsTrigger value="vault">Credentials</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="actions">Actions</TabsTrigger>
          </TabsList>

          <TabsContent value="status" className="mt-6">
            <AgentStatusGrid agentId={agent.id} initialTasks={serializedTasks} />
          </TabsContent>

          <TabsContent value="inbox" className="mt-6">
            <InboxViewer inboxId={agent.inboxId} />
          </TabsContent>

          <TabsContent value="vault" className="mt-6">
            <CredentialsTable agentId={agent.id} />
          </TabsContent>

          <TabsContent value="activity" className="mt-6">
            <TaskActivityLog agentId={agent.id} />
          </TabsContent>

          <TabsContent value="integrations" className="mt-6">
            <IntegrationsPanel agentId={agent.id} />
          </TabsContent>

          <TabsContent value="actions" className="mt-6">
            <ActionsPanel agentId={agent.id} />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
