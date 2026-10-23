import { getSessionDetails } from '@/lib/chatData';
import { canReviewSessionsForChatbot } from '@/lib/adminAccess';
import { auth } from '@clerk/nextjs/server';
import * as XLSX from 'xlsx';
import { type NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type Format = 'csv' | 'xlsx';

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toCsv(rows: Record<string, string | number>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(','),
    ...rows.map((row) =>
      headers.map((h) => escapeCsv(String(row[h] ?? ''))).join(',')
    ),
  ];
  return lines.join('\r\n');
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await ctx.params;
  const sessionId = parseInt(id, 10);
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return NextResponse.json({ error: 'Invalid session id' }, { status: 400 });
  }

  const formatParam = (req.nextUrl.searchParams.get('format') || 'csv')
    .toLowerCase() as Format;
  if (formatParam !== 'csv' && formatParam !== 'xlsx') {
    return NextResponse.json(
      { error: "format must be 'csv' or 'xlsx'" },
      { status: 400 }
    );
  }

  try {
    const session = await getSessionDetails(sessionId);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Tenant guard — owner OR invited admin can review this chatbot.
    const allowed = await canReviewSessionsForChatbot(
      userId,
      session.chatbot.id,
    );
    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const guest = session.guest;
    const chatbot = session.chatbot;
    const startedAt = new Date(session.created_at);
    const sortedMessages = [...session.messages].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    const lastMessageAt = sortedMessages.length
      ? new Date(sortedMessages[sortedMessages.length - 1].created_at)
      : startedAt;
    const durationMs = lastMessageAt.getTime() - startedAt.getTime();
    const durationMin = Math.max(0, Math.round(durationMs / 60000));

    const summaryRows: Record<string, string | number>[] = [
      { Field: 'Session ID', Value: session.id },
      { Field: 'Chatbot', Value: chatbot.name },
      { Field: 'Guest Name', Value: guest?.name ?? 'Anonymous' },
      { Field: 'Guest Email', Value: guest?.email ?? '' },
      { Field: 'Started At', Value: startedAt.toISOString() },
      { Field: 'Last Message At', Value: lastMessageAt.toISOString() },
      { Field: 'Duration (min)', Value: durationMin },
      { Field: 'Message Count', Value: sortedMessages.length },
      {
        Field: 'User Messages',
        Value: sortedMessages.filter((m) => m.sender === 'user').length,
      },
      {
        Field: 'AI Messages',
        Value: sortedMessages.filter((m) => m.sender === 'ai').length,
      },
    ];

    const messageRows: Record<string, string | number>[] = sortedMessages.map(
      (m, i) => ({
        '#': i + 1,
        Timestamp: new Date(m.created_at).toISOString(),
        Sender: m.sender === 'ai' ? 'AI' : 'User',
        Content: m.content,
      })
    );

    const safe = (s: string) => s.replace(/[^a-z0-9-_]+/gi, '_').slice(0, 60);
    const filename = `assistly-session-${session.id}-${safe(chatbot.name)}-${safe(
      guest?.name ?? 'guest'
    )}`.replace(/-+$/, '');

    if (formatParam === 'csv') {
      const csv =
        '# Session Summary\r\n' +
        toCsv(summaryRows) +
        '\r\n\r\n# Messages\r\n' +
        toCsv(messageRows) +
        '\r\n';
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}.csv"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    // XLSX — two sheets: Summary + Messages.
    const wb = XLSX.utils.book_new();
    const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
    summarySheet['!cols'] = [{ wch: 20 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

    const messagesSheet = XLSX.utils.json_to_sheet(messageRows);
    messagesSheet['!cols'] = [
      { wch: 5 },
      { wch: 24 },
      { wch: 8 },
      { wch: 80 },
    ];
    XLSX.utils.book_append_sheet(wb, messagesSheet, 'Messages');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}.xlsx"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[/api/export-session] error', error);
    return NextResponse.json(
      { error: 'Failed to export session' },
      { status: 500 }
    );
  }
}
