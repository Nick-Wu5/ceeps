/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./public/**/*.html", "./public/**/*.js", "./*.html"],
  theme: {
    extend: {
      colors: {
        "ceeps-orange": "#FFA500",
        "ceeps-black": "#000000",
      },
      fontFamily: {
        sans: ["Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
};
