import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/server';
import { searchTools } from '@/lib/wisp';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { data: session } = await auth.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const query = searchParams.get('query');
  if (!query) {
    return NextResponse.json({ error: 'Missing required parameter: query' }, { status: 400 });
  }

  const page = parseInt(searchParams.get('page') ?? '1', 10);
  const limit = parseInt(searchParams.get('limit') ?? '10', 10);

  try {
    const results = await searchTools(query, page, limit);
    return NextResponse.json(results);
  } catch (error) {
    console.error('[GET /api/tools/search] Error:', error);
    return NextResponse.json({ error: 'Failed to search tools.' }, { status: 500 });
  }
}
