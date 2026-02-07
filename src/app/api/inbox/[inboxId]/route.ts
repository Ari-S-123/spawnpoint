import { NextRequest, NextResponse } from 'next/server';
import { listInboxMessages } from '@/lib/agentmail';
import { auth } from '@/lib/auth/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ inboxId: string }> }
): Promise<NextResponse> {
  const { data: session } = await auth.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { inboxId } = await params;

  try {
    const messages = await listInboxMessages(inboxId);
    return NextResponse.json({ messages });
  } catch (error) {
    console.error('[GET /api/inbox] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch messages.' }, { status: 500 });
  }
}
