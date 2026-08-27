import { motion, useReducedMotion } from "motion/react";
import { isTestEnv } from "@/lib/motion";

export type AuthIllustrationVariant =
  | "signup"
  | "create_account"
  | "welcome_back"
  | "email_entry"
  | "verify_email"
  | "phone_entry"
  | "verify_phone"
  | "email_otp"
  | "phone_otp"
  | "otp_verify"
  | "auth_complete";

interface AuthIllustrationProps {
  variant: AuthIllustrationVariant;
  className?: string;
}

const ASSET_CONFIG: Record<AuthIllustrationVariant, { src: string; alt: string }> = {
  signup: {
    src: "/illustrations/auth/mobile_signup.png",
    alt: "Account creation illustration",
  },
  create_account: {
    src: "/illustrations/auth/mobile_signup.png",
    alt: "Account creation illustration",
  },
  welcome_back: {
    src: "/illustrations/auth/mobile_signup.png",
    alt: "Welcome back portfolio journey illustration",
  },
  email_entry: {
    src: "/illustrations/auth/mobile_email_entry.png",
    alt: "Email verification illustration",
  },
  verify_email: {
    src: "/illustrations/auth/mobile_email_entry.png",
    alt: "Email verification illustration",
  },
  phone_entry: {
    src: "/illustrations/auth/mobile_phone_entry.png",
    alt: "Phone entry illustration",
  },
  verify_phone: {
    src: "/illustrations/auth/mobile_phone_entry.png",
    alt: "Phone entry illustration",
  },
  email_otp: {
    src: "/illustrations/auth/mobile_email_entry.png",
    alt: "Email verification illustration",
  },
  phone_otp: {
    src: "/illustrations/auth/mobile_otp_verify.png",
    alt: "Phone verification illustration",
  },
  otp_verify: {
    src: "/illustrations/auth/mobile_otp_verify.png",
    alt: "Phone verification illustration",
  },
  auth_complete: {
    src: "/illustrations/auth/mobile_signup.png",
    alt: "Authentication journey complete illustration",
  },
};

export function AuthIllustration({
  variant,
  className = "",
}: AuthIllustrationProps) {
  const shouldReduceMotion = useReducedMotion() || isTestEnv;
  const config = ASSET_CONFIG[variant] || ASSET_CONFIG.signup;

  return (
    <motion.div
      initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={`relative flex items-center justify-center select-none pointer-events-none w-full bg-transparent ${className}`}
      aria-hidden="true"
    >
      <img
        src={config.src}
        alt={config.alt}
        className="h-full w-auto max-h-full max-w-full object-contain mx-auto select-none pointer-events-none bg-transparent"
        loading="eager"
        decoding="async"
      />
    </motion.div>
  );
}
