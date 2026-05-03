import { NextResponse } from 'next/server';
import { supabaseAdmin, hasSupabaseConfig } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!hasSupabaseConfig()) return NextResponse.json({ threads: [] });
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('chat_threads')
    .select('id, title, updated_at')
    .order('updated_at', { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ threads: data ?? [] });
}

export async function POST(req: Request) {
  if (!hasSupabaseConfig()) return NextResponse.json({ error: 'No DB' }, { status: 500 });
  const { id, title } = await req.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const db = supabaseAdmin();
  const { error } = await db
    .from('chat_threads')
    .upsert({ id, title: title ?? 'New chat', updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  if (!hasSupabaseConfig()) return NextResponse.json({ error: 'No DB' }, { status: 500 });
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const db = supabaseAdmin();
  const { error } = await db.from('chat_threads').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
