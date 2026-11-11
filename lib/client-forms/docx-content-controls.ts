/**
 * Word DOCX content control helpers (OOXML w:sdt). Works in browser-less Node tests.
 */

const W15_NS = "http://schemas.microsoft.com/office/word/2012/wordml";

function escapeXml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function findBalancedClose(xml: string, openIdx: number, openTag: string, closeTag: string): number {
  let depth = 0;
  let i = openIdx;
  while (i < xml.length) {
    const nextOpen = xml.indexOf(openTag, i);
    const nextClose = xml.indexOf(closeTag, i);
    if (nextClose < 0) return -1;
    if (nextOpen >= 0 && nextOpen < nextClose) {
      depth += 1;
      i = nextOpen + openTag.length;
      continue;
    }
    depth -= 1;
    if (depth === 0) return nextClose;
    i = nextClose + closeTag.length;
  }
  return -1;
}

/** Replace w:t nodes inside each sdt block that carries the given tag. */
export function setContentControlText(xml: string, tag: string, value: string): string {
  const tagNeedle = `w:tag w:val="${tag}"`;
  let searchFrom = 0;
  const escaped = escapeXml(value);
  while (true) {
    const tagIdx = xml.indexOf(tagNeedle, searchFrom);
    if (tagIdx < 0) return xml;
    const sdtStart = xml.lastIndexOf("<w:sdt>", tagIdx);
    if (sdtStart < 0) return xml;
    const sdtEnd = findBalancedClose(xml, sdtStart, "<w:sdt>", "</w:sdt>");
    if (sdtEnd < 0) return xml;

    const block = xml.slice(sdtStart, sdtEnd + "</w:sdt>".length);
    let replacedOnce = false;
    const replaced = block.replace(/<w:t(\s[^>]*)?>([\s\S]*?)<\/w:t>/g, (match, attrs = "") => {
      if (replacedOnce) return match;
      replacedOnce = true;
      const preserve = String(attrs).includes('xml:space="preserve"') ? ' xml:space="preserve"' : "";
      return `<w:t${preserve}>${escaped}</w:t>`;
    });

    xml = xml.slice(0, sdtStart) + replaced + xml.slice(sdtEnd + "</w:sdt>".length);
    searchFrom = sdtStart + replaced.length;
  }
}

export function fillTagsInFragment(fragment: string, values: Record<string, string>): string {
  let out = fragment;
  for (const [tag, value] of Object.entries(values)) {
    out = setContentControlText(out, tag, value);
  }
  return out;
}

/** Inner XML of the first repeatingSectionItem under loopTag. */
export function extractRepeatingSectionItemTemplate(xml: string, loopTag: string): string | null {
  const loopNeedle = `w:tag w:val="${loopTag}"`;
  const loopIdx = xml.indexOf(loopNeedle);
  if (loopIdx < 0) return null;
  const loopSdt = xml.lastIndexOf("<w:sdt>", loopIdx);
  if (loopSdt < 0) return null;
  const loopEnd = findBalancedClose(xml, loopSdt, "<w:sdt>", "</w:sdt>");
  if (loopEnd < 0) return null;
  const loopBlock = xml.slice(loopSdt, loopEnd + "</w:sdt>".length);
  const itemIdx = loopBlock.indexOf("w15:repeatingSectionItem");
  if (itemIdx < 0) return null;
  const itemSdt = loopBlock.lastIndexOf("<w:sdt>", itemIdx);
  if (itemSdt < 0) return null;
  const itemEnd = findBalancedClose(loopBlock, itemSdt, "<w:sdt>", "</w:sdt>");
  if (itemEnd < 0) return null;
  const itemBlock = loopBlock.slice(itemSdt, itemEnd + "</w:sdt>".length);
  const contentOpen = itemBlock.indexOf("<w:sdtContent>");
  const contentClose = itemBlock.lastIndexOf("</w:sdtContent>");
  if (contentOpen < 0 || contentClose < 0) return null;
  return itemBlock.slice(contentOpen + "<w:sdtContent>".length, contentClose);
}

function wrapRepeatingItem(innerXml: string, id: number) {
  return `<w:sdt><w:sdtPr><w:rPr><w:b w:val="0"/><w:bCs w:val="0"/></w:rPr><w:id w:val="${id}"/><w:placeholder><w:docPart w:val="DefaultPlaceholder_-1854013435"/></w:placeholder><w15:repeatingSectionItem xmlns:w15="${W15_NS}"/></w:sdtPr><w:sdtContent>${innerXml}</w:sdtContent></w:sdt>`;
}

/** Replace all repeating items under loopTag with clones built from rowInnerXmlList. */
export function replaceRepeatingSection(xml: string, loopTag: string, rowInnerXmlList: string[]): string {
  const loopNeedle = `w:tag w:val="${loopTag}"`;
  const loopIdx = xml.indexOf(loopNeedle);
  if (loopIdx < 0) return xml;
  const loopSdt = xml.lastIndexOf("<w:sdt>", loopIdx);
  if (loopSdt < 0) return xml;
  const loopEnd = findBalancedClose(xml, loopSdt, "<w:sdt>", "</w:sdt>");
  if (loopEnd < 0) return xml;

  const loopBlock = xml.slice(loopSdt, loopEnd + "</w:sdt>".length);
  const protoTemplate = extractRepeatingSectionItemTemplate(xml, loopTag);
  if (!protoTemplate) return xml;

  const contentOpen = loopBlock.indexOf("<w:sdtContent>");
  const contentClose = loopBlock.lastIndexOf("</w:sdtContent>");
  if (contentOpen < 0 || contentClose < 0) return xml;

  const beforeContent = loopBlock.slice(0, contentOpen + "<w:sdtContent>".length);
  const afterContent = loopBlock.slice(contentClose);

  const rows = (rowInnerXmlList.length > 0 ? rowInnerXmlList : [protoTemplate])
    .map((inner, index) => wrapRepeatingItem(inner, 9_000_000 + index))
    .join("");

  const newLoop = beforeContent + rows + afterContent;
  return xml.slice(0, loopSdt) + newLoop + xml.slice(loopEnd + "</w:sdt>".length);
}

export function listContentControlTags(xml: string): string[] {
  const tags = new Set<string>();
  const re = /w:tag w:val="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) tags.add(m[1]);
  return [...tags];
}

export { escapeXml };
