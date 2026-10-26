import { ProfileFrame } from "../ProfileFrame";
import { ComingSoonPage } from "./ComingSoonPage";

export function ConnectedAccountsPage() {
  return (
    <ProfileFrame>
      <ComingSoonPage variant="connected-accounts" />
    </ProfileFrame>
  );
}

export function NotificationsPage() {
  return (
    <ProfileFrame>
      <ComingSoonPage variant="notifications" />
    </ProfileFrame>
  );
}

export function PreferencesPage() {
  return (
    <ProfileFrame>
      <ComingSoonPage variant="preferences" />
    </ProfileFrame>
  );
}

export function SecurityPage() {
  return (
    <ProfileFrame>
      <ComingSoonPage variant="security" />
    </ProfileFrame>
  );
}

export function TaxPage() {
  return (
    <ProfileFrame>
      <ComingSoonPage variant="tax" />
    </ProfileFrame>
  );
}
