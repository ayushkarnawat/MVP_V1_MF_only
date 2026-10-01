import { useEffect, useState } from "react";

// Scenario A night-stop window (Docs/2026-09-29-aws-staging-cost-analysis-and-
// reduction-plan.md §4/§7/§8): backend/RDS/NAT are stopped 9PM-5AM IST. Without
// this banner a user hitting the window just sees a generic connection error.
// Computed in IST regardless of the viewer's own timezone/locale -- not tied to
// backend reachability, so it still renders when the backend is down.
export function isWithinMaintenanceWindow(date: Date): boolean {
  const istHour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kolkata",
      hourCycle: "h23",
      hour: "numeric",
    }).format(date)
  );
  return istHour >= 21 || istHour < 5;
}

export function MaintenanceBanner() {
  const [visible, setVisible] = useState(() => isWithinMaintenanceWindow(new Date()));

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(isWithinMaintenanceWindow(new Date()));
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      className="w-full bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200 text-xs sm:text-sm font-medium text-center py-2 px-4"
    >
      Scheduled maintenance 9 PM–5 AM IST — the app may be briefly unreachable during this window.
    </div>
  );
}
