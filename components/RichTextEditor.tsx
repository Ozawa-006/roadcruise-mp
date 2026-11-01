'use client';

import { useEffect, useId, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import RichText from '@/components/RichText';
import { sanitizeHttpUrl } from '@/lib/rich-text';

export interface RichTextEditorProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  label?: string;
  className?: string;
  /** 保留原 textarea 的 required 校验；默认 false。 */
  required?: boolean;
}

const toolbarButtonClass =
  'shrink-0 whitespace-nowrap rounded border border-gray-600 bg-[#232428] px-2.5 py-1.5 text-xs font-bold text-gray-300 transition hover:border-blue-500 hover:bg-[#2f3035] hover:text-white focus:outline-none focus-visible:border-blue-400 focus-visible:text-white active:bg-[#18191c] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-gray-600 disabled:hover:bg-[#232428] disabled:hover:text-gray-300';

const defaultPlaceholder =
  '支持 **加粗**、*斜体*、`代码`、[链接](https://...)、![图片](https://...)、> 引用、- 列表、## 标题；普通换行会保留。';

/** 转义链接文字 / 图片 alt 中会破坏语法的字符。 */
function escapeInlineLabel(value: string): string {
  return value.replace(/\s*\n\s*/g, ' ').replace(/([\\\[\]])/g, '\\$1');
}

/** URL 中的圆括号在 Markdown 链接语法里有歧义，插入前编码掉。 */
function encodeUrlForMarkdown(href: string): string {
  return href.replace(/\(/g, '%28').replace(/\)/g, '%29');
}

function ToolbarButton({
  title,
  onClick,
  disabled = false,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      // 防止点工具栏时 textarea 失焦、选区丢失（click 仍会触发）。
      onMouseDown={(event) => event.preventDefault()}
      className={toolbarButtonClass}
    >
      {children}
    </button>
  );
}

/**
 * 安全富文本编辑器：textarea + 工具栏 + 实时预览。
 * 不使用 execCommand，仅在字符串层面插入 / 包裹标记。
 */
export default function RichTextEditor({
  value,
  onChange,
  placeholder = defaultPlaceholder,
  rows = 8,
  maxLength,
  label,
  className,
  required = false,
}: RichTextEditorProps) {
  const editorId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingSelection = useRef<{ start: number; end: number } | null>(null);
  const [preview, setPreview] = useState(false);

  // 受控 textarea 重新渲染后再恢复选区，避免 setSelectionRange 被旧值截断。
  useEffect(() => {
    if (preview) return;
    const textarea = textareaRef.current;
    const selection = pendingSelection.current;
    if (!textarea || !selection) return;
    pendingSelection.current = null;
    textarea.focus();
    textarea.setSelectionRange(selection.start, selection.end);
  }, [value, preview]);

  const readSelection = (): { start: number; end: number } => {
    const textarea = textareaRef.current;
    if (!textarea) return { start: value.length, end: value.length };
    return { start: textarea.selectionStart, end: textarea.selectionEnd };
  };

  const commit = (nextValue: string, start: number, end = start): boolean => {
    if (typeof maxLength === 'number' && nextValue.length > maxLength) return false;

    if (nextValue === value) {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(start, end);
      }
      return true;
    }

    pendingSelection.current = { start, end };
    onChange(nextValue);
    textareaRef.current?.focus();
    return true;
  };

  const wrapSelection = (before: string, after: string, placeholderText: string) => {
    const { start, end } = readSelection();
    const selected = value.slice(start, end);
    const inner = selected || placeholderText;
    const nextValue = `${value.slice(0, start)}${before}${inner}${after}${value.slice(end)}`;
    const innerStart = start + before.length;
    commit(nextValue, innerStart, innerStart + inner.length);
  };

  /** 在 [start, end) 区间插入一段 Markdown，并把光标放到片段之后。 */
  const insertAt = (start: number, end: number, syntax: string) => {
    const nextValue = value.slice(0, start) + syntax + value.slice(end);
    commit(nextValue, start + syntax.length);
  };

  const insertLink = () => {
    const { start, end } = readSelection();
    const selected = value.slice(start, end);
    const input = window.prompt(
      '请输入链接地址（仅支持 http://、https:// 或 mailto:）',
      'https://'
    );
    if (input === null) return;

    const href = sanitizeHttpUrl(input, true);
    if (!href) {
      window.alert('链接地址不合法：仅支持 http://、https:// 或 mailto:。');
      return;
    }

    const linkText = escapeInlineLabel(selected.trim() || '链接文字');
    const syntax = `[${linkText}](${encodeUrlForMarkdown(href)})`;
    insertAt(start, end, syntax);
  };

  const insertImage = () => {
    const { start, end } = readSelection();
    const selected = value.slice(start, end);
    const input = window.prompt(
      '请输入完整图片地址（路过图床的「图片URL链接」，http/https）',
      'https://'
    );
    if (input === null) return;

    const src = sanitizeHttpUrl(input);
    if (!src) {
      window.alert('图片地址不合法：仅支持 http:// 或 https://。');
      return;
    }

    const alt = escapeInlineLabel(selected.trim() || '图片描述');
    const syntax = `![${alt}](${encodeUrlForMarkdown(src)})`;
    insertAt(start, end, syntax);
  };

  /**
   * 插入「缩略图 + 点击看大图」：使用路过图床提供的缩略图 URL 与完整图片/页面 URL。
   * Markdown 形式：[![缩略图](thumb)](full)
   */
  const insertThumbnail = () => {
    const { start, end } = readSelection();
    const selected = value.slice(start, end);

    const thumbInput = window.prompt(
      '请输入缩略图地址（路过图床的「缩略图URL链接」，http/https）',
      'https://'
    );
    if (thumbInput === null) return;

    const thumb = sanitizeHttpUrl(thumbInput);
    if (!thumb) {
      window.alert('缩略图地址不合法：仅支持 http:// 或 https://。');
      return;
    }

    const fullInput = window.prompt(
      '请输入点击后打开的大图/页面地址（完整图片URL或图片页面链接）',
      thumb
    );
    if (fullInput === null) return;

    const full = sanitizeHttpUrl(fullInput);
    if (!full) {
      window.alert('大图地址不合法：仅支持 http:// 或 https://。');
      return;
    }

    const alt = escapeInlineLabel(selected.trim() || '图片');
    const syntax = `[![${alt}](${encodeUrlForMarkdown(thumb)})](${encodeUrlForMarkdown(full)})`;
    insertAt(start, end, syntax);
  };

  const applyLinePrefix = (prefix: string) => {
    const { start, end } = readSelection();
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const nextBreak = value.indexOf('\n', end);
    const blockEnd = nextBreak === -1 ? value.length : nextBreak;
    const block = value.slice(lineStart, blockEnd);
    const lines = block.split('\n');
    let changed = false;

    const prefixedLines = lines.map((line) => {
      if (line.startsWith(prefix)) return line;
      changed = true;
      return prefix + line;
    });

    if (!changed) {
      textareaRef.current?.focus();
      return;
    }

    const nextBlock = prefixedLines.join('\n');
    const nextValue = value.slice(0, lineStart) + nextBlock + value.slice(blockEnd);
    const collapsed = start === end;
    const caret = collapsed
      ? lineStart + prefix.length + (start - lineStart)
      : lineStart + nextBlock.length;
    commit(nextValue, caret);
  };

  const applyHeading = () => {
    const { start } = readSelection();
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const nextBreak = value.indexOf('\n', start);
    const lineEnd = nextBreak === -1 ? value.length : nextBreak;
    const line = value.slice(lineStart, lineEnd);

    if (line.startsWith('## ')) {
      textareaRef.current?.focus();
      return;
    }

    const body = line.startsWith('### ') ? line.slice(4) : line;
    const nextLine = `## ${body}`;
    const nextValue = value.slice(0, lineStart) + nextLine + value.slice(lineEnd);
    commit(nextValue, lineStart + nextLine.length);
  };

  const togglePreview = () => {
    if (preview) {
      setPreview(false);
      window.requestAnimationFrame(() => textareaRef.current?.focus());
      return;
    }
    pendingSelection.current = null;
    setPreview(true);
  };

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = event.target.value;
    if (typeof maxLength === 'number' && nextValue.length > maxLength) return;
    onChange(nextValue);
  };

  // 预览时若原生 required 校验失败，自动切回编辑态，避免用户对着预览区无从下手。
  const handleInvalid = () => {
    if (!preview) return;
    setPreview(false);
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  };

  return (
    <div className={className}>
      {label &&
        (preview ? (
          <span className="mb-2 block text-sm font-bold text-gray-400">{label}</span>
        ) : (
          <label htmlFor={editorId} className="mb-2 block text-sm font-bold text-gray-400">
            {label}
          </label>
        ))}

      <div className="overflow-hidden rounded-lg border border-gray-700 bg-[#18191c] transition-colors focus-within:border-blue-500">
        <div className="flex items-center gap-2 border-b border-gray-700 bg-[#2c2d31] px-2 py-2">
          <div
            role="toolbar"
            aria-label="富文本格式工具栏"
            className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto"
          >
            <ToolbarButton
              title="加粗 (**文字**)"
              onClick={() => wrapSelection('**', '**', '加粗文字')}
              disabled={preview}
            >
              <span className="font-black">B</span>
            </ToolbarButton>
            <ToolbarButton
              title="斜体 (*文字*)"
              onClick={() => wrapSelection('*', '*', '斜体文字')}
              disabled={preview}
            >
              <em>I</em>
            </ToolbarButton>
            <ToolbarButton
              title="行内代码 (`代码`)"
              onClick={() => wrapSelection('`', '`', '代码')}
              disabled={preview}
            >
              <span className="font-mono text-[11px]">&lt;/&gt;</span>
            </ToolbarButton>
            <ToolbarButton
              title="插入链接 [文字](https://...)"
              onClick={insertLink}
              disabled={preview}
            >
              链接
            </ToolbarButton>
            <ToolbarButton
              title="插入完整图片 ![描述](图片URL)"
              onClick={insertImage}
              disabled={preview}
            >
              完整图片
            </ToolbarButton>
            <ToolbarButton
              title="插入缩略图（点击看大图）"
              onClick={insertThumbnail}
              disabled={preview}
            >
              缩略图
            </ToolbarButton>
            <ToolbarButton
              title="引用 (> 文字)"
              onClick={() => applyLinePrefix('> ')}
              disabled={preview}
            >
              引用
            </ToolbarButton>
            <ToolbarButton
              title="无序列表 (- 文字)"
              onClick={() => applyLinePrefix('- ')}
              disabled={preview}
            >
              列表
            </ToolbarButton>
            <ToolbarButton title="二级标题 (## 文字)" onClick={applyHeading} disabled={preview}>
              H2
            </ToolbarButton>
          </div>

          <button
            type="button"
            onClick={togglePreview}
            aria-pressed={preview}
            title={preview ? '返回编辑' : '预览渲染效果'}
            className={`shrink-0 whitespace-nowrap rounded border px-2.5 py-1.5 text-xs font-bold transition focus:outline-none focus-visible:border-blue-400 ${
              preview
                ? 'border-orange-500/60 bg-orange-500/15 text-orange-300 hover:bg-orange-500/25'
                : 'border-gray-600 bg-[#232428] text-gray-300 hover:border-blue-500 hover:text-white'
            }`}
          >
            {preview ? '编辑' : '预览'}
          </button>
        </div>

        {preview && (
          <div className="min-h-40 bg-[#18191c] p-3">
            {value.trim() ? (
              <RichText text={value} className="text-sm leading-relaxed text-gray-300" />
            ) : (
              <p className="text-sm text-gray-500">暂无内容，切换到编辑模式开始输入。</p>
            )}
          </div>
        )}

        {/*
          预览时 textarea 仍保留在表单中（sr-only），
          这样原生 required 校验在预览状态下依然生效。
        */}
        <textarea
          id={editorId}
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          rows={rows}
          maxLength={maxLength}
          required={required}
          placeholder={placeholder}
          tabIndex={preview ? -1 : undefined}
          onInvalid={handleInvalid}
          className={
            preview
              ? 'sr-only'
              : 'block w-full resize-y border-0 bg-[#18191c] p-3 text-sm leading-relaxed text-white placeholder:text-gray-500 focus:outline-none focus:ring-0'
          }
        />

        <div className="flex items-center justify-between gap-3 border-t border-gray-700/60 bg-[#232428] px-3 py-1.5">
          <span className="min-w-0 truncate text-[11px] text-gray-500">
            支持 **加粗**、*斜体*、`代码`、[链接]、![完整图片]、[![缩略图]](&#8203;大图链接)、&gt; 引用、- 列表、## 标题
          </span>
          {typeof maxLength === 'number' && (
            <span
              className={`shrink-0 font-mono text-[11px] ${
                value.length >= maxLength ? 'text-orange-400' : 'text-gray-500'
              }`}
            >
              {value.length} / {maxLength}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
