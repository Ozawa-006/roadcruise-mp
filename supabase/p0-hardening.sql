-- =============================================================================
-- RCT MP · P0 数据库加固（Supabase / PostgreSQL）
-- 项目：https://www.roadcruise-mp.com  /  Supabase project ref: undmtiotuffrqcfvqand
-- 配套：supabase/inspect-schema.sql（先跑它，再跑本文件）
-- -----------------------------------------------------------------------------
-- ★★★ 本文件不会、也没有被执行过 ★★★
-- 它不是迁移工具，不会自动运行。必须由项目所有者（或 DBA）在
-- Supabase Dashboard → SQL Editor 里手动执行，并在执行前逐项核对下面的清单。
-- AI 没有该数据库的凭据，也没有连接过任何生产库；本文件是“待审阅的变更脚本”。
--
-- ★ 设计目标（对应交接文档的权限语义）
--   匿名可读：首页/论坛/车队/规则(仅已发布)/公告/公开资料
--   profiles：本人只能改展示类字段；role / role_level / custom_id / random_id /
--             discord_id 只有 Lv.40+ 或 service_role 能改；
--             steam_id / steam_verified 只有 service_role 能写（服务端绑定接口），
--             任何客户端（含工作人员）都不能代签；
--             vtc_id / vtc_role 只能按“加入/退出/建队”迁移
--   注：profiles 的跨用户 UPDATE 策略阈值 = 经理 Lv.70（与 /admin/users 一致）
--   forum_topics：登录 + Steam 已验证才能发帖；category_id=1（官方公告）要 Lv.70+；
--                 作者可改删自己的；Lv.70+ 可删任意
--   forum_replies：登录 + Steam 已验证才能回；author_id 必须 = auth.uid()；
--                  作者或 Lv.70+ 可删；增删自动维护 forum_topics.replies_count；
--                  新增会给楼主插一条 notifications
--   notifications：只能读/标记自己的；禁止客户端 insert
--   vtcs：匿名可读；登录+验证才能建（owner_id = auth.uid()）；只有 owner 能改；tag 唯一
--   announcements：匿名可读；Lv.40+ 可发布
--   rules_articles：匿名只能读 status='published'；写要 Lv.90+
--   roles：匿名可读（展示用）
--   Storage avatars：public 读；登录用户只能写 avatar-<自己的 uid>-* 路径
--   所有判权基于 role_level（数字），不基于邮箱 —— 硬编码邮箱超管已从代码移除。
--
-- ★★★ 执行前必须核对（先跑 supabase/inspect-schema.sql，把结果对着这里看）★★★
--   [ ] 1. handle_new_user 是否存在、定义里是否信任 raw_user_meta_data 的
--          steam_id / steam_verified / role / role_level
--          → 若信任：本脚本 STEP 3.5 的 BEFORE INSERT 守卫已强行把
--            steam_verified 置回 false / steam_id 置空（不依赖该触发器定义），
--            因此注册时无法自称“已验证”；仍建议按文末附录 A2 彻底改写。
--   [ ] 2. 既有 policy 的名称。本文件只 drop 自己命名的那批策略；
--          若线上还有 "Enable read access for all users"、"profiles_update_own"
--          这类旧策略，它们会与新策略取并集 → 权限被放宽。
--          请先看 inspect 的 U8 输出，把旧策略在 SQL Editor 里手动 drop，
--          或把它们的名字加进对应步骤的 drop 列表。脚本末端的“既有策略告警”
--          会把不属于本文件的策略名打出来。
--   [ ] 3. profiles 是否有 created_at 列（本文件不使用该列，但你的其它脚本可能用）。
--          profiles 的 19 个已知列必须齐全（脚本第 0 步会自检，缺列会直接报错并回滚）。
--   [ ] 4. notifications 表是否存在、列是否为 user_id / actor_id / content /
--          link / is_read / created_at。列名不符时，第 6、7 步会失败
--          （plpgsql 在运行期才校验列名）。表不存在时先跑附录 A1。
--   [ ] 5. forum_topics.category_id 的类型（integer 还是 uuid）。
--          本文件用 category_id::text = '1' 判定官方公告版块，两种类型都安全。
--   [ ] 6. vtcs.tag 是否已有重复值（唯一索引会建失败）→ inspect 的 U4。
--   [ ] 7. 是否已存在 vtc 相关的触发器（inspect U9）。重复的计数触发器会导致
--          replies_count / 成员数翻倍，需要先与本文档核对。
--   [ ] 8. 线上是否有 role_level 为 NULL 的账号（会影响其被判为 Lv.0）。
--   [ ] 9. 已备份：Dashboard → Database → Backups，或本地 pg_dump。
--
-- ★ 执行方式建议（先预演，再落地）
--   1. 复制整个文件到 SQL Editor。
--   2. 第一次：把最后一行的 commit; 改成 rollback; 执行。
--      预期：所有 DDL 成功，最后 rollback，数据库不变。
--      （若某步报错，PostgreSQL 会整体回滚，不会有半套状态。）
--   3. 看 verify 段的输出是否符合预期（注意 rollback 后当然是空的）。
--   4. 第二次：把 rollback; 改回 commit;，再执行一次 → 真正生效。
--   5. 立刻跑 verify 段 + docs/SECURITY.md 的上线前测试清单。
--
-- ★ 每一步的风险都写在 steps 上方的 ⚠️ 注释里，请逐条读。
-- ★ 本文件依赖 Supabase 内置的 auth.uid() / auth.role()，仅在 Supabase 环境有效。
-- =============================================================================

begin;

-- 让 DDL 等锁最多等 5 秒，避免线上请求把 ALTER 卡死（也可防止锁表事故）
set local lock_timeout = '5s';
set local statement_timeout = '60s';


-- =============================================================================
-- STEP 0 · 预检（不通过就整体失败，什么都不改）
-- ⚠️ 风险：无。只做只读检查；失败时事务回滚，数据库保持原样。
-- =============================================================================
do $preflight$
declare
  v_missing_tables text;
  v_missing_cols   text;
  v_count          integer;
  v_cat_type       text;
begin
  -- 0.1 九张业务表必须都存在
  select string_agg(u.t, ', ' order by u.t)
    into v_missing_tables
  from unnest(array[
    'public.profiles',
    'public.roles',
    'public.forum_categories',
    'public.forum_topics',
    'public.forum_replies',
    'public.notifications',
    'public.vtcs',
    'public.announcements',
    'public.rules_articles'
  ]) as u(t)
  where to_regclass(u.t) is null;

  if v_missing_tables is not null then
    raise exception
      '预检失败：以下表不存在 → %。请先按附录 A1 建表，或把脚本中对应步骤注释掉。',
      v_missing_tables;
  end if;

  -- 0.2 profiles 的关键列必须齐全（守卫触发器会引用它们）
  select string_agg(u.c, ', ' order by u.c)
    into v_missing_cols
  from unnest(array[
    'id', 'display_name', 'bio', 'avatar_url', 'languages',
    'twitch_url', 'twitter_url', 'youtube_url', 'wot_url',
    'discord_id', 'steam_id', 'steam_verified',
    'custom_id', 'random_id', 'role', 'role_level',
    'vtc_id', 'vtc_role', 'updated_at'
  ]) as u(c)
  where not exists (
    select 1
    from information_schema.columns ic
    where ic.table_schema = 'public'
      and ic.table_name = 'profiles'
      and ic.column_name = u.c
  );

  if v_missing_cols is not null then
    raise exception
      '预检失败：profiles 缺少列 → %。请先核对表结构（inspect-schema.sql 的 U1），再改本脚本。',
      v_missing_cols;
  end if;

  -- 0.3 notifications 的列：只告警，不阻断。
  --     原因：notifications 目前是空表、前端还没接；如果因为它的列名不符
  --     就让整份加固失败，会连带 8 张已经正确的表都上不了线。
  --     回复通知的写入已被包在异常处理器里（见 STEP 6），列名不符只会“没有通知”，
  --     不会导致回帖失败。但仍强烈建议先对齐结构。
  select string_agg(u.c, ', ' order by u.c)
    into v_missing_cols
  from unnest(array['user_id', 'actor_id', 'content', 'link', 'is_read', 'created_at']) as u(c)
  where not exists (
    select 1
    from information_schema.columns ic
    where ic.table_schema = 'public'
      and ic.table_name = 'notifications'
      and ic.column_name = u.c
  );

  if v_missing_cols is not null then
    raise warning
      'notifications 缺少列 → %。回复通知将写不进去（会被异常处理器吞掉，不影响回帖）。请按附录 A1 对齐结构。',
      v_missing_cols;
  end if;

  -- 0.4 官方公告版块的判定必须是“整型 id=1”；如果 category_id 是 uuid，
  --     `category_id::text = '1'` 永远成立，官方版块策略会形同虚设。
  --     这里直接阻断，要求先改成 is_official 标记或整型 id。
  --     实测线上 forum_topics.category_id / forum_categories.id 都是 bigint，
  --     因此这里同时接受 integer / bigint。
  select ic.data_type into v_cat_type
  from information_schema.columns ic
  where ic.table_schema = 'public'
    and ic.table_name = 'forum_topics'
    and ic.column_name = 'category_id';
  if coalesce(v_cat_type, '') not in ('integer', 'bigint') then
    raise exception
      '预检失败：forum_topics.category_id 类型是 %，不是整型（integer/bigint）。官方公告版块保护依赖 category_id=1，uuid/文本下会失效。请先改成整型 id 或改用 is_official 标记（inspect U3）。',
      coalesce(v_cat_type, 'unknown');
  end if;

  -- 0.5 旧验证绕过留下的“已验证”记录：steam_verified=true 但没有合法 17 位 steam_id。
  --     这些账号在加固后仍然可以发帖（策略只看布尔值），所以必须处理：
  --     STEP 0.6 会在本事务内把它们打回未验证（会被记进 NOTICE），
  --     之后本人可在「账号设置 → 绑定 Steam」重新完成真实验证。
  select count(*) into v_count
  from public.profiles p
  where p.steam_verified is true
    and (p.steam_id is null or p.steam_id !~ '^[0-9]{17}$');

  if v_count > 0 then
    raise notice '预检：发现 % 个“已验证但 steam_id 非法”的历史账号，将在 STEP 0.6 被打回未验证。名单见 inspect U11。', v_count;
  end if;

  raise notice '预检通过：9 张表与 profiles 的 19 个关键列均存在。';
end
$preflight$;

-- =============================================================================
-- STEP 0.6 · 撤销“无法证明”的历史 Steam 验证状态
-- ⚠️ 风险：中。会改动数据（steam_verified=true → false），回滚段有对应恢复说明。
--    · 只动 Steam 相关两个字段，不动 role/role_level。
--    · 被撤销的账号需要本人到「账号设置 → 绑定 Steam」重新验证一次。
--    · 如果你确认某个账号的验证是可信的（例如开发者本人已人工核对 steam_id），
--      先给该账号补上正确的 17 位 steam_id 再跑本脚本即可跳过。
-- =============================================================================
do $revoke_legacy_verified$
declare
  v_count integer;
begin
  update public.profiles p
     set steam_verified = false
   where p.steam_verified is true
     and (p.steam_id is null or p.steam_id !~ '^[0-9]{17}$');
  get diagnostics v_count = row_count;
  if v_count > 0 then
    raise notice '已撤销 % 个“已验证但 steam_id 非法”账号的验证状态（需本人重新绑定 Steam）。', v_count;
  else
    raise notice '没有需要撤销的历史验证状态。';
  end if;
end
$revoke_legacy_verified$;


-- =============================================================================
-- STEP 0.7 · 清理“旧版本遗留”的宽松 RLS 策略（关键！）
-- ⚠️ 风险：中。RLS 策略之间是 OR 关系：只要残留一条 using(true)，
--    新策略就形同虚设。下面这些策略名来自 2026-11-01 对线上库的实际探查
--    （Supabase 管理 API 读取 pg_policies），全部是旧版前端/早期脚本创建的宽松策略。
--    · 本步只做删除；新策略在 STEP 3~11 重新创建。
--    · storage.objects 的旧策略在 STEP 11 里清理（需要 storage 权限，带异常保护）。
--    · 如果你之后自己加过策略，请把它从下面的列表里排除，否则会被误删。
-- =============================================================================
-- profiles（旧：任何登录用户可改任意资料/可 INSERT 任意 profile）
drop policy if exists "Auth users update profiles" on public.profiles;
drop policy if exists "Users can update own non-role fields" on public.profiles;
drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Users can insert their own profile." on public.profiles;
drop policy if exists "Profiles are readable by everyone" on public.profiles;
drop policy if exists "Public profiles are viewable by everyone." on public.profiles;
drop policy if exists "Public read profiles" on public.profiles;

-- announcements
drop policy if exists "Announcements are readable by everyone" on public.announcements;
drop policy if exists "Anyone can read announcements" on public.announcements;
drop policy if exists "Authenticated users can manage announcements" on public.announcements;

-- forum_categories
drop policy if exists "Anyone can read forum categories" on public.forum_categories;
drop policy if exists "Public read categories" on public.forum_categories;

-- forum_replies
drop policy if exists "Auth users delete replies" on public.forum_replies;
drop policy if exists "Auth users insert replies" on public.forum_replies;
drop policy if exists "Authors can delete own replies" on public.forum_replies;
drop policy if exists "Public read replies" on public.forum_replies;
drop policy if exists "Replies are readable by everyone" on public.forum_replies;

-- forum_topics
drop policy if exists "Auth users delete topics" on public.forum_topics;
drop policy if exists "Auth users insert topics" on public.forum_topics;
drop policy if exists "Auth users update topics" on public.forum_topics;
drop policy if exists "Authors can delete own topics" on public.forum_topics;
drop policy if exists "Authors can update own topics" on public.forum_topics;
drop policy if exists "Public read topics" on public.forum_topics;
drop policy if exists "Topics are readable by everyone" on public.forum_topics;

-- notifications（旧：任何人都能插入通知！）
drop policy if exists "Anyone can insert notifications" on public.notifications;
drop policy if exists "Auth users update notifications" on public.notifications;
drop policy if exists "Users read own notifications" on public.notifications;

-- rules_articles
drop policy if exists "Managers can manage rules" on public.rules_articles;
drop policy if exists "Published rules are readable by everyone" on public.rules_articles;

-- vtcs
drop policy if exists "Auth users delete vtcs" on public.vtcs;
drop policy if exists "Auth users insert vtcs" on public.vtcs;
drop policy if exists "Auth users update vtcs" on public.vtcs;
drop policy if exists "Public read vtcs" on public.vtcs;

-- STEP 0.7 完成：旧策略已删（新策略将在 STEP 3~11 创建）。


-- =============================================================================
-- STEP 0.8 · 清理旧版“回复通知”触发器（避免与新触发器重复）
-- ⚠️ 风险：低。线上实探发现 forum_replies 上原有一条
--    on_reply_created -> public.handle_new_reply()，它只负责插 notifications
--    （不管 replies_count），会和 STEP 6 的新触发器重复 → 每次回帖两条通知。
--    旧实现还依赖 notifications.type（NOT NULL），新触发器已写入 type='reply'。
--    这里删除旧触发器和旧函数；若你确认还需要旧逻辑，可跳过本步并删掉 STEP 6 的通知部分。
-- =============================================================================
drop trigger if exists on_reply_created on public.forum_replies;
drop function if exists public.handle_new_reply();


-- =============================================================================
-- STEP 1 · 权限判定辅助函数
-- ⚠️ 风险：低。SECURITY DEFINER + 固定 search_path，只读取调用者自己的 profile。
--    · 为什么需要：profiles 开了 RLS 后，策略里如果直接子查询 profiles 会递归；
--      用 SECURITY DEFINER 函数读 profiles 可以绕过 RLS（函数 owner = postgres），
--      既避免递归，也让策略可读。
--    · STABLE：同一条语句内结果会被缓存，避免每行都查一次。
-- =============================================================================

-- 1.1 当前登录用户的 role_level（未登录 / 无 profile → 0）
create or replace function public.rct_role_level()
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select coalesce(
           (select p.role_level from public.profiles p where p.id = auth.uid()),
           0
         )::integer;
$fn$;

comment on function public.rct_role_level() is
  'RCT MP：返回当前 JWT 用户的 role_level；anon/未登录返回 0。仅用于 RLS 策略判权。';

-- 1.2 当前登录用户是否已完成 Steam 验证
--     注意：同时要求 steam_id 是合法 17 位 SteamID64。旧实现可能通过 metadata
--     伪造 steam_verified=true 而 steam_id 为空/非法；只认布尔值会被这批账号绕过。
create or replace function public.rct_is_steam_verified()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select coalesce(
           (
             select p.steam_verified
                and p.steam_id ~ '^[0-9]{17}$'
             from public.profiles p
             where p.id = auth.uid()
           ),
           false
         );
$fn$;

comment on function public.rct_is_steam_verified() is
  'RCT MP：当前 JWT 用户是否真正完成 Steam 验证（steam_verified=true 且 steam_id 为 17 位）；anon/未登录返回 false。';

-- 1.3 是否是“后端/运维”调用（service_role、GoTrue、SQL Editor、迁移脚本）
--     判据：JWT 里没有 role claim（空）或 role = service_role，
--     或数据库会话本身是 postgres / supabase_admin / supabase_auth_admin。
--     PostgREST 的普通请求一定带 role claim（anon / authenticated），不会误放行。
create or replace function public.rct_caller_is_backend()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $fn$
  select coalesce(auth.role(), '') in ('', 'service_role')
      or session_user in ('postgres', 'supabase_admin', 'supabase_auth_admin');
$fn$;

comment on function public.rct_caller_is_backend() is
  'RCT MP：判断当前调用是否来自 service_role / SQL Editor / 认证服务，用于放行守卫触发器。';

-- 1.4 显式授权：RLS 策略会以“查询者”的身份调用这些函数，需要 EXECUTE 权限。
--     Supabase 默认把函数 EXECUTE 授予 PUBLIC；这里再显式给一次，
--     防止有人改过默认权限后，所有策略集体报 “permission denied for function”。
--     只给这三个只读辅助函数；守卫/计数触发器函数不对外授权（它们只能被触发器调用）。
grant execute on function public.rct_role_level()        to anon, authenticated, service_role;
grant execute on function public.rct_is_steam_verified() to anon, authenticated, service_role;
grant execute on function public.rct_caller_is_backend() to anon, authenticated, service_role;


-- =============================================================================
-- STEP 2 · 打开所有业务表的 RLS
-- ⚠️ 风险：中。开启 RLS 后，没有对应策略的访问会立刻被拒绝。
--    本步骤之后紧接着创建策略，全部在同一个事务里，所以不会出现“只开了 RLS
--    还没策略”的窗口。但如果第 3~11 步有任何一步失败，整个事务回滚，线上不变。
--    · 不用 FORCE ROW LEVEL SECURITY：FORCE 会让表 owner 也受 RLS 约束，
--      导致上面的 SECURITY DEFINER 函数失效（策略判权全部变 0）。
-- =============================================================================
alter table public.profiles         enable row level security;
alter table public.roles            enable row level security;
alter table public.forum_categories enable row level security;
alter table public.forum_topics     enable row level security;
alter table public.forum_replies    enable row level security;
alter table public.notifications    enable row level security;
alter table public.vtcs             enable row level security;
alter table public.announcements    enable row level security;
alter table public.rules_articles   enable row level security;

-- storage.objects 的 RLS 在 Supabase 里默认就是开启的，这里不去 ALTER 它
-- （storage schema 属于 supabase_storage_admin，ALTER 可能报 must be owner）；
-- 只追加策略，并在 verify 段确认 relrowsecurity 仍是 ON。
-- 若报 “must be owner of table objects”，请改用 Dashboard → Storage → Policies 手动建策略。


-- =============================================================================
-- STEP 3 · profiles
-- ⚠️ 风险：高（这是全站身份表的最后一道防线）。三个东西一起上：
--    (a) 公开读策略      —— 与线上现状一致，首页/论坛/搜索依赖它
--    (b) 更新策略        —— 本人可改自己；Lv.40+ 可改他人（/admin/users 需要）
--                           “能改哪些字段”由 (c) 的守卫触发器逐字段判定
--    (c) 守卫触发器      —— 身份字段/车队字段的“字段级”保护，RLS 做不到的那部分
--    ⚠️ 不创建 INSERT 策略：profiles 行应由 handle_new_user（security definer）
--       或 service_role 创建。若线上依赖客户端 insert，请先看附录 A2 再决定。
-- =============================================================================

-- 3.1 匿名 + 登录用户都能读公开资料（含 role_level，用于展示职位徽章）
drop policy if exists "profiles_select_public" on public.profiles;
create policy "profiles_select_public"
  on public.profiles
  for select
  to anon, authenticated
  using (true);

-- 3.2 本人可更新自己那一行；经理(Lv.70)+ 可更新他人的行
--     （/admin/users 的人员管理功能就是这样跨用户更新的；阈值与 app/admin/users 一致）
--     ⚠️ 能改哪些“字段”不在这里管，由 3.4 的守卫触发器逐字段判定。
--     ⚠️ 若只允许 auth.uid() = id，后台的人员管理会 0 行更新（表现为“保存没反应”）。
--     ⚠️ 策略名沿用 self_or_staff，实际阈值 = 经理 70（名字仅为历史兼容）。
drop policy if exists "profiles_update_self_or_staff" on public.profiles;
create policy "profiles_update_self_or_staff"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id or public.rct_role_level() >= 70)
  with check (auth.uid() = id or public.rct_role_level() >= 70);

-- 3.3 新行默认值（只影响之后插入的行，不改动历史数据）
--     ⚠️ 若 handle_new_user 已经显式赋值，这里是冗余但无害的兜底。
alter table public.profiles alter column role          set default 'member';
alter table public.profiles alter column role_level    set default 10;
alter table public.profiles alter column steam_verified set default false;

-- 3.4 身份字段保护：BEFORE UPDATE
--     规则（按交接文档）：
--       · service_role / 直连数据库 / 认证服务 → 放行
--       · 无登录态 → 拒绝
--       · role / role_level / custom_id / random_id / steam_id / steam_verified /
--         discord_id 变化 → 必须 Lv.40+；不能给自己提权（只允许改自己的 custom_id）、
--         不能改同级或上级、不能授予同级或更高等级（Lv.100 开发者除外）
--       · vtc_id / vtc_role 变化 → 只能“加入存在的车队 / 退出 / 建队后成为 owner”
create or replace function public.rct_guard_profiles()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid        uuid := auth.uid();
  v_level      integer;
  v_old_level  integer := coalesce(old.role_level, 0);
  v_vtc_owner  uuid;
  v_old_vtc_owner uuid;
  v_recruiting boolean;
begin
  -- 3.4.1 后端 / 运维通道
  if public.rct_caller_is_backend() then
    return new;
  end if;

  -- 3.4.2 无登录态：anon key 直接 update 一律拒绝
  if v_uid is null then
    raise exception 'profiles: 未登录，禁止修改'
      using errcode = '42501';
  end if;

  -- 3.4.2b 主键不可改：防止经理把低等级用户的 id 改成别的 auth 用户 id（数据错位/DoS）
  if new.id is distinct from old.id then
    raise exception 'profiles: 不允许修改主键 id'
      using errcode = '42501';
  end if;

  v_level := public.rct_role_level();

  -- 3.4.3 Steam 验证字段：连工作人员也不能写，只能由服务端绑定接口用
  --       service_role 写入（上面 3.4.1 已经把后端通道放行了）。
  --       原因：这是“正版 ETS2 + 2 小时”门槛的唯一凭证，不能被人为代签。
  if new.steam_id is distinct from old.steam_id
     or new.steam_verified is distinct from old.steam_verified then
    raise exception 'steam_id / steam_verified 只能由服务端 Steam 绑定接口（service_role）写入，客户端不可修改'
      using errcode = '42501';
  end if;

  -- 3.4.5 其它身份字段
  if new.role            is distinct from old.role
     or new.role_level   is distinct from old.role_level
     or new.custom_id    is distinct from old.custom_id
     or new.random_id    is distinct from old.random_id
     or new.discord_id   is distinct from old.discord_id then

    if v_level < 40 then
      raise exception '权限不足：role / role_level / custom_id / random_id / discord_id 仅工作人员(Lv.40)及以上可修改'
        using errcode = '42501';
    end if;

    if old.id = v_uid then
      -- 自己改自己：只放行 custom_id（后台「我的靓号」功能，见 app/admin/users/page.tsx
      -- 的 isSelf 分支，它只提交 custom_id）。其余提权相关字段一律拒绝。
      if new.role          is distinct from old.role
         or new.role_level is distinct from old.role_level
         or new.random_id  is distinct from old.random_id
         or new.discord_id is distinct from old.discord_id then
        raise exception '禁止修改自己的 role / role_level / random_id / discord_id；只能改自己的 custom_id，或请其他工作人员/service_role 操作'
          using errcode = '42501';
      end if;
    else
      -- 改别人：不能动同级或上级，不能授予同级或更高等级
      -- 例外：Lv.100 开发者（交接文档“无视任何限制”，且前端 UI 也允许开发者互相管理）
      if v_old_level >= v_level and v_level < 100 then
        raise exception '禁止修改同级或上级的身份字段（目标 Lv.%，你的 Lv.%）', v_old_level, v_level
          using errcode = '42501';
      end if;

      if v_level < 100
         and new.role_level is distinct from old.role_level
         and new.role_level >= v_level then
        raise exception '禁止赋予同级或更高的等级（目标 Lv.%，你的 Lv.%）', new.role_level, v_level
          using errcode = '42501';
      end if;

      -- 若 roles 表已定义职位等级，再校验一次“职位等级低于自己”
      if v_level < 100
         and new.role is distinct from old.role
         and exists (
           select 1
           from public.roles r
           where r.name = new.role
             and coalesce(r.level, 0) >= v_level
         ) then
        raise exception '禁止赋予同级或更高的职位：%', coalesce(new.role, '(null)')
          using errcode = '42501';
      end if;
    end if;
  end if;

  -- 3.4.6 车队字段
  if new.vtc_id is distinct from old.vtc_id
     or new.vtc_role is distinct from old.vtc_role then

    -- owner 不能通过客户端把自己摘出车队（否则车队会变成无主孤儿；
    -- 转让/解散目前没有产品功能，需 service_role / SQL Editor 操作）
    -- 所有者保护以 vtcs.owner_id 为准（不能只信 profiles.vtc_role）：
    -- 否则车主可以“先把 vtc_role 改成 member、再退出”，把车队变成无主孤儿。
    if old.vtc_id is not null then
      select v.owner_id into v_old_vtc_owner
      from public.vtcs v
      where v.id = old.vtc_id;
    end if;

    if v_old_vtc_owner is not null
       and v_old_vtc_owner = v_uid
       and (new.vtc_id is distinct from old.vtc_id
            or new.vtc_role is distinct from old.vtc_role) then
      raise exception '车队所有者不能通过客户端离开车队或变更自己的车队身份；请先转让/解散车队（需 service_role）'
        using errcode = '42501';
    end if;

    if new.vtc_id is null then
      -- 退出车队：两个字段必须同时清空
      if new.vtc_role is not null then
        raise exception '退出车队时必须同时把 vtc_role 置空'
          using errcode = '42501';
      end if;
    else
      -- 新加入车队（原来不在任何车队）必须是已验证用户；已在队内改资料/改名不受影响
      if old.vtc_id is null and new.vtc_id is distinct from old.vtc_id
         and not public.rct_is_steam_verified() then
        raise exception '未完成 Steam 正版验证，不能加入车队'
          using errcode = '42501';
      end if;
      -- 合法取值
      if new.vtc_role is null
         or new.vtc_role not in ('owner', 'manager', 'member') then
        raise exception '非法 vtc_role：%，只允许 owner / manager / member',
          coalesce(new.vtc_role, '(null)')
          using errcode = '42501';
      end if;

      -- 目标车队必须真实存在
      select v.owner_id, coalesce(v.is_recruiting, true)
        into v_vtc_owner, v_recruiting
      from public.vtcs v
      where v.id = new.vtc_id;

      if not found then
        raise exception '目标车队不存在（vtc_id=%），禁止把资料写成不存在的车队', new.vtc_id
          using errcode = '42501';
      end if;

      -- 禁止自称 owner：必须真的是该车队的 owner_id（建队流程天然满足）
      -- 注意：不看 role_level —— 即使是工作人员/经理也不能通过客户端把
      -- 自己“写成”某个车队的 owner（否则会伪造 owner 徽章）。
      if new.vtc_role = 'owner'
         and v_vtc_owner is distinct from v_uid then
        raise exception '禁止把自己写成车队 owner：你不是该车队的 owner_id'
          using errcode = '42501';
      end if;

      -- manager 只有车队 owner 可以指派（后台代管需 service_role）
      if new.vtc_role = 'manager'
         and v_vtc_owner is distinct from v_uid then
        raise exception '只有车队所有者或工作人员可以设置 manager'
          using errcode = '42501';
      end if;

      -- 新加入的车队必须仍在招募（已在队内改名/改角色不受影响）
      if old.vtc_id is distinct from new.vtc_id
         and v_recruiting is false then
        raise exception '该车队当前未开放招募（is_recruiting = false）'
          using errcode = '42501';
      end if;
    end if;
  end if;

  -- 3.4.7 跨用户编辑的总闸门：不能动同级或上级的整行（含昵称/简介等展示字段），
  --       与后台 UI 的“不可操作”规则保持一致。
  --       例外：Lv.100 开发者可互相管理（交接文档“无视任何限制”，前端也放开）。
  if old.id <> v_uid and v_old_level >= v_level and v_level < 100 then
    raise exception '禁止修改同级或上级的资料（目标 Lv.%，你的 Lv.%）', v_old_level, v_level
      using errcode = '42501';
  end if;

  return new;
end;
$fn$;

drop trigger if exists trg_rct_guard_profiles on public.profiles;
create trigger trg_rct_guard_profiles
  before update on public.profiles
  for each row
  execute function public.rct_guard_profiles();

-- 3.5 插入保护：任何来源创建 profiles 都从“普通司机 + 未验证”开始。
--     ⚠️ 设计取舍（很重要）：
--       · 不区分调用方（handle_new_user / service_role / SQL Editor 一视同仁）：
--         role / role_level / custom_id / discord_id / vtc_id / vtc_role /
--         steam_id / steam_verified 一律强制安全默认值。
--       · 为什么不能对认证服务放行：GoTrue 的连接角色通常是 supabase_auth_admin，
--         而线上 handle_new_user 是否信任 raw_user_meta_data 无法在本脚本里确认。
--         攻击者可直接 POST /auth/v1/signup 并带
--         data:{role:'developer',role_level:100,custom_id:'000001',vtc_role:'owner'}；
--         只要按“后端放行”处理，这些字段就会原样落库 = P0 提权。
--         所以这里一律覆盖，不依赖 handle_new_user 的定义。
--       · 服务端后续如需提权/绑定 Steam，走 UPDATE（3.4 的守卫对 service_role 放行）。
--       · 不碰 random_id（结构未知，可能是 NOT NULL DEFAULT；且它不是权限字段）。
create or replace function public.rct_guard_profiles_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  new.role           := 'member';
  new.role_level     := 10;
  new.steam_verified := false;
  new.steam_id       := null;
  new.discord_id     := null;
  new.custom_id      := null;
  new.vtc_id         := null;
  new.vtc_role       := null;

  -- 有登录态时，只能创建自己那一行；无登录态（认证服务内部插入）跳过此检查
  if auth.uid() is not null and new.id is distinct from auth.uid() then
    raise exception 'profiles: 只能创建自己的资料行'
      using errcode = '42501';
  end if;

  return new;
end;
$fn$;

drop trigger if exists trg_rct_guard_profiles_insert on public.profiles;
create trigger trg_rct_guard_profiles_insert
  before insert on public.profiles
  for each row
  execute function public.rct_guard_profiles_insert();


-- =============================================================================
-- STEP 4 · roles / forum_categories（只读表）
-- ⚠️ 风险：低。都是展示用字典表，只开读，写操作只允许 service_role / SQL Editor。
--    · roles 当前对 anon 返回 401，就是“RLS 已开但缺 select 策略”，本步补上。
-- =============================================================================
drop policy if exists "roles_select_public" on public.roles;
create policy "roles_select_public"
  on public.roles
  for select
  to anon, authenticated
  using (true);

drop policy if exists "forum_categories_select_public" on public.forum_categories;
create policy "forum_categories_select_public"
  on public.forum_categories
  for select
  to anon, authenticated
  using (true);


-- =============================================================================
-- STEP 4.1 · roles 字典表的等级归一化（数据迁移，不属于 RLS，但同样必须执行）
-- ⚠️ 风险：中。会改 roles.level 与个别 profiles.role_level。
--    · 为什么必须做：/admin/users 保存时严格取 roles.level 作为 profiles.role_level，
--      若 roles 里 manager 还是 60、director 还是 80，保存后管理员会“降级自己人”。
--    · 只处理交接文档里的 5 个标准职位；未知职位（director 等）保持原值不动。
--    · 插入缺失职位时若遇到 NOT NULL 列（如 department）会失败：用子事务兜底，
--      只发 WARNING，不会让整份加固回滚。
--    · profiles 只修“role=developer 但 role_level<100”这一种明确的历史脏数据；
--      60/80 等旧阈值的账号请先用 V9 查询人工确认，再执行文件末尾【M1】的可选迁移。
-- =============================================================================
do $roles_norm$
declare
  rec       record;
  v_changed text := '';
  v_n       integer;
begin
  for rec in
    select *
    from (values
      ('developer',                100),
      ('senior_community_manager',  90),
      ('manager',                   70),
      ('staff',                     40),
      ('member',                    10)
    ) as v(name, level)
  loop
    begin
      if exists (select 1 from public.roles r where r.name = rec.name) then
        update public.roles r
           set level = rec.level
         where r.name = rec.name
           and coalesce(r.level, -1) <> rec.level;
        if found then
          v_changed := v_changed || rec.name || '(' || rec.level || ') ';
        end if;
      else
        -- 本项目的职位命名以线上 roles 表为准（实际字典里有 28 个自定义职位），
        -- 脚本不擅自新增/删除职位，只标准化已存在的主干职位。
        raise notice 'roles 字典里没有 % → 跳过（不新增职位，避免污染字典）', rec.name;
      end if;
    exception
      when others then
        raise warning 'roles 归一化跳过 %：%（请手工核对 roles 表结构后补齐）', rec.name, sqlerrm;
    end;
  end loop;

  -- ⚠️ 这里【不自动】升级 role='developer' 的账号：
  --     旧系统允许用户自己改 role（见 docs/SECURITY.md 的 P0-1），攻击者可能预埋了
  --     role='developer' 但 role_level 很低的记录；脚本一跑就把他升到 Lv.100，
  --     等于把攻击者转正。正确做法：跑 V9 列出名单，人工确认后按白名单升级，例如：
  --       update public.profiles set role_level = 100
  --        where id in ('<可信开发者-uid-1>', '<可信开发者-uid-2>');
  --     （当前线上 CRT 的 role='developer' / role_level=99，属于需要人工升级的情况。）
  -- 旧阈值账号映射（60→70、80→90）：保留原有管理权限，避免加固后把经理锁在后台外。
  -- ⚠️ 这是数据迁移，回滚段不恢复；执行前先备份 profiles（见 SECURITY.md Step 0）。
  update public.profiles set role_level = 70 where role_level = 60;
  get diagnostics v_n = row_count;
  if v_n > 0 then
    v_changed := v_changed || '旧阈值70(' || v_n || ') ';
  end if;

  update public.profiles set role_level = 90 where role_level = 80;
  get diagnostics v_n = row_count;
  if v_n > 0 then
    v_changed := v_changed || '旧阈值90(' || v_n || ') ';
  end if;

  raise notice 'roles 等级归一化完成：%', coalesce(nullif(v_changed, ''), '(无变化)');
end
$roles_norm$;


-- =============================================================================
-- STEP 5 · forum_topics
-- ⚠️ 风险：中高。发帖是核心功能，策略写错会导致“登录了也发不了帖”。
--    · 作者改帖：允许 update 自己的行，但 author_id / category_id / replies_count
--      由守卫触发器锁定（客户端改不动，也不会报错，静默忽略）。
--      replies_count 现在由 STEP 6 的 AFTER 触发器维护（前端已移除读改写逻辑）。
--    · 官方公告版块用 category_id::text = '1' 判断，兼容 integer / uuid 两种类型。
-- =============================================================================
drop policy if exists "forum_topics_select_public" on public.forum_topics;
create policy "forum_topics_select_public"
  on public.forum_topics
  for select
  to anon, authenticated
  using (true);

drop policy if exists "forum_topics_insert_verified" on public.forum_topics;
create policy "forum_topics_insert_verified"
  on public.forum_topics
  for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and public.rct_is_steam_verified()
    and (
      coalesce(forum_topics.category_id::text, '') <> '1'
      or public.rct_role_level() >= 70
    )
  );

drop policy if exists "forum_topics_update_author_or_manager" on public.forum_topics;
create policy "forum_topics_update_author_or_manager"
  on public.forum_topics
  for update
  to authenticated
  using (author_id = auth.uid() or public.rct_role_level() >= 70)
  with check (author_id = auth.uid() or public.rct_role_level() >= 70);

drop policy if exists "forum_topics_delete_author_or_manager" on public.forum_topics;
create policy "forum_topics_delete_author_or_manager"
  on public.forum_topics
  for delete
  to authenticated
  using (author_id = auth.uid() or public.rct_role_level() >= 70);

-- 5.1 守卫触发器：锁定 author_id / category_id / replies_count
create or replace function public.rct_guard_forum_topics()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_level      integer := public.rct_role_level();
  v_counter_on boolean := coalesce(current_setting('rct.reply_counter', true), '') = 'on';
begin
  if public.rct_caller_is_backend() then
    return new;
  end if;

  -- 作者归属与所属版块不允许普通用户改（含把帖子挪出/挪进官方公告版块）
  if v_level < 70 then
    new.author_id   := old.author_id;
    new.category_id := old.category_id;
  end if;

  -- replies_count 只由论坛回复触发器维护；客户端写入一律忽略
  if v_level < 70 and not v_counter_on then
    new.replies_count := old.replies_count;
  end if;

  return new;
end;
$fn$;

drop trigger if exists trg_rct_guard_forum_topics on public.forum_topics;
create trigger trg_rct_guard_forum_topics
  before update on public.forum_topics
  for each row
  execute function public.rct_guard_forum_topics();


-- =============================================================================
-- STEP 6 · forum_replies（策略 + 计数触发器 + 通知触发器）
-- ⚠️ 风险：中高。两个 AFTER 触发器会写 forum_topics / notifications：
--    · 它们用 SECURITY DEFINER 执行（owner=postgres），因此能绕过 RLS 写表，
--      普通用户不需要额外的 update/insert 权限。
--    · 计数器用事务级开关 rct.reply_counter 与 STEP 5 的守卫配合，
--      不会把自己的写操作拦掉。
--    · 不创建 UPDATE 策略：当前产品没有“编辑回复”的功能，按最小权限关闭。
-- =============================================================================
drop policy if exists "forum_replies_select_public" on public.forum_replies;
create policy "forum_replies_select_public"
  on public.forum_replies
  for select
  to anon, authenticated
  using (true);

drop policy if exists "forum_replies_insert_verified" on public.forum_replies;
create policy "forum_replies_insert_verified"
  on public.forum_replies
  for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and public.rct_is_steam_verified()
  );

-- 与前端“删主题 = 先删该主题下所有回复、再删主题”的流程对齐：
-- 帖子作者也可能删掉别人在自己帖子下的回复，所以这里额外放行“主题作者”。
drop policy if exists "forum_replies_delete_author_or_manager" on public.forum_replies;
create policy "forum_replies_delete_author_or_manager"
  on public.forum_replies
  for delete
  to authenticated
  using (
    author_id = auth.uid()
    or public.rct_role_level() >= 70
    or exists (
      select 1
      from public.forum_topics t
      where t.id = forum_replies.topic_id
        and t.author_id = auth.uid()
    )
  );

-- 6.1 新增回复：replies_count + 1，并给楼主插一条通知
create or replace function public.rct_forum_replies_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_topic_author uuid;
  v_topic_title  text;
  v_topic_cat    text;
  v_excerpt      text;
begin
  select t.author_id, t.title, t.category_id::text
    into v_topic_author, v_topic_title, v_topic_cat
  from public.forum_topics t
  where t.id = new.topic_id;

  if not found then
    return null;   -- 主题被并发删除，不计数也不通知
  end if;

  -- 打开发关，让 STEP 5 的守卫允许本次计数更新
  perform set_config('rct.reply_counter', 'on', true);

  update public.forum_topics t
     set replies_count = coalesce(t.replies_count, 0) + 1
   where t.id = new.topic_id;

  perform set_config('rct.reply_counter', 'off', true);

  -- 自己回复自己不必通知
  if v_topic_author is not null and v_topic_author <> new.author_id then
    v_excerpt := left(
      replace(
        replace(coalesce(new.content, ''), chr(10), ' '),
        chr(13), ' '
      ),
      40
    );

    -- 单独包一层异常处理：通知写失败（表结构不符 / 缺列 / 约束冲突）
    -- 只发 WARNING，绝不能让“回帖”这个核心动作失败。
    begin
      insert into public.notifications (user_id, actor_id, type, content, link, is_read)
      values (
        v_topic_author,
        new.author_id,
        'reply',
        '你的帖子《' || left(coalesce(v_topic_title, ''), 30) || '》有新回复：' || v_excerpt,
        '/forum/' || coalesce(v_topic_cat, '') || '/' || new.topic_id::text,
        false
      );
    exception
      when others then
        raise warning '回复通知写入失败（不影响回帖）：% / SQLSTATE %', sqlerrm, sqlstate;
    end;
  end if;

  return null;   -- AFTER 触发器的返回值被忽略
end;
$fn$;

drop trigger if exists trg_rct_forum_replies_after_insert on public.forum_replies;
create trigger trg_rct_forum_replies_after_insert
  after insert on public.forum_replies
  for each row
  execute function public.rct_forum_replies_after_insert();

-- 6.2 删除回复：replies_count - 1（下限 0，避免历史数据不一致时变成负数）
create or replace function public.rct_forum_replies_after_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  perform set_config('rct.reply_counter', 'on', true);

  update public.forum_topics t
     set replies_count = greatest(coalesce(t.replies_count, 0) - 1, 0)
   where t.id = old.topic_id;

  perform set_config('rct.reply_counter', 'off', true);

  return null;
end;
$fn$;

drop trigger if exists trg_rct_forum_replies_after_delete on public.forum_replies;
create trigger trg_rct_forum_replies_after_delete
  after delete on public.forum_replies
  for each row
  execute function public.rct_forum_replies_after_delete();


-- =============================================================================
-- STEP 7 · notifications（列结构不符时整体跳过，不阻断其它表的加固）
-- ⚠️ 风险：低。只开“读自己的 + 标记自己的已读”；
--    插入由 STEP 6 的 SECURITY DEFINER 触发器完成，客户端不能 insert。
--    · 守卫触发器把 user_id / actor_id / content / link 钉死，只允许改 is_read，
--      防止用户把自己的通知改成别人的、或伪造通知内容。
--    · ⚠️ policy 表达式在 CREATE POLICY 时就会解析列名：若 notifications 缺
--      user_id / is_read 等列，直接执行会报错并让整个事务回滚。所以本步用
--      DO + EXECUTE 包起来，缺列时只发 WARNING 并跳过（其余表照常加固）。
--      缺列时 notifications 表会处于“RLS 已开、无策略”的拒绝状态，
--      需要按附录 A1 对齐结构后单独重跑 STEP 7。
-- =============================================================================
do $notif_boot$
declare
  v_ready boolean;
begin
  select
    exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'notifications' and column_name = 'user_id')
    and exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'notifications' and column_name = 'actor_id')
    and exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'notifications' and column_name = 'content')
    and exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'notifications' and column_name = 'link')
    and exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'notifications' and column_name = 'is_read')
    into v_ready;

  if not v_ready then
    raise warning 'notifications 缺少 user_id/actor_id/content/link/is_read 之一 → 跳过 STEP 7 的策略与守卫触发器（请按附录 A1 对齐结构后单独重跑本步）';
    return;
  end if;

  execute $ddl$
    drop policy if exists "notifications_select_own" on public.notifications;
    create policy "notifications_select_own"
      on public.notifications
      for select
      to authenticated
      using (user_id = auth.uid());

    drop policy if exists "notifications_update_own_mark_read" on public.notifications;
    create policy "notifications_update_own_mark_read"
      on public.notifications
      for update
      to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());

    create or replace function public.rct_guard_notifications()
    returns trigger
    language plpgsql
    security definer
    set search_path = public, pg_temp
    as $fn$
    begin
      if public.rct_caller_is_backend() then
        return new;
      end if;

      -- 只允许改 is_read，其余列一律保持原值
      new.user_id  := old.user_id;
      new.actor_id := old.actor_id;
      new.content  := old.content;
      new.link     := old.link;

      return new;
    end;
    $fn$;

    drop trigger if exists trg_rct_guard_notifications on public.notifications;
    create trigger trg_rct_guard_notifications
      before update on public.notifications
      for each row
      execute function public.rct_guard_notifications();
  $ddl$;
end
$notif_boot$;


-- =============================================================================
-- STEP 8 · vtcs（公共可读 + 验证后可建 + 只有 owner 能改 + tag 唯一）
-- ⚠️ 风险：中。
--    · with check (owner_id = auth.uid()) 同时阻止了“把车队转让给别人”
--      —— 需要转让时由 service_role / SQL Editor 操作（当前产品没有转让功能）。
--    · 唯一索引建在 lower(btrim(tag)) 上：'rct' 与 'RCT' 视为重复。
--      若线上已有重复 tag，本步会失败并回滚 → 先按 inspect U4 清理数据。
-- =============================================================================
drop policy if exists "vtcs_select_public" on public.vtcs;
create policy "vtcs_select_public"
  on public.vtcs
  for select
  to anon, authenticated
  using (true);

drop policy if exists "vtcs_insert_verified" on public.vtcs;
create policy "vtcs_insert_verified"
  on public.vtcs
  for insert
  to authenticated
  with check (
    owner_id = auth.uid()
    and public.rct_is_steam_verified()
  );

drop policy if exists "vtcs_update_owner" on public.vtcs;
create policy "vtcs_update_owner"
  on public.vtcs
  for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- 8.1 唯一索引（仅当线上还没有“tag 唯一”索引/约束时才创建）
do $vtc_tag$
declare
  v_dup_count integer;
begin
  -- 先检查重复，给出可读的报错（否则只会看到 “could not create unique index”）
  select count(*)
    into v_dup_count
  from (
    select lower(btrim(tag)) as tag_norm
    from public.vtcs
    where tag is not null and btrim(tag) <> ''
    group by lower(btrim(tag))
    having count(*) > 1
  ) d;

  if v_dup_count > 0 then
    raise exception
      'vtcs.tag 存在 % 组重复（区分大小写无关），无法创建唯一索引。请先合并重复车队（见 inspect U4）。',
      v_dup_count;
  end if;

  if not exists (
    select 1
    from pg_index i
    join pg_class t on t.oid = i.indrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'vtcs'
      and i.indisunique
      and pg_get_indexdef(i.indexrelid) ilike '%(tag%'
  ) then
    execute 'create unique index if not exists vtcs_tag_unique_ci on public.vtcs (lower(btrim(tag))) where tag is not null and btrim(tag) <> ''''';
    raise notice '已创建 vtcs.tag 部分唯一索引 vtcs_tag_unique_ci（空 tag 不参与唯一约束）';
  else
    raise notice 'vtcs.tag 已有唯一索引/约束 → 跳过创建';
  end if;
end
$vtc_tag$;


-- =============================================================================
-- STEP 9 · announcements（匿名可读，Lv.40+ 可发布/修改/删除）
-- ⚠️ 风险：低。发布权限从“任何登录用户”收紧到 Lv.40+。
-- ✅ 口径已统一（2026-11-01）：交接文档写 Lv.40「工作人员可发新闻」，
--    lib/permissions.ts 的 canManageAnnouncements() 已同步改为 STAFF(40)，
--    /admin/news 入口与数据库策略一致。
--    如果之后想收紧为「仅经理可发公告」：把本段 4 处 `>= 40` 改成 `>= 70`，
--    并把 lib/permissions.ts 的 canManageAnnouncements 改回 MANAGER。
-- =============================================================================
drop policy if exists "announcements_select_public" on public.announcements;
create policy "announcements_select_public"
  on public.announcements
  for select
  to anon, authenticated
  using (true);

drop policy if exists "announcements_insert_staff" on public.announcements;
create policy "announcements_insert_staff"
  on public.announcements
  for insert
  to authenticated
  with check (public.rct_role_level() >= 40);

drop policy if exists "announcements_update_staff" on public.announcements;
create policy "announcements_update_staff"
  on public.announcements
  for update
  to authenticated
  using (public.rct_role_level() >= 40)
  with check (public.rct_role_level() >= 40);

drop policy if exists "announcements_delete_staff" on public.announcements;
create policy "announcements_delete_staff"
  on public.announcements
  for delete
  to authenticated
  using (public.rct_role_level() >= 40);


-- =============================================================================
-- STEP 10 · rules_articles（匿名只能读 published，写要 Lv.90+）
-- ⚠️ 风险：低-中。会改变 /rules 页面的可见内容：草稿不再对普通用户可见。
--    · 后台 /admin/rules 需要读草稿 → 所以 select 策略里带了 role_level >= 90 的分支。
-- =============================================================================
drop policy if exists "rules_articles_select_published_or_senior" on public.rules_articles;
create policy "rules_articles_select_published_or_senior"
  on public.rules_articles
  for select
  to anon, authenticated
  using (
    status = 'published'
    or public.rct_role_level() >= 90
  );

drop policy if exists "rules_articles_insert_senior" on public.rules_articles;
create policy "rules_articles_insert_senior"
  on public.rules_articles
  for insert
  to authenticated
  with check (public.rct_role_level() >= 90);

drop policy if exists "rules_articles_update_senior" on public.rules_articles;
create policy "rules_articles_update_senior"
  on public.rules_articles
  for update
  to authenticated
  using (public.rct_role_level() >= 90)
  with check (public.rct_role_level() >= 90);

drop policy if exists "rules_articles_delete_senior" on public.rules_articles;
create policy "rules_articles_delete_senior"
  on public.rules_articles
  for delete
  to authenticated
  using (public.rct_role_level() >= 90);


-- =============================================================================
-- STEP 11 · Storage：avatars 桶
-- ⚠️ 风险：中。策略写在 storage.objects 上，属于 storage schema。
--    · 上传路径必须是 avatar-<自己的 uid>-<随机>.<ext>，与前端
--      app/settings/page.tsx 里 `avatar-${user.id}-${Math.random()}.${ext}` 一致。
--    · 如果报 “must be owner of table objects”，改用 Dashboard → Storage →
--      Policies 手动创建同等策略，或用 supabase_storage_admin 执行本段。
--    · 已有对象若不符合前缀规范，仍然可以公开读（select 策略不限前缀），
--      只是原主人不能再覆盖/删除它（需 service_role 处理历史遗留）。
-- =============================================================================
-- ⚠️ 用 DO + 异常处理：storage.objects 属于 supabase_storage_admin，
--    在部分项目里 SQL Editor 的 postgres 没有建策略权限。若权限不足，
--    只发 WARNING（不影响前面 9 张 public 表已经完成的加固），
--    然后到 Dashboard → Storage → Policies 手动建同等策略。
do $storage_policies$
begin
  execute $ddl$
    -- 先清理旧版 storage 宽松策略（否则它们会与我们新增的策略取并集）
    drop policy if exists "Allow Admin Uploads" on storage.objects;
    drop policy if exists "Allow authenticated uploads" on storage.objects;
    drop policy if exists "profiles 1oj01fe_0" on storage.objects;

    drop policy if exists "avatars_select_public" on storage.objects;
    create policy "avatars_select_public"
      on storage.objects
      for select
      to anon, authenticated
      using (bucket_id = 'avatars');

    drop policy if exists "avatars_insert_own_path" on storage.objects;
    create policy "avatars_insert_own_path"
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'avatars'
        and auth.uid() is not null
        and name like ('avatar-' || auth.uid()::text || '-%')
      );

    drop policy if exists "avatars_update_own_path" on storage.objects;
    create policy "avatars_update_own_path"
      on storage.objects
      for update
      to authenticated
      using (
        bucket_id = 'avatars'
        and auth.uid() is not null
        and name like ('avatar-' || auth.uid()::text || '-%')
      )
      with check (
        bucket_id = 'avatars'
        and auth.uid() is not null
        and name like ('avatar-' || auth.uid()::text || '-%')
      );

    drop policy if exists "avatars_delete_own_path" on storage.objects;
    create policy "avatars_delete_own_path"
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id = 'avatars'
        and auth.uid() is not null
        and name like ('avatar-' || auth.uid()::text || '-%')
      );
  $ddl$;
  raise notice 'STORAGE：avatars 桶策略已创建。';
exception
  when insufficient_privilege then
    raise warning 'STORAGE：当前角色没有 storage.objects 的建策略权限（%）。请改用 Dashboard → Storage → Policies 手动创建 4 条 avatars 策略；public 表加固不受影响。', sqlerrm;
  when undefined_table then
    raise warning 'STORAGE：storage.objects 不存在（%）。请确认 Storage 已启用后手动创建 avatars 策略。', sqlerrm;
end
$storage_policies$;


-- =============================================================================
-- STEP 12 · 注册触发器兜底（防御式：只补缺，绝不覆盖既有定义）
-- ⚠️ 风险：中。
--    · 若 handle_new_user 已存在 → 本步什么都不做，只发出一条 NOTICE，
--      提醒你人工核对它是否信任 raw_user_meta_data（这决定注册能否自称已验证）。
--    · 若不存在 → 建一个最小可用版本：display_name 取 metadata 或邮箱前缀，
--      role='member'、role_level=10、steam_verified=false（永不相信 metadata 的验证状态）。
--    · 若 auth.users 上已有同名触发器 → 跳过。
--    · 报 “must be owner of relation users” 时：Supabase 的 auth.users 属于
--      supabase_auth_admin，部分项目不允许 postgres 建触发器。
--      这时请改用 Dashboard → Auth → Hooks，或让 Supabase Support 协助。
-- =============================================================================
do $bootstrap_fn$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'handle_new_user'
  ) then
    execute $sql$
      create function public.handle_new_user()
      returns trigger
      language plpgsql
      security definer
      set search_path = public, pg_temp
      as $fn$
      begin
        insert into public.profiles (id, display_name, role, role_level, steam_verified, updated_at)
        values (
          new.id,
          coalesce(
            nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), ''),
            split_part(coalesce(new.email, 'player'), '@', 1)
          ),
          'member',
          10,
          false,
          now()
        )
        on conflict (id) do nothing;

        return new;
      end;
      $fn$;
    $sql$;

    raise notice 'handle_new_user 不存在 → 已创建兜底版本（member / Lv.10 / 未验证）';
  else
    raise notice 'handle_new_user 已存在 → 未覆盖。请人工核对它是否信任 raw_user_meta_data 的 steam_id/steam_verified（附录 A2）';
  end if;
end
$bootstrap_fn$;

do $bootstrap_trg$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'handle_new_user'
  ) and not exists (
    -- 按“触发器函数是 handle_new_user”判断，而不是按触发器名判断：
    -- 线上触发器可能叫别的名字，按名字判断会导致重复创建 → 注册时插入两次。
    select 1
    from pg_trigger t
    join pg_proc f on f.oid = t.tgfoid
    join pg_namespace fn_ns on fn_ns.oid = f.pronamespace
    where t.tgrelid = 'auth.users'::regclass
      and not t.tgisinternal
      and fn_ns.nspname = 'public'
      and f.proname = 'handle_new_user'
  ) then
    begin
      execute $sql$
        create trigger rct_on_auth_user_created
          after insert on auth.users
          for each row
          execute function public.handle_new_user();
      $sql$;
      raise notice 'auth.users 触发器不存在 → 已创建 rct_on_auth_user_created';
    exception
      when insufficient_privilege then
        raise warning 'auth.users 触发器创建失败（%）：请改用 Dashboard → Auth → Hooks，或让 Supabase Support 协助创建 handle_new_user 触发器。public 表加固不受影响。', sqlerrm;
    end;
  else
    raise notice 'auth.users 触发器已存在（或函数缺失）→ 跳过创建';
  end if;
end
$bootstrap_trg$;


-- =============================================================================
-- STEP 13 · 索引（RLS 策略会按 author_id / user_id / vtc_id 过滤，没索引会全表扫）
-- ⚠️ 风险：低。create index（非 concurrently）会给表加 SHARE 锁，执行期间
--    阻塞写入但允许读；当前表很小（帖子级数据），影响可忽略。
--    注意：create index concurrently 不能在事务块里执行，所以这里不用它。
-- =============================================================================
create index if not exists idx_forum_topics_category_created
  on public.forum_topics (category_id, created_at desc);

create index if not exists idx_forum_topics_author
  on public.forum_topics (author_id);

create index if not exists idx_forum_replies_topic_created
  on public.forum_replies (topic_id, created_at);

create index if not exists idx_forum_replies_author
  on public.forum_replies (author_id);

-- ⚠️ notifications 的列结构未知：索引放在按列存在性判断的 DO 里，
--    缺列时只跳过索引，不让整个加固事务回滚（策略见 STEP 7，同样是条件执行）。
do $idx_notif$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notifications' and column_name = 'user_id'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notifications' and column_name = 'created_at'
  ) then
    execute 'create index if not exists idx_notifications_user_created on public.notifications (user_id, created_at desc)';
  else
    raise warning 'notifications 缺 user_id 或 created_at → 跳过 idx_notifications_user_created';
  end if;
end
$idx_notif$;

create index if not exists idx_profiles_vtc
  on public.profiles (vtc_id);

-- 9. 收到这里为止，profiles.steam_id 只建普通索引；这里再尝试建“部分唯一索引”，
--    用于并发兜底（两个账号同时绑定同一个 SteamID 时，数据库层保证只有一个成功）。
--    已有重复数据时只发 WARNING 并跳过，不阻断加固；请按 inspect U11 清理后手工补建。
do $idx_steam_unique$
declare
  v_dup integer;
begin
  select count(*) into v_dup
  from (
    select steam_id
    from public.profiles
    where steam_id is not null
    group by steam_id
    having count(*) > 1
  ) d;

  if v_dup > 0 then
    raise warning 'profiles.steam_id 存在 % 组重复 → 跳过唯一索引。请先清理（inspect U11），否则“并发双绑”只能靠应用层查重。', v_dup;
  else
    execute 'create unique index if not exists profiles_steam_id_unique on public.profiles (steam_id) where steam_id is not null';
    raise notice '已创建 profiles.steam_id 部分唯一索引 profiles_steam_id_unique';
  end if;
end
$idx_steam_unique$;


-- =============================================================================
-- STEP 14 · 既有策略告警（只读，不改任何东西）
-- ⚠️ 风险：无。目的：把“不是本脚本创建的策略”列出来，让你在执行后仍能发现
--    旧的宽松策略（RLS 策略之间是“或”的关系，一条 using(true) 就能毁掉全部加固）。
-- =============================================================================
do $policy_warn$
declare
  v_list text;
begin
  select string_agg(
           x.schemaname || '.' || x.tablename || ' :: ' || x.policyname ||
           ' [' || x.cmd || ' ' || coalesce(array_to_string(x.roles, ','), '') || ']',
           chr(10) || '  '
           order by x.schemaname, x.tablename, x.policyname
         )
    into v_list
  from pg_policies x
  where x.schemaname in ('public', 'storage')
    and x.tablename in (
      'profiles', 'roles', 'forum_categories', 'forum_topics', 'forum_replies',
      'notifications', 'vtcs', 'announcements', 'rules_articles', 'objects'
    )
    and x.policyname not in (
      'profiles_select_public', 'profiles_update_self_or_staff',
      'roles_select_public',
      'forum_categories_select_public',
      'forum_topics_select_public', 'forum_topics_insert_verified',
      'forum_topics_update_author_or_manager', 'forum_topics_delete_author_or_manager',
      'forum_replies_select_public', 'forum_replies_insert_verified',
      'forum_replies_delete_author_or_manager',
      'notifications_select_own', 'notifications_update_own_mark_read',
      'vtcs_select_public', 'vtcs_insert_verified', 'vtcs_update_owner',
      'announcements_select_public', 'announcements_insert_staff',
      'announcements_update_staff', 'announcements_delete_staff',
      'rules_articles_select_published_or_senior', 'rules_articles_insert_senior',
      'rules_articles_update_senior', 'rules_articles_delete_senior',
      'avatars_select_public', 'avatars_insert_own_path',
      'avatars_update_own_path', 'avatars_delete_own_path'
    );

  if v_list is null then
    raise notice '策略自检：没有发现“非本脚本创建”的策略。';
  elsif coalesce(current_setting('rct.allow_legacy_policies', true), '') = 'on' then
    raise warning '发现非本脚本创建的策略（已通过 rct.allow_legacy_policies=on 放行，请尽快人工处理）：%', chr(10) || '  ' || v_list;
  else
    -- ★ 默认失败即回滚：RLS 策略是“或”关系，一条遗留的 using(true) 就能让全部加固失效。
    raise exception '发现 % 条非本脚本创建的 RLS 策略（它们会与新策略取并集，可能放宽权限，见 NOTICE 上一条 WARNING 列出的名单）。请先 DROP 掉旧策略，或临时 set rct.allow_legacy_policies = ''on''; 后再执行本脚本——但请务必随后清理。', 1;
  end if;
end
$policy_warn$;

commit;


-- =============================================================================
--   ✅ 到这里为止是“已提交”的变更。以下全部是只读校验，可以重复执行。
-- =============================================================================
-- 如果你的 SQL Editor 把整段一次跑完，只显示了最后一条结果，
-- 请把下面每段单独选中执行。
-- =============================================================================

-- V1 · RLS 是否全部开启（9 张表都应为 true；storage.objects 也应为 true）
select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'storage')
  and c.relname in (
    'profiles', 'roles', 'forum_categories', 'forum_topics', 'forum_replies',
    'notifications', 'vtcs', 'announcements', 'rules_articles', 'objects'
  )
order by 1;

-- V2 · 策略总清单
select schemaname, tablename, policyname, permissive, roles, cmd,
       coalesce(qual, '(none)') as using_expr,
       coalesce(with_check, '(none)') as check_expr
from pg_policies
where schemaname in ('public', 'storage')
order by schemaname, tablename, policyname;

-- V3 · 期望的 28 条策略是否都存在（任何一行 ❌ 都说明该步没生效或被回滚）
with expected(schemaname, tablename, policyname) as (
  values
    ('public', 'profiles', 'profiles_select_public'),
    ('public', 'profiles', 'profiles_update_self_or_staff'),
    ('public', 'roles', 'roles_select_public'),
    ('public', 'forum_categories', 'forum_categories_select_public'),
    ('public', 'forum_topics', 'forum_topics_select_public'),
    ('public', 'forum_topics', 'forum_topics_insert_verified'),
    ('public', 'forum_topics', 'forum_topics_update_author_or_manager'),
    ('public', 'forum_topics', 'forum_topics_delete_author_or_manager'),
    ('public', 'forum_replies', 'forum_replies_select_public'),
    ('public', 'forum_replies', 'forum_replies_insert_verified'),
    ('public', 'forum_replies', 'forum_replies_delete_author_or_manager'),
    ('public', 'notifications', 'notifications_select_own'),
    ('public', 'notifications', 'notifications_update_own_mark_read'),
    ('public', 'vtcs', 'vtcs_select_public'),
    ('public', 'vtcs', 'vtcs_insert_verified'),
    ('public', 'vtcs', 'vtcs_update_owner'),
    ('public', 'announcements', 'announcements_select_public'),
    ('public', 'announcements', 'announcements_insert_staff'),
    ('public', 'announcements', 'announcements_update_staff'),
    ('public', 'announcements', 'announcements_delete_staff'),
    ('public', 'rules_articles', 'rules_articles_select_published_or_senior'),
    ('public', 'rules_articles', 'rules_articles_insert_senior'),
    ('public', 'rules_articles', 'rules_articles_update_senior'),
    ('public', 'rules_articles', 'rules_articles_delete_senior'),
    ('storage', 'objects', 'avatars_select_public'),
    ('storage', 'objects', 'avatars_insert_own_path'),
    ('storage', 'objects', 'avatars_update_own_path'),
    ('storage', 'objects', 'avatars_delete_own_path')
)
select e.schemaname,
       e.tablename,
       e.policyname,
       case when p.policyname is null then 'MISSING' else 'OK' end as status
from expected e
left join pg_policies p
       on p.schemaname::text = e.schemaname
      and p.tablename::text  = e.tablename
      and p.policyname::text = e.policyname
order by e.schemaname, e.tablename, e.policyname;

-- V4 · 守卫/计数触发器清单
select n.nspname as table_schema,
       c.relname as table_name,
       t.tgname,
       pg_get_triggerdef(t.oid) as trigger_def
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where not t.tgisinternal
  and n.nspname = 'public'
order by 1, 2, 3;

-- V5 · 辅助函数清单。验收要点：
--      · rct_role_level / rct_is_steam_verified 必须是 security_definer=true 且 proconfig 含 search_path；
--      · rct_caller_is_backend 是 SECURITY INVOKER（security_definer=false 是正常的，不要误判）。
select n.nspname,
       p.proname,
       pg_get_function_result(p.oid) as returns,
       p.prosecdef as security_definer,
       coalesce(array_to_string(p.proconfig, '; '), '(unset)') as search_path
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (p.proname like 'rct\_%' escape '\' or p.proname = 'handle_new_user')
order by p.proname;

-- V6 · 索引清单
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
order by tablename, indexname;

-- V7 · 自检：SQL Editor 里没有 JWT，所以前两个应为 0 / false，
--      第三个 caller_is_backend() 应为 true（session_user = postgres）。
--      返回 0/false 而不是报错，说明函数已创建且能正常执行。
select public.rct_role_level()         as my_level_in_sql_editor,
       public.rct_is_steam_verified()  as my_verified_in_sql_editor,
       public.rct_caller_is_backend()  as caller_is_backend;

-- V8 · 数据一致性抽查：replies_count 与真实回复数是否吻合
--      （历史数据可能早就对不上了，触发器只能保证“从现在开始”正确）
select t.id,
       t.title,
       t.replies_count as stored,
       count(r.id)     as actual,
       t.replies_count - count(r.id) as diff
from public.forum_topics t
left join public.forum_replies r on r.topic_id = t.id
group by t.id, t.title, t.replies_count
having t.replies_count is distinct from count(r.id)
order by abs(t.replies_count - count(r.id)) desc
limit 50;

-- V8.1 需要修正历史计数时，确认 V8 结果后执行（单独执行，不要放进上面的事务）：
-- update public.forum_topics t
--    set replies_count = (select count(*) from public.forum_replies r where r.topic_id = t.id);

-- V9 · 角色等级体检（STEP 4.1 归一化后跑一次，人工确认没有“旧阈值”账号）
--      重点看：role 是否在 roles 字典里、role_level 是否与 roles.level 一致、
--      是否存在 60 / 80 这类历史阈值。
select p.id,
       p.display_name,
       p.role,
       p.role_level,
       r.level as role_level_in_roles_table,
       case
         when r.name is null then 'role 不在 roles 字典里'
         when coalesce(r.level, 0) <> coalesce(p.role_level, 0) then '与 roles.level 不一致'
         else 'ok'
       end as check_result
from public.profiles p
left join public.roles r on r.name = p.role
order by p.role_level desc nulls last;

-- V9.1 roles 字典最终值（应包含 developer=100 / senior_manager=90 / manager=70 / staff=40 / member=10）
select * from public.roles order by level desc nulls last;


-- =============================================================================
--   ↩️ 回滚指引（按需，从上到下）
-- =============================================================================
-- 0) 最省事的做法：本脚本是单事务的。执行时把最后的 commit; 改成 rollback;
--    就能“完整预演一次、什么也不留”。已经 commit 之后想撤销，见下面。
--
-- 1) 先删“依赖函数”的策略，再删函数，否则删函数会因被策略依赖而失败：
--    drop policy if exists "profiles_select_public" on public.profiles;
--    drop policy if exists "profiles_update_self_or_staff" on public.profiles;
--    drop policy if exists "roles_select_public" on public.roles;
--    drop policy if exists "forum_categories_select_public" on public.forum_categories;
--    drop policy if exists "forum_topics_select_public" on public.forum_topics;
--    drop policy if exists "forum_topics_insert_verified" on public.forum_topics;
--    drop policy if exists "forum_topics_update_author_or_manager" on public.forum_topics;
--    drop policy if exists "forum_topics_delete_author_or_manager" on public.forum_topics;
--    drop policy if exists "forum_replies_select_public" on public.forum_replies;
--    drop policy if exists "forum_replies_insert_verified" on public.forum_replies;
--    drop policy if exists "forum_replies_delete_author_or_manager" on public.forum_replies;
--    drop policy if exists "notifications_select_own" on public.notifications;
--    drop policy if exists "notifications_update_own_mark_read" on public.notifications;
--    drop policy if exists "vtcs_select_public" on public.vtcs;
--    drop policy if exists "vtcs_insert_verified" on public.vtcs;
--    drop policy if exists "vtcs_update_owner" on public.vtcs;
--    drop policy if exists "announcements_select_public" on public.announcements;
--    drop policy if exists "announcements_insert_staff" on public.announcements;
--    drop policy if exists "announcements_update_staff" on public.announcements;
--    drop policy if exists "announcements_delete_staff" on public.announcements;
--    drop policy if exists "rules_articles_select_published_or_senior" on public.rules_articles;
--    drop policy if exists "rules_articles_insert_senior" on public.rules_articles;
--    drop policy if exists "rules_articles_update_senior" on public.rules_articles;
--    drop policy if exists "rules_articles_delete_senior" on public.rules_articles;
--    drop policy if exists "avatars_select_public" on storage.objects;
--    drop policy if exists "avatars_insert_own_path" on storage.objects;
--    drop policy if exists "avatars_update_own_path" on storage.objects;
--    drop policy if exists "avatars_delete_own_path" on storage.objects;
--
-- 2) 删触发器（先触发器，后函数）：
--    drop trigger if exists trg_rct_guard_profiles on public.profiles;
--    drop trigger if exists trg_rct_guard_profiles_insert on public.profiles;
--    drop trigger if exists trg_rct_guard_forum_topics on public.forum_topics;
--    drop trigger if exists trg_rct_forum_replies_after_insert on public.forum_replies;
--    drop trigger if exists trg_rct_forum_replies_after_delete on public.forum_replies;
--    drop trigger if exists trg_rct_guard_notifications on public.notifications;
--
-- 3) 删函数：
--    drop function if exists public.rct_guard_profiles();
--    drop function if exists public.rct_guard_profiles_insert();
--    drop function if exists public.rct_guard_forum_topics();
--    drop function if exists public.rct_forum_replies_after_insert();
--    drop function if exists public.rct_forum_replies_after_delete();
--    drop function if exists public.rct_guard_notifications();
--    drop function if exists public.rct_role_level();
--    drop function if exists public.rct_is_steam_verified();
--    drop function if exists public.rct_caller_is_backend();
--    -- handle_new_user 不要随手删！删掉它注册就废了（除非你确认是本脚本建的兜底版本）。
--
-- 4) 删索引（唯一索引删除后，重复 tag 又能写入了）：
--    drop index if exists public.vtcs_tag_unique_ci;
--    drop index if exists public.idx_forum_topics_category_created;
--    drop index if exists public.idx_forum_topics_author;
--    drop index if exists public.idx_forum_replies_topic_created;
--    drop index if exists public.idx_forum_replies_author;
--    drop index if exists public.idx_notifications_user_created;
--    drop index if exists public.idx_profiles_vtc;
--    drop index if exists public.idx_profiles_steam_id;
--    drop index if exists public.profiles_steam_id_unique;   -- 部分唯一索引（若已创建）
--
-- 8) ⚠️ 数据变更不会自动回滚（策略/触发器删掉不等于数据复原）：
--    · STEP 0.6 把“steam_verified=true 但 steam_id 非法”的账号打回了 false；
--    · STEP 4.1 改了 roles.level，并把 role_level 60→70、80→90；
--    需要还原时：用执行前的备份（pg_dump / Dashboard Backups），
--    或对 STEP 0.6 的账号逐个人工确认后 update steam_verified=true。
--
-- 5) RLS 开关：一般【不要】关掉。关掉等于把数据库暴露给 anon key 全表读写。
--    如果确实要退回加固前的状态（不推荐），逐表执行：
--    -- alter table public.profiles disable row level security;
--    -- ... 其余 8 张表同理
--    ⚠️ 注意：一旦 RLS 关闭且 anon key 仍在前端，任何人都能用它读写全库。
--
-- 6) 列默认值回退（可选）：
--    -- alter table public.profiles alter column role drop default;
--    -- alter table public.profiles alter column role_level drop default;
--    -- alter table public.profiles alter column steam_verified drop default;
--
-- 7) 强烈建议：执行前在 Dashboard → Database → Backups 做一次备份/确认 PITR 可用。
--    Supabase 免费版没有 PITR，只能靠备份或自己 pg_dump。
--
--
-- =============================================================================
--   附录（默认全部注释掉，核对后再启用；每块都标注了启用条件）
-- =============================================================================
--
-- 【A1】notifications 表不存在时建表（启用条件：inspect U2 报 relation does not exist）
-- -----------------------------------------------------------------------------
-- create table if not exists public.notifications (
--   id         uuid primary key default gen_random_uuid(),
--   user_id    uuid not null references auth.users (id) on delete cascade,
--   actor_id   uuid references auth.users (id) on delete set null,
--   content    text not null,
--   link       text,
--   is_read    boolean not null default false,
--   created_at timestamptz not null default now()
-- );
-- create index if not exists idx_notifications_user_created
--   on public.notifications (user_id, created_at desc);
-- alter table public.notifications enable row level security;
-- -- 建完后再回到 STEP 0 重新执行本脚本。
--
--
-- 【A2】改写 handle_new_user，让它不再相信 raw_user_meta_data 里的验证状态
--      启用条件：inspect U6 显示它读了 steam_id / steam_verified / role /
--      role_level。必须先在代码侧确认注册不再传这些字段（当前 lib 版本已不传），
--      否则改写后注册仍可自称已验证。
-- ⚠️ 先执行 `select pg_get_functiondef('public.handle_new_user'::regproc);` 存一份原定义，
--    以便回滚。
-- -----------------------------------------------------------------------------
-- create or replace function public.handle_new_user()
-- returns trigger
-- language plpgsql
-- security definer
-- set search_path = public, pg_temp
-- as $fn$
-- begin
--   insert into public.profiles (id, display_name, role, role_level, steam_verified, updated_at)
--   values (
--     new.id,
--     coalesce(
--       nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), ''),
--       split_part(coalesce(new.email, 'player'), '@', 1)
--     ),
--     'member',   -- 角色固定
--     10,         -- 等级固定（Lv.10 注册司机）
--     false,      -- 验证状态只能由 /api/auth/steam/bind 用 service_role 写入
--     now()
--   )
--   on conflict (id) do nothing;
--   return new;
-- end;
-- $fn$;
--
--
-- 【A3】steam_id 格式约束（可选，防止脏数据）
--      启用条件：inspect U11 返回 0 行（没有历史脏数据），否则加约束会失败。
-- -----------------------------------------------------------------------------
-- do $steam_fmt$
-- begin
--   if not exists (
--     select 1 from pg_constraint
--     where conname = 'profiles_steam_id_format'
--       and conrelid = 'public.profiles'::regclass
--   ) then
--     alter table public.profiles
--       add constraint profiles_steam_id_format
--       check (steam_id is null or steam_id ~ '^[0-9]{17}$');
--     raise notice '已添加 profiles_steam_id_format 约束';
--   end if;
-- end
-- $steam_fmt$;
--
--
-- 【A4】补外键（可选，让删除行为可控）
--      启用条件：inspect U13 的三条孤儿查询都返回 0 行。
--      注意：论坛删除帖子的现有代码是“先删回复、再删主题”，
--      加了 ON DELETE CASCADE 后可以只删主题，但与现有代码不冲突。
-- -----------------------------------------------------------------------------
-- do $fks$
-- begin
--   if not exists (
--     select 1 from pg_constraint
--     where conname = 'forum_replies_topic_id_fkey'
--       and conrelid = 'public.forum_replies'::regclass
--   ) then
--     alter table public.forum_replies
--       add constraint forum_replies_topic_id_fkey
--       foreign key (topic_id) references public.forum_topics (id)
--       on delete cascade;
--   end if;
--
--   if not exists (
--     select 1 from pg_constraint
--     where conname = 'forum_topics_category_id_fkey'
--       and conrelid = 'public.forum_topics'::regclass
--   ) then
--     alter table public.forum_topics
--       add constraint forum_topics_category_id_fkey
--       foreign key (category_id) references public.forum_categories (id)
--       on delete restrict;
--   end if;
--
--   if not exists (
--     select 1 from pg_constraint
--     where conname = 'profiles_vtc_id_fkey'
--       and conrelid = 'public.profiles'::regclass
--   ) then
--     alter table public.profiles
--       add constraint profiles_vtc_id_fkey
--       foreign key (vtc_id) references public.vtcs (id)
--       on delete set null;
--   end if;
-- end
-- $fks$;
--
--
-- 【A5】历史回复计数一次性校正（V8 查到 diff 之后再执行）
-- -----------------------------------------------------------------------------
-- update public.forum_topics t
--    set replies_count = (
--      select count(*) from public.forum_replies r where r.topic_id = t.id
--    );
--
--
-- 【M1】旧阈值账号迁移（可选，默认注释；先跑 V9 人工确认名单再启用）
-- -----------------------------------------------------------------------------
-- 背景：交接文档的等级是 10/40/70/90/100；早期代码用过 10/40/60/80/100。
--       STEP 4.1 已把 roles 字典归一化，但不会擅自改 profiles 里已有的 60/80 账号
--       （那等于替你做人事决定）。V9 会列出所有“role_level 与 roles.level 不一致”的账号。
-- 启用条件：确认名单里确实有人是旧阈值的“经理(60) / 总监(80)”，且应升级。
-- ⚠️ 这会直接改变这些账号的权限，执行前请与当事人确认，并先备份。
-- update public.profiles set role_level = 70 where role_level = 60;  -- 旧「经理」→ 新「经理」
-- update public.profiles set role_level = 90 where role_level = 80;  -- 旧「总监」→ 新「高级社区经理」
--
-- =============================================================================
-- 文件结束。再次强调：本文件由项目所有者手动执行；AI 未连接、未执行任何 SQL。
-- =============================================================================
