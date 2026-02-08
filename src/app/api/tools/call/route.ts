import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/server';
import { callTool } from '@/lib/wisp';
import { db } from '@/db';
import { auditLog } from '@/db/schema';
import type { CallRequest } from '@/lib/wisp';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { data: session } = await auth.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: CallRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.server_name || !body.tool_name) {
    return NextResponse.json({ error: 'Missing required fields: server_name, tool_name' }, { status: 400 });
  }

  try {
    const result = await callTool(body);

    await db.insert(auditLog).values({
      operatorId: session.user.id,
      action: 'tool_call',
      resourceId: `${body.server_name}/${body.tool_name}`
    });

    return NextResponse.json({ result });
  } catch (error) {
    console.error('[POST /api/tools/call] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to execute tool.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
