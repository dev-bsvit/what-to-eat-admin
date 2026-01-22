/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#fff1e6',
          100: '#ffdec2',
          200: '#ffca9a',
          300: '#ffb671',
          400: '#ffa752',
          500: '#ff9833',
          600: '#ff902e',
          700: '#ff8527',
          800: '#ff7b20',
          900: '#ff6a14',
        },
        accent: {
          50: '#fff0f5',
          100: '#ffd9e6',
          200: '#ffc0d6',
          300: '#ffa6c6',
          400: '#ff93b9',
          500: '#ff80ad',
          600: '#ff78a6',
          700: '#ff6d9c',
          800: '#ff6393',
          900: '#ff5083',
        },
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
        'card-hover': '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        'card-dark': '0 10px 30px rgba(8, 7, 12, 0.4)',
      },
    },
  },
  plugins: [],
}
