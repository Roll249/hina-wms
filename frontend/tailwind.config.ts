import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Primary palette — Coral #FB7185 (đồng bộ với web e-comm)
        primary: {
          50:  "#fff1f3",
          100: "#ffe4e7",
          200: "#fecdd3",
          300: "#fda4af",
          400: "#fb7185",
          500: "#f43f5e",
          600: "#e11d48",
          700: "#be123c",
          800: "#9f1239",
          900: "#881337",
          950: "#4c0519",
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
