// Sign-up copy (design slides 2 to 10, 2 and 3 Nov 2026).
export const SIGNUP_PARAGRAPH = "Bring your family's investments together, uncover deeper insights, and make more informed financial decisions.";

export const SIGNUP_CODE_HEADLINE = "Quick and secure.";
export const SIGNUP_CODE_LEAD = "We've sent a 6-digit verification code to";
export const SIGNUP_CODE_TITLE = "Verify your number";
export const SIGNUP_CODE_DESCRIPTION = "Enter the 6-digit code we sent to your mobile number.";

export const ACCOUNT_HEADLINE_BEFORE = "Let's start with the ";
export const ACCOUNT_HEADLINE_ACCENT = "basics.";
export const PAN_CARD_TITLE = "Why do we need your PAN name?";
export const PAN_CARD_TEXT = "It helps us correctly match your investments across your accounts and avoid duplicates.";

export const EMAIL_CODE_HEADLINE = "Almost there.";
export const EMAIL_CODE_PARAGRAPH = "Confirm your email so we can keep your account secure and send you important updates.";

/** "+919876543210" -> "+91 98765 43210". The sign-up code screen shows the number in full: the user has just typed it. */
export function formatPhoneSpaced(phone: string): string {
  const digits = phone.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
  if (digits.length !== 10) return phone;
  return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
}
