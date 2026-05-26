import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#4361ee",
          hover: "#3a0ca3",
        },
        accent: "#7209b7",
        danger: "#e63946",
        success: "#4CAF50",
      },
      animation: {
        "spin-slow": "spin 1.5s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
