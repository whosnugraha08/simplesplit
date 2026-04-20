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
          DEFAULT: '#f59e0b',
          light: 'rgba(245, 158, 11, 0.15)',
          dark: '#d97706',
        },
        surface: 'rgba(255, 255, 255, 0.05)',
        page: '#0a0a12',
        'text-primary': '#f1f5f9',
        'text-secondary': 'rgba(255, 255, 255, 0.55)',
        'text-muted': 'rgba(255, 255, 255, 0.3)',
        border: {
          DEFAULT: 'rgba(255, 255, 255, 0.08)',
          light: 'rgba(255, 255, 255, 0.04)',
        },
        success: {
          DEFAULT: '#22c55e',
          light: 'rgba(34, 197, 94, 0.12)',
        },
        warning: {
          DEFAULT: '#f59e0b',
          light: 'rgba(245, 158, 11, 0.12)',
        },
        danger: {
          DEFAULT: '#ef4444',
          light: 'rgba(239, 68, 68, 0.12)',
        },
        // Dark glass
        glass: {
          DEFAULT: 'rgba(255, 255, 255, 0.04)',
          hover: 'rgba(255, 255, 255, 0.08)',
          active: 'rgba(255, 255, 255, 0.12)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'Fira Code', 'monospace'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
};
