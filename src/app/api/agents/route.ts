import { NextRequest, NextResponse, after } from 'next/server';
import { db } from '@/db';
import { agents, setupTasks } from '@/db/schema';
import { CreateAgentSchema, PLATFORMS } from '@/types';
import { createAgentEmail } from '@/lib/agentmail';
import { generatePassword, storeCredential } from '@/lib/vault';
import { enqueueSignupTasks } from '@/lib/orchestrator';
import { auth } from '@/lib/auth/server';
import { eq, desc, count } from 'drizzle-orm';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { data: session } = await auth.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = CreateAgentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const result = await db.select({ value: count() }).from(agents);
  const agentCount = result[0]?.value ?? 0;
  if (agentCount >= 3) {
    return NextResponse.json(
      { error: 'Maximum of 3 agents allowed. Delete an existing agent to create a new one.' },
      { status: 400 }
    );
  }

  const { name } = parsed.data;
  const sanitizedName = name.toLowerCase().replace(/\s+/g, '-');

  try {
    const inbox = await createAgentEmail(sanitizedName);
    const email = `${inbox.username}@agentmail.to`;

    const [agent] = await db
      .insert(agents)
      .values({
        name: sanitizedName,
        email,
        inboxId: inbox.inbox_id,
        operatorId: session.user.id
      })
      .returning();

    if (!agent) {
      throw new Error('Failed to insert agent record.');
    }

    const taskRecords = await Promise.all(
      PLATFORMS.map(async (platform) => {
        const password = generatePassword();

        await storeCredential(agent.id, platform, {
          email,
          password,
          createdAt: new Date().toISOString()
        });

        const [task] = await db
          .insert(setupTasks)
          .values({
            agentId: agent.id,
            platform,
            status: 'pending'
          })
          .returning();

        return task;
      })
    );

    // Enqueue signup orchestration (non-blocking, runs after response)
    after(() => {
      enqueueSignupTasks(agent.id, email, inbox.inbox_id).catch(console.error);
    });

    return NextResponse.json({ agent, tasks: taskRecords }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/agents] Error:', error);
    return NextResponse.json({ error: 'Failed to create agent.' }, { status: 500 });
  }
}

export async function GET(): Promise<NextResponse> {
  const { data: session } = await auth.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const agentList = await db
    .select()
    .from(agents)
    .where(eq(agents.operatorId, session.user.id))
    .orderBy(desc(agents.createdAt));

  return NextResponse.json({ agents: agentList });
}
