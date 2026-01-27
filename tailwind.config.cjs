/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './devtools.html',
    './devtools-panel.html',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: '#1e2a32',
        haze: '#f7f2e9',
        mist: '#e9f0f7',
        clay: '#9a4b1e',
      },
    },
  },
  plugins: [],
}
