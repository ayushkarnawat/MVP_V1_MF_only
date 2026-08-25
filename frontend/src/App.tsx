import { useState, useEffect } from "react";
import { AuthProvider, useAuth } from "./features/auth/AuthContext";
import { AuthEntryFlow } from "./features/auth/AuthEntryFlow";
import { OnboardingFlow } from "./features/auth/OnboardingFlow";
import { DashboardPlaceholder } from "./features/dashboard/DashboardPlaceholder";
import { MobileRoot } from "./mobile/MobileRoot";

function useIsMobileViewport(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < breakpoint;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches);
    };

    setIsMobile(mediaQuery.matches);

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handler);
      return () => mediaQuery.removeEventListener("change", handler);
    } else {
      mediaQuery.addListener(handler);
      return () => mediaQuery.removeListener(handler);
    }
  }, [breakpoint]);

  return isMobile;
}

function MainApp() {
  const { me, loading } = useAuth();
  const isMobileViewport = useIsMobileViewport(768);
  const isMobileRoute =
    typeof window !== "undefined" &&
    (window.location.pathname.startsWith("/mobile") ||
      window.location.hash.startsWith("#/mobile"));

  const isMobile = isMobileRoute || isMobileViewport;

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
          fontFamily: "var(--font-body)",
          color: "var(--color-text-secondary)",
        }}
      >
        <p>Loading Unifolio...</p>
      </div>
    );
  }

  if (!me) {
    return <AuthEntryFlow />;
  }

  if (!me.onboarding_completed) {
    return <OnboardingFlow isMobile={isMobile} />;
  }

  return isMobile ? <MobileRoot /> : <DashboardPlaceholder />;
}

function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}

export default App;
