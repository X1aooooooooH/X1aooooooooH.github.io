import { escapeHtml } from './dom.js';

const SAFE_LINK = /^(https?:|mailto:|#|\.\/|\.\.\/|\/)/i;

function safeUrl(url) {
  const value = String(url || '').trim();
  return SAFE_LINK.test(value) ? value.replace(/"/g, '&quot;') : '#';
}

export function inlineMarkdown(source) {
  const codes = [];
  const stash = html => {
    const index = codes.length;
    codes.push(html);
    return `\u0000CODE${index}\u0000`;
  };
  let text = String(source ?? '').replace(/`([^`\n]+)`/g, (_, code) => stash(`<code>${code}</code>`));
  text = text.replace(/\[([^\]]+)\]\(([^\s)]+)(?:\s+"([^"]*)")?\)/g, (_, label, url, title) => {
    const href = safeUrl(url);
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
    const target = /^https?:/i.test(href) ? ' target="_blank" rel="noopener noreferrer"' : '';
    return stash(`<a href="${href}"${titleAttr}${target}>${label}</a>`);
  });
  text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/(^|[\s(])__([^_\n]+)__(?=$|[\s).,!?:;])/g, '$1<strong>$2</strong>');
  text = text.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  text = text.replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?:;])/g, '$1<em>$2</em>');
  text = text.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
  text = text.replace(/\u0000CODE(\d+)\u0000/g, (_, index) => codes[Number(index)] || '');
  return text;
}

export function markdownSlug(text) {
  return String(text).trim().toLowerCase().replace(/[`*_~]/g, '').replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-');
}

const TABLE_SEPARATOR = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/;

function tableCells(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());
}

export function renderMarkdown(source, options = {}) {
  const { headingIds = false, tableWrapper = false } = options;
  const raw = String(source ?? '').replace(/\r/g, '');
  const codeBlocks = [];
  let text = raw.replace(/```([^\n`]*)\n?([\s\S]*?)```/g, (_, language, code) => {
    const index = codeBlocks.length;
    const className = language.trim() ? ` class="language-${escapeHtml(language.trim())}"` : '';
    codeBlocks.push(`<pre><code${className}>${escapeHtml(code.replace(/\n$/, ''))}</code></pre>`);
    return `\n\u0000BLOCK${index}\u0000\n`;
  });
  const lines = escapeHtml(text).split('\n');
  const out = [];
  let paragraph = [];
  const flushParagraph = () => {
    if (!paragraph.length) return;
    out.push(`<p>${paragraph.map(line => inlineMarkdown(line)).join('<br>')}</p>`);
    paragraph = [];
  };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) { flushParagraph(); continue; }
    const code = trimmed.match(/^\u0000BLOCK(\d+)\u0000$/);
    if (code) { flushParagraph(); out.push(codeBlocks[Number(code[1])] || ''); continue; }
    if (trimmed.includes('|') && index + 1 < lines.length && TABLE_SEPARATOR.test(lines[index + 1])) {
      flushParagraph();
      const header = tableCells(trimmed);
      const aligns = tableCells(lines[index + 1]).map(cell => {
        const left = cell.startsWith(':');
        const right = cell.endsWith(':');
        return left && right ? 'center' : right ? 'right' : 'left';
      });
      const rows = [];
      index += 2;
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) rows.push(tableCells(lines[index++]));
      index--;
      const cellHtml = (value, tag, column) =>
        `<${tag} style="text-align:${aligns[column] || 'left'}">${inlineMarkdown(value)}</${tag}>`;
      const table = '<table><thead><tr>' + header.map((cell, i) => cellHtml(cell, 'th', i)).join('') + '</tr></thead><tbody>' +
        rows.map(row => '<tr>' + header.map((_, i) => cellHtml(row[i] || '', 'td', i)).join('') + '</tr>').join('') +
        '</tbody></table>';
      out.push(tableWrapper ? `<div class="readme-table-wrap">${table}</div>` : table);
      continue;
    }
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(trimmed)) { flushParagraph(); out.push('<hr>'); continue; }
    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      const level = heading[1].length;
      const title = heading[2];
      const id = headingIds ? ` id="${escapeHtml(markdownSlug(title))}"` : '';
      out.push(`<h${level}${id}>${inlineMarkdown(title)}</h${level}>`);
      continue;
    }
    if (/^&gt;\s?/.test(trimmed)) {
      flushParagraph();
      out.push(`<blockquote>${inlineMarkdown(trimmed.replace(/^&gt;\s?/, ''))}</blockquote>`);
      continue;
    }
    if (/^[-*+]\s+/.test(trimmed)) {
      flushParagraph();
      const items = [];
      let next = index;
      while (next < lines.length && /^[-*+]\s+/.test(lines[next].trim())) items.push(`<li>${inlineMarkdown(lines[next++].trim().replace(/^[-*+]\s+/, ''))}</li>`);
      index = next - 1;
      out.push(`<ul>${items.join('')}</ul>`);
      continue;
    }
    if (/^\d+\.\s+/.test(trimmed)) {
      flushParagraph();
      const items = [];
      const start = Number(trimmed.match(/^(\d+)\./)[1]);
      let next = index;
      while (next < lines.length && /^\d+\.\s+/.test(lines[next].trim())) items.push(`<li>${inlineMarkdown(lines[next++].trim().replace(/^\d+\.\s+/, ''))}</li>`);
      index = next - 1;
      out.push(`<ol${start !== 1 ? ` start="${start}"` : ''}>${items.join('')}</ol>`);
      continue;
    }
    paragraph.push(trimmed);
  }
  flushParagraph();
  return out.join('\n');
}

export function renderReadmeMarkdown(markdown) {
  return renderMarkdown(markdown, { headingIds: true, tableWrapper: true });
}
