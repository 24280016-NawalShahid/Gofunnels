import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef4ff",
          100: "#d9e5ff",
          200: "#b3caff",
          300: "#82a8ff",
          400: "#5c86ff",
          500: "#3f63f5",
          600: "#2f49d1",
          700: "#2638a6",
          800: "#212f80",
          900: "#1c2a66",
        },
      },
    },
  },
  plugins: [],
};

export default config;
