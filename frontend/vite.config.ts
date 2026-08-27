import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import svgr from 'vite-plugin-svgr'
import { visualizer } from 'rollup-plugin-visualizer'
import pkg from './package.json'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isAnalyze = mode === 'analyze'

  return {
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version || '1.0.0'),
    },
    plugins: [
      react(),
      tailwindcss(),
      svgr(),
      isAnalyze &&
        visualizer({
          filename: 'reports/bundle-report.html',
          open: false,
          gzipSize: true,
          brotliSize: true,
          template: 'treemap',
        }),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": "/src",
      },
    },
  }
})
