import { NextRequest, NextResponse } from 'next/server';
import { getCredential } from '@/lib/vault';
import { auth } from '@/lib/auth/server';
import { db } from '@/db';
import { auditLog } from '@/db/schema';
import type { Platform } from '@/types';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ agentId: string; platform: string }> }
): Promise<NextResponse> {
  const { data: session } = await auth.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { agentId, platform } = await params;

  try {
    const credential = await getCredential(agentId, platform as Platform);

    if (!credential) {
      return NextResponse.json({ error: 'Credential not found' }, { status: 404 });
    }

    // Log the credential access
    await db.insert(auditLog).values({
      operatorId: session.user.id,
      action: 'view_credential',
      resourceId: `${agentId}/${platform}`
    });

    return NextResponse.json({ credential });
  } catch (error) {
    console.error('[GET /api/vault] Error:', error);
    return NextResponse.json({ error: 'Failed to retrieve credential.' }, { status: 500 });
  }
}
