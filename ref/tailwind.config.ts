/** @type {import('tailwindcss').Config} */
export default {
    content: [
      "./index.html",
      "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
      extend: {
        colors: {
          dark: {
            base: '#0A0A0C',
            elevated: '#111318',
            surface: '#171A21',
            border: '#2A2D35',
          },
          accent: {
            gold: '#EAB308',
            'gold-light': '#FACC15',
            arcane: '#7C3AED',
            danger: '#EF4444',
            heal: '#22C55E',
            'arcane-glow': 'rgba(124, 58, 237, 0.3)',
            'gold-glow': 'rgba(234, 179, 8, 0.3)',
          },
          rarity: {
            common: '#9CA3AF',
            rare: '#3B82F6',
            epic: '#A855F7',
            mythic: '#F59E0B',
          }
        },
        fontFamily: {
          display: ['Cinzel', 'serif'],
          mono: ['Orbitron', 'monospace'],
          body: ['Inter', 'sans-serif'],
        },
        boxShadow: {
          'card': '0 4px 20px rgba(0, 0, 0, 0.5)',
          'card-hover': '0 8px 32px rgba(234, 179, 8, 0.3)',
          'glow-gold': '0 0 20px rgba(234, 179, 8, 0.5)',
          'glow-arcane': '0 0 20px rgba(124, 58, 237, 0.5)',
          'inner-glow': 'inset 0 0 20px rgba(234, 179, 8, 0.2)',
        },
        animation: {
          'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
          'float': 'float 3s ease-in-out infinite',
          'glow': 'glow 2s ease-in-out infinite',
        },
        keyframes: {
          float: {
            '0%, 100%': { transform: 'translateY(0px)' },
            '50%': { transform: 'translateY(-10px)' },
          },
          glow: {
            '0%, 100%': { opacity: '1' },
            '50%': { opacity: '0.5' },
          },
        },
      },
    },
    plugins: [],
  }