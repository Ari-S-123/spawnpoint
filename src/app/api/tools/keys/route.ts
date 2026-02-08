import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/server';
import { getAvailableKeys } from '@/lib/wisp';

export async function GET(): Promise<NextResponse> {
  const { data: session } = await auth.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const keys = await getAvailableKeys();
    return NextResponse.json({ keys });
  } catch (error) {
    console.error('[GET /api/tools/keys] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch available keys.' }, { status: 500 });
  }
}
