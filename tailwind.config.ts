import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      width: {
        '70': '280px', // Custom width for sidebar
      },
      colors: {
        // ── New design-system neutrals ──
        'bg-base': '#151615',
        'surface-1': '#1f201f',
        'surface-2': '#242624',
        'stroke-subtle': 'rgba(255,255,255,0.08)',
        'stroke-strong': 'rgba(255,255,255,0.14)',
        'text-primary': 'rgba(255,255,255,0.92)',
        'text-secondary': 'rgba(255,255,255,0.62)',
        'text-muted': 'rgba(255,255,255,0.45)',
        'icon': 'rgba(255,255,255,0.72)',
        // ── Brand / accent ──
        'brand-primary': '#44af21',
        'brand-secondary': '#00c356',
        'brand-tertiary': '#3a6fe3',
        'success': '#00e16e',
        'warning': '#ffa500',
        'danger': '#ff4444',
        // ── Status (unchanged) ──
        status: {
          online: '#44af21',
          charging: '#00c356',
          discharging: '#00e16e',
          offline: '#666666',
          error: '#ff4444',
          warning: '#ffa500',
        },
        // ── Deprecated (kept temporarily for backward-compat) ──
        'primary-black': '#000000',
        'primary-dark': '#2b2b2b',
        'accent-green': '#44af21',
        'accent-green-secondary': '#00c356',
        'accent-green-light': '#00e16e',
        'accent-blue': '#3a6fe3',
        'accent-gray': '#ebebeb',
        primary: {
          black: '#000000',
          dark: '#2b2b2b',
        },
        accent: {
          green: '#44af21',
          'green-secondary': '#00c356',
          'green-light': '#00e16e',
          blue: '#3a6fe3',
          gray: '#ebebeb',
        },
      },
      borderRadius: {
        'card': '18px',
        'pill': '999px',
        'inner': '12px',
      },
      boxShadow: {
        'card': '0 10px 30px rgba(0,0,0,0.35)',
        'card-hover': '0 14px 40px rgba(0,0,0,0.45)',
      },
      screens: {
        'xs': '480px',
        'sm': '640px',
        'md': '768px',
        'lg': '1024px',
        'xl': '1280px',
        '2xl': '1536px',
      },
      fontFamily: {
        'neue-montreal': ['var(--font-neue-montreal)', 'Inter', 'SF Pro Text', 'Segoe UI', 'Roboto', 'system-ui', 'sans-serif'],
        sans: ['var(--font-neue-montreal)', 'Inter', 'SF Pro Text', 'Segoe UI', 'Roboto', 'system-ui', 'sans-serif'],
        // Deprecated
        inter: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'metric': ['2.75rem', { lineHeight: '1', letterSpacing: '-0.02em', fontWeight: '500' }],
        'page-title': ['2.125rem', { lineHeight: '1.2', letterSpacing: '-0.01em', fontWeight: '500' }],
        'section-title': ['1rem', { lineHeight: '1.4', fontWeight: '500' }],
      },
      spacing: {
        'safe-top': 'env(safe-area-inset-top)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-left': 'env(safe-area-inset-left)',
        'safe-right': 'env(safe-area-inset-right)',
      },
      transitionTimingFunction: {
        'dashboard': 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      },
      animation: {
        'pulse-green': 'pulse-green 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        'pulse-green': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
}

export default config