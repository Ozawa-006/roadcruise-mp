# -*- coding: utf-8 -*-
"""生成 RCT MP 开发对接文档（游戏服状态接口 + 启动器登录）DOCX。"""

from docx import Document
from docx.enum.section import WD_ORIENT
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

OUT = "docs/RCT-MP-开发对接文档.docx"

FONT_CN = "Microsoft YaHei"
FONT_CODE = "Consolas"


def set_cell_shading(cell, color: str) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), color)
    tc_pr.append(shd)


def set_run_font(run, name=FONT_CN, size=10.5, bold=False, color=None):
    run.font.name = name
    run.font.size = Pt(size)
    run.font.bold = bold
    if color:
        run.font.color.rgb = RGBColor(*color)
    rpr = run._element.get_or_add_rPr()
    rfonts = rpr.find(qn("w:rFonts"))
    if rfonts is None:
        rfonts = OxmlElement("w:rFonts")
        rpr.append(rfonts)
    rfonts.set(qn("w:eastAsia"), FONT_CN)
    rfonts.set(qn("w:ascii"), name)
    rfonts.set(qn("w:hAnsi"), name)


def para(doc, text="", size=10.5, bold=False, space_after=4, color=None, style=None):
    p = doc.add_paragraph(style=style) if style else doc.add_paragraph()
    p.paragraph_format.space_after = Pt(space_after)
    run = p.add_run(text)
    set_run_font(run, size=size, bold=bold, color=color)
    return p


def heading(doc, text, level=1):
    h = doc.add_heading(level=level)
    run = h.add_run(text)
    set_run_font(run, size={0: 24, 1: 16, 2: 13, 3: 11.5}.get(level, 11), bold=True, color=(0x1F, 0x3A, 0x5F))
    return h


def code_block(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Cm(0.4)
    p.paragraph_format.space_before = Pt(4)
    p.paragraph_format.space_after = Pt(6)
    pPr = p._p.get_or_add_pPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), "F2F2F2")
    pPr.append(shd)
    run = p.add_run(text)
    set_run_font(run, name=FONT_CODE, size=8.5)
    return p


def table(doc, headers, rows, widths=None):
    t = doc.add_table(rows=1, cols=len(headers))
    t.style = "Table Grid"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    hdr = t.rows[0].cells
    for i, text in enumerate(headers):
        hdr[i].text = ""
        r = hdr[i].paragraphs[0].add_run(text)
        set_run_font(r, size=9, bold=True, color=(0xFF, 0xFF, 0xFF))
        set_cell_shading(hdr[i], "2F5597")
    for row in rows:
        cells = t.add_row().cells
        for i, text in enumerate(row):
            cells[i].text = ""
            r = cells[i].paragraphs[0].add_run(str(text))
            set_run_font(r, size=9)
    if widths:
        for row in t.rows:
            for i, width in enumerate(widths):
                row.cells[i].width = Cm(width)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)
    return t


def bullet(doc, text, size=10.5):
    p = doc.add_paragraph(style="List Bullet")
    p.paragraph_format.space_after = Pt(2)
    run = p.add_run(text)
    set_run_font(run, size=size)
    return p


# ---------------------------------------------------------------- document
doc = Document()
section = doc.sections[0]
section.top_margin = Cm(2)
section.bottom_margin = Cm(2)
section.left_margin = Cm(2.2)
section.right_margin = Cm(2.2)

style = doc.styles["Normal"]
style.font.name = FONT_CN
style.font.size = Pt(10.5)
style.element.rPr.rFonts.set(qn("w:eastAsia"), FONT_CN)

# footer
footer_p = section.footer.paragraphs[0]
footer_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
fr = footer_p.add_run("RCT MP · 开发对接文档 · 2026-11-05")
set_run_font(fr, size=8, color=(0x88, 0x88, 0x88))

# cover
t = doc.add_paragraph()
t.alignment = WD_ALIGN_PARAGRAPH.CENTER
t.paragraph_format.space_before = Pt(80)
tr = t.add_run("RCT MP")
set_run_font(tr, size=36, bold=True, color=(0x2F, 0x55, 0x97))

t2 = doc.add_paragraph()
t2.alignment = WD_ALIGN_PARAGRAPH.CENTER
tr2 = t2.add_run("开发对接文档")
set_run_font(tr2, size=26, bold=True)

t3 = doc.add_paragraph()
t3.alignment = WD_ALIGN_PARAGRAPH.CENTER
tr3 = t3.add_run("游戏服务器状态接口 · 启动器账号登录")
set_run_font(tr3, size=14, color=(0x55, 0x55, 0x55))

doc.add_paragraph()
info = [
    ("文档版本", "v1.0"),
    ("更新日期", "2026-11-05"),
    ("网站地址", "https://www.roadcruise-mp.com"),
    ("API Base", "https://www.roadcruise-mp.com"),
    ("适用对象", "游戏服开发 / 启动器开发"),
]
for key, value in info:
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r1 = p.add_run(f"{key}：")
    set_run_font(r1, size=10.5, bold=True)
    r2 = p.add_run(value)
    set_run_font(r2, size=10.5)

doc.add_page_break()

# ================================================================ part 1
heading(doc, "第一部分 · 游戏服务器状态接口", 1)
para(doc, "网站 /servers 页面通过服务端定时拉取游戏服务器状态并展示。下面是对游戏服需要提供的接口约定。")

heading(doc, "1. 请求", 2)
table(
    doc,
    ["项目", "说明"],
    [
        ["方法", "GET"],
        ["地址", "{BASE_URL}/status"],
        ["完整玩家列表", "{BASE_URL}/status?full=1（可选，建议支持）"],
        ["请求头", "Accept: application/json"],
        ["鉴权（可选）", "x-api-key: <RCTMP_API_KEY>"],
        ["超时", "网站侧 2.5 秒"],
        ["缓存", "网站每次实时拉取，不缓存"],
        ["CORS", "不需要（网站服务端请求）"],
    ],
    widths=[4.2, 12.5],
)

heading(doc, "2. 响应总字段", 2)
para(doc, "返回 HTTP 200，Body 必须是 JSON 对象（不能是数组 / null / 字符串）。")
table(
    doc,
    ["字段", "类型", "必填", "说明"],
    [
        ["id", "string", "否", "服务器标识，缺省用网站配置的 ID"],
        ["name", "string", "否", "服务器显示名称"],
        ["region", "string / null", "否", "区域，如 EU、ASIA"],
        ["game", "string / null", "否", "游戏标识，如 ETS2"],
        ["version", "string / null", "否", "游戏版本，如 1.50"],
        ["protocolVersion", "number / null", "否", "协议版本"],
        ["uptimeSec", "number / null", "否", "运行时长（秒）"],
        ["capacity", "number", "否", "最大玩家数；缺省用 config.maxPlayers"],
        ["online", "number", "否", "当前在线人数；缺省用 players.length"],
        ["avgNeighbors", "number / null", "否", "平均邻近玩家数"],
        ["lastTickMs", "number / null", "否", "最近一次 tick 耗时（毫秒）"],
        ["config", "object", "否", "服务器配置，见 4"],
        ["players", "array", "否", "玩家列表，见 3；full=1 时建议返回完整列表"],
        ["stats", "object", "否", "运行统计，见 5"],
    ],
    widths=[3.2, 3.4, 1.6, 8.5],
)
para(doc, "缺失字段网站会以 null / 0 兜底；未知字段会保留，方便以后扩展。", size=9, color=(0x66, 0x66, 0x66))

heading(doc, "3. players[] 玩家字段", 2)
table(
    doc,
    ["字段", "类型", "说明"],
    [
        ["id", "number", "玩家 ID"],
        ["name", "string", "玩家昵称"],
        ["tag", "string", "车队标签，如 TMP"],
        ["ping", "number", "延迟（ms）"],
        ["addr", "string", "连接地址（IP:端口）"],
        ["connectedSec", "number", "已连接时长（秒）"],
        ["silentMs", "number", "静默时长（毫秒）"],
        ["pos", "object", "位置 { x, y, z, kmh }，数值均可选"],
    ],
    widths=[4.0, 4.0, 8.7],
)

heading(doc, "4. config 字段", 2)
table(
    doc,
    ["字段", "类型", "说明"],
    [
        ["port", "number", "服务器端口"],
        ["maxPlayers", "number", "最大玩家数"],
        ["snapshotHz", "number", "快照频率"],
        ["radius", "number", "同步半径"],
        ["maxNeighbors", "number", "最大邻近玩家数"],
        ["auth", "boolean", "是否开启鉴权"],
    ],
    widths=[4.0, 4.0, 8.7],
)

heading(doc, "5. stats 字段", 2)
table(
    doc,
    ["字段", "类型", "说明"],
    [
        ["packetsIn / packetsOut", "number", "收 / 发包数"],
        ["bytesIn / bytesOut", "number", "收 / 发字节数"],
        ["rejects", "object", "{ jump, zero }，拒绝统计"],
        ["chats", "number", "聊天消息数"],
        ["logins", "number", "登录次数"],
        ["kicks", "number", "踢出次数"],
        ["snapshotTicks", "number", "快照 tick 数"],
        ["lastTickMs", "number", "最近 tick 耗时"],
        ["avgNeighbors", "number", "平均邻近玩家数"],
        ["resyncs", "number", "重同步次数"],
    ],
    widths=[5.0, 3.0, 8.7],
)

heading(doc, "6. 错误与状态码", 2)
table(
    doc,
    ["情况", "网站表现"],
    [
        ["HTTP 200 + JSON 对象", "正常展示"],
        ["HTTP 401", "显示「鉴权失败」"],
        ["其他非 2xx", "显示「服务不可用（HTTP xxx）」"],
        ["返回非 JSON / 非对象", "显示「服务器状态数据异常」"],
        ["超过 2.5 秒", "显示「请求超时」"],
        ["网络不可达", "显示「网络错误」"],
    ],
    widths=[8.0, 8.7],
)

heading(doc, "7. 返回示例", 2)
code_block(
    doc,
    """{
  "id": "rct1",
  "name": "RCTMP 路驰 · RCT1",
  "region": "CN-East",
  "game": "ETS2",
  "version": "1.61.1.9",
  "protocolVersion": 3,
  "uptimeSec": 36000,
  "capacity": 300,
  "online": 12,
  "avgNeighbors": 3.5,
  "lastTickMs": 20,
  "config": { "port": 27015, "maxPlayers": 300, "snapshotHz": 15, "radius": 800, "maxNeighbors": 24, "auth": true },
  "players": [
    { "id": 1, "name": "Ozawa", "tag": "TMP", "ping": 42, "addr": "1.2.3.4:1234",
      "connectedSec": 1200, "silentMs": 0, "pos": { "x": 0, "y": 0, "z": 0, "kmh": 80 } }
  ],
  "stats": { "packetsIn": 1000, "packetsOut": 900, "bytesIn": 123456, "bytesOut": 654321,
             "rejects": { "jump": 0, "zero": 0 }, "chats": 5, "logins": 2, "kicks": 0,
             "snapshotTicks": 100, "lastTickMs": 20, "avgNeighbors": 3.5, "resyncs": 0 }
}""",
)

heading(doc, "8. 网站侧环境变量", 2)
table(
    doc,
    ["变量", "说明"],
    [
        ["RCTMP_API_BASE_URL", "单台服务器地址，如 http://43.136.85.164"],
        ["RCTMP_SERVER_ID", "服务器 ID，默认 rct1"],
        ["RCTMP_SERVER_NAME", "服务器显示名称"],
        ["RCTMP_API_KEY", "可选，请求头 x-api-key"],
        ["RCTMP_SERVERS", "多台服务器 JSON 数组，优先级高于单台配置"],
    ],
    widths=[5.5, 11.2],
)

heading(doc, "9. 当前状态", 2)
bullet(doc, "状态接口已接通：http://43.136.85.164/status（当前 HTTP + IP）")
bullet(doc, "API Key 已配置：x-api-key 鉴权生效")
bullet(doc, "full=1 已支持，网站使用完整玩家列表")
bullet(doc, "后续上 HTTPS 后仅需替换 RCTMP_API_BASE_URL，服务端代码不用改")

# ================================================================ part 2
doc.add_page_break()
heading(doc, "第二部分 · 启动器账号登录", 1)
para(doc, "对应《启动器账号登录 —— 需要网站侧提供的接口与约定》，网站侧已全部实现。")

heading(doc, "1. 结论", 2)
table(
    doc,
    ["项目", "约定"],
    [
        ["登录方式", "WebView2 打开网站登录页（方案 A）+ REST 原生登录（方案 B）均已支持"],
        ["凭证格式", "RS256 JWT，游戏服可通过 JWKS 离线验签"],
        ["有效期", "access token 24 小时；refresh token 可刷新"],
        ["封禁账号", "登录返回 403 banned；已签发 token 校验时 banned:true"],
        ["API Base", "https://www.roadcruise-mp.com"],
    ],
    widths=[4.2, 12.5],
)

heading(doc, "2. WebView2 登录（推荐）", 2)
para(doc, "启动器 WebView2 打开：")
code_block(doc, "https://www.roadcruise-mp.com/login?client=rctmp-launcher")
para(doc, "用户完成登录后，页面自动跳转：")
code_block(doc, "https://www.roadcruise-mp.com/launcher-callback")
para(doc, "该页面通过 postMessage 回传：")
code_block(
    doc,
    """window.chrome.webview.postMessage({
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
});""",
)

heading(doc, "3. REST 登录接口（原生登录框）", 2)
table(
    doc,
    ["方法", "路径", "请求", "响应"],
    [
        ["POST", "/api/auth/login", "{ username|email, password, client }", "{ accessToken, refreshToken, expiresIn, expiresAt, user }"],
        ["POST", "/api/auth/refresh", "{ refreshToken }", "同上"],
        ["GET", "/api/auth/me", "Authorization: Bearer <JWT>", "{ user, expiresAt }"],
        ["GET", "/api/auth/jwks", "—", "RS256 公钥 JWKS"],
        ["POST", "/api/game/verify", "{ token } 或 Bearer", "{ ok, userId, name, banned, expiresAt }"],
    ],
    widths=[1.8, 5.0, 5.2, 5.5],
)

para(doc, "登录成功示例：", bold=True, space_after=2)
code_block(
    doc,
    """{
  "accessToken": "<JWT>",
  "refreshToken": "<Supabase refresh token>",
  "expiresIn": 86400,
  "expiresAt": 1793909114,
  "user": { "id": "d3a58d11-...", "name": "Launcher Test", "displayName": "Launcher Test", "avatarUrl": null, "banned": false }
}""",
)

heading(doc, "4. JWT / JWKS", 2)
table(
    doc,
    ["项目", "值"],
    [
        ["算法", "RS256"],
        ["JWKS 地址", "https://www.roadcruise-mp.com/api/auth/jwks"],
        ["kid", "a05e8c9dc1b4efec（以 JWKS 当前返回为准）"],
        ["iss", "https://www.roadcruise-mp.com"],
        ["aud", "rctmp-game"],
        ["sub", "用户 UUID"],
        ["有效期", "24 小时"],
    ],
    widths=[3.6, 13.1],
)
para(doc, "Claims 示例：", bold=True, space_after=2)
code_block(
    doc,
    """{
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
}""",
)
para(doc, "游戏服验签步骤：", bold=True, space_after=2)
for line in [
    "1. 从 JWKS 取公钥（按 kid 匹配）",
    "2. 验证 RS256 签名",
    "3. 校验 iss、aud = rctmp-game、exp 未过期",
    "4. 用 sub 作为玩家唯一 ID，name / display_name 作为昵称",
    "5. banned: true 拒绝进服",
]:
    bullet(doc, line, size=10)

heading(doc, "5. 错误格式", 2)
code_block(doc, '{ "error": { "code": "invalid_credentials", "message": "用户名或密码错误" } }')
table(
    doc,
    ["HTTP", "code", "说明"],
    [
        ["400", "invalid_request", "缺少账号 / 密码 / refreshToken"],
        ["401", "invalid_credentials", "账号或密码错误"],
        ["401", "invalid_token", "token 无效或已过期"],
        ["403", "banned", "账号已被封禁"],
        ["503", "server_not_configured", "登录服务未配置"],
    ],
    widths=[2.0, 5.0, 10.0],
)

heading(doc, "6. 测试账号", 2)
table(
    doc,
    ["类型", "邮箱", "密码", "预期行为"],
    [
        ["正常", "launcher-normal@rctmp.test", "RctmpLauncher-2026!", "登录成功，banned=false"],
        ["封禁", "launcher-banned@rctmp.test", "RctmpLauncher-2026!", "登录返回 403 banned"],
    ],
    widths=[2.2, 6.5, 4.5, 5.0],
)
para(doc, "测试完成后可删除这两个账号；如需长期保留测试环境请告知。", size=9, color=(0x66, 0x66, 0x66))

heading(doc, "7. 网站侧完成情况", 2)
for line in [
    "HTTPS 站点：https://www.roadcruise-mp.com",
    "WebView2 登录 + postMessage 回调",
    "REST 登录 / 刷新 / me",
    "RS256 JWT + JWKS",
    "游戏服实时校验接口",
    "封禁状态",
    "待补：登录失败锁定 / IP 限流（当前仅基础校验）",
    "待补：Steam 登录接入启动器回调（当前邮箱密码登录）",
]:
    bullet(doc, line, size=10)

# ================================================================ part 3
heading(doc, "第三部分 · 对接清单与待确认", 1)
table(
    doc,
    ["#", "事项", "状态"],
    [
        ["1", "游戏服状态接口接通（HTTP + IP）", "已完成"],
        ["2", "状态接口 API Key 鉴权", "已完成"],
        ["3", "启动器 REST 登录 / 刷新 / me", "已完成"],
        ["4", "RS256 JWKS 离线验签", "已完成"],
        ["5", "WebView2 登录回调", "已完成"],
        ["6", "游戏服 HTTPS 域名（Cloudflare/Caddy）", "待网站替换 RCTMP_API_BASE_URL"],
        ["7", "启动器确认 postMessage 字段", "待开发确认"],
        ["8", "游戏服确认 JWKS 验签方式", "待开发确认"],
        ["9", "封禁原因 / 到期时间是否传给启动器", "待确认"],
        ["10", "Steam 登录接入启动器", "待确认是否需要"],
    ],
    widths=[1.0, 10.5, 5.2],
)

para(doc, "联系方式 / 后续配合：网站侧（RCT MP 开发）", size=9, color=(0x66, 0x66, 0x66))

doc.save(OUT)
print("saved", OUT)
