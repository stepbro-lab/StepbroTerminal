import type { Config } from 'tailwindcss'

export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        sidebar: 'var(--bg-sidebar)',
        card: 'var(--bg-card)',
        hover: 'var(--bg-hover)',
        active: 'var(--bg-active)',
        fg: 'var(--text)',
        muted: 'var(--text-muted)',
        line: 'var(--border)',
        accent: 'var(--accent)',
        attention: 'var(--attention)',
        danger: 'var(--danger)'
      },
      fontFamily: {
        ui: 'var(--font-ui)',
        mono: 'var(--font-mono)'
      },
      borderRadius: {
        card: 'var(--radius-card)',
        row: 'var(--radius-row)'
      }
    }
  },
  plugins: []
} satisfies Config
