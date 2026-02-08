import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/server';
import { db } from '@/db';
import { agents } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { createInstagramPost, publishFirstPost } from '@/lib/composio';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ agentId: string }> }
): Promise<NextResponse> {
    const { data: session } = await auth.getSession();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { agentId } = await params;

    // Verify agent belongs to the current user
    const [agent] = await db
        .select()
        .from(agents)
        .where(eq(agents.id, agentId))
        .limit(1);

    if (!agent || agent.operatorId !== session.user.id) {
        return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const body = await request.json();
    const { imageUrl, caption } = body as { imageUrl?: string; caption?: string };

    let result;

    if (imageUrl && caption) {
        // Direct post with provided image and caption
        result = await createInstagramPost(imageUrl, caption);
    } else {
        // Auto-generate first post using AI
        result = await publishFirstPost(agent.name);
    }

    if (result.success) {
        return NextResponse.json({ success: true, result: result.result });
    } else {
        return NextResponse.json({ error: result.error }, { status: 500 });
    }
}
