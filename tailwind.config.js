/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#C4622D',
          light: '#F5D4C1',
          dark: '#A04E22',
          hover: '#E8956D',
        },
        accent: {
          DEFAULT: '#E8956D',
          light: '#F5D4C1',
        },
        blush: '#F5D4C1',
        cream: '#FDF6F0',
        espresso: '#2C1810',
        forest: {
          DEFAULT: '#2D7A4F',
          light: 'rgba(45, 122, 79, 0.12)',
        },
        ruby: {
          DEFAULT: '#C0392B',
          light: 'rgba(192, 57, 43, 0.12)',
        },
        warm: {
          muted: 'rgba(44, 24, 16, 0.45)',
          border: 'rgba(196, 98, 45, 0.15)',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'SF Mono', 'monospace'],
      },
      borderRadius: {
        card: '16px',
        modal: '24px',
      },
      boxShadow: {
        warm: '0 4px 24px rgba(196, 98, 45, 0.08)',
        'warm-lg': '0 8px 32px rgba(196, 98, 45, 0.12)',
      },
      maxWidth: {
        content: '1200px',
      },
    },
  },
  plugins: [],
};
