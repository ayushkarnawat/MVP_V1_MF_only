/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class", '[data-theme="dark"]'],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "var(--color-border)",
        input: "var(--color-border)",
        ring: "var(--color-accent)",
        background: "var(--color-bg)",
        foreground: "var(--color-ink)",
        primary: {
          DEFAULT: "var(--color-accent)",
          foreground: "#FFFFFF",
        },
        secondary: {
          DEFAULT: "var(--color-surface)",
          foreground: "var(--color-ink)",
        },
        destructive: {
          DEFAULT: "var(--color-negative)",
          foreground: "#FFFFFF",
        },
        muted: {
          DEFAULT: "var(--color-bg)",
          foreground: "var(--color-text-secondary)",
        },
        accent: {
          DEFAULT: "var(--color-accent)",
          foreground: "#FFFFFF",
        },
        popover: {
          DEFAULT: "var(--color-surface)",
          foreground: "var(--color-ink)",
        },
        card: {
          DEFAULT: "var(--color-surface)",
          foreground: "var(--color-ink)",
        },
        /* Direct Unifolio Design Schema Tokens */
        unifolio: {
          bg: "var(--color-bg)",
          ink: "var(--color-ink)",
          surface: "var(--color-surface)",
          border: "var(--color-border)",
          secondary: "var(--color-text-secondary)",
          accent: "var(--color-accent)",
          positive: "var(--color-positive)",
          negative: "var(--color-negative)",
          neutral: "var(--color-neutral-badge)",
          warning: "var(--color-warning)",
        },
      },
      borderRadius: {
        lg: "var(--radius-lg, 20px)",
        md: "var(--radius-md, 12px)",
        sm: "var(--radius-sm, 8px)",
      },
      fontFamily: {
        sans: ["Manrope", "system-ui", "-apple-system", "sans-serif"],
        display: ["DM Sans", "system-ui", "-apple-system", "sans-serif"],
        heading: ["DM Sans", "system-ui", "-apple-system", "sans-serif"],
        body: ["Manrope", "system-ui", "-apple-system", "sans-serif"],
        serif: ["Instrument Serif", "Newsreader", "Playfair Display", "Georgia", "serif"],
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
      },
      transitionDuration: {
        fast: "150ms",
        reveal: "400ms",
        page: "300ms",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
