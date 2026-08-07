import { AuthProvider, useAuth } from "./features/auth/AuthContext";
import { AuthEntryFlow } from "./features/auth/AuthEntryFlow";
import { OnboardingFlow } from "./features/auth/OnboardingFlow";
import { DashboardPlaceholder } from "./features/dashboard/DashboardPlaceholder";
import { ThemeToggle } from "./components/ThemeToggle";

function AppShell() {
  const { me, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", fontFamily: "var(--font-body)", color: "var(--color-text-secondary)" }}>
        <p>Loading Unifolio...</p>
      </div>
    );
  }
  if (!me) {
    return <AuthEntryFlow />;
  }
  if (!me.onboarding_completed) {
    return <OnboardingFlow />;
  }
  return <DashboardPlaceholder />;
}

function App() {
  return (
    <AuthProvider>
      <ThemeToggle />
      <AppShell />
    </AuthProvider>
  );
}

export default App;
