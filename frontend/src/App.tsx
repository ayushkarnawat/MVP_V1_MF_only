import { AuthProvider, useAuth } from "./features/auth/AuthContext";
import { AuthEntryFlow } from "./features/auth/AuthEntryFlow";
import { OnboardingFlow } from "./features/auth/OnboardingFlow";
import { DashboardPlaceholder } from "./features/dashboard/DashboardPlaceholder";

function AppShell() {
  const { me, loading } = useAuth();

  if (loading) {
    return null;
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
      <AppShell />
    </AuthProvider>
  );
}

export default App;
