import type { Config } from "tailwindcss";

// Palette is in OKLCH so lightness steps stay perceptually uniform and the
// neutrals tint subtly toward the brand hue (~295, violet). Chroma drops at
// the lightness extremes so the ramp doesn't look garish near black or
// white.
const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          50:  "oklch(0.978 0.003 295)",
          100: "oklch(0.945 0.004 295)",
          200: "oklch(0.875 0.005 295)",
          300: "oklch(0.795 0.007 295)",
          400: "oklch(0.690 0.009 295)",
          500: "oklch(0.585 0.011 295)",
          600: "oklch(0.470 0.011 295)",
          700: "oklch(0.320 0.009 295)",
          800: "oklch(0.215 0.006 295)",
          850: "oklch(0.180 0.005 295)",
          900: "oklch(0.140 0.004 295)",
          950: "oklch(0.105 0.003 295)",
        },
        signal: {
          DEFAULT: "oklch(0.74 0.17 295)",
          dim:     "oklch(0.48 0.14 295)",
          ghost:   "oklch(0.74 0.17 295 / 0.10)",
        },
        warn: {
          DEFAULT: "oklch(0.71 0.18 16)",
          dim:     "oklch(0.42 0.13 16)",
          ghost:   "oklch(0.71 0.18 16 / 0.10)",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
        display: [
          "var(--font-display)",
          "var(--font-geist-sans)",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
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
