import { NextResponse } from 'next/server';
import { getSession } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

// Decision trail export for one call: transcript, scores, every policy decision with its window,
// events, verification result and timings. Served as a download.
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const session = getSession(id);
  if (!session) {
    return NextResponse.json({ error: 'Unknown session' }, { status: 404 });
  }

  const body = {
    exportedAt: new Date().toISOString(),
    session,
  };
  return new NextResponse(JSON.stringify(body, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="gatekeeper-trail-${encodeURIComponent(id)}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}
