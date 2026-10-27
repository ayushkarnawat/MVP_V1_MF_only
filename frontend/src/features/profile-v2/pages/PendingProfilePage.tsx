import { useLocation } from "react-router";
import { resolveRoute } from "@/shell/nav/resolve";
import { useRegistry } from "@/shell/registry/RegistryContext";
import { ProfileFrame } from "../ProfileFrame";

export default function PendingProfilePage() {
  const location = useLocation();
  const routes = useRegistry();
  const title = resolveRoute(location.pathname, routes)?.title ?? "Profile";

  return (
    <ProfileFrame>
      <section
        data-testid="profile-pending"
        className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-6"
      >
        <h2 className="font-heading text-xl font-semibold text-[var(--ui-text)]">
          {title}
        </h2>
        <p className="mt-2 text-sm text-[var(--shell-text-body)]">
          This page is being built.
        </p>
      </section>
    </ProfileFrame>
  );
}
