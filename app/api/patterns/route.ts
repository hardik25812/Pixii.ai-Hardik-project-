import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = supabaseAdmin();
    const { data: patterns, error } = await db
      .from('patterns')
      .select('id, name, template, description, example_count, avg_engagement')
      .order('avg_engagement', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ patterns: patterns ?? [] });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
