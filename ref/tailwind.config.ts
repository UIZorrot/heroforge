import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // 极暗底色系统
        dark: {
          950: '#080808',
          900: '#0a0a0a',
          850: '#0f0f0f',
          800: '#121212',
        },
        // 克制的金色系统（降低饱和度）
        gold: {
          50: '#f5f1e8',
          100: '#e8dfc8',
          200: '#d4c5a0',
          300: '#b49664',
          400: '#9a7d4a',
          500: '#806838',
        },
        // 稀有度色系（哑光版本）
        rarity: {
          mythic: '#b49664',
          epic: '#8c64b4',
          rare: '#5078b4',
          common: '#787878',
        },
      },
      fontFamily: {
        display: ['Cinzel', 'serif'],
        mono: ['Orbitron', 'monospace'],
        body: ['Inter', 'sans-serif'],
      },
      letterSpacing: {
        'ultra-wide': '0.25em',
        'extra-wide': '0.15em',
      },
      borderWidth: {
        'hairline': '0.5px',
      },
      backgroundImage: {
        'metal-matte': 'linear-gradient(145deg, #0f0f0f 0%, #0a0a0a 100%)',
        'glass-matte': 'linear-gradient(135deg, rgba(12, 12, 12, 0.6) 0%, rgba(8, 8, 8, 0.8) 100%)',
      },
    },
  },
  plugins: [],
} satisfies Config;