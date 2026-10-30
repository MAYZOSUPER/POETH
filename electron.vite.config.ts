import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const sharedAlias = {
  '@shared': resolve('src/shared')
}

// main и preload: пакеты из dependencies не вшиваются в бандл (build.externalizeDeps, в electron-vite 5 включено
// по умолчанию; раньше — externalizeDepsPlugin()). electron-builder кладёт их в app.asar/node_modules.
export default defineConfig({
  main: {
    resolve: { alias: sharedAlias },
    build: {
      rollupOptions: {
        input: { index: resolve('src/main/index.ts') }
      }
    }
  },
  preload: {
    resolve: { alias: sharedAlias },
    build: {
      rollupOptions: {
        input: { index: resolve('src/preload/index.ts') }
      }
    }
  },
  renderer: {
    root: resolve('src/renderer'),
    resolve: {
      alias: {
        ...sharedAlias,
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        // multi-page: компаньон, игровой оверлей (S1), сайдбар трейд-окна (S5)
        input: {
          index: resolve('src/renderer/index.html'),
          overlay: resolve('src/renderer/overlay.html'),
          'trade-sidebar': resolve('src/renderer/trade-sidebar.html')
        }
      }
    }
  }
})
