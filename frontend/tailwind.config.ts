import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#09090b",
          900: "#101013",
          850: "#16161a",
          800: "#1c1c21",
          700: "#27272d",
          600: "#3a3a42",
          500: "#5a5a64",
          400: "#8a8a94",
          300: "#b4b4bc",
          200: "#d8d8de",
          100: "#ededf0",
          50:  "#f7f7f8",
        },
        signal: {
          DEFAULT: "#34d399",
          dim: "#0d6b50",
          ghost: "rgba(52, 211, 153, 0.10)",
        },
        warn: {
          DEFAULT: "#fb7185",
          dim: "#7a2e3b",
          ghost: "rgba(251, 113, 133, 0.10)",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      letterSpacing: {
        tightest: "-0.04em",
      },
      boxShadow: {
        diffuse: "0 24px 60px -28px rgba(0,0,0,0.55)",
        ring: "inset 0 0 0 1px rgba(255,255,255,0.06)",
        "ring-strong": "inset 0 0 0 1px rgba(255,255,255,0.12)",
      },
      animation: {
        "pulse-soft": "pulseSoft 2.4s ease-in-out infinite",
        shimmer: "shimmer 2.2s linear infinite",
      },
      keyframes: {
        pulseSoft: {
          "0%, 100%": { opacity: "0.55" },
          "50%": { opacity: "1" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
