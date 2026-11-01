-- =============================================================================
-- RCT MP · 帖子/新闻图片上传（Storage bucket: post-images）
-- 前置：p0-hardening.sql（RLS/辅助函数）
-- 说明：公开读；登录用户只能写/删自己目录下的文件（<uid>/xxx）。
-- =============================================================================

begin;

-- 1) 创建/更新公开图片桶（5MB，仅 jpg/png/webp）
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'post-images',
  'post-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2) 公开读
drop policy if exists "post_images_public_read" on storage.objects;
create policy "post_images_public_read"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'post-images');

-- 3) 登录用户上传到自己的目录（<uid>/...）
drop policy if exists "post_images_insert_own" on storage.objects;
create policy "post_images_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'post-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 4) 只能删自己的文件
drop policy if exists "post_images_delete_own" on storage.objects;
create policy "post_images_delete_own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'post-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

commit;

-- 校验
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets where id = 'post-images';

select policyname, cmd from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname like 'post_images_%'
order by 1;

-- 回滚
-- drop policy if exists "post_images_public_read" on storage.objects;
-- drop policy if exists "post_images_insert_own" on storage.objects;
-- drop policy if exists "post_images_delete_own" on storage.objects;
-- delete from storage.buckets where id = 'post-images';
