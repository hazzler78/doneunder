/**
 * Hermes often drafts school/outreach emails with light markdown (**bold**,
 * lists, ---). Resend was sending that as plain text, so recipients saw the
 * asterisks. Convert before send: clean text + simple HTML multipart.
 */

function escapeHtml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Strip common markdown so the text/plain part stays readable. */
export function markdownToPlainText(input: string) {
  let text = input.replace(/\r\n/g, "\n").trim();
  text = text.replace(/^#{1,6}\s+/gm, "");
  text = text.replace(/^---+$/gm, "");
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1 ($2)");
  text = text.replace(/\*\*([^*\n]+)\*\*/g, "$1");
  text = text.replace(/__([^_\n]+)__/g, "$1");
  text = text.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1$2");
  text = text.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, "$1$2");
  text = text.replace(/^[\t ]*[-*+]\s+/gm, "• ");
  text = text.replace(/^[\t ]*\d+\.\s+/gm, (match) => match.trimStart());
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

function inlineMarkdownToHtml(escapedLine: string) {
  let html = escapedLine;
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');
  html = html.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__([^_\n]+)__/g, "<strong>$1</strong>");
  html = html.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  return html;
}

/**
 * Turn light markdown into a small HTML body for email clients.
 * Only covers patterns Hermes actually uses in drafts.
 */
export function markdownToEmailHtml(input: string) {
  const lines = input.replace(/\r\n/g, "\n").trim().split("\n");
  const parts: string[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length === 0) return;
    parts.push(`<ul>${listItems.map((item) => `<li>${item}</li>`).join("")}</ul>`);
    listItems = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      continue;
    }
    if (/^---+$/.test(trimmed)) {
      flushList();
      parts.push("<hr>");
      continue;
    }
    const bullet = trimmed.match(/^[-*+]\s+(.+)$/);
    if (bullet) {
      listItems.push(inlineMarkdownToHtml(escapeHtml(bullet[1]!)));
      continue;
    }
    flushList();
    const heading = trimmed.match(/^#{1,6}\s+(.+)$/);
    if (heading) {
      parts.push(`<p><strong>${inlineMarkdownToHtml(escapeHtml(heading[1]!))}</strong></p>`);
      continue;
    }
    parts.push(`<p>${inlineMarkdownToHtml(escapeHtml(trimmed))}</p>`);
  }
  flushList();

  const body = parts.join("\n");
  return [
    '<!DOCTYPE html><html><body style="font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.5; color: #111;">',
    body,
    "</body></html>",
  ].join("");
}

export function prepareOutboundEmailBody(body: string) {
  const source = body.trim();
  return {
    text: markdownToPlainText(source),
    html: markdownToEmailHtml(source),
  };
}
