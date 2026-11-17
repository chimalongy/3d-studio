/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: { extend: { colors: { studio: { 950: "#090d18", 900: "#101728", 800: "#182238", 700: "#26334d", 500: "#8796b4", 100: "#e8edf7" } } } },
  plugins: []
};