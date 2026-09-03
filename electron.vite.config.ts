import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const shared = resolve(__dirname, 'src/shared')

export default defineConfig({
  main: {
    // The MCP SDK and zod are bundled into host.js: the host runs unpacked, outside the asar.
    plugins: [externalizeDepsPlugin({ exclude: ['@modelcontextprotocol/sdk', 'zod'] })],
    resolve: {
      alias: {
        '@shared': shared,
        // The package's "module" field points at a file that does not exist; use the real ESM build.
        '@xterm/headless': resolve(__dirname, 'node_modules/@xterm/headless/lib-headless/xterm-headless.mjs')
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          host: resolve(__dirname, 'src/host/index.ts')
        },
        output: { entryFileNames: '[name].js' }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': shared } }
  },
  renderer: {
    plugins: [react()],
    resolve: {
      alias: {
        '@shared': shared,
        '@': resolve(__dirname, 'src/renderer/src')
      }
    }
  }
})
