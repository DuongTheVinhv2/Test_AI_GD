import { defineConfig, type Plugin } from 'vite';

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Same idea as vite.designer.config.ts: one self-contained analytics.html that also opens by double click. */
function selfContained(page: string): Plugin {
  return {
    name: 'self-contained-analytics',
    apply: 'build',
    enforce: 'post',
    generateBundle(_o, bundle) {
      const html = bundle[page];
      if (!html || html.type !== 'asset') return;
      let out = String(html.source);
      for (const [name, file] of Object.entries(bundle)) {
        if (file.type === 'asset' && name.endsWith('.css')) {
          out = out.replace(new RegExp(`<link[^>]*href="\\./${escapeRe(name)}"[^>]*>`), () => `<style>${file.source}</style>`);
          delete bundle[name];
        } else if (file.type === 'chunk' && file.isEntry) {
          const code = file.code.replace(/<\/script/gi, '<\\/script');
          out = out.replace(new RegExp(`<script[^>]*src="\\./${escapeRe(name)}"[^>]*></script>`), () => `<script type="module">${code}</script>`);
          delete bundle[name];
        }
      }
      html.source = out;
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [selfContained('analytics.html')],
  build: {
    target: 'es2022',
    outDir: 'dist-analytics',
    emptyOutDir: true,
    sourcemap: false,
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 4000,
    rollupOptions: { input: 'analytics.html' },
  },
});
