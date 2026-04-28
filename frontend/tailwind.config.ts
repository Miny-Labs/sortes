import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#0b0d12",
          card: "#13161e",
          hover: "#1a1e29",
        },
        border: {
          DEFAULT: "#252a35",
        },
        accent: {
          DEFAULT: "#7c5cff",
          glow: "#9d83ff",
        },
        success: "#22c55e",
        danger: "#ef4444",
        muted: "#8a92a6",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
