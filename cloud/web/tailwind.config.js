/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // "Aetheris Automotive" tokens, mirrored from the Android app's colors.xml so the
        // web app reads as the same product - see cloud/DESIGN.md §11.
        bg: "#0A0A0A",
        surface: "rgba(25,25,25,0.6)",
        "surface-border": "rgba(255,255,255,0.1)",
        onsurface: "#E5E2E1",
        "onsurface-variant": "#BCC8D1",
        accent: "#00BFFF",
        "accent-soft": "#8FD6FF",
        good: "#2E7D32",
        warn: "#FB8C00",
        bad: "#C62828",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
