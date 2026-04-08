/** @type {import('tailwindcss').Config} */
export default {
    content: [
      "./src/app/**/*.{js,ts,jsx,tsx}",
      "./src/components/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
      extend: {
        gridTemplateColumns: {
          15: "repeat(15, minmax(0, 1fr))",
        },
        gridTemplateRows: {
          15: "repeat(15, minmax(0, 1fr))",
        },
      },
    },
    plugins: [],
  };