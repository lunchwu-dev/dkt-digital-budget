import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * 让构建产物可以在 file:// 协议下直接双击打开。
 * Vite 默认产出 type="module"，file:// 下会被 CORS 拦死，必须剥掉。
 */
function offlineFriendlyHtml() {
  return {
    name: 'offline-friendly-html',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler: (html) =>
        html
          .replace(/<script type="module" crossorigin([^>]*)>/g, '<script defer$1>')
          .replace(/<script type="module"([^>]*)>/g, '<script$1>')
          .replace(/ crossorigin(?=[\s>])/g, '')
    }
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), offlineFriendlyHtml()],
  build: {
    target: 'es2018',
    cssCodeSplit: false,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'assets/app.js',
        assetFileNames: 'assets/[name][extname]'
      }
    }
  }
});
