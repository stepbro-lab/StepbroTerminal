import { resolve } from 'node:path'
import { bytecodePlugin, defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const shared = resolve(__dirname, 'src/shared')

export default defineConfig({
  main: {
    // The MCP SDK and zod are bundled into host.js: the host runs unpacked, outside the asar.
    // Main, host and the chunk they share ship as V8 bytecode, not as readable JavaScript.
    plugins: [externalizeDepsPlugin({ exclude: ['@modelcontextprotocol/sdk', 'zod'] }), bytecodePlugin()],
    resolve: {
      alias: {
        '@shared': shared,
        // The package's "module" field points at a file that does not exist; use the real ESM build.
        '@xterm/headless': resolve(__dirname, 'node_modules/@xterm/headless/lib-headless/xterm-headless.mjs')
      }
    },
    // Class fields become constructor assignments, which the bytecode plugin's arrow-function
    // rewrite can handle. Node in Electron runs the result just the same.
    esbuild: { supported: { 'class-field': false, 'class-static-field': false, 'class-private-field': false } },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          host: resolve(__dirname, 'src/host/index.ts')
        },
        output: {
          entryFileNames: '[name].js',
          // One named chunk for what main and host share, so the bytecode plugin can compile it too.
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
