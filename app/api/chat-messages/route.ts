import { NextResponse } from 'next/server';
import { supabaseAdmin, hasSupabaseConfig } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!hasSupabaseConfig()) return NextResponse.json({ messages: [] });
  const threadId = new URL(req.url).searchParams.get('thread_id');
  if (!threadId) return NextResponse.json({ error: 'thread_id required' }, { status: 400 });
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('chat_messages')
    .select('id, role, blocks, created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ messages: data ?? [] });
}

export async function POST(req: Request) {
  if (!hasSupabaseConfig()) return NextResponse.json({ error: 'No DB' }, { status: 500 });
  const { thread_id, role, blocks } = await req.json();
  if (!thread_id || !role) return NextResponse.json({ error: 'thread_id + role required' }, { status: 400 });
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('chat_messages')
    .insert({ thread_id, role, blocks: blocks ?? [] })
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}

export async function PATCH(req: Request) {
  if (!hasSupabaseConfig()) return NextResponse.json({ error: 'No DB' }, { status: 500 });
  const { id, blocks } = await req.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const db = supabaseAdmin();
  const { error } = await db
    .from('chat_messages')
    .update({ blocks })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
