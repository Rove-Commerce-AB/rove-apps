// tailwind.config.ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          signal: "var(--color-brand-signal)",
          lilac: "var(--color-brand-lilac)",
          blue: "var(--color-brand-blue)",
        },
        surface: {
          page: "var(--color-surface-page)",
          DEFAULT: "var(--color-surface-default)",
          subtle: "var(--color-surface-subtle)",
          raised: "var(--color-surface-raised)",
          sunken: "var(--color-surface-sunken)",
          inverse: "var(--color-surface-inverse)",
        },
        accent: {
          1: "var(--color-accent-1)",
          2: "var(--color-accent-2)",
          3: "var(--color-accent-3)",
          4: "var(--color-accent-4)",
          primary: "var(--color-accent-primary)",
          "primary-hover": "var(--color-accent-primary-hover)",
          "primary-active": "var(--color-accent-primary-active)",
          "primary-subtle": "var(--color-accent-primary-subtle)",
          "primary-text": "var(--color-accent-primary-text)",
          focus: "var(--color-accent-focus)",
        },
        interactive: {
          primary: "var(--color-interactive-primary)",
          "primary-hover": "var(--color-interactive-primary-hover)",
          "primary-active": "var(--color-interactive-primary-active)",
          "primary-subtle": "var(--color-interactive-primary-subtle)",
          secondary: "var(--color-interactive-secondary)",
          "secondary-hover": "var(--color-interactive-secondary-hover)",
        },
        status: {
          info: "var(--color-status-info)",
          "info-subtle": "var(--color-status-info-subtle)",
          success: "var(--color-status-success)",
          "success-subtle": "var(--color-status-success-subtle)",
          warning: "var(--color-status-warning)",
          "warning-subtle": "var(--color-status-warning-subtle)",
          danger: "var(--color-status-danger)",
          "danger-subtle": "var(--color-status-danger-subtle)",
        },
        customer: {
          DEFAULT: "var(--color-customer-default)",
        },
        bg: {
          DEFAULT: "var(--color-bg-default)",
          page: "var(--color-bg-page)",
          muted: "var(--color-bg-muted)",
          panel: "var(--panel-bg)",
        },
        text: {
          primary: "var(--color-text-primary)",
          secondary: "var(--color-text-secondary)",
          tertiary: "var(--color-text-tertiary)",
          inverse: "var(--color-text-inverse)",
          muted: "var(--color-text-muted)",
          link: "var(--color-text-link)",
        },
        border: {
          DEFAULT: "var(--color-border-default)",
          subtle: "var(--color-border-subtle)",
          form: "var(--color-border-form)",
        },
        grid: {
          DEFAULT: "var(--color-grid-border)",
          light: "var(--color-grid-border-light)",
          row: "var(--color-grid-row)",
          subtle: "var(--color-grid-border-subtle)",
          "light-subtle": "var(--color-grid-border-light-subtle)",
        },
        danger: {
          DEFAULT: "var(--color-danger)",
        },
        success: {
          DEFAULT: "var(--color-success)",
        },
        warning: {
          DEFAULT: "var(--color-warning)",
        },
        nav: {
          active: "var(--color-nav-active)",
          "active-accent": "var(--color-nav-active-accent)",
          hover: "var(--color-nav-hover)",
        },
        app: {
          planner: "var(--color-app-planner)",
          "planner-subtle": "var(--color-app-planner-subtle)",
          work: "var(--color-app-work)",
          "work-subtle": "var(--color-app-work-subtle)",
          "time-report": "var(--color-app-time-report)",
          "time-report-subtle": "var(--color-app-time-report-subtle)",
          support: "var(--color-app-support)",
          "support-subtle": "var(--color-app-support-subtle)",
          insights: "var(--color-app-insights)",
          "insights-subtle": "var(--color-app-insights-subtle)",
        },
        table: {
          header: "var(--color-table-header)",
        },
      },
      fontFamily: {
        primary: ["var(--font-primary)"],
        secondary: ["var(--font-secondary)"],
      },
      borderRadius: {
        DEFAULT: "var(--radius)",
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        "2xl": "var(--radius-2xl)",
        full: "var(--radius-full)",
        panel: "var(--radius-panel)",
      },
      boxShadow: {
        xs: "var(--shadow-xs)",
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        xl: "var(--shadow-xl)",
        primary: "var(--shadow-primary)",
        "panel-header": "var(--panel-header-shadow)",
      },
      keyframes: {
        "loading-bar": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(400%)" },
        },
      },
      animation: {
        "loading-bar": "loading-bar 1.5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
