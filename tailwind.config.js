/** @type {import('tailwindcss').Config} */
const scale = (name) =>
  Object.fromEntries([50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((s) => [s, `rgb(var(--c-${name}-${s}) / <alpha-value>)`]));

export default {
  darkMode: 'class',
  content: ['./public/**/*.{html,js}'],
  theme: {
    extend: {
      // Los colores son variables CSS: en modo oscuro (.dark) cambian de valor
      // sin tener que escribir dark: en cada clase. Ver src/input.css.
      colors: {
        slate: scale('slate'),
        green: scale('green'),
        amber: scale('amber'),
        red: scale('red'),
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        'background-light': 'rgb(var(--c-background) / <alpha-value>)',
        primary: '#2b8cee',
        'spotify-green': '#1DB954',
        youtube: '#cc0000',
      },
      fontFamily: {
        display: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '1rem',
        lg: '2rem',
        xl: '3rem',
        full: '9999px',
      },
    },
  },
  plugins: [],
};
