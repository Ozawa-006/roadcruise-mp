/** 服务端 Discord Webhook 推送（不暴露给浏览器）。 */

export interface DiscordWebhookPayload {
  content?: string;
  username?: string;
  avatar_url?: string;
  embeds?: Array<Record<string, unknown>>;
}

function defaultWebhookUrls(): string[] {
  const raw = process.env.DISCORD_WEBHOOK_URL;
  if (!raw) return [];
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/** 发送到指定 Webhook 列表；失败只记录状态码，不打印 URL（避免泄露）。 */
export async function sendDiscordWebhookTo(
  urls: string[],
  payload: DiscordWebhookPayload
): Promise<boolean> {
  const targets = urls.map((item) => item.trim()).filter(Boolean);
  if (targets.length === 0) return false;

  let anyOk = false;

  await Promise.all(
    targets.map(async (url) => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, allowed_mentions: { parse: [] } }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (response.ok) {
          anyOk = true;
        } else {
          console.warn('[discord-webhook] non-ok status', response.status);
        }
      } catch (error) {
        console.warn(
          '[discord-webhook] send failed',
          error instanceof Error ? error.name : 'unknown'
        );
      }
    })
  );

  return anyOk;
}

/** 发送到默认 Webhook（DISCORD_WEBHOOK_URL）。 */
export async function sendDiscordWebhook(
  payload: DiscordWebhookPayload
): Promise<boolean> {
  return sendDiscordWebhookTo(defaultWebhookUrls(), payload);
}
