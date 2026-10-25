/** @type {import('tailwindcss').Config} */
export default {
  content: ['./public/**/*.{html,js}'],
  theme: {
    extend: {
      colors: {
        primary: '#2b8cee',
        'background-light': '#f6f7f8',
        'spotify-green': '#1DB954',
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
