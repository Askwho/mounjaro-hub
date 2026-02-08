/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans Variable"', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50:  '#effef7',
          100: '#d9ffed',
          200: '#b5fddc',
          300: '#7cf9c2',
          400: '#3ceca0',
          500: '#14d482',
          600: '#09b068',
          700: '#0b8a55',
          800: '#0f6d46',
          900: '#0e593b',
          950: '#01331f',
        },
      },
      keyframes: {
        'modal-enter': {
          '0%': { opacity: '0', transform: 'scale(0.95) translateY(8px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        'backdrop-enter': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'toast-in': {
          '0%': { opacity: '0', transform: 'translateY(-8px) scale(0.96)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      animation: {
        'modal-enter': 'modal-enter 0.2s ease-out',
        'backdrop-enter': 'backdrop-enter 0.15s ease-out',
        'slide-up': 'slide-up 0.25s ease-out',
        'toast-in': 'toast-in 0.2s ease-out',
      },
    },
  },
  plugins: [],
}
