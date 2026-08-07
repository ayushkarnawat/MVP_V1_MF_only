import { useState, useEffect } from "react";
import { Button } from "../../components/Button";
import styles from "./NavigationShell.module.css";

export interface MemberOption {
  id: string;
  name: string;
}

export interface NavigationShellProps {
  viewMode: "aggregate" | "member";
  selectedMemberId: string | null;
  members: MemberOption[];
  onViewModeChange: (mode: "aggregate" | "member") => void;
  onMemberSelect: (memberId: string) => void;
  onAddData: () => void;
  children: React.ReactNode;
}

export function NavigationShell({
  viewMode,
  selectedMemberId,
  members,
  onViewModeChange,
  onMemberSelect,
  onAddData,
  children,
}: NavigationShellProps) {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    return (localStorage.getItem("unifolio_theme") as "light" | "dark") ||
      (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("unifolio_theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  const hasFamily = members.length > 1;

  return (
    <div className={styles.layoutContainer}>
      <header className={styles.header}>
        <div className={styles.leftSection}>
          <div className={styles.logoMark} aria-label="Unifolio Logo">
            <span className={styles.logoText}>Unifolio</span>
            <svg viewBox="0 0 100 100" className={styles.logoArcSvg}>
              <path
                d="M 50 10 A 40 40 0 0 1 90 50"
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth="14"
                strokeLinecap="round"
              />
            </svg>
          </div>

          <nav className={styles.navLinks}>
            <button
              className={`${styles.navItem} ${styles.activeNavItem}`}
              type="button"
            >
              Dashboard
            </button>
            <button
              className={`${styles.navItem} ${styles.disabledNavItem}`}
              type="button"
              disabled
              title="Analytics Dashboard — backend coming soon in PRD-04"
            >
              Analytics <span className={styles.soonBadge}>Soon</span>
            </button>
          </nav>
        </div>

        <div className={styles.rightSection}>
          {/* Member / Family View Switcher */}
          {hasFamily && (
            <div className={styles.viewToggleGroup}>
              <button
                className={`${styles.toggleBtn} ${
                  viewMode === "aggregate" ? styles.toggleActive : ""
                }`}
                onClick={() => onViewModeChange("aggregate")}
                type="button"
              >
                Family Combined
              </button>
              <button
                className={`${styles.toggleBtn} ${
                  viewMode === "member" ? styles.toggleActive : ""
                }`}
                onClick={() => onViewModeChange("member")}
                type="button"
              >
                Per Member
              </button>
            </div>
          )}

          {/* Member Dropdown Selector (when in member view) */}
          {viewMode === "member" && members.length > 0 && (
            <select
              value={selectedMemberId || ""}
              onChange={(e) => onMemberSelect(e.target.value)}
              className={styles.memberSelect}
              aria-label="Select household member"
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}

          {/* Add Data Action */}
          <Button variant="secondary" size="sm" onClick={onAddData}>
            + Add Data
          </Button>

          {/* Theme Toggle */}
          <button
            className={styles.themeToggleBtn}
            onClick={toggleTheme}
            title={`Switch to ${theme === "light" ? "Dark" : "Light"} mode`}
            type="button"
            aria-label="Toggle theme"
          >
            {theme === "light" ? "🌙" : "☀️"}
          </button>
        </div>
      </header>

      <main className={styles.mainContent}>{children}</main>
    </div>
  );
}
