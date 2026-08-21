import { ApiError } from "@/lib/apiClient";

export interface ValidationResult {
  isValid: boolean;
  error: string | null;
  suggestion?: string;
}

export interface PhoneValidationResult {
  isValid: boolean;
  error: string | null;
  normalized: string;
  digits: string;
}

const COMMON_DOMAIN_TYPOS: Record<string, string> = {
  "gmial.com": "gmail.com",
  "gamil.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gmaill.com": "gmail.com",
  "gamil.co": "gmail.com",
  "gmaill.co": "gmail.com",
  "gmail.con": "gmail.com",
  "gmail.cpm": "gmail.com",
  "gmail.coom": "gmail.com",
  "gmail.comcom": "gmail.com",
  "gmail.comm": "gmail.com",
  "yaho.com": "yahoo.com",
  "yahooo.com": "yahoo.com",
  "yaho.co": "yahoo.com",
  "yahoo.con": "yahoo.com",
  "ymail.con": "ymail.com",
  "hotmial.com": "hotmail.com",
  "hotmai.com": "hotmail.com",
  "hotmaill.com": "hotmail.com",
  "hotmial.co": "hotmail.com",
  "hotmail.con": "hotmail.com",
  "outlok.com": "outlook.com",
  "outloo.com": "outlook.com",
  "outlook.con": "outlook.com",
  "outluk.com": "outlook.com",
  "iclud.com": "icloud.com",
  "iclou.com": "icloud.com",
  "icloud.con": "icloud.com",
  "redifmail.com": "rediffmail.com",
  "rediffmial.com": "rediffmail.com",
};

const COMMON_TLD_TYPOS: Record<string, string> = {
  comcom: "com",
  coom: "com",
  comm: "com",
  con: "com",
  cpm: "com",
  xom: "com",
  ocm: "com",
  vom: "com",
  cooom: "com",
  commm: "com",
  iin: "in",
  orgg: "org",
  nett: "net",
};

/**
 * Comprehensive email validation with actionable typo suggestions.
 */
export function validateEmail(rawEmail: string): ValidationResult {
  const email = rawEmail.trim();

  // 1. Empty check
  if (!email) {
    return { isValid: false, error: "Please enter your email address." };
  }

  // 2. Spaces inside the string
  if (/\s/.test(email)) {
    return { isValid: false, error: "Email address cannot contain spaces." };
  }

  // 3. Check for @ symbol
  if (!email.includes("@")) {
    const lower = email.toLowerCase();
    if (
      lower.includes("gmail") ||
      lower.includes("yahoo") ||
      lower.includes("hotmail") ||
      lower.includes("outlook") ||
      lower.includes("icloud")
    ) {
      return {
        isValid: false,
        error: "Please enter a full email address, e.g. name@gmail.com.",
      };
    }
    return { isValid: false, error: "Please include an '@' in your email address." };
  }

  // 4. Multiple @ symbols
  const atParts = email.split("@");
  if (atParts.length > 2) {
    return { isValid: false, error: "Email address can only contain one '@' symbol." };
  }

  const [localPart, domainPart] = atParts;

  // 5. Missing local or domain part
  if (!localPart) {
    return { isValid: false, error: "Please enter the username before '@'." };
  }
  if (!domainPart) {
    return { isValid: false, error: "Please enter a domain after '@', e.g. gmail.com." };
  }

  // 6. Dot positioning around @ and boundaries
  if (email.startsWith(".")) {
    return { isValid: false, error: "Email address cannot start with a dot." };
  }
  if (email.endsWith(".")) {
    return { isValid: false, error: "Email address cannot end with a dot." };
  }
  if (localPart.endsWith(".")) {
    return { isValid: false, error: "Email address cannot have a dot immediately before '@'." };
  }
  if (domainPart.startsWith(".")) {
    return { isValid: false, error: "Email address cannot have a dot immediately after '@'." };
  }

  // 7. Consecutive dots
  if (/\.\./.test(email)) {
    return { isValid: false, error: "Email address cannot contain consecutive dots ('..')." };
  }

  // 8. Invalid characters in local part
  if (!/^[a-zA-Z0-9._+%+-]+$/.test(localPart)) {
    return { isValid: false, error: "Email contains invalid characters before '@'." };
  }

  // 9. Domain structure & invalid characters
  if (!/^[a-zA-Z0-9.-]+$/.test(domainPart)) {
    return { isValid: false, error: "Domain name contains invalid characters." };
  }

  // Hyphen checks
  if (domainPart.startsWith("-") || domainPart.endsWith("-")) {
    return { isValid: false, error: "Domain name cannot start or end with a hyphen." };
  }

  const domainLabels = domainPart.split(".");
  for (const label of domainLabels) {
    if (label.startsWith("-") || label.endsWith("-")) {
      return { isValid: false, error: "Domain name cannot start or end with a hyphen." };
    }
  }

  // 10. Missing domain extension (e.g. name@gmail)
  if (!domainPart.includes(".")) {
    const suggested = `${localPart}@${domainPart}.com`;
    return {
      isValid: false,
      error: `Please include the domain extension, e.g. ${suggested}.`,
      suggestion: suggested,
    };
  }

  const lowerDomain = domainPart.toLowerCase();

  // 11. Known Domain Typo Suggestions (e.g. gmial.com -> gmail.com)
  if (COMMON_DOMAIN_TYPOS[lowerDomain]) {
    const suggested = `${localPart}@${COMMON_DOMAIN_TYPOS[lowerDomain]}`;
    return {
      isValid: false,
      error: `Did you mean ${suggested}?`,
      suggestion: suggested,
    };
  }

  // 12. Malformed TLD / Extension typos (e.g. name@example.comcom -> name@example.com)
  const lastLabel = domainLabels[domainLabels.length - 1].toLowerCase();
  if (COMMON_TLD_TYPOS[lastLabel]) {
    const correctedLabels = [...domainLabels];
    correctedLabels[correctedLabels.length - 1] = COMMON_TLD_TYPOS[lastLabel];
    const suggested = `${localPart}@${correctedLabels.join(".")}`;
    return {
      isValid: false,
      error: `Did you mean ${suggested}?`,
      suggestion: suggested,
    };
  }

  // 13. TLD length check
  if (lastLabel.length < 2) {
    return { isValid: false, error: "Please enter a valid domain extension (e.g. .com, .in)." };
  }

  // 14. Standard RFC Regex pattern
  const standardRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!standardRegex.test(email)) {
    return { isValid: false, error: "Please enter a valid email address." };
  }

  return { isValid: true, error: null };
}

/**
 * Comprehensive Indian phone number validation and normalization.
 */
export function validateIndianPhone(rawPhone: string): PhoneValidationResult {
  const trimmed = rawPhone.trim();

  // 1. Empty check
  if (!trimmed) {
    return {
      isValid: false,
      error: "Please enter your mobile number.",
      normalized: "",
      digits: "",
    };
  }

  // 2. Alphabetic check
  if (/[a-zA-Z]/.test(trimmed)) {
    return {
      isValid: false,
      error: "Phone number can contain digits only.",
      normalized: "",
      digits: "",
    };
  }

  // 3. Decimal point check
  if (/\./.test(trimmed)) {
    return {
      isValid: false,
      error: "Phone number cannot contain decimal points.",
      normalized: "",
      digits: "",
    };
  }

  // 4. Invalid non-phone symbols check (allow digits, +, -, spaces, parentheses)
  if (/[^0-9+\s\-()]/.test(trimmed)) {
    return {
      isValid: false,
      error: "Phone number can contain digits only.",
      normalized: "",
      digits: "",
    };
  }

  // 5. Clean punctuation
  const clean = trimmed.replace(/[\s\-()]/g, "");

  // 6. Non-Indian country code check
  if (clean.startsWith("+") && !clean.startsWith("+91")) {
    return {
      isValid: false,
      error: "Please enter an Indian mobile number (+91).",
      normalized: "",
      digits: "",
    };
  }

  // 7. Strip prefix (+91, 0091, 91 (if 12 digits), or leading 0 (if 11 digits))
  let digits = clean;
  if (digits.startsWith("+91")) {
    digits = digits.slice(3);
  } else if (digits.startsWith("0091")) {
    digits = digits.slice(4);
  } else if (digits.startsWith("91") && digits.length === 12) {
    digits = digits.slice(2);
  } else if (digits.startsWith("0") && digits.length === 11) {
    digits = digits.slice(1);
  }

  // 8. Digit-only check on remaining
  if (!/^\d+$/.test(digits)) {
    return {
      isValid: false,
      error: "Phone number can contain digits only.",
      normalized: "",
      digits: "",
    };
  }

  // 9. Length check
  if (digits.length < 10) {
    return {
      isValid: false,
      error: "Enter a 10-digit mobile number.",
      normalized: "",
      digits,
    };
  }

  if (digits.length > 10) {
    return {
      isValid: false,
      error: "Mobile number cannot exceed 10 digits.",
      normalized: "",
      digits,
    };
  }

  // 10. Indian mobile first-digit validity (must start with 6, 7, 8, or 9)
  if (!/^[6-9]/.test(digits)) {
    return {
      isValid: false,
      error: "Please enter a valid Indian mobile number starting with 6, 7, 8, or 9.",
      normalized: "",
      digits,
    };
  }

  return {
    isValid: true,
    error: null,
    normalized: `+91${digits}`,
    digits,
  };
}

/**
 * Formats API and authentication errors into clear, human-friendly messages.
 */
export function formatAuthErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const status = err.status;
    const detail = typeof err.payload === "string" ? err.payload : "";

    if (detail) {
      return detail;
    }

    if (status === 409) {
      return "An account with this email already exists — log in instead.";
    }

    if (status === 401) {
      return "That verification code is not correct. Please try again.";
    }

    if (status === 429) {
      return "Please wait before requesting another code.";
    }

    if (status >= 500) {
      return "Something went wrong on our servers. Please try again in a moment.";
    }
  }

  // Network / Fetch failures
  if (err instanceof TypeError && err.message.toLowerCase().includes("fetch")) {
    return "Unable to connect to the server. Please check your internet connection.";
  }

  if (err instanceof Error && err.message) {
    return err.message;
  }

  return fallback;
}
