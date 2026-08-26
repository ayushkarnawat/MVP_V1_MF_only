import { useState, useEffect } from "react";
import { AuthProvider, useAuth } from "./features/auth/AuthContext";
import { AuthEntryFlow } from "./features/auth/AuthEntryFlow";
import { OnboardingFlow } from "./features/auth/OnboardingFlow";
import { DashboardPlaceholder } from "./features/dashboard/DashboardPlaceholder";
import { MobileRoot } from "./mobile/MobileRoot";
import { MobileLandingPage } from "./mobile/features/landing/MobileLandingPage";
import { UnifolioLogo } from "./components/UnifolioLogo";

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
  const [showMobileLanding, setShowMobileLanding] = useState(true);
  const [authInitialMode, setAuthInitialMode] = useState<"login" | "signup">("signup");
  const isMobileViewport = useIsMobileViewport(768);
  const isMobileRoute =
    typeof window !== "undefined" &&
    (window.location.pathname.startsWith("/mobile") ||
      window.location.hash.startsWith("#/mobile"));

  const isMobile = isMobileRoute || isMobileViewport;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[var(--color-bg)] text-[var(--color-text-secondary)] transition-colors duration-300">
        <UnifolioLogo className="h-9 mb-3 animate-pulse" />
        <p className="text-xs font-medium tracking-wide">Loading Unifolio…</p>
      </div>
    );
  }

  if (!me) {
    if (isMobile && showMobileLanding) {
      return (
        <MobileLandingPage
          onGetStarted={() => {
            setAuthInitialMode("signup");
            setShowMobileLanding(false);
          }}
          onLogin={() => {
            setAuthInitialMode("login");
            setShowMobileLanding(false);
          }}
        />
      );
    }
    return <AuthEntryFlow initialMode={authInitialMode} />;
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
