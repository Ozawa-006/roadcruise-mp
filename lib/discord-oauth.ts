/** 服务端 Discord OAuth / Bot API 工具。所有 secret 仅从环境变量读取。 */

export const DISCORD_API = 'https://discord.com/api/v10';
export const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID ?? '1565403809969348640';

const SITE_URL = (process.env.NEXTAUTH_URL ?? 'https://www.roadcruise-mp.com').replace(/\/+$/, '');

export const DISCORD_OAUTH_SCOPES = 'identify email guilds guilds.members.read';

export function discordOAuthConfigured(): boolean {
  return Boolean(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET);
}

export function discordBotConfigured(): boolean {
  return Boolean(process.env.DISCORD_BOT_TOKEN);
}

export function discordRedirectUri(): string {
  return process.env.DISCORD_REDIRECT_URI ?? `${SITE_URL}/api/auth/discord/callback`;
}

export function buildDiscordAuthorizeUrl(state: string): string {
  const clientId = process.env.DISCORD_CLIENT_ID ?? '';
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: discordRedirectUri(),
    response_type: 'code',
    scope: DISCORD_OAUTH_SCOPES,
    state,
    prompt: 'consent',
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

export interface DiscordTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

export interface DiscordUser {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
  email?: string | null;
}

export interface DiscordGuildMember {
  roles: string[];
  nick?: string | null;
}

export interface DiscordGuildRole {
  id: string;
  name: string;
  color: number;
  position: number;
  managed: boolean;
}

export async function exchangeDiscordCode(code: string): Promise<DiscordTokenResponse> {
  const body = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID ?? '',
    client_secret: process.env.DISCORD_CLIENT_SECRET ?? '',
    grant_type: 'authorization_code',
    code,
    redirect_uri: discordRedirectUri(),
  });

  const response = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`discord_token_${response.status}`);
  }
  return (await response.json()) as DiscordTokenResponse;
}

export async function fetchDiscordUser(accessToken: string): Promise<DiscordUser> {
  const response = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`discord_user_${response.status}`);
  return (await response.json()) as DiscordUser;
}

/** 用户 OAuth 读取自己在公会中的身份组（需 guilds.members.read scope）。不在公会返回 null。 */
export async function fetchDiscordMemberForUser(
  accessToken: string
): Promise<DiscordGuildMember | null> {
  const response = await fetch(
    `${DISCORD_API}/users/@me/guilds/${DISCORD_GUILD_ID}/member`,
    { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' }
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`discord_member_${response.status}`);
  return (await response.json()) as DiscordGuildMember;
}

/** Bot API 调用（需要 Bot Token）。 */
export async function discordBotFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error('discord_bot_not_configured');
  return fetch(`${DISCORD_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bot ${token}`,
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  });
}

export async function fetchDiscordGuildRoles(): Promise<DiscordGuildRole[]> {
  const response = await discordBotFetch(`/guilds/${DISCORD_GUILD_ID}/roles`);
  if (!response.ok) throw new Error(`discord_roles_${response.status}`);
  const roles = (await response.json()) as Array<{
    id: string;
    name: string;
    color: number;
    position: number;
    managed: boolean;
  }>;
  return roles.filter((role) => !role.managed && role.id !== DISCORD_GUILD_ID);
}

export async function fetchDiscordGuildMember(
  discordId: string
): Promise<DiscordGuildMember | null> {
  const response = await discordBotFetch(`/guilds/${DISCORD_GUILD_ID}/members/${discordId}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`discord_guild_member_${response.status}`);
  return (await response.json()) as DiscordGuildMember;
}

export async function addDiscordRole(discordId: string, roleId: string): Promise<void> {
  const response = await discordBotFetch(
    `/guilds/${DISCORD_GUILD_ID}/members/${discordId}/roles/${roleId}`,
    { method: 'PUT' }
  );
  if (!response.ok && response.status !== 204) {
    throw new Error(`discord_add_role_${response.status}`);
  }
}

export async function removeDiscordRole(discordId: string, roleId: string): Promise<void> {
  const response = await discordBotFetch(
    `/guilds/${DISCORD_GUILD_ID}/members/${discordId}/roles/${roleId}`,
    { method: 'DELETE' }
  );
  if (!response.ok && response.status !== 204) {
    throw new Error(`discord_remove_role_${response.status}`);
  }
}
