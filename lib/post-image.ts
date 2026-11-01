'use client';

/**
 * 富文本图片上传 helper（Supabase Storage 公开桶）。
 *
 * 与已上线的存储桶配置保持一致：
 * - 桶 `post-images`：public=true、file_size_limit=5MB、
 *   allowed_mime_types=`image/jpeg,image/png,image/webp`。
 * - RLS：登录用户只能写入 `storage.foldername(name))[1] = auth.uid()::text` 的目录，
 *   因此对象路径必须以当前用户 uid 开头。
 *
 * 本模块只负责“校验 + 上传 + 取公开 URL”，不做任何 UI 提示；
 * 所有失败都抛出中文 Error，由调用方决定如何展示。
 */

import { createClient } from '@supabase/supabase-js';

/** 存储桶允许的图片 MIME 类型（与 allowed_mime_types 一致）。 */
export const POST_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type PostImageMimeType = (typeof POST_IMAGE_MIME_TYPES)[number];

/** 单个图片大小上限：5MB（与桶的 file_size_limit 一致）。 */
export const POST_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** 图片存储桶名称。 */
export const POST_IMAGE_BUCKET = 'post-images';

/** MIME → 文件扩展名映射。 */
const EXTENSION_BY_MIME: Record<PostImageMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** 文件名随机部分使用的字符集。 */
const RANDOM_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** 与项目其它客户端组件一致：模块级 anon client（需要读取客户端 session）。 */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/** 把 File.type 归一化为白名单内的 MIME；不在白名单返回 null。 */
function resolveMimeType(file: File): PostImageMimeType | null {
  const mime = typeof file?.type === 'string' ? file.type.trim().toLowerCase() : '';
  return POST_IMAGE_MIME_TYPES.find((allowed) => allowed === mime) ?? null;
}

/** 生成 `[a-z0-9]` 随机串；优先用 Web Crypto，缺失时退回 Math.random。 */
function randomSuffix(length = 6): string {
  const bytes = new Uint8Array(length);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  let suffix = '';
  for (const byte of bytes) {
    suffix += RANDOM_ALPHABET[byte % RANDOM_ALPHABET.length];
  }
  return suffix;
}

/**
 * 是否为允许上传的图片类型（JPG / PNG / WebP）。
 * 注意：这里只校验 MIME，大小限制见 {@link uploadPostImage}。
 */
export function isAllowedPostImage(file: File): boolean {
  return resolveMimeType(file) !== null;
}

/**
 * 上传一张图片到 `post-images` 桶，返回公开访问 URL 与对象路径。
 *
 * 对象路径固定为 `<uid>/<时间戳>-<6 位随机>.<ext>`，满足桶的目录级 RLS 策略。
 *
 * @throws Error('仅支持 JPG/PNG/WebP 图片') 类型不在白名单（含空类型）
 * @throws Error('图片不能超过 5MB') 超过大小上限
 * @throws Error('请先登录后再上传图片') 未登录 / session 失效
 * @throws Error(error.message) Storage 上传失败
 */
export async function uploadPostImage(file: File): Promise<{ url: string; path: string }> {
  const mimeType = resolveMimeType(file);
  if (!mimeType) throw new Error('仅支持 JPG/PNG/WebP 图片');

  if (file.size > POST_IMAGE_MAX_BYTES) throw new Error('图片不能超过 5MB');

  // 未登录时不抛出未捕获异常：auth 层错误统一转成“请先登录”。
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const uid = userData?.user?.id;
  if (userError || !uid) throw new Error('请先登录后再上传图片');

  const path = `${uid}/${Date.now()}-${randomSuffix(6)}.${EXTENSION_BY_MIME[mimeType]}`;

  const { error: uploadError } = await supabase.storage.from(POST_IMAGE_BUCKET).upload(path, file, {
    cacheControl: '31536000',
    upsert: false,
    contentType: mimeType,
  });

  if (uploadError) throw new Error(uploadError.message);

  const { data: publicUrlData } = supabase.storage.from(POST_IMAGE_BUCKET).getPublicUrl(path);
  return { url: publicUrlData.publicUrl, path };
}
