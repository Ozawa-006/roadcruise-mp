import type { ReactNode } from 'react';
import { parseRichText, type RichBlock, type RichInline } from '@/lib/rich-text';

/**
 * 安全富文本渲染组件。
 *
 * 只根据 lib/rich-text.ts 产出的 token 渲染 React 元素，
 * 不拼接 HTML、不做原始 HTML 注入；未知语法由解析器保留为文本。
 * 正文颜色继承父级，仅链接 / 行内代码等强调元素使用固定强调色。
 */
function renderInline(tokens: RichInline[]): ReactNode {
  return tokens.map((token, index) => {
    switch (token.type) {
      case 'text':
        return token.value;
      case 'strong':
        return (
          <strong key={index} className="font-bold">
            {renderInline(token.children)}
          </strong>
        );
      case 'em':
        return (
          <em key={index} className="italic">
            {renderInline(token.children)}
          </em>
        );
      case 'code':
        return (
          <code
            key={index}
            className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[0.9em] text-blue-200"
          >
            {token.value}
          </code>
        );
      case 'link':
        return (
          <a
            key={index}
            href={token.href}
            target="_blank"
            rel="noopener noreferrer"
            className="break-words font-medium text-blue-400 underline decoration-blue-400/40 underline-offset-2 transition hover:text-blue-300"
          >
            {renderInline(token.children)}
          </a>
        );
      case 'image':
        return (
          // eslint-disable-next-line @next/next/no-img-element -- 站外图床直链无法交给 next/image 远程白名单
          <img
            key={index}
            src={token.src}
            alt={token.alt || ''}
            loading="lazy"
            className="my-2 max-w-full rounded border border-gray-700"
          />
        );
    }
  });
}

function renderBlock(block: RichBlock, key: number): ReactNode {
  switch (block.type) {
    case 'heading':
      return block.level === 2 ? (
        <h2
          key={key}
          className="mb-3 mt-6 border-b border-gray-700 pb-1.5 text-xl font-bold first:mt-0 last:mb-0"
        >
          {renderInline(block.content)}
        </h2>
      ) : (
        <h3 key={key} className="mb-2 mt-5 text-lg font-bold first:mt-0 last:mb-0">
          {renderInline(block.content)}
        </h3>
      );
    case 'quote':
      return (
        <blockquote
          key={key}
          className="my-3 border-l-4 border-blue-500/60 bg-black/20 py-2 pl-4 pr-3"
        >
          {block.lines.map((line, lineIndex) => (
            <p key={lineIndex} className="whitespace-pre-wrap break-words">
              {renderInline(line)}
            </p>
          ))}
        </blockquote>
      );
    case 'list':
      return (
        <ul key={key} className="my-3 list-disc space-y-1 pl-6 marker:text-blue-400">
          {block.items.map((item, itemIndex) => (
            <li key={itemIndex} className="whitespace-pre-wrap break-words">
              {renderInline(item)}
            </li>
          ))}
        </ul>
      );
    case 'paragraph':
      return (
        <p key={key} className="my-2 whitespace-pre-wrap break-words first:mt-0 last:mb-0">
          {renderInline(block.content)}
        </p>
      );
  }
}

export default function RichText({
  text,
  className,
}: {
  text: string | null | undefined;
  className?: string;
}) {
  if (typeof text !== 'string' || text.trim() === '') return null;

  const blocks = parseRichText(text);
  if (blocks.length === 0) return null;

  return <div className={className}>{blocks.map((block, index) => renderBlock(block, index))}</div>;
}
