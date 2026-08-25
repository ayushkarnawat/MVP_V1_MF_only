import { describe, it, expect } from "vitest";
import {
  validateEmail,
  validateIndianPhone,
  formatPhoneForDisplay,
  formatAuthErrorMessage,
} from "./validation";
import { ApiError } from "@/lib/apiClient";

describe("validateEmail", () => {
  it("rejects empty and whitespace-only emails", () => {
    expect(validateEmail("").isValid).toBe(false);
    expect(validateEmail("").error).toBe("Please enter your email address.");
    expect(validateEmail("   ").isValid).toBe(false);
    expect(validateEmail("   ").error).toBe("Please enter your email address.");
  });

  it("rejects emails containing spaces inside", () => {
    expect(validateEmail("user @gmail.com").isValid).toBe(false);
    expect(validateEmail("user @gmail.com").error).toBe("Email address cannot contain spaces.");
    expect(validateEmail("user@ gmail.com").isValid).toBe(false);
  });

  it("rejects missing @ with helpful hint for known providers", () => {
    expect(validateEmail("gmail").error).toBe("Please enter a full email address, e.g. name@gmail.com.");
    expect(validateEmail("mygmailcom").error).toBe("Please enter a full email address, e.g. name@gmail.com.");
    expect(validateEmail("someuser").error).toBe("Please include an '@' in your email address.");
  });

  it("rejects multiple @ symbols", () => {
    expect(validateEmail("name@@gmail.com").error).toBe("Email address can only contain one '@' symbol.");
    expect(validateEmail("name@sub@gmail.com").error).toBe("Email address can only contain one '@' symbol.");
  });

  it("rejects missing username before @", () => {
    expect(validateEmail("@gmail.com").error).toBe("Please enter the username before '@'.");
  });

  it("rejects missing domain after @", () => {
    expect(validateEmail("name@").error).toBe("Please enter a domain after '@', e.g. gmail.com.");
  });

  it("rejects dot boundary violations", () => {
    expect(validateEmail(".name@gmail.com").error).toBe("Email address cannot start with a dot.");
    expect(validateEmail("name@gmail.com.").error).toBe("Email address cannot end with a dot.");
    expect(validateEmail("name.@gmail.com").error).toBe("Email address cannot have a dot immediately before '@'.");
    expect(validateEmail("name@.gmail.com").error).toBe("Email address cannot have a dot immediately after '@'.");
  });

  it("rejects consecutive dots", () => {
    expect(validateEmail("name..user@gmail.com").error).toBe("Email address cannot contain consecutive dots ('..').");
  });

  it("rejects invalid characters in username", () => {
    expect(validateEmail("name!user@gmail.com").error).toBe("Email contains invalid characters before '@'.");
    expect(validateEmail("name#test@gmail.com").error).toBe("Email contains invalid characters before '@'.");
  });

  it("rejects domain starting or ending with hyphen", () => {
    expect(validateEmail("name@-gmail.com").error).toBe("Domain name cannot start or end with a hyphen.");
    expect(validateEmail("name@gmail-.com").error).toBe("Domain name cannot start or end with a hyphen.");
  });

  it("suggests .com when extension is missing (e.g. name@gmail)", () => {
    const res = validateEmail("name@gmail");
    expect(res.isValid).toBe(false);
    expect(res.error).toBe("Please include the domain extension, e.g. name@gmail.com.");
    expect(res.suggestion).toBe("name@gmail.com");
  });

  it("detects and suggests corrections for common domain typos without silently modifying", () => {
    expect(validateEmail("ayush@gmial.com").error).toBe("Did you mean ayush@gmail.com?");
    expect(validateEmail("ayush@gamil.com").error).toBe("Did you mean ayush@gmail.com?");
    expect(validateEmail("ayush@gmai.com").error).toBe("Did you mean ayush@gmail.com?");
    expect(validateEmail("ayush@yaho.com").error).toBe("Did you mean ayush@yahoo.com?");
    expect(validateEmail("ayush@hotmial.com").error).toBe("Did you mean ayush@hotmail.com?");
    expect(validateEmail("ayush@outlok.com").error).toBe("Did you mean ayush@outlook.com?");
    expect(validateEmail("ayush@iclud.com").error).toBe("Did you mean ayush@icloud.com?");
  });

  it("detects and suggests corrections for malformed TLD extensions", () => {
    expect(validateEmail("user@example.comcom").error).toBe("Did you mean user@example.com?");
    expect(validateEmail("user@example.coom").error).toBe("Did you mean user@example.com?");
    expect(validateEmail("user@example.comm").error).toBe("Did you mean user@example.com?");
    expect(validateEmail("user@example.con").error).toBe("Did you mean user@example.com?");
  });

  it("accepts valid standard email addresses", () => {
    expect(validateEmail("investor@unifolio.in").isValid).toBe(true);
    expect(validateEmail("user.name+tag@gmail.com").isValid).toBe(true);
    expect(validateEmail("test_account@sub.domain.co.in").isValid).toBe(true);
  });
});

describe("validateIndianPhone", () => {
  it("rejects empty phone numbers", () => {
    expect(validateIndianPhone("").isValid).toBe(false);
    expect(validateIndianPhone("").error).toBe("Please enter your mobile number.");
  });

  it("rejects alphabetic characters", () => {
    expect(validateIndianPhone("98765abcde").error).toBe("Phone number can contain digits only.");
  });

  it("rejects decimal points", () => {
    expect(validateIndianPhone("98765.43210").error).toBe("Phone number cannot contain decimal points.");
  });

  it("rejects unsupported special characters", () => {
    expect(validateIndianPhone("98765#43210").error).toBe("Phone number can contain digits only.");
  });

  it("rejects numbers with fewer than 10 digits", () => {
    expect(validateIndianPhone("987654321").error).toBe("Enter a 10-digit mobile number.");
  });

  it("rejects numbers with more than 10 digits", () => {
    expect(validateIndianPhone("987654321000").error).toBe("Mobile number cannot exceed 10 digits.");
  });

  it("rejects numbers starting with invalid digits (0-5)", () => {
    expect(validateIndianPhone("1234567890").error).toBe(
      "Please enter a valid Indian mobile number starting with 6, 7, 8, or 9.",
    );
    expect(validateIndianPhone("5555567890").error).toBe(
      "Please enter a valid Indian mobile number starting with 6, 7, 8, or 9.",
    );
  });

  it("rejects foreign country codes", () => {
    expect(validateIndianPhone("+1 9876543210").error).toBe("Please enter an Indian mobile number (+91).");
    expect(validateIndianPhone("+44 9876543210").error).toBe("Please enter an Indian mobile number (+91).");
  });

  it("normalizes and accepts various valid Indian phone formats", () => {
    const r1 = validateIndianPhone("9876543210");
    expect(r1.isValid).toBe(true);
    expect(r1.normalized).toBe("+919876543210");

    const r2 = validateIndianPhone("+91 98765 43210");
    expect(r2.isValid).toBe(true);
    expect(r2.normalized).toBe("+919876543210");

    const r3 = validateIndianPhone("09876543210");
    expect(r3.isValid).toBe(true);
    expect(r3.normalized).toBe("+919876543210");

    const r4 = validateIndianPhone("91 9876543210");
    expect(r4.isValid).toBe(true);
    expect(r4.normalized).toBe("+919876543210");

    const r5 = validateIndianPhone("+91-9876543210");
    expect(r5.isValid).toBe(true);
    expect(r5.normalized).toBe("+919876543210");
  });
});

describe("formatPhoneForDisplay", () => {
  it("formats unspaced +91 phone numbers to +91 XXXXXXXXXX", () => {
    expect(formatPhoneForDisplay("+919876543210")).toBe("+91 9876543210");
  });

  it("keeps already formatted +91 XXXXXXXXXX phone numbers as +91 XXXXXXXXXX", () => {
    expect(formatPhoneForDisplay("+91 9876543210")).toBe("+91 9876543210");
  });

  it("formats 10-digit phone numbers to +91 XXXXXXXXXX", () => {
    expect(formatPhoneForDisplay("9876543210")).toBe("+91 9876543210");
  });

  it("handles null, undefined, and empty string gracefully", () => {
    expect(formatPhoneForDisplay(null)).toBe("");
    expect(formatPhoneForDisplay(undefined)).toBe("");
    expect(formatPhoneForDisplay("")).toBe("");
  });
});


describe("formatAuthErrorMessage", () => {
  it("formats 409 conflict errors with detail", () => {
    const err = new ApiError(409, "An account with this email already exists — log in instead.");
    expect(formatAuthErrorMessage(err, "fallback")).toBe(
      "An account with this email already exists — log in instead.",
    );
  });

  it("formats 401 account not found error with detail", () => {
    const err = new ApiError(401, "No account found for that email — sign up instead.");
    expect(formatAuthErrorMessage(err, "fallback")).toBe(
      "No account found for that email — sign up instead.",
    );
  });

  it("formats 401 incorrect OTP error with detail", () => {
    const err = new ApiError(401, "Incorrect OTP.");
    expect(formatAuthErrorMessage(err, "fallback")).toBe("Incorrect OTP.");
  });

  it("formats 401 fallback when no detail", () => {
    const err = new ApiError(401, "");
    expect(formatAuthErrorMessage(err, "fallback")).toBe("That verification code is not correct. Please try again.");
  });

  it("formats 429 throttled error with detail", () => {
    const err = new ApiError(429, "Please wait 45s before requesting another code.");
    expect(formatAuthErrorMessage(err, "fallback")).toBe("Please wait 45s before requesting another code.");
  });

  it("formats 500 server error without detail", () => {
    const err = new ApiError(500, "");
    expect(formatAuthErrorMessage(err, "fallback")).toBe(
      "Something went wrong on our servers. Please try again in a moment.",
    );
  });

  it("formats network fetch error", () => {
    const err = new TypeError("Failed to fetch");
    expect(formatAuthErrorMessage(err, "fallback")).toBe(
      "Unable to connect to the server. Please check your internet connection.",
    );
  });
});
