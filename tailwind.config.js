/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        body: ['"DM Sans"', 'sans-serif'],
        mono: ['"DM Mono"', 'monospace'],
      },
      colors: {
        slate: {
          850: '#162032',
          950: '#0a1120',
        },
        gold: {
          300: '#fcd97d',
          400: '#f7c34a',
          500: '#e8a800',
          600: '#c48a00',
        },
        emerald: {
          350: '#3ecf8e',
        }
      },
    },
  },
  plugins: [],
}
