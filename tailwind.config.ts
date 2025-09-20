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
        // EcoFlow Brand Colors
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
        // Additional semantic colors
        status: {
          online: '#44af21',
          charging: '#00c356',
          discharging: '#00e16e',
          offline: '#666666',
          error: '#ff4444',
          warning: '#ffa500',
        }
      },
      fontFamily: {
        inter: ['Inter', 'system-ui', 'sans-serif'],
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