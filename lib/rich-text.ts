/**
 * 安全富文本（Markdown 子集）解析器。
 *
 * 设计约束：
 * - 不依赖 DOM、不引入第三方库，Server / Client Component 均可复用。
 * - 只解析白名单语法；无法识别或 URL 不合法的内容原样保留为文本，绝不丢弃用户内容。
 * - 行内语法不跨行，避免旧纯文本中的孤立符号吞掉整段内容。
 * - 渲染层只消费这里产出的 token / block，禁止直出 HTML 字符串。
 */

export type RichInline =
  | { type: 'text'; value: string }
  | { type: 'strong'; children: RichInline[] }
  | { type: 'em'; children: RichInline[] }
  | { type: 'code'; value: string }
  | { type: 'link'; href: string; children: RichInline[] }
  | { type: 'image'; src: string; alt: string };

export type RichBlock =
  | { type: 'paragraph'; content: RichInline[] }
  | { type: 'heading'; level: 2 | 3; content: RichInline[] }
  | { type: 'quote'; lines: RichInline[][] }
  | { type: 'list'; items: RichInline[][] };

/** 行内解析最大嵌套深度，防止恶意/异常输入造成过深递归。 */
const MAX_INLINE_DEPTH = 8;

/** 行内允许被反斜杠转义的标记字符。 */
const ESCAPABLE_CHARS = new Set(['\\', '*', '`', '[', ']', '(', ')', '!', '#', '>', '-']);

/**
 * 校验并规范化 URL。
 *
 * 默认只允许 http / https；`allowMailto` 为 true 时额外允许 mailto（仅用于链接，图片不传）。
 * 拒绝控制字符、空白、反斜杠、引号、尖括号、凭据等容易被用于伪装的写法。
 * 不合法时返回 null，调用方必须把原始语法按文本展示。
 */
export function sanitizeHttpUrl(raw: string, allowMailto = false): string | null {
  if (typeof raw !== 'string') return null;

  const value = raw.trim();
  if (!value) return null;

  // 原始 URL 中不允许出现控制字符、空白、反斜杠、引号、尖括号（浏览器会做意外归一化）。
  if (/[\u0000-\u0020\u007f\\<>"`]/.test(value)) return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const protocol = url.protocol.toLowerCase();

  if (protocol === 'mailto:') {
    if (!allowMailto) return null;
    // mailto 没有 host / 凭据，地址在 pathname 中。
    if (url.host || url.username || url.password) return null;
    if (!url.pathname) return null;
    return url.toString();
  }

  if (protocol !== 'http:' && protocol !== 'https:') return null;
  if (!url.hostname) return null;
  // 含 user:pass@ 的链接容易被用来伪装目标域名，直接拒绝。
  if (url.username || url.password) return null;

  return url.toString();
}

/** 找出当前行结束位置（不包含换行符）。 */
function lineEndAt(input: string, from: number): number {
  const index = input.indexOf('\n', from);
  return index === -1 ? input.length : index;
}

/** 找配对的 `]`，跳过转义字符并支持嵌套方括号。 */
function findClosingBracket(input: string, openIndex: number, lineEnd: number): number {
  let depth = 0;
  for (let index = openIndex; index < lineEnd; index += 1) {
    const char = input[index];
    if (char === '\\') {
      index += 1;
      continue;
    }
    if (char === '[') {
      depth += 1;
    } else if (char === ']') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/** 找配对的 `)`，支持 URL 中的成对圆括号。 */
function findClosingParen(input: string, openIndex: number, lineEnd: number): number {
  let depth = 0;
  for (let index = openIndex; index < lineEnd; index += 1) {
    const char = input[index];
    if (char === '\\') {
      index += 1;
      continue;
    }
    if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/** 把行内 token 压平成纯文本（摘要 / 图片 alt 使用）。 */
function flattenInline(tokens: RichInline[]): string {
  let value = '';
  for (const token of tokens) {
    switch (token.type) {
      case 'text':
      case 'code':
        value += token.value;
        break;
      case 'image':
        value += token.alt;
        break;
      case 'strong':
      case 'em':
      case 'link':
        value += flattenInline(token.children);
        break;
    }
  }
  return value;
}

/**
 * 解析单段行内内容。
 *
 * 支持：`**加粗**`、`*斜体*`、`` `行内代码` ``、`[文字](url)`、`![alt](url)`、
 * 以及 `\*` 这类标记转义。语法不完整或 URL 不合法时整段原样保留。
 */
function parseInline(input: string, depth = 0): RichInline[] {
  if (!input) return [];
  if (depth > MAX_INLINE_DEPTH) return [{ type: 'text', value: input }];

  const tokens: RichInline[] = [];
  let buffer = '';

  const flush = () => {
    if (buffer) {
      tokens.push({ type: 'text', value: buffer });
      buffer = '';
    }
  };

  let index = 0;

  while (index < input.length) {
    const char = input[index];

    // 换行在段内保留为文本，由渲染层的 whitespace-pre-wrap 呈现。
    if (char === '\n') {
      buffer += char;
      index += 1;
      continue;
    }

    // 转义：\*、\`、\[ 等还原为普通字符。
    if (char === '\\' && index + 1 < input.length && ESCAPABLE_CHARS.has(input[index + 1])) {
      buffer += input[index + 1];
      index += 2;
      continue;
    }

    // 行内代码优先，代码内的标记不再解析。
    if (char === '`') {
      const lineEnd = lineEndAt(input, index);
      const close = input.indexOf('`', index + 1);
      if (close !== -1 && close < lineEnd && close > index + 1) {
        flush();
        tokens.push({ type: 'code', value: input.slice(index + 1, close) });
        index = close + 1;
        continue;
      }
      buffer += '`';
      index += 1;
      continue;
    }

    // 图片：![alt](http/https)
    if (char === '!' && input[index + 1] === '[') {
      const lineEnd = lineEndAt(input, index);
      const closeBracket = findClosingBracket(input, index + 1, lineEnd);
      if (closeBracket !== -1 && input[closeBracket + 1] === '(') {
        const closeParen = findClosingParen(input, closeBracket + 1, lineEnd);
        if (closeParen !== -1) {
          const altRaw = input.slice(index + 2, closeBracket);
          const urlRaw = input.slice(closeBracket + 2, closeParen);
          const src = sanitizeHttpUrl(urlRaw);
          if (src) {
            flush();
            tokens.push({
              type: 'image',
              src,
              alt: flattenInline(parseInline(altRaw, depth + 1)).trim(),
            });
          } else {
            // URL 不合法：保留完整原始语法。
            buffer += input.slice(index, closeParen + 1);
          }
          index = closeParen + 1;
          continue;
        }
      }
      buffer += '!';
      index += 1;
      continue;
    }

    // 链接：[文字](http/https/mailto)
    if (char === '[') {
      const lineEnd = lineEndAt(input, index);
      const closeBracket = findClosingBracket(input, index, lineEnd);
      if (closeBracket !== -1 && input[closeBracket + 1] === '(') {
        const closeParen = findClosingParen(input, closeBracket + 1, lineEnd);
        if (closeParen !== -1) {
          const labelRaw = input.slice(index + 1, closeBracket);
          const urlRaw = input.slice(closeBracket + 2, closeParen);
          const href = sanitizeHttpUrl(urlRaw, true);
          if (href) {
            flush();
            tokens.push({
              type: 'link',
              href,
              children: parseInline(labelRaw, depth + 1),
            });
          } else {
            buffer += input.slice(index, closeParen + 1);
          }
          index = closeParen + 1;
          continue;
        }
      }
      buffer += '[';
      index += 1;
      continue;
    }

    // 加粗 **...**
    if (char === '*' && input[index + 1] === '*') {
      const lineEnd = lineEndAt(input, index);
      const close = input.indexOf('**', index + 2);
      if (close !== -1 && close + 2 <= lineEnd && close > index + 2) {
        flush();
        tokens.push({
          type: 'strong',
          children: parseInline(input.slice(index + 2, close), depth + 1),
        });
        index = close + 2;
        continue;
      }
      buffer += '*';
      index += 1;
      continue;
    }

    // 斜体 *...*（跳过成对的 **）
    if (char === '*') {
      const lineEnd = lineEndAt(input, index);
      let close = -1;
      for (let scan = index + 1; scan < lineEnd; scan += 1) {
        if (input[scan] === '\\') {
          scan += 1;
          continue;
        }
        if (input[scan] === '*') {
          if (input[scan + 1] === '*') {
            scan += 1;
            continue;
          }
          close = scan;
          break;
        }
      }
      if (close !== -1 && close > index + 1) {
        flush();
        tokens.push({
          type: 'em',
          children: parseInline(input.slice(index + 1, close), depth + 1),
        });
        index = close + 1;
        continue;
      }
      buffer += '*';
      index += 1;
      continue;
    }

    buffer += char;
    index += 1;
  }

  flush();
  return tokens;
}

const HEADING_PATTERN = /^(#{2,3}) (.*)$/;
const QUOTE_PATTERN = /^> (.*)$/;
const LIST_PATTERN = /^- (.*)$/;

/**
 * 把 Markdown 子集解析成渲染块。
 *
 * - 空行分段；段内单个换行保留。
 * - `## `/`### ` 标题、`> ` 引用、`- ` 无序列表按行首识别。
 * - 一级标题（`# `）不在子集内，会作为普通段落原样显示。
 */
export function parseRichText(input: string | null | undefined): RichBlock[] {
  if (typeof input !== 'string' || input.length === 0) return [];

  const lines = input.replace(/\r\n?/g, '\n').split('\n');
  const blocks: RichBlock[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const content = paragraph.join('\n');
    if (content.trim() !== '') {
      blocks.push({ type: 'paragraph', content: parseInline(content) });
    }
    paragraph = [];
  };

  let index = 0;
  while (index < lines.length) {
    const line = lines[index];

    if (line.trim() === '') {
      flushParagraph();
      index += 1;
      continue;
    }

    const heading = HEADING_PATTERN.exec(line);
    if (heading) {
      flushParagraph();
      blocks.push({
        type: 'heading',
        level: heading[1].length === 3 ? 3 : 2,
        content: parseInline(heading[2]),
      });
      index += 1;
      continue;
    }

    if (QUOTE_PATTERN.test(line)) {
      flushParagraph();
      const quoteLines: RichInline[][] = [];
      while (index < lines.length) {
        const match = QUOTE_PATTERN.exec(lines[index]);
        if (!match) break;
        quoteLines.push(parseInline(match[1]));
        index += 1;
      }
      blocks.push({ type: 'quote', lines: quoteLines });
      continue;
    }

    if (LIST_PATTERN.test(line)) {
      flushParagraph();
      const items: RichInline[][] = [];
      while (index < lines.length) {
        const match = LIST_PATTERN.exec(lines[index]);
        if (!match) break;
        items.push(parseInline(match[1]));
        index += 1;
      }
      blocks.push({ type: 'list', items });
      continue;
    }

    paragraph.push(line);
    index += 1;
  }

  flushParagraph();
  return blocks;
}

/**
 * 生成列表摘要用的纯文本：
 * - 去掉标题 / 引用 / 列表前缀与行内标记语法；
 * - 链接保留文字、图片保留 alt；
 * - 压缩所有空白；
 * - 按 Unicode 码点截断（不会切断 emoji 代理对），超长时追加省略号。
 */
export function plainTextExcerpt(markdown: string, max = 160): string {
  const blocks = parseRichText(markdown);
  const pieces: string[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case 'paragraph':
      case 'heading':
        pieces.push(flattenInline(block.content));
        break;
      case 'quote':
        pieces.push(block.lines.map((line) => flattenInline(line)).join(' '));
        break;
      case 'list':
        pieces.push(block.items.map((item) => flattenInline(item)).join(' '));
        break;
    }
  }

  const text = pieces.join(' ').replace(/\s+/g, ' ').trim();
  const limit = Number.isFinite(max) ? Math.floor(max) : 160;
  if (limit <= 0) return '';

  const chars = Array.from(text);
  if (chars.length <= limit) return text;

  return `${chars.slice(0, limit).join('').replace(/\s+$/, '')}…`;
}
