import {
  type ArchivalWork,
  type Ao3Rating,
  type Ao3Category,
  type Ao3Status,
  type ChapterEntry,
  splitTextIntoChapters,
} from '../data/internetArchiveCatalog';

function countProseWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function normalizeRating(raw: string): Ao3Rating {
  const lower = raw.toLowerCase();
  if (lower.includes('explicit')) return 'Explicit';
  if (lower.includes('mature')) return 'Mature';
  if (lower.includes('teen')) return 'Teen And Up Audiences';
  if (lower.includes('general')) return 'General Audiences';
  return 'Not Rated';
}

function normalizeCategory(raw: string): Ao3Category {
  const lower = raw.toLowerCase();
  if (lower.includes('m/m')) return 'M/M';
  if (lower.includes('f/f')) return 'F/F';
  if (lower.includes('f/m')) return 'F/M';
  if (lower.includes('multi')) return 'Multi';
  if (lower.includes('other')) return 'Other';
  return 'Gen';
}

/**
 * Converts an AO3 HTML element (.userstuff / blockquote) into clean, paragraph-separated prose
 * while stripping hidden screen-reader landmarks and scripts/styles.
 */
function extractCleanProseFromElement(el: Element | null): string {
  if (!el) return '';
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll('script, style, .landmark').forEach((n) => n.remove());

  const blocks = Array.from(
    clone.querySelectorAll('p, li, blockquote, h1, h2, h3, h4, hr')
  ).filter((node) => {
    // Avoid double-extracting nested <p> inside <blockquote>
    return !node.parentElement?.closest('blockquote, li') || node.tagName.toLowerCase() === 'p';
  });

  if (blocks.length > 0) {
    const lines: string[] = [];
    for (const block of blocks) {
      const tag = block.tagName.toLowerCase();
      if (tag === 'hr') {
        lines.push('* * *');
        continue;
      }
      // Preserve <br> as single line breaks inside paragraphs
      const htmlWithBreaks = block.innerHTML.replace(/<br\s*\/?>/gi, '\n');
      const temp = document.createElement('div');
      temp.innerHTML = htmlWithBreaks;
      const text = (temp.textContent || '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n[ \t]+/g, '\n')
        .trim();
      if (text) lines.push(text);
    }
    if (lines.length > 0) {
      return lines.join('\n\n');
    }
  }

  return (clone.textContent || '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseMetaTags(doc: Document, selectors: string[]): string[] {
  const items: string[] = [];
  for (const sel of selectors) {
    const nodes = doc.querySelectorAll(sel);
    nodes.forEach((n) => {
      const val = (n.textContent || '').trim();
      if (val && !items.includes(val)) items.push(val);
    });
  }
  return items;
}

function extractArchiveUrlId(doc: Document): string | null {
  const links = Array.from(doc.querySelectorAll('a[href*="archiveofourown.org/works/"]'));
  for (const a of links) {
    const href = a.getAttribute('href') || '';
    const match = href.match(/archiveofourown\.org\/works\/(\d+)/i);
    if (match) return match[1];
  }
  return null;
}

/**
 * Parses an official AO3 HTML export ("Download -> HTML") or captured AO3 work page HTML
 * into a complete unabridged ArchivalWork with full multi-chapter structure.
 */
export function parseAo3HtmlToWork(
  html: string,
  fallbackFileName = 'Imported AO3 Work',
  sourceArchiveIdOverride?: string
): ArchivalWork {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // 1. Title & Author
  const rawTitle =
    doc.querySelector('#preface .meta h1, #preface h1, h2.title.heading, h1.title')?.textContent?.trim() ||
    doc.title
      ?.replace(/\s*[-–|]\s*Archive of Our Own.*$/i, '')
      .replace(/\s*\[Archive of Our Own\]$/i, '')
      .trim() ||
    fallbackFileName.replace(/\.(html?|epub|txt)$/i, '');

  const rawAuthor =
    doc
      .querySelector('#preface .byline a, a[rel="author"], .byline a, #preface .byline')
      ?.textContent?.replace(/^by\s+/i, '')
      .trim() || 'AO3 Author';

  // 2. Tags & Classification
  const fandoms = parseMetaTags(doc, [
    'dd.fandom a.tag',
    'dd.fandom li',
    '#preface dd.fandom a',
    '.meta dd.fandom',
  ]);
  const ratingTags = parseMetaTags(doc, ['dd.rating a.tag', '#preface dd.rating', 'dd.rating']);
  const categoryTags = parseMetaTags(doc, [
    'dd.category a.tag',
    '#preface dd.category',
    'dd.category',
  ]);
  const relationships = parseMetaTags(doc, [
    'dd.relationship a.tag',
    '#preface dd.relationship a',
  ]);
  const characters = parseMetaTags(doc, ['dd.character a.tag', '#preface dd.character a']);
  const freeforms = parseMetaTags(doc, ['dd.freeform a.tag', '#preface dd.freeform a']);
  const warnings = parseMetaTags(doc, ['dd.warning a.tag', '#preface dd.warning a']);

  const fandom = fandoms[0] || 'AO3 Downloaded Work';
  const rating = normalizeRating(ratingTags[0] || '');
  const category = normalizeCategory(categoryTags[0] || '');

  const combinedTags = Array.from(
    new Set([
      ...freeforms,
      ...warnings.filter((w) => !/no archive warnings apply/i.test(w)),
      'AO3 Direct Import',
    ])
  ).slice(0, 12);

  // 3. Summary
  const summaryEl =
    doc.querySelector('#preface .summary blockquote.userstuff, div.summary blockquote.userstuff, div.summary .userstuff') ||
    doc.querySelector('#preface .summary p, div.summary p');
  const summary =
    extractCleanProseFromElement(summaryEl).slice(0, 1800) ||
    `Complete work imported from Archive of Our Own (${rawTitle}).`;

  // 4. Published / Updated Date & Chapter Count Metadata
  const chaptersStatText =
    doc.querySelector('dd.chapters, #preface dd.chapters')?.textContent?.trim() || '';
  const chStatMatch = chaptersStatText.match(/(\d+)\s*\/\s*(\d+|\?)/);
  const declaredTotalChapters = chStatMatch && chStatMatch[2] !== '?' ? Number(chStatMatch[2]) : 0;

  const publishedDate =
    doc.querySelector('dd.status, dd.published')?.textContent?.trim()?.match(/\d{4}-\d{2}-\d{2}/)?.[0] ||
    new Date().toISOString().slice(0, 10);

  // 5. Extract Chapters (#chapters div.chapter OR downloaded HTML h2.heading sections)
  const parsedChapters: ChapterEntry[] = [];
  const chaptersContainer = doc.querySelector('#chapters') || doc.body;

  const chapterBlocks = Array.from(chaptersContainer.querySelectorAll('div.chapter, section.chapter'));
  if (chapterBlocks.length > 0) {
    chapterBlocks.forEach((chEl, idx) => {
      const chHeadingEl = chEl.querySelector('.chapter.preface h3.title, h3.title, h2.heading, h2');
      const chTitle =
        chHeadingEl?.textContent?.replace(/\s+/g, ' ').trim() || `Chapter ${idx + 1}`;
      const chNotesEl = chEl.querySelector('div.notes blockquote.userstuff, .notes .userstuff');
      const chNotes = extractCleanProseFromElement(chNotesEl);

      // Gather prose from userstuff sections belonging to chapter text (not notes/summary)
      const userstuffEls = Array.from(chEl.querySelectorAll('div.userstuff')).filter(
        (u) => !u.closest('.notes, .summary, .preface')
      );
      const proseParts =
        userstuffEls.length > 0
          ? userstuffEls.map((u) => extractCleanProseFromElement(u)).filter(Boolean)
          : [extractCleanProseFromElement(chEl.querySelector('.userstuff.module, .userstuff'))];

      const chContent = proseParts.join('\n\n').trim();
      if (chContent) {
        parsedChapters.push({
          number: idx + 1,
          title: chTitle,
          notes: chNotes || undefined,
          content: chContent,
          wordCount: countProseWords(chContent),
        });
      }
    });
  }

  // Fallback for single-chapter AO3 downloads or plain #chapters > .userstuff HTML
  if (parsedChapters.length === 0) {
    const mainStuffEls = Array.from(chaptersContainer.querySelectorAll('div.userstuff')).filter(
      (u) => !u.closest('#preface, .summary, .notes, .end.notes')
    );

    if (mainStuffEls.length > 1) {
      // Downloaded HTML sometimes places each chapter as a sibling header + div.userstuff inside #chapters
      mainStuffEls.forEach((el, idx) => {
        const prev = el.previousElementSibling;
        const chTitle =
          prev && /^h[1-4]|div$/i.test(prev.tagName)
            ? prev.textContent?.replace(/\s+/g, ' ').trim() || `Chapter ${idx + 1}`
            : `Chapter ${idx + 1}`;
        const body = extractCleanProseFromElement(el);
        if (body) {
          parsedChapters.push({
            number: idx + 1,
            title: chTitle,
            content: body,
            wordCount: countProseWords(body),
          });
        }
      });
    } else if (mainStuffEls.length === 1) {
      const fullBody = extractCleanProseFromElement(mainStuffEls[0]);
      if (fullBody) {
        const autoSplit = splitTextIntoChapters(fullBody, rawTitle);
        parsedChapters.push(...autoSplit);
      }
    }
  }

  // Ultimate fallback: extract whole body minus preface/navigation
  if (parsedChapters.length === 0) {
    const bodyClone = doc.body.cloneNode(true) as Element;
    bodyClone.querySelectorAll('#header, #footer, #preface, nav, script, style').forEach((n) => n.remove());
    const fallbackText = extractCleanProseFromElement(bodyClone);
    parsedChapters.push(...splitTextIntoChapters(fallbackText, rawTitle));
  }

  const combinedContent = parsedChapters
    .map((c) => (parsedChapters.length > 1 ? `${c.title}\n\n${c.content}` : c.content))
    .join('\n\n');
  const totalWordCount =
    parsedChapters.reduce((acc, c) => acc + c.wordCount, 0) || countProseWords(combinedContent);

  const detectedAo3WorkId = extractArchiveUrlId(doc);
  const sourceArchiveId =
    sourceArchiveIdOverride ||
    (detectedAo3WorkId ? `ao3-direct-${detectedAo3WorkId}` : `ao3-file-${Date.now()}`);
  const id = detectedAo3WorkId
    ? `ao3_work_${detectedAo3WorkId}`
    : `ao3_import_${rawTitle.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 48)}_${Date.now()
        .toString()
        .slice(-5)}`;

  const status: Ao3Status =
    declaredTotalChapters > 0 && parsedChapters.length < declaredTotalChapters
      ? 'In Progress'
      : chStatMatch && chStatMatch[2] === '?'
      ? 'In Progress'
      : 'Completed';

  return {
    id,
    title: rawTitle.slice(0, 200),
    authorName: rawAuthor.slice(0, 100),
    authorUid: 'ao3_direct_import',
    fandom: fandom.slice(0, 150),
    rating,
    category,
    status,
    summary,
    content: combinedContent,
    chapters: parsedChapters,
    tags: combinedTags.length > 0 ? combinedTags : ['AO3 Direct Import'],
    relationships: relationships.slice(0, 6),
    characters: characters.slice(0, 10),
    wordCount: totalWordCount,
    chapterCount: parsedChapters.length,
    totalChapters: Math.max(parsedChapters.length, declaredTotalChapters || parsedChapters.length),
    kudosCount: 1,
    hitsCount: 1,
    bookmarksCount: 1,
    sourceArchiveId,
    archiveDate: publishedDate,
    visibility: 'public',
  };
}

async function inflateRawBytesBrowser(compressed: Uint8Array): Promise<string> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Browser DecompressionStream is unavailable; please import an AO3 .html download.');
  }
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  const safeCopy = new Uint8Array(compressed.byteLength);
  safeCopy.set(compressed);
  await writer.write(safeCopy);
  await writer.close();
  const buf = await new Response(ds.readable).arrayBuffer();
  return new TextDecoder('utf-8').decode(buf);
}

/**
 * Zero-dependency browser EPUB/ZIP reader for official AO3 Download -> EPUB files.
 */
export async function parseAo3EpubToWork(file: File): Promise<ArchivalWork> {
  const arrBuf = await file.arrayBuffer();
  const bytes = new Uint8Array(arrBuf);
  const view = new DataView(arrBuf);

  const minOffset = Math.max(0, bytes.length - 65558);
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= minOffset; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error('Could not read EPUB zip directory. Try exporting as HTML from AO3.');
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);

  interface ZipItem {
    name: string;
    method: number;
    compSize: number;
    localOffset: number;
  }
  const xhtmlEntries: ZipItem[] = [];
  let opfEntry: ZipItem | null = null;
  const decoder = new TextDecoder('utf-8');

  let ptr = cdOffset;
  for (let idx = 0; idx < totalEntries && ptr + 46 <= bytes.length; idx++) {
    if (view.getUint32(ptr, true) !== 0x02014b50) break;
    const method = view.getUint16(ptr + 10, true);
    const compSize = view.getUint32(ptr + 20, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localOffset = view.getUint32(ptr + 42, true);
    const name = decoder.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));
    ptr += 46 + nameLen + extraLen + commentLen;

    const lower = name.toLowerCase();
    if (lower.endsWith('.opf')) {
      opfEntry = { name, method, compSize, localOffset };
    } else if (
      (lower.endsWith('.xhtml') || lower.endsWith('.html') || lower.endsWith('.htm')) &&
      !lower.includes('nav.') &&
      !lower.includes('toc.')
    ) {
      xhtmlEntries.push({ name, method, compSize, localOffset });
    }
  }

  const readEntryText = async (item: ZipItem): Promise<string> => {
    if (item.localOffset + 30 > bytes.length) return '';
    if (view.getUint32(item.localOffset, true) !== 0x04034b50) return '';
    const lNameLen = view.getUint16(item.localOffset + 26, true);
    const lExtraLen = view.getUint16(item.localOffset + 28, true);
    const dataStart = item.localOffset + 30 + lNameLen + lExtraLen;
    const dataEnd = dataStart + item.compSize;
    if (dataEnd > bytes.length) return '';
    const slice = bytes.subarray(dataStart, dataEnd);
    if (item.method === 0) return decoder.decode(slice);
    if (item.method === 8) return inflateRawBytesBrowser(slice);
    return '';
  };

  xhtmlEntries.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  );

  // Extract OPF metadata & spine order if available
  let opfTitle = '';
  let opfAuthor = '';
  let opfSummary = '';
  const opfSubjects: string[] = [];

  if (opfEntry) {
    try {
      const opfXml = await readEntryText(opfEntry);
      const opfDoc = new DOMParser().parseFromString(opfXml, 'application/xml');
      opfTitle = opfDoc.querySelector('title')?.textContent?.trim() || '';
      opfAuthor = opfDoc.querySelector('creator')?.textContent?.trim() || '';
      opfSummary = opfDoc.querySelector('description')?.textContent?.trim() || '';
      opfDoc.querySelectorAll('subject').forEach((s) => {
        const t = s.textContent?.trim();
        if (t) opfSubjects.push(t);
      });
    } catch {
      // Optional OPF metadata
    }
  }

  // Merge all XHTML content documents sequentially and parse via AO3 HTML pipeline or chapter split
  const htmlBodies: string[] = [];
  for (const item of xhtmlEntries) {
    const xhtml = await readEntryText(item);
    if (xhtml.trim().length > 40) {
      htmlBodies.push(xhtml);
    }
  }

  if (htmlBodies.length === 0) {
    throw new Error('No readable chapters found inside EPUB archive.');
  }

  // Inspect preface/first file for AO3 metadata, and extract each XHTML file as a chapter section
  const firstDoc = new DOMParser().parseFromString(htmlBodies[0], 'text/html');
  const mergedPrefaceWork = parseAo3HtmlToWork(htmlBodies[0], file.name);

  const chapters: ChapterEntry[] = [];
  for (let i = 0; i < htmlBodies.length; i++) {
    const chDoc = i === 0 ? firstDoc : new DOMParser().parseFromString(htmlBodies[i], 'text/html');
    const isPrefaceOnly =
      htmlBodies.length > 1 &&
      (xhtmlEntries[i].name.toLowerCase().includes('preface') ||
        (chDoc.querySelector('#preface') !== null && chDoc.querySelector('#chapters') === null));

    if (isPrefaceOnly) continue;

    const chHeading =
      chDoc.querySelector('h1, h2.heading, h3.title, title')?.textContent?.trim() ||
      `Chapter ${chapters.length + 1}`;
    const bodyClone = chDoc.body.cloneNode(true) as Element;
    bodyClone.querySelectorAll('script, style, .landmark').forEach((n) => n.remove());
    const prose = extractCleanProseFromElement(bodyClone);
    if (prose.length > 30) {
      chapters.push({
        number: chapters.length + 1,
        title: chHeading,
        content: prose,
        wordCount: countProseWords(prose),
      });
    }
  }

  const finalChapters =
    chapters.length > 0 ? chapters : mergedPrefaceWork.chapters || [];
  const combinedContent = finalChapters
    .map((c) => `${c.title}\n\n${c.content}`)
    .join('\n\n');
  const totalWords = finalChapters.reduce((acc, c) => acc + c.wordCount, 0);

  return {
    ...mergedPrefaceWork,
    title: (opfTitle || mergedPrefaceWork.title).slice(0, 200),
    authorName: (opfAuthor || mergedPrefaceWork.authorName).slice(0, 100),
    summary: (opfSummary || mergedPrefaceWork.summary).slice(0, 1800),
    tags: Array.from(new Set([...mergedPrefaceWork.tags, ...opfSubjects, 'AO3 EPUB Import'])).slice(
      0,
      12
    ),
    chapters: finalChapters,
    content: combinedContent || mergedPrefaceWork.content,
    wordCount: totalWords || mergedPrefaceWork.wordCount,
    chapterCount: finalChapters.length || 1,
    totalChapters: Math.max(
      finalChapters.length || 1,
      mergedPrefaceWork.totalChapters || finalChapters.length || 1
    ),
    sourceArchiveId: `ao3-epub-${file.name.replace(/[^a-zA-Z0-9._\-]/g, '_').slice(0, 80)}`,
  };
}

export async function parseUploadedAo3File(file: File): Promise<ArchivalWork> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.epub')) {
    return parseAo3EpubToWork(file);
  }
  const text = await file.text();
  if (lower.endsWith('.html') || lower.endsWith('.htm') || lower.endsWith('.xhtml') || /<html|<div\s+id=["']chapters["']/i.test(text)) {
    return parseAo3HtmlToWork(text, file.name);
  }

  const cleanText = text.replace(/\r\n/g, '\n').trim();
  const title = file.name.replace(/\.[^.]+$/, '');
  const chapters = splitTextIntoChapters(cleanText, title);
  const wordCount = countProseWords(cleanText);
  return {
    id: `ao3_txt_${Date.now()}`,
    title,
    authorName: 'Local Archivist',
    authorUid: 'ao3_direct_import',
    fandom: 'Imported Text Manuscript',
    rating: 'Not Rated',
    category: 'Gen',
    status: 'Completed',
    summary: cleanText.slice(0, 420),
    content: cleanText,
    chapters,
    tags: ['AO3 Direct Import', 'Plain Text Manuscript'],
    wordCount,
    chapterCount: chapters.length,
    totalChapters: chapters.length,
    kudosCount: 1,
    hitsCount: 1,
    bookmarksCount: 1,
    sourceArchiveId: `ao3-txt-${Date.now()}`,
    archiveDate: new Date().toISOString().slice(0, 10),
    visibility: 'public',
  };
}

export async function recoverAo3WorkFromWayback(workInput: string): Promise<{
  work: ArchivalWork;
  waybackUrl: string;
  snapshotDate: string;
  mode: string;
}> {
  const resp = await fetch(`/api/archive/ao3-wayback?url=${encodeURIComponent(workInput.trim())}`);
  const contentType = resp.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(
      'Wayback server proxy is unavailable on static GitHub Pages hosting. Download the HTML or EPUB directly from AO3 and drop it into the file importer.'
    );
  }
  const data = await resp.json();
  if (!resp.ok || !data.html) {
    throw new Error(
      data?.error ||
        'No full-work Wayback snapshot found for this AO3 work. Download the HTML/EPUB directly from AO3 and drop it into the file importer below.'
    );
  }

  const parsed = parseAo3HtmlToWork(
    data.html,
    `AO3 Work ${data.workId || ''}`,
    `ao3-wayback-${data.workId || 'snapshot'}`
  );

  // If Wayback only captured multiple single chapters merged by the server, keep chapter list accurate
  const enrichedWork: ArchivalWork = {
    ...parsed,
    id: `ao3_wayback_${data.workId || Date.now()}`,
    archiveDate: data.snapshotDate || parsed.archiveDate,
  };

  return {
    work: enrichedWork,
    waybackUrl: data.waybackUrl || `https://archiveofourown.org/works/${data.workId || ''}`,
    snapshotDate: data.snapshotDate || '',
    mode: data.mode || 'wayback_full_work',
  };
}
