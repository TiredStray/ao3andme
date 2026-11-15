import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Vite server middleware plugin that scrapes the Internet Archive (archive.org)
 * for historical AO3 / fanfiction works and full text metadata.
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
          const timeout = setTimeout(() => controller.abort(), 6500);

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

          const metaUrl = `https://archive.org/metadata/${encodeURIComponent(id)}`;
          const metaResp = await fetch(metaUrl);
          const metaData = await metaResp.json();

          // Locate a readable .txt or .html file inside the Internet Archive item if available
          const files: Array<{ name: string; format?: string; size?: string }> = metaData?.files || [];
          const textFile = files.find(
            (f) =>
              f.name &&
              (f.name.endsWith('_djvu.txt') ||
                f.name.endsWith('.txt') ||
                f.format === 'DjVuTXT' ||
                f.format === 'Text') &&
              !f.name.includes('_files.xml') &&
              !f.name.includes('_meta.txt')
          );

          let extractedText = '';
          if (textFile) {
            try {
              const txtUrl = `https://archive.org/download/${encodeURIComponent(id)}/${encodeURIComponent(
                textFile.name
              )}`;
              const txtResp = await fetch(txtUrl, {
                headers: { Range: 'bytes=0-28000' },
              });
              if (txtResp.ok) {
                extractedText = await txtResp.text();
              }
            } catch {
              // Ignore text stream error and use metadata description
            }
          }

          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              identifier: id,
              metadata: metaData?.metadata || {},
              extractedText: extractedText.slice(0, 24000),
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
        includeAssets: ['icon.svg', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png', 'pwa-maskable-512x512.png'],
        manifest: {
          id: '/',
          name: 'Archive of Our Own — Modern Folio PWA',
          short_name: 'AO3 Folio',
          description: 'Modern dark-mode Archive of Our Own (AO3) PWA with offline tag filtering, cloud-synced bookmarks, and author version control.',
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
