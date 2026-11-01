-- =============================================================================
-- RCT MP · Supabase 数据库结构探查（只读）
-- 项目：https://www.roadcruise-mp.com  /  Supabase project ref: undmtiotuffrqcfvqand
-- 所属：交接 / P0 加固前的“事实核对”步骤
-- -----------------------------------------------------------------------------
-- 这个文件做什么：
--   把线上数据库的真实结构（表、列、约束、索引、RLS、策略、触发器、函数、
--   枚举、授权、roles 内容、auth.users 触发器、Storage 桶）全部导出来，
--   用于回答 supabase/p0-hardening.sql 顶部列出的【执行前必须核对】问题。
--
-- 安全性：
--   本文件【只包含 SELECT】，没有任何 CREATE / ALTER / DROP / INSERT / UPDATE /
--   DELETE / GRANT，也不会写入任何数据。可以重复执行，不会改变数据库状态。
--   （唯一的副作用是读 pg 系统目录，和普通查询一样。）
--
-- 使用方法：
--   1. 打开 Supabase Dashboard → SQL Editor → New query
--   2. 【第 1 部分】整段复制执行：只返回一张三列的表（section / item / detail），
--      右键 Download CSV 或直接框选复制，原样回传即可。
--   3. 【第 2 部分】请【逐条单独执行】（选中该条 SQL 再按 Run）。整段执行时
--      Supabase 只会显示最后一个结果集，会看不到前面的输出。
--      每条查询前都有中文注释说明用途和“该怎么读”。
--   4. 如果某条报 “relation ... does not exist” 或 “permission denied”，
--      这本身就是重要信息（说明该表/函数不存在），请把报错原文一起记下来。
--
-- 输出可能包含敏感信息（SteamID、Discord ID、邮箱片段）：
--   回传时请私下发送给项目所有者，不要贴到公开频道 / Issue。
-- =============================================================================


-- =============================================================================
-- 第 1 部分：一次性总览（单条语句，多个 UNION ALL，输出一张表）
-- -----------------------------------------------------------------------------
-- 结果里 section 列的取值含义：
--   01-表与RLS      每张表的 RLS 开关、是否 FORCE、行数估算、策略数量
--   02-列           public schema 全部列：类型/是否可空/默认值
--   03-约束         主键/唯一/外键/CHECK，含外键的 ON DELETE 行为
--   04-索引         public + storage 全部索引定义
--   05-策略         pg_policies：public/storage/auth 全部策略（含 roles、using、check）
--   06-触发器       全部非内部触发器 + 它调用的函数
--   07-函数         函数签名 / 是否 SECURITY DEFINER / search_path / 源码行数
--   08-枚举         所有枚举类型及其标签（角色、状态字段常用）
--   09-表授权       anon / authenticated / service_role 对表的 GRANT
--   10-roles表      roles 表的真实内容（整行 JSON，不假设列名）
--   11-auth触发器   auth.users 上的注册触发器（handle_new_user 的挂载点）
--   12-存储桶       Storage 桶配置（含 public 标记）
--
-- 注意：如果 "10-roles表" 这一段报错（roles 表不存在或无权访问），
--       把该 UNION 分支删掉再执行一次即可，不影响其它段。
-- =============================================================================

select '01-表与RLS' as section,
       c.relname::text as item,
       concat(
         'kind=', c.relkind::text,
         ' rls=', case when c.relrowsecurity then 'ON' else 'OFF' end,
         ' force_rls=', case when c.relforcerowsecurity then 'ON' else 'OFF' end,
         ' est_rows=', c.reltuples::bigint,
         ' policies=', (
           select count(*)
           from pg_policies p
           where p.schemaname = n.nspname
             and p.tablename = c.relname
         )
       ) as detail
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'storage')
  and c.relkind in ('r', 'p', 'v', 'm', 'f')

union all

select '02-列' as section,
       col.table_name::text
         || '.' || lpad(col.ordinal_position::text, 3, '0')
         || '.' || col.column_name::text as item,
       concat(
         'type=', col.data_type,
         ' udt=', col.udt_name,
         ' null=', col.is_nullable,
         ' default=', coalesce(col.column_default, '-')
       ) as detail
from information_schema.columns col
where col.table_schema = 'public'

union all

select '03-约束' as section,
       con.conrelid::regclass::text || ' :: ' || con.conname::text as item,
       concat(
         pg_get_constraintdef(con.oid),
         ' [type=', con.contype::text,
         case when con.convalidated then '' else ', NOT VALID' end,
         ']'
       ) as detail
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'storage')

union all

select '04-索引' as section,
       ix.schemaname::text || '.' || ix.tablename::text || ' :: ' || ix.indexname::text as item,
       ix.indexdef::text as detail
from pg_indexes ix
where ix.schemaname in ('public', 'storage')

union all

select '05-策略' as section,
       pol.schemaname::text || '.' || pol.tablename::text || ' :: ' || pol.policyname::text as item,
       concat(
         'perm=', pol.permissive::text,
         ' roles=', coalesce(array_to_string(pol.roles, ','), '(none)'),
         ' cmd=', pol.cmd::text,
         ' using=', coalesce(pol.qual, '(none)'),
         ' check=', coalesce(pol.with_check, '(none)')
       ) as detail
from pg_policies pol
where pol.schemaname in ('public', 'storage', 'auth')

union all

select '06-触发器' as section,
       tg.tgrelid::regclass::text || ' :: ' || tg.tgname::text as item,
       concat(
         pg_get_triggerdef(tg.oid),
         ' -> ',
         pn.nspname::text, '.', pr.proname::text
       ) as detail
from pg_trigger tg
join pg_proc pr on pr.oid = tg.tgfoid
join pg_namespace pn on pn.oid = pr.pronamespace
where not tg.tgisinternal

union all

select '07-函数' as section,
       pn.nspname::text || '.' || pr.proname::text
         || '(' || pg_get_function_identity_arguments(pr.oid) || ')' as item,
       concat(
         'returns=', pg_get_function_result(pr.oid),
         ' lang=', l.lanname::text,
         ' secdef=', pr.prosecdef::text,
         ' volatility=', pr.provolatile::text,
         ' search_path=', coalesce(array_to_string(pr.proconfig, '; '), '(unset)'),
         ' owner=', pg_get_userbyid(pr.proowner),
         ' src_lines=', (length(pr.prosrc) - length(replace(pr.prosrc, chr(10), '')) + 1)::text
       ) as detail
from pg_proc pr
join pg_namespace pn on pn.oid = pr.pronamespace
join pg_language l on l.oid = pr.prolang
where pn.nspname in ('public', 'auth', 'storage', 'private')
  and pr.prokind = 'f'

union all

select '08-枚举' as section,
       pn.nspname::text || '.' || ty.typname::text as item,
       string_agg(en.enumlabel::text, ',' order by en.enumsortorder) as detail
from pg_type ty
join pg_namespace pn on pn.oid = ty.typnamespace
join pg_enum en on en.enumtypid = ty.oid
where pn.nspname in ('public', 'auth', 'storage')
group by pn.nspname, ty.typname

union all

select '09-表授权' as section,
       g.table_schema::text || '.' || g.table_name::text || ' :: ' || g.grantee::text as item,
       string_agg(g.privilege_type::text, ',' order by g.privilege_type::text) as detail
from information_schema.role_table_grants g
where g.table_schema in ('public', 'storage')
  and g.grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
group by g.table_schema, g.table_name, g.grantee

union all

select '10-roles表' as section,
       'roles_row'::text as item,
       to_jsonb(r)::text as detail
from public.roles r

union all

select '11-auth触发器' as section,
       tg.tgname::text as item,
       concat(
         pg_get_triggerdef(tg.oid),
         ' -> ',
         pn.nspname::text, '.', pr.proname::text
       ) as detail
from pg_trigger tg
join pg_proc pr on pr.oid = tg.tgfoid
join pg_namespace pn on pn.oid = pr.pronamespace
where tg.tgrelid = 'auth.users'::regclass
  and not tg.tgisinternal

union all

select '12-存储桶' as section,
       b.id::text as item,
       to_jsonb(b)::text as detail
from storage.buckets b

order by 1, 2;


-- =============================================================================
-- 第 2 部分：逐条明细（请一条一条执行）
-- =============================================================================


-- -----------------------------------------------------------------------------
-- [U1] profiles 的列清单（回答【未知项】：有没有 created_at / role_level 是什么类型）
-- 读法：看 column_name 里有没有 created_at；确认 role_level 是 integer、
--       steam_verified 是 boolean、vtc_id 是 uuid。
-- 用途：p0-hardening.sql 里 profiles 保护触发器只引用已确认存在的列。
-- -----------------------------------------------------------------------------
select ordinal_position,
       column_name,
       data_type,
       udt_name,
       is_nullable,
       column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'profiles'
order by ordinal_position;


-- -----------------------------------------------------------------------------
-- [U2] notifications 表的列清单 + 行数（回答【未知项】：表到底存不存在、有哪些列）
-- 读法：如果报 "relation public.notifications does not exist"，说明表没建，
--       需要先执行 p0-hardening.sql 附录 A1 的建表语句。
--       重点看：user_id / actor_id / content / link / is_read / created_at 是否齐全，
--       created_at 有没有 default now()（通知触发器依赖它）。
-- -----------------------------------------------------------------------------
select ordinal_position,
       column_name,
       data_type,
       is_nullable,
       column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'notifications'
order by ordinal_position;

-- 行数（应当为 0；非 0 说明已有历史数据，触发器上线后不受影响）
select count(*) as notifications_rows from public.notifications;


-- -----------------------------------------------------------------------------
-- [U3] forum_topics.category_id 的真实类型 + 现有取值分布
-- 读法：确认它是 integer 还是 uuid。p0-hardening.sql 里判断“官方公告版块(id=1)”
--       用的是 category_id::text = '1'，对两种类型都成立。
--       同时能看到线上是否真的存在 category_id=1 的数据。
-- -----------------------------------------------------------------------------
select c.data_type,
       c.udt_name
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name = 'forum_topics'
  and c.column_name = 'category_id';

select category_id, count(*) as topics
from public.forum_topics
group by category_id
order by topics desc;


-- -----------------------------------------------------------------------------
-- [U4] vtcs.tag 的类型 / 是否已有唯一约束 / 是否存在重复值
-- 读法：p0-hardening.sql 会建 "lower(tag) 唯一索引"，若此处已有重复 tag，
--       建索引会失败；请先人工合并重复车队或把该段落注释掉。
-- -----------------------------------------------------------------------------
select data_type, udt_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'vtcs'
  and column_name = 'tag';

select lower(btrim(tag)) as tag_norm,
       count(*) as dup_count,
       string_agg(id::text, ', ') as vtc_ids
from public.vtcs
where tag is not null
group by lower(btrim(tag))
having count(*) > 1;

select count(*) as vtcs_total,
       count(*) filter (where tag is null or btrim(tag) = '') as vtcs_without_tag
from public.vtcs;


-- -----------------------------------------------------------------------------
-- [U5] roles 表的全部内容（权限体系的事实来源）
-- 读法：确认 level 的实际取值（应当是 10/40/70/90/100 这套）。
--       p0-hardening.sql 的“不能赋予高于自己等级的职位”会读 roles.level。
-- -----------------------------------------------------------------------------
select * from public.roles order by level desc;

-- role 名与 level 的对照（只取两列，便于粘贴进文档）
select name, level, display_name, department
from public.roles
order by level desc;


-- -----------------------------------------------------------------------------
-- [U6] handle_new_user 的完整定义（最重要的未知项）
-- 读法：这是注册时自动建 profiles 行的触发器函数。重点看：
--   (a) 它是否把 raw_user_meta_data 里的 steam_id / steam_verified 直接写库
--       —— 如果是，任何人注册时都能自称“已验证”，必须改写（见 p0-hardening 附录 A2）；
--   (b) 它是否设置 role / role_level —— 如果不设置，新用户 role_level 为 NULL；
--   (c) 它用的列名是否与当前 profiles 一致（有没有 referenced 已删除的列）；
--   (d) 有没有 on conflict 处理（重复注册的邮箱重试时会报错）。
-- -----------------------------------------------------------------------------
select pn.nspname as schema_name,
       pr.proname as function_name,
       pg_get_functiondef(pr.oid) as definition
from pg_proc pr
join pg_namespace pn on pn.oid = pr.pronamespace
where pr.proname = 'handle_new_user';

-- 逐行展开版（如果上面的 definition 在 SQL Editor 里换行被压扁，用这一条逐行复制）
select t.line_no, t.line
from (
  select p.oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.proname = 'handle_new_user'
) f
cross join lateral (
  select ord as line_no, l as line
  from regexp_split_to_table(pg_get_functiondef(f.oid), chr(10)) with ordinality as x(l, ord)
) t
order by t.line_no;


-- -----------------------------------------------------------------------------
-- [U7] auth.users 上的触发器（注册链路入口）
-- 读法：确认是否存在 on_auth_user_created -> public.handle_new_user()。
--       若不存在，注册不会自动建 profile（用户注册后没有 profiles 行）。
-- -----------------------------------------------------------------------------
select tg.tgname,
       pg_get_triggerdef(tg.oid) as trigger_def,
       pn.nspname as func_schema,
       pr.proname as func_name,
       pr.prosecdef as is_security_definer
from pg_trigger tg
join pg_proc pr on pr.oid = tg.tgfoid
join pg_namespace pn on pn.oid = pr.pronamespace
where tg.tgrelid = 'auth.users'::regclass
  and not tg.tgisinternal;


-- -----------------------------------------------------------------------------
-- [U8] 现有策略清单（按表分组，只取名字和类型）
-- 读法：p0-hardening.sql 用 "drop policy if exists + create policy" 保证幂等，
--       但它只会 drop 自己命名的那批策略；如果这里有别的名字（尤其是
--       permissive + using(true) 的旧策略），新旧策略会取并集，权限会被放宽。
--       请把“不属于 rct_/canonical 命名”的策略名记下来，执行前先手动 drop。
-- -----------------------------------------------------------------------------
select tablename,
       policyname,
       permissive,
       array_to_string(roles, ',') as roles,
       cmd,
       coalesce(qual, '(none)') as using_expr,
       coalesce(with_check, '(none)') as check_expr
from pg_policies
where schemaname in ('public', 'storage')
order by schemaname, tablename, policyname;


-- -----------------------------------------------------------------------------
-- [U9] 所有用户触发器（含可能存在的 vtc 相关触发器）
-- 读法：如果有未知的 BEFORE/AFTER 触发器在写 profiles / vtcs，
--       p0-hardening 的守卫触发器可能与之冲突（例如重复计数）。
-- -----------------------------------------------------------------------------
select n.nspname as table_schema,
       c.relname as table_name,
       tg.tgname,
       pg_get_triggerdef(tg.oid) as trigger_def,
       pr.proname as func_name
from pg_trigger tg
join pg_class c on c.oid = tg.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc pr on pr.oid = tg.tgfoid
where not tg.tgisinternal
  and n.nspname in ('public', 'storage')
order by n.nspname, c.relname, tg.tgname;


-- -----------------------------------------------------------------------------
-- [U10] Storage：avatars 桶是否 public + 现有对象路径样本
-- 读法：确认 bucket 名就是 'avatars'、public = true。
--       对象路径应当是 'avatar-<user-uuid>-<random>.<ext>'，
--       p0-hardening 的上传策略依赖这个前缀（name like 'avatar-<uid>-%'）。
-- -----------------------------------------------------------------------------
select id,
       name,
       public,
       file_size_limit,
       allowed_mime_types,
       created_at
from storage.buckets
order by id;

select bucket_id,
       count(*) as objects,
       count(*) filter (where name like 'avatar-%') as avatar_prefixed,
       min(created_at) as first_upload,
       max(created_at) as last_upload
from storage.objects
where bucket_id = 'avatars'
group by bucket_id;

-- 最近 20 个对象路径（回传前可删掉玩家 UUID）
select name, created_at
from storage.objects
where bucket_id = 'avatars'
order by created_at desc
limit 20;


-- -----------------------------------------------------------------------------
-- [U11] 可疑的“已验证”账号（数据侧排查 Steam 验证是否被绕过）
-- 读法：steam_verified = true 但 steam_id 为空 / 不是 17 位数字的行，
--       基本可以断定是通过伪造 metadata 或伪造 OpenID 参数刷出来的。
--       这些行需要在修好鉴权后人工清理（把 steam_verified 置回 false）。
-- -----------------------------------------------------------------------------
select id,
       display_name,
       steam_id,
       steam_verified,
       role,
       role_level,
       updated_at
from public.profiles
where steam_verified is true
  and (steam_id is null or steam_id !~ '^[0-9]{17}$');

-- 反向检查：同一个 steam_id 被多个账号绑定（应当唯一）
select steam_id,
       count(*) as accounts,
       string_agg(id::text, ', ') as profile_ids
from public.profiles
where steam_id is not null
group by steam_id
having count(*) > 1;


-- -----------------------------------------------------------------------------
-- [U12] 关键表行数（人工确认线上数据规模，用于判断加固执行时长）
-- 每条单独执行，避免某张表不存在导致整段失败。
-- -----------------------------------------------------------------------------
select count(*) as profiles from public.profiles;
select count(*) as roles from public.roles;
select count(*) as forum_categories from public.forum_categories;
select count(*) as forum_topics from public.forum_topics;
select count(*) as forum_replies from public.forum_replies;
select count(*) as vtcs from public.vtcs;
select count(*) as announcements from public.announcements;
select count(*) as rules_articles from public.rules_articles;


-- -----------------------------------------------------------------------------
-- [U13] 孤儿数据检查（防止加固后加约束/加外键时失败）
-- 读法：三张查询都应当返回 0 行。
--   (a) topics 指向不存在的版块 → 加外键会失败，需要先修数据；
--   (b) profiles.vtc_id 指向不存在的车队 → 同上；
--   (c) replies 指向不存在的主题 → 同上。
-- -----------------------------------------------------------------------------
select t.id, t.category_id
from public.forum_topics t
left join public.forum_categories c on c.id = t.category_id
where c.id is null;

select p.id, p.vtc_id
from public.profiles p
left join public.vtcs v on v.id = p.vtc_id
where p.vtc_id is not null
  and v.id is null;

select r.id, r.topic_id
from public.forum_replies r
left join public.forum_topics t on t.id = r.topic_id
where t.id is null;


-- -----------------------------------------------------------------------------
-- [U14] 权限等级分布（谁能直接操作后台）
-- 读法：level >= 40 的账号就是“工作人员”，加固后他们能改别人的 role_level；
--       level >= 90 的能改规则；level >= 100 的是开发者。
--       请人工确认这份名单里没有不该出现的人。
-- -----------------------------------------------------------------------------
select role_level,
       role,
       count(*) as accounts,
       string_agg(coalesce(display_name, '(no name)'), ' | ' order by display_name) as names
from public.profiles
group by role_level, role
order by role_level desc nulls last;


-- -----------------------------------------------------------------------------
-- [U15] 列级授权（默认注释掉）
-- 读法：如果之前有人做过 "revoke select (steam_id)" 这类列级收权，会在这里出现。
--       需要时取消下面三行的注释再执行。
-- -----------------------------------------------------------------------------
-- select table_name, column_name, grantee, privilege_type
-- from information_schema.column_privileges
-- where table_schema = 'public'
--   and grantee in ('anon', 'authenticated')
-- order by table_name, column_name, grantee;


-- =============================================================================
-- 回传清单（把以下结果发给项目所有者 / 写进交接文档）：
--   [1] 第 1 部分的整张表（CSV 或截图）
--   [2] U1  profiles 列清单            -> 确认有没有 created_at
--   [3] U2  notifications 是否存在     -> 决定是否要跑附录 A1 建表
--   [4] U3  category_id 类型           -> 确认公告版块判定写法
--   [5] U6  handle_new_user 定义       -> 决定是否要跑附录 A2 改写
--   [6] U8  现有策略名                 -> 决定执行前要先 drop 哪些旧策略
--   [7] U11 可疑“已验证”账号           -> 加固后需要人工清理的名单
--   [8] U13 孤儿数据                   -> 非 0 行则先修数据再加约束
-- =============================================================================
