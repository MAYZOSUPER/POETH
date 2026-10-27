import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

// Юнит-тесты чистого кода (src/shared, чистые ядра main/renderer) — без Electron.
// Запуск: `npm test`. Тесты лежат в tests/**, фикстуры — в tests/fixtures/**.
export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@renderer': resolve('src/renderer/src')
    }
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node'
  }
})
