export function chunkPages(pages, title, { targetWords = 450, overlapWords = 60 } = {}) {
  const paragraphs = [];
  for (const page of pages) {
    for (const paragraph of normalizeText(page.text).split(/\n\s*\n/g)) {
      const text = paragraph.trim();
      if (text) paragraphs.push({ pageNumber: page.pageNumber, text });
    }
  }

  const chunks = [];
  let current = [];
  let currentPages = [];
  let currentWords = 0;

  const flush = () => {
    if (!current.length) return;
    const text = current.join("\n\n").trim();
    const chunkTitle = inferTitle(text, title);
    const pages = currentPages.filter((page) => page !== null && page !== undefined);
    chunks.push({
      chunkIndex: chunks.length,
      title: chunkTitle,
      breadcrumb: `${title} > ${chunkTitle}`,
      pageStart: pages.length ? Math.min(...pages) : null,
      pageEnd: pages.length ? Math.max(...pages) : null,
      text,
      tokenCount: text.split(/\s+/).filter(Boolean).length,
    });

    if (overlapWords > 0) {
      const overlap = text.split(/\s+/).slice(-overlapWords).join(" ");
      current = overlap ? [overlap] : [];
      currentWords = overlap ? overlap.split(/\s+/).length : 0;
      currentPages = currentPages.length ? [currentPages[currentPages.length - 1]] : [];
    } else {
      current = [];
      currentWords = 0;
      currentPages = [];
    }
  };

  for (const paragraph of paragraphs) {
    const words = paragraph.text.split(/\s+/).filter(Boolean).length;
    if (current.length && currentWords + words > targetWords) flush();
    current.push(paragraph.text);
    currentWords += words;
    if (paragraph.pageNumber !== null && paragraph.pageNumber !== undefined) currentPages.push(paragraph.pageNumber);
  }
  flush();
  return chunks;
}

function normalizeText(text) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function inferTitle(text, fallback) {
  const heading = text.match(/^#{1,6}\s+(.+?)\s*$/m);
  if (heading) return heading[1].trim().slice(0, 120);
  return (text.split("\n").find((line) => line.trim()) || fallback).trim().slice(0, 120);
}
