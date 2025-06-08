import { defineConfig, transformWithEsbuild } from 'vite'
import path from 'path'

import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  esbuild: {
    loader: 'jsx',
    include: /\.(js|ts)$/,
  },
  plugins: [
    {
      name: 'treat-js-files-as-jsx',
      async transform(code, id) {
        if (!/src\/.*\.js$/.test(id)) return null
        return transformWithEsbuild(code, id, {
          loader: 'jsx',      // parse as JSX
          jsx: 'automatic',   // or 'transform' if you want classic runtime
        })
      },
    },
    react({
      jsxRuntime: 'automatic',
    }),
    tailwindcss(),
  ],
  optimizeDeps: {
    force: true,
    esbuildOptions: {
      loader: {
        '.js': 'jsx',
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})