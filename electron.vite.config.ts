import { resolve } from 'node:path'
import { bytecodePlugin, defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const shared = resolve(__dirname, 'src/shared')

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['@modelcontextprotocol/sdk', 'zod'] }), bytecodePlugin()],
    resolve: {
      alias: {
        '@shared': shared,
        '@xterm/headless': resolve(__dirname, 'node_modules/@xterm/headless/lib-headless/xterm-headless.mjs')
      }
    },
    // The bytecode plugin only handles arrow functions assigned in constructors.
    esbuild: { supported: { 'class-field': false, 'class-static-field': false, 'class-private-field': false } },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          host: resolve(__dirname, 'src/host/index.ts')
        },
        output: {
          entryFileNames: '[name].js',
          manualChunks: (id) => (id.replace(/\\/g, '/').includes('/src/shared/') ? 'shared' : undefined)
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin(), bytecodePlugin()],
    resolve: { alias: { '@shared': shared } },
    esbuild: { supported: { 'class-field': false, 'class-static-field': false, 'class-private-field': false } }
  },
  renderer: {
    plugins: [react()],
    build: { minify: 'esbuild', sourcemap: false },
    resolve: {
      alias: {
        '@shared': shared,
        '@': resolve(__dirname, 'src/renderer/src')
      }
    }
  }
})
