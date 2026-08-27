import { useState, useEffect } from "react";
import { AuthProvider, useAuth } from "./features/auth/AuthContext";
import { AuthEntryFlow } from "./features/auth/AuthEntryFlow";
import { OnboardingFlow } from "./features/auth/OnboardingFlow";
import { DashboardPlaceholder } from "./features/dashboard/DashboardPlaceholder";
import { MobileRoot } from "./mobile/MobileRoot";
import { MobileLandingPage } from "./mobile/features/landing/MobileLandingPage";
import { MobileJourneyContext } from "./features/auth/mobileJourneyContext";
import type { MobileJourneyStep } from "./features/auth/mobileJourneyContext";

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

function MobileInitialFlow({ authInitialMode }: { authInitialMode: "login" | "signup" }) {
  const { me } = useAuth();
  const [journeyStep, setJourneyStep] = useState<MobileJourneyStep>("auth_landing");

  return (
    <MobileJourneyContext.Provider value={{ activeStep: journeyStep, setJourneyStep }}>
      <div className="relative w-full min-h-dvh h-dvh max-h-dvh overflow-x-hidden overflow-y-auto bg-[#F8FAF9] dark:bg-[var(--color-bg)]">
        {/* Foreground Content Card with physics-based fluid transition */}
        <div className="relative z-10 w-full min-h-full flex flex-col">
          {!me ? (
            <AuthEntryFlow initialMode={authInitialMode} />
          ) : (
            <OnboardingFlow isMobile={true} />
          )}
        </div>
      </div>
    </MobileJourneyContext.Provider>
  );
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
        <div className="h-7 w-7 rounded-full border-2 border-[#22C55E] border-t-transparent animate-spin mb-3" />
        <p className="text-xs font-medium tracking-wide">Loading Unifolio…</p>
      </div>
    );
  }

  // 1. Mobile Initial Flow (Landing -> Auth -> Onboarding) with persistent roadmap background
  if (isMobile) {
    if (showMobileLanding && !me) {
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

    if (!me || !me.onboarding_completed) {
      return <MobileInitialFlow authInitialMode={authInitialMode} />;
    }

    return <MobileRoot />;
  }

  // 2. Desktop Web Initial Flow (Untouched)
  if (!me) {
    return <AuthEntryFlow initialMode={authInitialMode} />;
  }

  if (!me.onboarding_completed) {
    return <OnboardingFlow isMobile={false} />;
  }

  return <DashboardPlaceholder />;
}

function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}

export default App;
