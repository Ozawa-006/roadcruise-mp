# RCT MP 游戏服务器状态接口规范

> 用途：网站 `/servers` 页面通过服务端定时拉取游戏服务器状态并展示。
> 版本：v1 · 2026-11-05

## 1. 请求

| 项目 | 说明 |
|---|---|
| 方法 | `GET` |
| 地址 | `{BASE_URL}/status` |
| 完整玩家列表 | `{BASE_URL}/status?full=1`（可选，建议支持） |
| 请求头 | `Accept: application/json` |
| 鉴权（可选） | `x-api-key: <RCTMP_API_KEY>` |
| 超时 | 网站侧 2.5 秒 |
| 缓存 | 网站每次实时拉取，不缓存 |
| CORS | 不需要（网站服务端请求） |

## 2. 响应总字段

返回 HTTP 200，Body 必须是 **JSON 对象**（不能是数组/null/字符串）。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | string | 否 | 服务器标识，缺省用网站配置的 ID |
| `name` | string | 否 | 服务器显示名称 |
| `region` | string \| null | 否 | 区域，如 `EU`、`ASIA` |
| `game` | string \| null | 否 | 游戏标识，如 `ETS2` |
| `version` | string \| null | 否 | 游戏版本，如 `1.50` |
| `protocolVersion` | number \| null | 否 | 协议版本 |
| `uptimeSec` | number \| null | 否 | 运行时长（秒），用于显示 Uptime |
| `capacity` | number | 否 | 最大玩家数；缺省用 `config.maxPlayers` |
| `online` | number | 否 | 当前在线人数；缺省用 `players.length` |
| `avgNeighbors` | number \| null | 否 | 平均邻近玩家数 |
| `lastTickMs` | number \| null | 否 | 最近一次 tick 耗时（毫秒） |
| `config` | object | 否 | 服务器配置，见下表 |
| `players` | array | 否 | 玩家列表，见下表；`?full=1` 时建议返回完整列表 |
| `stats` | object | 否 | 运行统计，见下表 |

> 缺失字段网站会以 `null` / `0` 兜底；未知字段会保留，不会报错。

## 3. `players[]` 玩家字段

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | number | 否 | 玩家 ID |
| `name` | string | 否 | 玩家昵称 |
| `tag` | string | 否 | 车队标签，如 `TMP` |
| `ping` | number | 否 | 延迟（ms） |
| `addr` | string | 否 | 连接地址（IP:端口） |
| `connectedSec` | number | 否 | 已连接时长（秒） |
| `silentMs` | number | 否 | 静默时长（毫秒） |
| `pos` | object | 否 | 位置：`{ x, y, z, kmh }`，数值均可选 |

## 4. `config` 字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `port` | number | 服务器端口 |
| `maxPlayers` | number | 最大玩家数 |
| `snapshotHz` | number | 快照频率 |
| `radius` | number | 同步半径 |
| `maxNeighbors` | number | 最大邻近玩家数 |
| `auth` | boolean | 是否开启鉴权 |

## 5. `stats` 字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `packetsIn` / `packetsOut` | number | 收/发包数 |
| `bytesIn` / `bytesOut` | number | 收/发字节数 |
| `rejects` | object | `{ jump, zero }`，拒绝统计 |
| `chats` | number | 聊天消息数 |
| `logins` | number | 登录次数 |
| `kicks` | number | 踢出次数 |
| `snapshotTicks` | number | 快照 tick 数 |
| `lastTickMs` | number | 最近 tick 耗时 |
| `avgNeighbors` | number | 平均邻近玩家数 |
| `resyncs` | number | 重同步次数 |

## 6. 错误与状态码

| 情况 | 网站表现 |
|---|---|
| HTTP 200 + JSON 对象 | 正常展示 |
| HTTP 401 | 显示「鉴权失败」 |
| 其他非 2xx | 显示「服务不可用（HTTP xxx）」 |
| 返回非 JSON / 非对象 | 显示「服务器状态数据异常」 |
| 超过 2.5 秒 | 显示「请求超时」 |
| 网络不可达 | 显示「网络错误」 |

## 7. 返回示例

```json
{
  "id": "rct1",
  "name": "RCTMP 路驰 · RCT1",
  "region": "EU",
  "game": "ETS2",
  "version": "1.50",
  "protocolVersion": 1,
  "uptimeSec": 36000,
  "capacity": 32,
  "online": 12,
  "avgNeighbors": 3.5,
  "lastTickMs": 20,
  "config": {
    "port": 27015,
    "maxPlayers": 32,
    "snapshotHz": 20,
    "radius": 500,
    "maxNeighbors": 8,
    "auth": true
  },
  "players": [
    {
      "id": 1,
      "name": "Ozawa",
      "tag": "TMP",
      "ping": 42,
      "addr": "1.2.3.4:1234",
      "connectedSec": 1200,
      "silentMs": 0,
      "pos": { "x": 0, "y": 0, "z": 0, "kmh": 80 }
    }
  ],
  "stats": {
    "packetsIn": 1000,
    "packetsOut": 900,
    "bytesIn": 123456,
    "bytesOut": 654321,
    "rejects": { "jump": 0, "zero": 0 },
    "chats": 5,
    "logins": 2,
    "kicks": 0,
    "snapshotTicks": 100,
    "lastTickMs": 20,
    "avgNeighbors": 3.5,
    "resyncs": 0
  }
}
```

## 8. 网站侧环境变量（由网站配置）

| 变量 | 说明 |
|---|---|
| `RCTMP_API_BASE_URL` | 单台服务器地址，如 `https://api.example.com` |
| `RCTMP_SERVER_ID` | 服务器 ID，默认 `rct1` |
| `RCTMP_SERVER_NAME` | 服务器显示名称 |
| `RCTMP_API_KEY` | 可选，请求头 `x-api-key` |
| `RCTMP_SERVERS` | 多台服务器 JSON 数组，优先级高于单台配置 |

多台示例：

```json
[
  { "id": "rct1", "name": "RCTMP #1", "baseUrl": "https://api1.example.com", "apiKey": "可选" },
  { "id": "rct2", "name": "RCTMP #2", "baseUrl": "https://api2.example.com" }
]
```

## 9. 其他要求

1. **HTTPS 公网可访问**（Vercel 服务端需要能访问到）。
2. 只暴露只读状态接口，不要暴露管理/RCON。
3. 建议所有字段尽量返回，缺失字段网站会兜底。
4. 如果服务端无法暴露公网接口，可改为「游戏服主动 POST 到网站」的推送模式，需另加接收接口与密钥。
