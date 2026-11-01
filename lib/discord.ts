/** RCT MP 社区 Discord 配置与邀请信息读取（服务端使用）。 */

export const DISCORD_INVITE_CODE = 'cv9bRmyfxU';
export const DISCORD_INVITE_URL = `https://discord.gg/${DISCORD_INVITE_CODE}`;
export const DISCORD_GUILD_ID = '1565403809969348640';

export interface DiscordInviteInfo {
  name: string;
  description: string | null;
  iconUrl: string | null;
  memberCount: number | null;
  onlineCount: number | null;
  channelName: string | null;
  inviteUrl: string;
}

interface DiscordApiInvite {
  guild?: {
    id?: string;
    name?: string;
    description?: string | null;
    icon?: string | null;
  };
  profile?: {
    member_count?: number;
    online_count?: number;
  };
  approximate_member_count?: number;
  approximate_presence_count?: number;
  channel?: { name?: string };
}

/** 读取邀请信息；失败时返回 null（页面降级为纯邀请链接）。每 5 分钟缓存。 */
export async function fetchDiscordInvite(): Promise<DiscordInviteInfo | null> {
  try {
    const response = await fetch(
      `https://discord.com/api/v10/invites/${DISCORD_INVITE_CODE}?with_counts=true`,
      {
        headers: { Accept: 'application/json' },
        next: { revalidate: 300 },
      }
    );

    if (!response.ok) return null;

    const data = (await response.json()) as DiscordApiInvite;
    const guildId = data.guild?.id ?? DISCORD_GUILD_ID;
    const iconHash = data.guild?.icon ?? null;

    return {
      name: data.guild?.name ?? 'Road Cruise Transport MP',
      description: data.guild?.description ?? null,
      iconUrl: iconHash
        ? `https://cdn.discordapp.com/icons/${guildId}/${iconHash}.png?size=256`
        : null,
      memberCount: data.profile?.member_count ?? data.approximate_member_count ?? null,
      onlineCount: data.profile?.online_count ?? data.approximate_presence_count ?? null,
      channelName: data.channel?.name ?? null,
      inviteUrl: DISCORD_INVITE_URL,
    };
  } catch {
    return null;
  }
}
