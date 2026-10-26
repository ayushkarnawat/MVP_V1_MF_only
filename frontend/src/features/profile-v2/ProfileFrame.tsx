import type { ReactNode } from "react";
import { PageLayout } from "@/shell/layout/PageLayout";
import { ProfileNav } from "./ProfileNav";

interface ProfileFrameProps {
  children?: ReactNode;
}

export function ProfileFrame({ children }: ProfileFrameProps) {
  return (
    <PageLayout
      title="Profile"
      subtitle="Manage your account, family members, preferences and data."
    >
      <div
        data-testid="profile-body"
        className="grid items-start gap-5 md:grid-cols-[232px_minmax(0,1fr)]"
      >
        <ProfileNav />
        <div data-testid="profile-content" className="min-w-0">
          {children}
        </div>
      </div>
    </PageLayout>
  );
}
