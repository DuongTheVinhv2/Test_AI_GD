import { defineConfig, type Plugin } from 'vite';

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Put the script, the styles and the fonts inside index.html. A page opened from disk (double click) has no origin: Chrome
 * refuses module scripts, stylesheets marked crossorigin and fonts that live in other files, and the page stays blank.
 * One file has nothing to fetch, so it runs from a folder, a USB stick, a zip, or any static host alike.
 * The old .woff copies of the fonts are dropped; every current browser reads .woff2.
 */
function selfContained(): Plugin {
  return {
    name: 'self-contained-html',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const html = bundle['index.html'];
      if (!html || html.type !== 'asset') return;
      let page = String(html.source);
      for (const [name, file] of Object.entries(bundle)) {
        if (file.type === 'asset' && name.endsWith('.css')) {
          const css = String(file.source).replace(/,url\(data:font\/woff;base64,[A-Za-z0-9+/=]+\)\s*format\("woff"\)/g, '');
          page = page.replace(new RegExp(`<link[^>]*href="\\./${escapeRe(name)}"[^>]*>`), () => `<style>${css}</style>`);
          delete bundle[name];
        } else if (file.type === 'chunk' && file.isEntry) {
          const code = file.code.replace(/<\/script/gi, '<\\/script');
          page = page.replace(new RegExp(`<script[^>]*src="\\./${escapeRe(name)}"[^>]*></script>`), () => `<script type="module">${code}</script>`);
          delete bundle[name];
        }
      }
      html.source = page;
    },
  };
}

// Relative base so the production build can also sit in any sub-folder of a static host.
export default defineConfig({
  base: './',
  server: { host: '127.0.0.1', port: 5173 },
  plugins: [selfContained()],
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1400,
    // every font and image goes into the stylesheet as a data URL
    assetsInlineLimit: 100_000_000,
  },
});
