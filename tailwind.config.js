/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#0066cc',    // Strong blue
        secondary: '#3399ff',  // Light blue
        accent: '#004080',     // Dark blue
        background: '#ffffff', // Pure white
        text: '#000000',      // Black
        border: '#e6e6e6'     // Light gray
      }
    },
  },
  plugins: [],
}
