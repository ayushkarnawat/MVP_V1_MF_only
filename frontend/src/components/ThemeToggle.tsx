import { useState, useEffect } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import styles from "./ThemeToggle.module.css";

export interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const stored = localStorage.getItem("unifolio_theme");
    if (stored === "light" || stored === "dark") return stored;
    return "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    const handleSync = () => {
      const stored = localStorage.getItem("unifolio_theme");
      if (stored === "light" || stored === "dark") {
        setTheme(stored);
      }
    };
    window.addEventListener("storage", handleSync);
    window.addEventListener("unifolio_theme_change", handleSync);
    return () => {
      window.removeEventListener("storage", handleSync);
      window.removeEventListener("unifolio_theme_change", handleSync);
    };
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
    localStorage.setItem("unifolio_theme", nextTheme);
    window.dispatchEvent(new Event("unifolio_theme_change"));
  };

  return (
    <button
      className={cn(styles.themeToggleBtn, className)}
      onClick={toggleTheme}
      title={`Switch to ${theme === "light" ? "Dark" : "Light"} mode`}
      aria-label="Toggle theme"
      type="button"
    >
      {theme === "light" ? (
        <Moon className="h-4 w-4 text-[var(--color-text-secondary)]" />
      ) : (
        <Sun className="h-4 w-4 text-[var(--color-accent)]" />
      )}
    </button>
  );
}
