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

/** 在服务器中创建身份组（Bot 需要「管理身份组」权限）。返回新角色 ID。 */
export async function createDiscordRole(input: {
  name: string;
  color?: number;
  hoist?: boolean;
  mentionable?: boolean;
}): Promise<string> {
  const response = await discordBotFetch(`/guilds/${DISCORD_GUILD_ID}/roles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: input.name.slice(0, 100),
      color: input.color ?? 0,
      hoist: input.hoist ?? false,
      mentionable: input.mentionable ?? false,
      permissions: '0',
    }),
  });
  if (!response.ok) {
    throw new Error(`discord_create_role_${response.status}`);
  }
  const role = (await response.json()) as { id: string };
  return role.id;
}

/** 修改身份组名称/颜色/是否单独显示。 */
export async function editDiscordRole(
  roleId: string,
  input: { name?: string; color?: number; hoist?: boolean }
): Promise<void> {
  const response = await discordBotFetch(`/guilds/${DISCORD_GUILD_ID}/roles/${roleId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(input.name ? { name: input.name.slice(0, 100) } : {}),
      ...(typeof input.color === 'number' ? { color: input.color } : {}),
      ...(typeof input.hoist === 'boolean' ? { hoist: input.hoist } : {}),
    }),
  });
  if (!response.ok) throw new Error(`discord_edit_role_${response.status}`);
}

// ---------------------------------------------------------------------------
// 频道与权限（用于一键创建 TMP 风格频道结构）
// ---------------------------------------------------------------------------

export interface DiscordChannel {
  id: string;
  name: string;
  type: number;
  parent_id: string | null;
}

export const PERM = {
  VIEW_CHANNEL: 1024,
  SEND_MESSAGES: 2048,
  READ_MESSAGE_HISTORY: 65536,
  CONNECT: 1048576,
  SPEAK: 2097152,
} as const;

export async function fetchDiscordGuildChannels(): Promise<DiscordChannel[]> {
  const response = await discordBotFetch(`/guilds/${DISCORD_GUILD_ID}/channels`);
  if (!response.ok) throw new Error(`discord_channels_${response.status}`);
  return (await response.json()) as DiscordChannel[];
}

export async function createDiscordChannel(input: {
  name: string;
  type: 0 | 2 | 4;
  parent_id?: string | null;
}): Promise<string> {
  const response = await discordBotFetch(`/guilds/${DISCORD_GUILD_ID}/channels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: input.name.slice(0, 100),
      type: input.type,
      parent_id: input.parent_id ?? undefined,
    }),
  });
  if (!response.ok) throw new Error(`discord_create_channel_${response.status}`);
  const channel = (await response.json()) as { id: string };
  return channel.id;
}

/** 移动频道到指定分类（parent_id），返回是否成功。 */
export async function moveDiscordChannel(
  channelId: string,
  parentId: string
): Promise<void> {
  const response = await discordBotFetch(`/channels/${channelId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parent_id: parentId }),
  });
  if (!response.ok) throw new Error(`discord_move_channel_${response.status}`);
}

/** 在指定频道创建 Webhook（Bot 需要管理 Webhook 权限）。 */
export async function createDiscordWebhook(
  channelId: string,
  name: string
): Promise<{ id: string; url: string }> {
  const response = await discordBotFetch(`/channels/${channelId}/webhooks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name.slice(0, 80) }),
  });
  if (!response.ok) throw new Error(`discord_create_webhook_${response.status}`);
  return (await response.json()) as { id: string; url: string };
}

/** 重命名频道（保留消息与历史）。 */
export async function renameDiscordChannel(
  channelId: string,
  name: string
): Promise<void> {
  const response = await discordBotFetch(`/channels/${channelId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name.slice(0, 100) }),
  });
  if (!response.ok) throw new Error(`discord_rename_channel_${response.status}`);
}

/** 设置频道对某个角色（或 @everyone，overwriteId=guildId）的权限覆盖。 */
export async function setDiscordChannelPermission(
  channelId: string,
  overwriteId: string,
  allow: number,
  deny: number
): Promise<void> {
  const response = await discordBotFetch(
    `/channels/${channelId}/permissions/${overwriteId}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        allow: allow.toString(),
        deny: deny.toString(),
        type: 0,
      }),
    }
  );
  if (!response.ok && response.status !== 204) {
    throw new Error(`discord_channel_perm_${response.status}`);
  }
}
