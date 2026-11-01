import type { NextRequest } from 'next/server';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

export interface RequestAuth {
  user: User;
  profile: { role_level: number; role: string | null; display_name: string | null } | null;
  supabase: SupabaseClient;
}

function bearerToken(request: NextRequest): string | null {
  const header = request.headers.get('authorization') ?? '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
}

/** 校验 Authorization Bearer Supabase access token；返回用户和档案。 */
export async function getRequestAuth(request: NextRequest): Promise<RequestAuth | null> {
  const token = bearerToken(request);
  if (!token) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;

  const supabase = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role_level, role, display_name')
    .eq('id', user.id)
    .maybeSingle();

  return { user, profile: profile ?? null, supabase };
}

export async function requireStaff(
  request: NextRequest,
  minLevel: number
): Promise<RequestAuth | null> {
  const auth = await getRequestAuth(request);
  if (!auth) return null;
  const level = typeof auth.profile?.role_level === 'number' ? auth.profile.role_level : 0;
  return level >= minLevel ? auth : null;
}
