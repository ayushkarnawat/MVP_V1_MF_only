import type { ReactNode } from "react";
import { AccountDetails } from "./AccountDetails";
import { AllSet } from "./AllSet";
import { ConnectAccounts } from "./ConnectAccounts";
import { AuthAlert } from "./AuthAlert";
import { AuthField } from "./AuthField";
import { AuthLeftPanel } from "./AuthLeftPanel";
import { AuthSplitCard } from "./AuthSplitCard";
import { InfoCard } from "./InfoCard";
import { InvestorProfile } from "./InvestorProfile";
import { LoginCode } from "./LoginCode";
import { LoginEntry } from "./LoginEntry";
import { OtpPanel } from "./OtpPanel";
import { DevTabsDemo } from "./DevTabsDemo";
import { EmailCode } from "./EmailCode";
import { SignupCode } from "./SignupCode";
import { SignupPhoneEntry } from "./SignupPhoneEntry";
import { StatusRow } from "./StatusRow";
import { StepProgress } from "./StepProgress";

export interface DevScreen {
  id: string;
  title: string;
  render: () => ReactNode;
}

const ROWS = [{ text: "All your accounts in one place." }, { text: "Your family, together." }, { text: "Private by design." }];
const noop = () => {};

// Every screen later phases build is added here with fake props, so the owner can review them before any flow is wired.
export const DEV_SCREENS: DevScreen[] = [
  {
    id: "split-card",
    title: "Split card layout",
    render: () => (
      <AuthSplitCard
        step={1}
        left={<AuthLeftPanel sketch="laptop" headline={<>One dashboard for your family&apos;s <span className="text-[var(--pos-text)]">financial life</span></>} paragraph="Pick up where you left off." rows={ROWS} />}
        right={<div className="space-y-5"><h1 className="text-[26px] font-bold">Let&apos;s get started</h1><AuthField id="dev-phone" label="Mobile number" hint="We will send a code." /></div>}
        bottom={<span>Already have an account? Log in</span>}
      />
    ),
  },
  {
    id: "otp-phone",
    title: "Code screen, mobile",
    render: () => (
      <AuthSplitCard
        step={2}
        onBack={noop}
        left={<AuthLeftPanel sketch="phone" headline="Quick and secure." paragraph="We sent a 6-digit code to +91 98765 43210." />}
        right={<OtpPanel channel="phone" identity="+91 ••••• 43210" submitLabel="Verify & Continue" devOtp="123456" error={null} onSubmit={noop} onResend={noop} onEditIdentity={noop} editLabel="Edit number" />}
      />
    ),
  },
  {
    id: "otp-email",
    title: "Code screen, email",
    render: () => (
      <AuthSplitCard
        step={3}
        onBack={noop}
        left={<AuthLeftPanel sketch="envelope" headline="Almost there." paragraph="Confirm your email so we can keep your account secure." infoCard={<InfoCard title="Why do we need your email?">To send you important updates.</InfoCard>} />}
        right={<OtpPanel channel="email" identity="si••••••@gmail.com" submitLabel="Verify & Continue" devOtp={null} error="That code has expired." onSubmit={noop} onResend={noop} onEditIdentity={noop} editLabel="Edit email address" showCall={false} />}
      />
    ),
  },
  {
    id: "login-entry",
    title: "Login, step 1 (Welcome back)",
    render: () => <LoginEntry error={null} submitting={false} onSubmitEmail={noop} onSubmitPhone={noop} onSignUp={noop} />,
  },
  {
    id: "login-code-phone",
    title: "Login, mobile code",
    render: () => <LoginCode channel="phone" identity="+919876543210" devOtp="123456" error={null} submitting={false} onSubmit={noop} onResend={noop} onBack={noop} onEditIdentity={noop} />,
  },
  {
    id: "login-code-email",
    title: "Login, email code",
    render: () => <LoginCode channel="email" identity="siddharth@gmail.com" devOtp={null} error="That code has expired." submitting={false} onSubmit={noop} onResend={noop} onBack={noop} onEditIdentity={noop} />,
  },
  {
    id: "signup-phone",
    title: "Sign-up, step 1 (Let's get started)",
    render: () => <SignupPhoneEntry error={null} submitting={false} legalReady onSubmit={noop} onLogin={noop} />,
  },
  {
    id: "signup-phone-exists",
    title: "Sign-up, step 1, account already exists",
    render: () => <SignupPhoneEntry error="An account with this mobile number already exists." submitting={false} legalReady onSubmit={noop} onLogin={noop} />,
  },
  {
    id: "signup-code",
    title: "Sign-up, step 2 (mobile code)",
    render: () => <SignupCode phone="+919876543210" devOtp="123456" error={null} submitting={false} onSubmit={noop} onResend={noop} onBack={noop} onEditNumber={noop} onLogin={noop} />,
  },
  {
    id: "signup-account",
    title: "Sign-up, step 3 (Create your account)",
    render: () => <AccountDetails onSubmit={noop} onBack={noop} />,
  },
  {
    id: "signup-account-locked",
    title: "Sign-up, step 3, name only (email already verified)",
    render: () => <AccountDetails initialEmail="siddharth@gmail.com" emailLocked onSubmit={noop} />,
  },
  {
    id: "signup-email-code",
    title: "Sign-up, step 3 (email code)",
    render: () => <EmailCode email="siddharth@gmail.com" devOtp={null} error="That code has expired." submitting={false} onSubmit={noop} onResend={noop} onBack={noop} onEditEmail={noop} />,
  },
  {
    id: "signup-profile",
    title: "Sign-up, step 4 (investor profile)",
    render: () => <InvestorProfile onSubmit={noop} onBack={noop} />,
  },
  {
    id: "signup-connect",
    title: "Sign-up, step 5 (Connect accounts)",
    render: () => <ConnectAccounts onContinue={noop} onBack={noop} />,
  },
  {
    id: "signup-all-set",
    title: "Sign-up, step 6 (All set)",
    render: () => <AllSet onFinish={noop} onViewDetails={noop} />,
  },
  {
    id: "step-progress",
    title: "Step bar",
    render: () => (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((step) => <StepProgress key={step} step={step} />)}
        <StepProgress step={5} done />
      </div>
    ),
  },
  {
    id: "alerts",
    title: "Alerts",
    render: () => (
      <div className="max-w-[360px] space-y-3">
        <AuthAlert tone="error" action={{ label: "Sign up", onClick: noop }}>No account found for this number.</AuthAlert>
        <AuthAlert tone="info">We sent a new code.</AuthAlert>
      </div>
    ),
  },
  { id: "tabs", title: "Email or mobile tabs", render: () => <div className="max-w-[360px]"><DevTabsDemo /></div> },
  {
    id: "status-rows",
    title: "Status rows",
    render: () => (
      <div className="max-w-[360px] space-y-4">
        <StatusRow label="Accounts connected" description="Your mutual funds are linked." state="done" />
        <StatusRow label="Importing your investment data" state="active" />
        <StatusRow label="Preparing your dashboard" state="pending" />
      </div>
    ),
  },
];
