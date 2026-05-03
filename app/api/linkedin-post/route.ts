import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_N8N_WEBHOOK_URL = 'https://n8n.srv1546601.hstgr.cloud/webhook/pixii-linkedin-post';

export async function POST(req: Request) {
  try {
    const { content, scheduled_at, post_now, linkedin_person } = (await req.json()) as {
      content?: string;
      scheduled_at?: string;
      post_now?: boolean;
      linkedin_person?: string;
    };

    if (!content?.trim()) {
      return NextResponse.json({ error: 'content is required' }, { status: 400 });
    }

    if (!post_now && !scheduled_at) {
      return NextResponse.json({ error: 'scheduled_at is required unless post_now is true' }, { status: 400 });
    }

    const webhookUrl = process.env.N8N_LINKEDIN_WEBHOOK_URL || DEFAULT_N8N_WEBHOOK_URL;
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        content,
        scheduled_at,
        post_now: Boolean(post_now),
        linkedin_person,
      }),
    });

    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    if (!res.ok) {
      return NextResponse.json(
        { error: 'n8n webhook failed', status: res.status, data },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, status: post_now ? 'posted' : 'scheduled', data });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
