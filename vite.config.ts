import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildSync } from 'esbuild';
import { defineConfig } from 'vite';

function copyExtensionManifest() {
  return {
    name: 'copy-extension-manifest',
    writeBundle() {
      const distManifestPath = resolve(__dirname, 'dist/manifest.json');
      mkdirSync(dirname(distManifestPath), { recursive: true });
      copyFileSync(resolve(__dirname, 'manifest.json'), distManifestPath);
    }
  };
}

function copyExtensionIcons() {
  return {
    name: 'copy-extension-icons',
    writeBundle() {
      const sourceDir = resolve(__dirname, 'icons');
      const targetDir = resolve(__dirname, 'dist/icons');
      mkdirSync(targetDir, { recursive: true });

      for (const file of readdirSync(sourceDir)) {
        copyFileSync(resolve(sourceDir, file), resolve(targetDir, file));
      }
    }
  };
}

function bundleProgrammaticContentScript() {
  return {
    name: 'bundle-programmatic-content-script',
    writeBundle() {
      buildSync({
        entryPoints: [resolve(__dirname, 'src/content/content-script.ts')],
        outfile: resolve(__dirname, 'dist/assets/content.js'),
        bundle: true,
        format: 'iife',
        target: 'es2022',
        platform: 'browser'
      });
    }
  };
}

export default defineConfig({
  base: './',
  plugins: [copyExtensionManifest(), copyExtensionIcons(), bundleProgrammaticContentScript()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/index.html'),
        offscreen: resolve(__dirname, 'src/offscreen/index.html'),
        background: resolve(__dirname, 'src/background/service-worker.ts'),
        content: resolve(__dirname, 'src/content/content-script.ts')
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
        manualChunks: undefined
      }
    }
  }
});
