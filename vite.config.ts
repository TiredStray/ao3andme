import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import zlib from 'node:zlib';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

function decodeHtmlEntities(text: string): string {
  const named: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
    '&mdash;': '—',
    '&ndash;': '–',
    '&hellip;': '…',
    '&lsquo;': '‘',
    '&rsquo;': '’',
    '&ldquo;': '“',
    '&rdquo;': '”',
    '&bull;': '•',
  };
  return text
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp|mdash|ndash|hellip|lsquo|rsquo|ldquo|rdquo|bull|#39);/gi, (m) => {
      return named[m.toLowerCase()] ?? m;
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = Number(dec);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : '';
    });
}

function htmlToStructuredProse(html: string): string {
  // If AO3 export wrapper exists, prefer main work content while keeping chapter titles & notes
  let cleaned = html
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '');

  // Preserve headings on isolated double-newline lines so chapter splitters detect them reliably
  cleaned = cleaned
    .replace(/<h([1-4])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, _lvl, inner) => {
      const heading = inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      return heading ? `\n\n${heading}\n\n` : '\n\n';
    })
    .replace(/<hr\b[^>]*\/?>/gi, '\n\n* * *\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|blockquote|section|article|tr)>/gi, '\n\n')
    .replace(/<(p|div|li|blockquote|section|article)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '');

  const decoded = decodeHtmlEntities(cleaned)
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return decoded;
}

/**
 * Lightweight zero-dependency PKZIP reader (for .epub and .zip fanwork bundles on archive.org)
 */
function extractTextFilesFromZip(buffer: Buffer, maxTotalChars = 8_000_000): string {
  // Locate End of Central Directory (signature 0x06054b50) near end of buffer
  const minOffset = Math.max(0, buffer.length - 65558);
  let eocdOffset = -1;
  for (let i = buffer.length - 22; i >= minOffset; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) return '';

  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const cdOffset = buffer.readUInt32LE(eocdOffset + 16);

  const entries: Array<{ name: string; method: number; compSize: number; localOffset: number }> = [];
  let ptr = cdOffset;
  for (let idx = 0; idx < totalEntries && ptr + 46 <= buffer.length; idx++) {
    if (buffer.readUInt32LE(ptr) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(ptr + 10);
    const compSize = buffer.readUInt32LE(ptr + 20);
    const nameLen = buffer.readUInt16LE(ptr + 28);
    const extraLen = buffer.readUInt16LE(ptr + 30);
    const commentLen = buffer.readUInt16LE(ptr + 32);
    const localOffset = buffer.readUInt32LE(ptr + 42);
    const name = buffer.subarray(ptr + 46, ptr + 46 + nameLen).toString('utf8');
    ptr += 46 + nameLen + extraLen + commentLen;

    const lower = name.toLowerCase();
    const isReadable =
      (lower.endsWith('.xhtml') ||
        lower.endsWith('.html') ||
        lower.endsWith('.htm') ||
        lower.endsWith('.txt')) &&
      !lower.includes('nav.') &&
      !lower.includes('toc.') &&
      !lower.startsWith('__macosx/');

    if (isReadable && compSize > 0 && (method === 0 || method === 8)) {
      entries.push({ name, method, compSize, localOffset });
    }
  }

  entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

  const chunks: string[] = [];
  let charTotal = 0;

  for (const entry of entries) {
    if (charTotal >= maxTotalChars) break;
    if (entry.localOffset + 30 > buffer.length) continue;
    if (buffer.readUInt32LE(entry.localOffset) !== 0x04034b50) continue;

    const lNameLen = buffer.readUInt16LE(entry.localOffset + 26);
    const lExtraLen = buffer.readUInt16LE(entry.localOffset + 28);
    const dataStart = entry.localOffset + 30 + lNameLen + lExtraLen;
    const dataEnd = dataStart + entry.compSize;
    if (dataEnd > buffer.length) continue;

    try {
      const compData = buffer.subarray(dataStart, dataEnd);
      const rawBuf = entry.method === 8 ? zlib.inflateRawSync(compData) : compData;
      const rawText = rawBuf.toString('utf8');
      const parsed =
        entry.name.toLowerCase().endsWith('.txt') ? rawText.trim() : htmlToStructuredProse(rawText);
      if (parsed.length > 40) {
        chunks.push(parsed);
        charTotal += parsed.length;
      }
    } catch {
      // Skip malformed entry
    }
  }

  return chunks.join('\n\n').slice(0, maxTotalChars);
}

/**
 * Vite server middleware plugin that scrapes the Internet Archive (archive.org)
 * for historical AO3 / fanfiction works and unabridged full text manuscripts.
 */
function internetArchiveAo3ScraperPlugin(): Plugin {
  return {
    name: 'internet-archive-ao3-scraper',
    configureServer(server) {
      server.middlewares.use('/api/archive/scrape', async (req, res) => {
        try {
          const urlObj = new URL(req.url || '', 'http://localhost:3000');
          const queryTerm = urlObj.searchParams.get('q') || '';
          const rows = urlObj.searchParams.get('rows') || '16';

          const baseQuery = queryTerm
            ? `((collection:ao3 OR "Archive of Our Own" OR subject:fanfiction OR subject:"fan fiction") AND (${queryTerm})) AND mediatype:texts`
            : `(collection:ao3 OR "Archive of Our Own" OR subject:"Archive of Our Own" OR (subject:fanfiction AND mediatype:texts))`;

          const iaUrl = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(
            baseQuery
          )}&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=description&fl[]=subject&fl[]=date&fl[]=downloads&fl[]=item_size&sort[]=downloads+desc&rows=${encodeURIComponent(
            rows
          )}&page=1&output=json`;

          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 18000);

          const response = await fetch(iaUrl, {
            signal: controller.signal,
            headers: {
              'User-Agent': 'AO3ModernFolioPWA/1.0 (Archival Research Reader)',
            },
          });
          clearTimeout(timeout);

          if (!response.ok) {
            throw new Error(`Internet Archive responded with ${response.status}`);
          }

          const data = await response.json();
          const docs = data?.response?.docs || [];

          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              source: 'internet_archive_live',
              count: docs.length,
              docs,
            })
          );
        } catch (err) {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              source: 'internet_archive_fallback',
              error: err instanceof Error ? err.message : 'Archive offline',
              docs: [],
            })
          );
        }
      });

      server.middlewares.use('/api/archive/item', async (req, res) => {
        try {
          const urlObj = new URL(req.url || '', 'http://localhost:3000');
          const id = urlObj.searchParams.get('id') || '';
          if (!id || !/^[a-zA-Z0-9_.\-]+$/.test(id)) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Invalid Internet Archive identifier' }));
            return;
          }

          const metaController = new AbortController();
          const metaTimeout = setTimeout(() => metaController.abort(), 15000);
          const metaUrl = `https://archive.org/metadata/${encodeURIComponent(id)}`;
          const metaResp = await fetch(metaUrl, {
            signal: metaController.signal,
            headers: { 'User-Agent': 'AO3ModernFolioPWA/1.0' },
          });
          clearTimeout(metaTimeout);
          const metaData = await metaResp.json();

          type IaFile = { name: string; format?: string; size?: string; source?: string };
          const files: IaFile[] = Array.isArray(metaData?.files) ? metaData.files : [];

          const isMetadataJunk = (name: string) =>
            name.endsWith('_files.xml') ||
            name.endsWith('_meta.xml') ||
            name.endsWith('_meta.txt') ||
            name.endsWith('_meta.sqlite') ||
            name.endsWith('_reviews.xml') ||
            name.endsWith('_scandata.xml') ||
            name.toLowerCase().includes('hocr.html') ||
            name.toLowerCase().includes('chocr.html') ||
            name.toLowerCase().includes('_abbyy.');

          const readableFiles = files.filter((f) => f.name && !isMetadataJunk(f.name));

          const originalHtmlFiles = readableFiles
            .filter((f) => /\.(html?|xhtml)$/i.test(f.name) && f.source === 'original')
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

          const isManifestOrIndexTxt = (name: string) => {
            const base = name.toLowerCase().split('/').pop() || '';
            return (
              base === 'filelist.txt' ||
              base === 'manifest.txt' ||
              base === 'index.txt' ||
              base === 'readme.txt'
            );
          };

          const originalTxtFiles = readableFiles
            .filter(
              (f) =>
                /\.txt$/i.test(f.name) &&
                !f.name.endsWith('_djvu.txt') &&
                !isManifestOrIndexTxt(f.name) &&
                f.source === 'original'
            )
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

          const djvuTxtFiles = readableFiles
            .filter(
              (f) =>
                f.name.endsWith('_djvu.txt') ||
                f.format === 'DjVuTXT' ||
                (f.format === 'Text' && /\.txt$/i.test(f.name) && !isManifestOrIndexTxt(f.name))
            )
            .sort((a, b) => Number(b.size || 0) - Number(a.size || 0));

          const anyHtmlFiles = readableFiles
            .filter((f) => /\.(html?|xhtml)$/i.test(f.name))
            .sort((a, b) => Number(b.size || 0) - Number(a.size || 0));

          const epubOrZipFiles = readableFiles
            .filter((f) => /\.(epub|zip)$/i.test(f.name))
            .sort((a, b) => {
              // Prefer .epub over .zip, and smaller/cleaner files within reasonable bounds
              const aEpub = a.name.toLowerCase().endsWith('.epub') ? 0 : 1;
              const bEpub = b.name.toLowerCase().endsWith('.epub') ? 0 : 1;
              if (aEpub !== bEpub) return aEpub - bEpub;
              return Number(a.size || 0) - Number(b.size || 0);
            });

          const buildDownloadUrl = (fileName: string) =>
            `https://archive.org/download/${encodeURIComponent(id)}/${fileName
              .split('/')
              .map(encodeURIComponent)
              .join('/')}`;

          const MAX_TEXT_BYTES = 12 * 1024 * 1024; // 12 MB full manuscript support
          const MAX_ZIP_BYTES = 24 * 1024 * 1024; // 24 MB EPUB/ZIP limit

          let extractedText = '';
          let selectedFormat = '';
          let selectedFileName = '';
          let isTruncated = false;

          const fetchFullTextFile = async (file: IaFile, parseHtml: boolean): Promise<string> => {
            const sizeNum = Number(file.size || 0);
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 25000);
            try {
              const headers: Record<string, string> = {
                'User-Agent': 'AO3ModernFolioPWA/1.0',
              };
              if (sizeNum > MAX_TEXT_BYTES) {
                headers.Range = `bytes=0-${MAX_TEXT_BYTES - 1}`;
                isTruncated = true;
              }
              const resp = await fetch(buildDownloadUrl(file.name), {
                signal: controller.signal,
                headers,
              });
              if (!resp.ok) return '';
              const raw = await resp.text();
              return parseHtml ? htmlToStructuredProse(raw) : raw.replace(/\r\n/g, '\n').trim();
            } finally {
              clearTimeout(timeout);
            }
          };

          // Priority 1: Original AO3/Archival HTML or XHTML files (cleanest full text & chapter headers)
          if (originalHtmlFiles.length > 0) {
            selectedFormat = 'HTML';
            selectedFileName = originalHtmlFiles.map((f) => f.name).join(', ');
            const parts: string[] = [];
            let accLen = 0;
            for (const f of originalHtmlFiles.slice(0, 60)) {
              if (accLen >= MAX_TEXT_BYTES) {
                isTruncated = true;
                break;
              }
              const part = await fetchFullTextFile(f, true);
              if (part.length > 30) {
                parts.push(part);
                accLen += part.length;
              }
            }
            extractedText = parts.join('\n\n');
          }

          // Priority 2: Original plain .txt files
          if (extractedText.length < 150 && originalTxtFiles.length > 0) {
            selectedFormat = 'Text';
            selectedFileName = originalTxtFiles.map((f) => f.name).join(', ');
            const parts: string[] = [];
            let accLen = 0;
            for (const f of originalTxtFiles.slice(0, 60)) {
              if (accLen >= MAX_TEXT_BYTES) {
                isTruncated = true;
                break;
              }
              const part = await fetchFullTextFile(f, false);
              if (part.length > 30) {
                parts.push(part);
                accLen += part.length;
              }
            }
            if (parts.join('\n\n').length > extractedText.length) {
              extractedText = parts.join('\n\n');
            }
          }

          // Priority 3: EPUB / ZIP bundle extraction (captures complete AO3 collections or EPUB-only uploads)
          if (extractedText.length < 1500 && epubOrZipFiles.length > 0) {
            const archiveCandidate = epubOrZipFiles.find(
              (f) => Number(f.size || 0) <= MAX_ZIP_BYTES
            );
            if (archiveCandidate) {
              const controller = new AbortController();
              const timeout = setTimeout(() => controller.abort(), 25000);
              try {
                const resp = await fetch(buildDownloadUrl(archiveCandidate.name), {
                  signal: controller.signal,
                  headers: { 'User-Agent': 'AO3ModernFolioPWA/1.0' },
                });
                if (resp.ok) {
                  const arrBuf = await resp.arrayBuffer();
                  const zipText = extractTextFilesFromZip(Buffer.from(arrBuf), 8_000_000);
                  if (zipText.length > extractedText.length) {
                    extractedText = zipText;
                    selectedFormat = archiveCandidate.name.toLowerCase().endsWith('.epub')
                      ? 'EPUB'
                      : 'ZIP';
                    selectedFileName = archiveCandidate.name;
                  }
                }
              } catch {
                // Continue to fallback formats
              } finally {
                clearTimeout(timeout);
              }
            }
          }

          // Priority 4: Derivative DjVuTXT (full OCR text) or any remaining HTML
          if (extractedText.length < 150 && djvuTxtFiles.length > 0) {
            const djvuText = await fetchFullTextFile(djvuTxtFiles[0], false);
            if (djvuText.length > extractedText.length) {
              extractedText = djvuText;
              selectedFormat = 'DjVuTXT';
              selectedFileName = djvuTxtFiles[0].name;
            }
          }

          if (extractedText.length < 150 && anyHtmlFiles.length > 0) {
            const htmlText = await fetchFullTextFile(anyHtmlFiles[0], true);
            if (htmlText.length > extractedText.length) {
              extractedText = htmlText;
              selectedFormat = 'HTML';
              selectedFileName = anyHtmlFiles[0].name;
            }
          }

          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              identifier: id,
              metadata: metaData?.metadata || {},
              extractedText: extractedText.slice(0, 8_000_000),
              fileFormat: selectedFormat,
              fileName: selectedFileName,
              isTruncated,
              archiveUrl: `https://archive.org/details/${id}`,
            })
          );
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              error: err instanceof Error ? err.message : 'Failed to fetch item metadata',
            })
          );
        }
      });

      server.middlewares.use('/api/archive/ao3-wayback', async (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        try {
          const urlObj = new URL(req.url || '', 'http://localhost:3000');
          const rawInput = (urlObj.searchParams.get('url') || '').trim();
          const idMatch = rawInput.match(/works\/(\d+)/i) || rawInput.match(/^(\d{2,12})$/);
          if (!idMatch) {
            res.statusCode = 400;
            res.end(
              JSON.stringify({
                error: 'Enter a valid archiveofourown.org/works/<ID> URL or numeric AO3 Work ID.',
              })
            );
            return;
          }

          const workId = idMatch[1];
          const cdxUrl = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(
            `archiveofourown.org/works/${workId}*`
          )}&output=json&fl=timestamp,original,statuscode,mimetype&filter=statuscode:200&filter=mimetype:text/html&collapse=urlkey&limit=80`;

          const cdxController = new AbortController();
          const cdxTimeout = setTimeout(() => cdxController.abort(), 16000);
          const cdxResp = await fetch(cdxUrl, {
            signal: cdxController.signal,
            headers: { 'User-Agent': 'AO3ModernFolioPWA/1.0' },
          });
          clearTimeout(cdxTimeout);

          if (!cdxResp.ok) {
            res.statusCode = 502;
            res.end(JSON.stringify({ error: `Wayback CDX API returned ${cdxResp.status}` }));
            return;
          }

          const rows = (await cdxResp.json()) as string[][];
          const entries = Array.isArray(rows) && rows.length > 1 ? rows.slice(1) : [];

          if (entries.length === 0) {
            res.statusCode = 404;
            res.end(
              JSON.stringify({
                error: `No archived Wayback snapshots found for AO3 work #${workId}. Download the HTML or EPUB directly from AO3 and import it below.`,
              })
            );
            return;
          }

          type CdxSnap = { timestamp: string; original: string };
          const snaps: CdxSnap[] = entries.map((r) => ({ timestamp: r[0], original: r[1] }));

          const fullWorkSnap =
            snaps.find((s) => /view_full_work=true/i.test(s.original)) ||
            snaps.find((s) => /\/works\/\d+(\?view_adult=true)?$/i.test(s.original));

          const formatTsDate = (ts: string) =>
            ts.length >= 8 ? `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}` : '';

          const fetchRawWaybackHtml = async (snap: CdxSnap): Promise<string> => {
            const c = new AbortController();
            const t = setTimeout(() => c.abort(), 18000);
            try {
              const r = await fetch(
                `https://web.archive.org/web/${snap.timestamp}id_/${snap.original}`,
                {
                  signal: c.signal,
                  headers: { 'User-Agent': 'AO3ModernFolioPWA/1.0' },
                }
              );
              return r.ok ? await r.text() : '';
            } finally {
              clearTimeout(t);
            }
          };

          const isBlockedOrLocked = (html: string) =>
            !html ||
            html.includes('This work is only available to registered users of the Archive') ||
            html.includes('Retry in a few moments');

          if (fullWorkSnap) {
            const html = await fetchRawWaybackHtml(fullWorkSnap);
            if (!isBlockedOrLocked(html) && html.includes('userstuff')) {
              res.end(
                JSON.stringify({
                  workId,
                  html,
                  waybackUrl: `https://web.archive.org/web/${fullWorkSnap.timestamp}/${fullWorkSnap.original}`,
                  snapshotDate: formatTsDate(fullWorkSnap.timestamp),
                  mode: /view_full_work=true/i.test(fullWorkSnap.original)
                    ? 'wayback_full_work'
                    : 'wayback_work_page',
                })
              );
              return;
            }
          }

          // Fallback: stitch individual archived chapter URLs if only chapter-by-chapter snapshots exist
          const chapterSnaps = snaps
            .filter((s) => new RegExp(`/works/${workId}/chapters/\\d+`, 'i').test(s.original))
            .slice(0, 25);

          if (chapterSnaps.length > 0) {
            const htmlChunks: string[] = [];
            let firstFullHtml = '';
            for (const chSnap of chapterSnaps) {
              const chHtml = await fetchRawWaybackHtml(chSnap);
              if (!isBlockedOrLocked(chHtml) && chHtml.includes('userstuff')) {
                if (!firstFullHtml) firstFullHtml = chHtml;
                const match = chHtml.match(/<div[^>]+id=["']chapters["'][^>]*>([\s\S]*?)<!--\/main-->/i) ||
                  chHtml.match(/<div[^>]+id=["']chapters["'][^>]*>([\s\S]*?)<\/div>\s*<!-- END work/i);
                if (match) {
                  htmlChunks.push(`<div class="chapter">${match[1]}</div>`);
                }
              }
            }
            if (firstFullHtml && htmlChunks.length > 0) {
              const mergedHtml = firstFullHtml.replace(
                /<div[^>]+id=["']chapters["'][^>]*>[\s\S]*$/i,
                `<div id="chapters">${htmlChunks.join('\n')}</div></body></html>`
              );
              res.end(
                JSON.stringify({
                  workId,
                  html: mergedHtml,
                  waybackUrl: `https://web.archive.org/web/${chapterSnaps[0].timestamp}/${chapterSnaps[0].original}`,
                  snapshotDate: formatTsDate(chapterSnaps[0].timestamp),
                  mode: `wayback_stitched_${htmlChunks.length}_chapters`,
                })
              );
              return;
            }
          }

          res.statusCode = 404;
          res.end(
            JSON.stringify({
              error: `Wayback snapshots for work #${workId} appear to be archive-locked or behind an adult interstitial. Please use AO3's Download -> HTML/EPUB button and drop the file below.`,
            })
          );
        } catch (err) {
          res.statusCode = 500;
          res.end(
            JSON.stringify({
              error: err instanceof Error ? err.message : 'Wayback AO3 lookup failed',
            })
          );
        }
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      internetArchiveAo3ScraperPlugin(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon.svg', 'reading-owl-mascot.png', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png', 'pwa-maskable-512x512.png'],
        manifest: {
          id: '/',
          name: 'Archive Mine Own',
          short_name: 'Mine Own',
          description: 'Archive Mine Own — Offline transformative works library, peer-to-peer Reading Room cache trading, and unique annotated bookmark editions.',
          theme_color: '#0C0C0E',
          background_color: '#0C0C0E',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,png,svg}'],
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /\/api\/archive\/.*/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'internet-archive-api-cache',
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 60 * 60 * 24 * 7,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
