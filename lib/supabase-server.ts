import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

/**
 * 服务端 Supabase 客户端（带缓存单例）。
 * - anon client 用于校验用户 access token（auth.getUser(token)）。
 * - admin client 使用 service_role，只在服务端 Route Handler 中使用，绝不能加 NEXT_PUBLIC_ 前缀。
 */

let anonClient: SupabaseClient | null = null;
let adminClient: SupabaseClient | null = null;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`缺少环境变量 ${name}`);
  return value;
}

function baseOptions() {
  return {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  } as const;
}

export function getAnonClient(): SupabaseClient {
  if (!anonClient) {
    anonClient = createClient(
      requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
      requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
      baseOptions()
    );
  }
  return anonClient;
}

export function getAdminClient(): SupabaseClient {
  if (!adminClient) {
    adminClient = createClient(
      requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
      requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
      baseOptions()
    );
  }
  return adminClient;
}

/** 统一的 no-store JSON 响应（NextResponse，便于继续写 Cookie） */
export function noStoreJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}
