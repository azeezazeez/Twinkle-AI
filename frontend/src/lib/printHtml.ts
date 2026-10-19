// Turns a chat message (Markdown) into safe HTML for the "Export as PDF" page.
// Images (including generated ones stored as data: URIs) become real pictures
// instead of pages of base64 text.

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const markdownToPrintHtml = (markdown: string): string => {
  const stash: string[] = [];
  const keep = (html: string) => `\u0000${stash.push(html) - 1}\u0000`;

  let text = String(markdown ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n?\n?\[Attached Files:.*?\]/g, '');

  // Fenced code blocks.
  text = text.replace(/```[^\n]*\n([\s\S]*?)(?:```|$)/g, (_m, code: string) =>
    keep(`<pre class="code"><code>${escapeHtml(code.replace(/\n$/, ''))}</code></pre>`));

  // Images: only real image data URIs or http(s) URLs are allowed.
  text = text.replace(/!\[([^\]]*)\]\(\s*(data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+|https?:\/\/[^\s)]+)\s*\)/gi,
    (_m, alt: string, src: string) =>
      keep(`<img src="${escapeHtml(src.replace(/\s+/g, ''))}" alt="${escapeHtml(alt)}">`));

  // Links.
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/gi,
    (_m, label: string, href: string) => keep(`<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`));

  // Inline code.
  text = text.replace(/`([^`\n]+)`/g, (_m, code: string) => keep(`<code>${escapeHtml(code)}</code>`));

  text = escapeHtml(text);

  text = text
    .replace(/^#{1,6}[ \t]+(.+)$/gm, (_m, title: string) => `<h3>${title}</h3>`)
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\s][^*\n]*?)\*(?![*\w])/g, '$1<em>$2</em>')
    .replace(/^[ \t]*[-*•][ \t]+(.+)$/gm, '<li>$1</li>')
    .replace(/^[ \t]*\d+[.)][ \t]+(.+)$/gm, '<li>$1</li>')
    .replace(/^[ \t]*(?:-{3,}|\*{3,})[ \t]*$/gm, '<hr>');

  // Paragraphs and line breaks (leave block-level tags alone).
  const html = text
    .split(/\n{2,}/)
    .map(block => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      if (/^<li>/.test(trimmed)) return `<ul>${trimmed.replace(/\n/g, '')}</ul>`;
      if (/^<(h3|hr)/.test(trimmed)) return trimmed.replace(/\n/g, '');
      return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
    })
    .join('');

  return html.replace(/\u0000(\d+)\u0000/g, (_m, index: string) => stash[Number(index)] ?? '');
};
