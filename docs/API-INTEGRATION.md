# RCTMP 服务器列表 · 前后端对接说明

> 面向后端 / 运维 / 启动器同学。对应实现：`lib/server-status.ts`、`app/api/servers/status/route.ts`、`app/servers/page.tsx`。
> 游戏服务器 API 原始规格见服务端团队提供的 `api.md`（外部文档，不在本仓库内）。

## 1. 架构与数据流

```text
浏览器 /servers
  └─ GET /api/servers/status?full=1        （本站 Next.js 服务端代理，5 秒轮询）
       └─ GET <baseUrl>/status?full=1       （游戏服务器；2 秒内并发请求合并）
            └─ 可选 Header: x-api-key
```

- 游戏服务器的 `/status` **不返回 CORS 头**，浏览器不能直连；必须由 Next.js 服务端代理。
- `RCTMP_API_KEY` 只存在于服务端，绝不加 `NEXT_PUBLIC_` 前缀，也不返回给浏览器。
- 代理只读地转发数据，不写数据库、不落盘。

## 2. 环境变量

全部只在 Next.js **服务端**读取。不要写入 `.env` 提交到 Git。

| 变量 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `RCTMP_API_BASE_URL` | 生产必填 | 开发环境 `http://127.0.0.1:8080` | 单台游戏服务器 base URL。只允许 `http://` / `https://`，可带路径前缀。 |
| `RCTMP_SERVER_ID` | 否 | `rct1` | 单台模式下的稳定服务器标识（slug），用于深链。 |
| `RCTMP_SERVER_NAME` | 否 | `RCTMP 路驰 · <ID 大写>`（`rct1` 时为 `RCTMP 路驰 · RCT1`） | 单台模式下的展示名。 |
| `RCTMP_API_KEY` | 否 | 空 | 配置后代理请求带 `x-api-key`。多台模式下作为未单独配置 key 的服务器的默认值。 |
| `RCTMP_SERVERS` | 否 | 空 | JSON 数组字符串，多台服务器模式，优先于单台变量。 |

### 2.1 单台模式

```bash
RCTMP_API_BASE_URL=http://127.0.0.1:8080
RCTMP_SERVER_ID=rct1
RCTMP_SERVER_NAME=RCTMP 路驰 · RCT1
RCTMP_API_KEY=
```

### 2.2 多台模式

`RCTMP_SERVERS` 优先级最高；配置后不再读取 `RCTMP_API_BASE_URL` / `RCTMP_SERVER_ID` / `RCTMP_SERVER_NAME`。

```json
[
  {
    "id": "rct1",
    "name": "RCTMP 路驰 · RCT1",
    "baseUrl": "https://rct1.example.com",
    "apiKey": "server-1-key"
  },
  {
    "id": "rct2-cn-east",
    "name": "RCTMP 路驰 · RCT2 华东",
    "baseUrl": "http://10.0.0.12:8080"
  }
]
```

规则：

- `id` 缺失时回退为 `server-1`、`server-2`……；**正式环境必须显式配置且保持稳定**，启动器深链依赖它。
- 重复 `id` 的条目会被忽略并记录错误。
- `baseUrl` 缺失 / 非 http(s) / 无法被 `new URL()` 解析 / 内嵌账号密码的条目会被过滤并记录错误。鉴权请使用 `apiKey` / `RCTMP_API_KEY`。
- 某条目没有 `apiKey` 时，回退到全局 `RCTMP_API_KEY`。
- JSON 解析失败、不是数组、或所有条目都非法时：**降级为单台配置**并记录错误，不会让页面崩溃。
- 显式配置 `RCTMP_SERVERS=[]` 表示“当前不提供任何服务器”，页面会显示未配置状态。

### 2.3 未配置时的行为

| 环境 | 行为 |
| --- | --- |
| `NODE_ENV !== 'production'` 且未配置 | 回退到 `http://127.0.0.1:8080`，方便本地联调。 |
| `NODE_ENV === 'production'` 且未配置 | 返回 `configured: false`，页面显示“尚未配置游戏服务器（RCTMP_API_BASE_URL）”。 |

## 3. 代理契约：`GET /api/servers/status`

### 3.1 Query

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 可选。只抓取指定 `id` 的服务器；未知 id 返回 `errors: [{ id, error: "unknown_server" }]`。 |
| `full` | `1` | 可选。透传为游戏服务器的 `/status?full=1`，返回全部在线玩家（默认最多 50 条）。 |

### 3.2 响应

HTTP 状态码**始终为 200**（单台失败体现在 `errors` 中，便于前端保留其它服务器）。
响应头：`Cache-Control: no-store`。

```json
{
  "servers": [
    {
      "id": "rct1",
      "name": "RCTMP 路驰 · RCT1",
      "region": "CN-East",
      "game": "ets2",
      "version": "0.1.0",
      "protocolVersion": 3,
      "uptimeSec": 36000,
      "capacity": 500,
      "online": 42,
      "avgNeighbors": 14.1,
      "lastTickMs": 4,
      "config": {
        "port": 27015,
        "maxPlayers": 500,
        "snapshotHz": 10,
        "radius": 1000,
        "maxNeighbors": 48,
        "auth": true
      },
      "players": [
        {
          "id": 5,
          "name": "司机01",
          "tag": "RCT",
          "ping": 23,
          "addr": "1.2.3.x",
          "connectedSec": 1820,
          "silentMs": 41,
          "pos": { "x": 7649.9, "y": 223.9, "z": 21643.1, "kmh": 84.2 }
        }
      ],
      "stats": {
        "packetsIn": 123456,
        "packetsOut": 98765,
        "bytesIn": 4000000,
        "bytesOut": 3000000,
        "rejects": { "jump": 34, "zero": 0 },
        "chats": 12,
        "logins": 57,
        "kicks": 2,
        "snapshotTicks": 14584,
        "lastTickMs": 4,
        "avgNeighbors": 14.1,
        "resyncs": 6
      },
      "baseUrl": "http://127.0.0.1:8080"
    }
  ],
  "errors": [
    {
      "id": "rct2-cn-east",
      "error": "timeout"
    }
  ],
  "fetchedAt": "2026-11-01T09:20:34.000Z",
  "configured": true
}
```

### 3.3 字段说明

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `servers[].id` | string | 稳定标识；游戏服务器缺失时用注册表 `target.id` 兜底。 |
| `servers[].name` | string | 展示名；缺失时用注册表名称兜底。 |
| `servers[].region` | string \| null | 区域标签，缺失为 `null`。 |
| `servers[].game` | string \| null | 目前为 `ets2`。 |
| `servers[].version` | string \| null | 服务器软件版本。 |
| `servers[].protocolVersion` | number \| null | 协议版本，用于提示客户端更新。 |
| `servers[].uptimeSec` | number \| null | 进程运行秒数。 |
| `servers[].capacity` | number | 最大玩家数；兜底顺序 `capacity` → `config.maxPlayers` → `0`。 |
| `servers[].online` | number | 当前在线人数；兜底顺序 `online` → `players.length` → `0`。 |
| `servers[].avgNeighbors` | number \| null | 平均邻居数。 |
| `servers[].lastTickMs` | number \| null | 最近一次 tick 耗时（毫秒）。 |
| `servers[].config` | object \| null | 原始 config 透传；已知字段做类型归一化，未来字段保留。 |
| `servers[].players` | array | 玩家列表，**原样透传**（含未来新增字段），只丢弃非对象条目。 |
| `servers[].stats` | object \| null | 运维统计，原样透传。 |
| `servers[].baseUrl` | string | **代理附加字段**，游戏服务器原 `/status` 不返回；用于页面展示 host。 |
| `errors[].id` | string | 失败的目标服务器 id。 |
| `errors[].error` | string | 错误码，见 §4。 |
| `fetchedAt` | string | 本轮抓取完成的 ISO 时间；命中 2 秒缓存时保持原值。 |
| `configured` | boolean | 是否有可用的服务器目标；为 `false` 时 `servers` / `errors` 均为空。 |

### 3.4 归一化规则

- 顶层字段容忍缺失；可选字段用 `null`。
- `players` / `stats` 不做字段裁剪，保留原始结构。
- 非 200、非 JSON、JSON 根节点不是对象 → 该台记为 `bad_response`，其它服务器不受影响。
- 单台抓取失败只进入 `errors`，不影响 `servers` 中其它服务器。

## 4. 错误码映射

| `errors[].error` | 触发条件 | 页面提示 |
| --- | --- | --- |
| `unauthorized` | 游戏服务器返回 HTTP 401（`x-api-key` 缺失/不匹配） | 鉴权失败 |
| `timeout` | 超过 2500ms（`AbortSignal.timeout(2500)`） | 请求超时 |
| `bad_response` | 非 200、JSON 解析失败、根节点不是对象 | 响应异常 |
| `network_error` | DNS / 连接被拒 / TLS / 其它 fetch 异常 | 网络错误 |
| `unknown_server` | `/api/servers/status?id=...` 的 id 不在注册表 | 未知服务器 ID |

游戏服务器原始错误：HTTP 401 返回 `{"error":"unauthorized","code":401}`；`/healthz` 永远公开，不要用于业务状态。

## 5. 缓存与请求频率

- 代理进程内缓存 **2 秒**，key = `full|brief + 目标 id@baseUrl 列表`。
- 同一 key 的并发请求合并为一次上游抓取（in-flight promise 复用）。
- 单台失败也会写入完整 payload（含 `errors`），2 秒后重试；避免故障时每 5 秒放大。
- 页面每 **5 秒**轮询一次 `GET /api/servers/status?full=1`；页面隐藏（`visibilitychange`）时暂停，恢复可见时立即刷新并重启定时器。
- 单页面正常情况下对每台服务器约 **1 次 / 5 秒**；2 秒缓存用于合并同一时刻的并发请求（多个标签页 / 多个访问者）。
- 多用户、多实例仍可能叠加请求。若上游有严格频率限制，请在反代层再加 2–5 秒缓存或按来源限流，不要只依赖本代理的进程内缓存。
- 缓存是**单进程内存**：多实例 / Serverless 部署时每个实例各自缓存，不共享。对上游频率敏感时，建议代理固定单实例，或在反代层再加一层 2–5 秒缓存。

## 6. 启动器深链

页面「连接启动器」按钮跳转：

```text
rctmp://connect?server=<server_id>
```

- `server`：`/status` 返回的稳定 `id`，页面会 `encodeURIComponent`。
- **ticket 尚未实现**（协议 v4 规划），因此当前**不带** `ticket` 参数。
- 启动器收到深链后应自行拉取 `/status` 校验在线 / 容量 / 协议版本，再启动游戏并注入。

### TODO：ticket（未实现）

后续接入 Steam 登录后，由网页服务端签发一次性 ticket，再拼成：

```text
rctmp://connect?server=<server_id>&ticket=<one_time_ticket>
```

约定（待与后端确认后实现）：

- ticket 由网页服务端用共享密钥 `HMAC-SHA256` 签名，payload 至少包含 `playerId`、`steamId`、`name`、`serverId`、`exp`。
- `exp` 建议 ≤ 120 秒，一次性使用（Redis 查重）。
- 启动器通过深链或命令行 `--ticket <t>` 取得，登录时发给 GameServer。
- 在 ticket 上线前，深链**不要**带空 `ticket=` 参数。

## 7. curl 自测

> Windows PowerShell 中如 `curl` 被别名到 `Invoke-WebRequest`，请使用 `curl.exe`。

### 7.1 直连游戏服务器（仅服务端/本机自测）

```bash
# 存活探针（永远公开）
curl -i http://127.0.0.1:8080/healthz

# 单台状态
curl -i http://127.0.0.1:8080/status

# 全部玩家
curl -i "http://127.0.0.1:8080/status?full=1"

# 启用 api-key 时
curl -i -H "x-api-key: your-key" http://127.0.0.1:8080/status
```

### 7.2 本站代理

```bash
# 全部服务器（默认玩家快照，最多 50 条）
curl -i http://localhost:3000/api/servers/status

# 指定单台
curl -i "http://localhost:3000/api/servers/status?id=rct1"

# 全部玩家
curl -i "http://localhost:3000/api/servers/status?full=1"

# 页面
curl -I http://localhost:3000/servers
```

### 7.3 本地联调环境变量（PowerShell 示例）

```powershell
$env:RCTMP_API_BASE_URL = "http://127.0.0.1:8080"
$env:RCTMP_SERVER_ID = "rct1"
$env:RCTMP_SERVER_NAME = "RCTMP 路驰 · RCT1"
# $env:RCTMP_API_KEY = "<key>"
npm run dev
```

多台模式示例：

```powershell
$env:RCTMP_SERVERS = '[{"id":"rct1","name":"RCT1","baseUrl":"http://127.0.0.1:8080"},{"id":"rct2","name":"RCT2","baseUrl":"http://127.0.0.1:8081"}]'
```

## 8. 生产 / 运维清单

- [ ] 确认生产 `RCTMP_API_BASE_URL` 或 `RCTMP_SERVERS`，使用 HTTPS 反代域名，不要暴露游戏服务器的明文 HTTP 8080。
- [ ] 是否启用 `--api-key`：启用后必须配置 `RCTMP_API_KEY`（或每台的 `apiKey`），否则全部返回 `unauthorized`。
- [ ] 在反代层加 IP 白名单，只允许 Next.js 服务端出口 IP 访问 `/status`；`/healthz` 保持公开给探针。
- [ ] Next.js 运行环境需能出网访问游戏服务器；Vercel 等托管环境无法访问内网地址时，必须使用公网 HTTPS 域名。
- [ ] 反代缓存 TTL 建议 2–5 秒，与代理缓存叠加时注意不要超过上游 1 次 / 2 秒的建议。
- [ ] 代理路由是公开只读接口；如需防刷，请在 CDN / WAF / 反代层加限流。
- [ ] ticket 上线后同步更新启动器深链与服务端 `api.md` §6，并补充分发共享密钥的方式。

## 9. 已知限制 / 遗留问题

1. **ticket 未实现**：当前深链仅包含 `server`，启动器不能凭 ticket 直接登录；需等协议 v4。
2. **生产 Base URL 未定**：测试/生产 HTTPS 地址、证书、IP 白名单范围仍需运维确认。
3. **多台服务器的慢请求**：代理用 `Promise.all` 并发抓取，单台超时会拖慢整轮响应（最多约 2.5 秒），但不会影响其它台的数据正确性；如需更快，可改为逐台流式/独立缓存。
4. **缓存不跨实例**：多实例部署时每实例独立缓存，上游频率可能翻倍；必要时用反代缓存或固定代理实例。
5. **没有历史数据 / 告警**：当前只提供实时快照，不存储 uptime、玩家曲线；如需图表需另接时序存储。
6. **玩家明细上限**：页面请求 `full=1` 以避免“展开全部”时再次请求；若上游数据量很大，可改回默认 50 条并在 UI 说明。
7. **无服务端鉴权**：`/api/servers/status` 是公开只读接口；若担心被第三方复用，请加 WAF 限流或站点级鉴权。
