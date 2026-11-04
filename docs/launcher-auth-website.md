# RCT MP 启动器登录 —— 网站侧接口说明

> 对应 `launcher-auth-integration.md` 的网站侧实现。
> API Base：`https://www.roadcruise-mp.com`（已 HTTPS）
> 更新：2026-11-05

## 0. 结论

- 登录方式：**WebView2 打开网站登录页**（方案 A）和 **REST 原生登录**（方案 B）**都已支持**
- 凭证格式：**RS256 JWT**，游戏服可通过 **JWKS 离线验签**
- 有效期：access token **24 小时**；refresh token 由 Supabase 提供，可调用刷新接口
- 封禁账号：登录返回 **403 `banned`**；已签发 token 在游戏服校验时 `banned: true`

## 1. WebView2 登录（推荐）

1. 启动器 WebView2 打开：

```
https://www.roadcruise-mp.com/login?client=rctmp-launcher
```

2. 用户完成登录后，页面自动跳转：

```
https://www.roadcruise-mp.com/launcher-callback
```

3. `launcher-callback` 页面会向 WebView2 发送：

```js
window.chrome.webview.postMessage({
  type: "rctmp-auth",
  accessToken: "<JWT>",
  refreshToken: "<Supabase refresh token 或 null>",
  user: {
    id: "d3a58d11-...",
    name: "Launcher Test",
    displayName: "Launcher Test",
    avatarUrl: null,
    banned: false
  },
  expiresIn: 86400
});
```

4. 启动器监听 `type === "rctmp-auth"` 即可。

> 备注：目前邮箱密码登录会走这个回调；Steam 登录暂未接入启动器回调。

## 2. REST 登录接口（原生登录框）

### POST `/api/auth/login`

请求：

```json
{ "username": "launcher-normal@rctmp.test", "password": "***", "client": "rctmp-launcher" }
```

> `username` 或 `email` 都可以，值是网站账号邮箱（目前网站没有独立用户名登录）。

成功 `200`：

```json
{
  "accessToken": "<JWT>",
  "refreshToken": "<Supabase refresh token>",
  "expiresIn": 86400,
  "expiresAt": 1793909114,
  "user": {
    "id": "d3a58d11-...",
    "name": "Launcher Test",
    "displayName": "Launcher Test",
    "avatarUrl": null,
    "banned": false
  }
}
```

失败：

| HTTP | code | 说明 |
|---|---|---|
| 400 | `invalid_request` | 缺少账号/密码 |
| 401 | `invalid_credentials` | 账号或密码错误 |
| 403 | `banned` | 账号已被封禁 |
| 503 | `server_not_configured` | 启动器登录未配置 |

### POST `/api/auth/refresh`

```json
{ "refreshToken": "<refreshToken>" }
```

返回同登录（新 accessToken + 新 refreshToken）。

### GET `/api/auth/me`

```
Authorization: Bearer <accessToken>
```

```json
{
  "user": { "id": "...", "name": "...", "displayName": "...", "avatarUrl": null, "banned": false },
  "expiresAt": 1793909114
}
```

## 3. JWT / JWKS

- 算法：`RS256`
- JWKS 地址：

```
GET https://www.roadcruise-mp.com/api/auth/jwks
```

- Header：`kid` = `a05e8c9dc1b4efec`（以 JWKS 当前返回为准）
- Claims：

```json
{
  "iss": "https://www.roadcruise-mp.com",
  "aud": "rctmp-game",
  "sub": "<用户 UUID>",
  "name": "Launcher Test",
  "display_name": "Launcher Test",
  "avatar_url": null,
  "banned": false,
  "steam_verified": true,
  "iat": 1793822714,
  "exp": 1793909114,
  "jti": "..."
}
```

游戏服验签步骤：

1. 从 JWKS 取公钥（按 `kid` 匹配）
2. 验证 RS256 签名
3. 校验 `iss`、`aud === "rctmp-game"`、`exp` 未过期
4. 用 `sub` 作为玩家唯一 ID，`name`/`display_name` 作为昵称
5. `banned: true` 拒绝进服

## 4. 游戏服实时校验（备选）

### POST `/api/game/verify`

```json
{ "token": "<JWT>" }
```

或 `Authorization: Bearer <JWT>`。

成功 `200`：

```json
{
  "ok": true,
  "userId": "...",
  "name": "Launcher Test",
  "displayName": "Launcher Test",
  "banned": false,
  "expiresAt": 1793909114
}
```

失败：`401 invalid_token`（token 无效/过期）。

> 建议游戏服优先用 JWKS 离线验签；实时接口只用于封禁复查（可缓存 60s）。

## 5. 错误格式

```json
{ "error": { "code": "invalid_credentials", "message": "用户名或密码错误" } }
```

## 6. 测试账号

已创建 2 个测试账号（密码私发，不写进仓库）：

| 类型 | 邮箱 | 说明 |
|---|---|---|
| 正常 | `launcher-normal@rctmp.test` | 未封禁，可完整登录 |
| 封禁 | `launcher-banned@rctmp.test` | 登录应返回 403 `banned` |

> 测试完成后可删除。

## 7. 网站侧已完成

- [x] HTTPS 站点 `https://www.roadcruise-mp.com`
- [x] WebView2 登录 + `postMessage` 回调
- [x] REST 登录/刷新/me
- [x] RS256 JWT + JWKS
- [x] 游戏服实时校验接口
- [x] 封禁状态
- [ ] 登录失败锁定/IP 限流（当前仅基础校验，后续可加）
- [ ] Steam 登录接入启动器回调（当前邮箱密码）

## 8. 待启动器/游戏服侧确认

1. WebView2 回调消息字段是否满足（`type/accessToken/refreshToken/user/expiresIn`）
2. 游戏服是否直接使用 JWKS 离线验签（推荐）
3. 是否需要「被封禁账号」在启动器里显示具体原因/到期时间
4. 是否需要测试环境的独立地址（目前只有生产）
