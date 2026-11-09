import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearToken, getSignInNotice, setSignInNotice, setToken } from "./session";
import { AuthAlert } from "./redesign/AuthAlert";
import { LoginEntry } from "./redesign/LoginEntry";

vi.mock("./GoogleButton", () => ({ GoogleButton: () => null }));

const NOTICE = { title: "Head of Family changed", body: "Sign in with ra••••••@example.in or +91 ••••• 45678. Siddharth Surve can no longer sign in." };

afterEach(() => { setSignInNotice(null); clearToken(); localStorage.clear(); sessionStorage.clear(); });

describe("the sign-in notice store (QA fixes, C3)", () => {
  it("holds a title and a body, and still holds a plain sentence", () => {
    setSignInNotice(NOTICE);
    expect(getSignInNotice()).toEqual(NOTICE);
    setSignInNotice("You were signed out. Log in again to continue.");
    expect(getSignInNotice()).toBe("You were signed out. Log in again to continue.");
    setSignInNotice(null);
    expect(getSignInNotice()).toBeNull();
  });
  it("lives in memory only: nothing is written to the browser's storage", () => {
    setSignInNotice(NOTICE);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
  it("is cleared by the next login", () => {
    setSignInNotice(NOTICE);
    setToken("tok");
    expect(getSignInNotice()).toBeNull();
  });
});

describe("AuthAlert with a title (QA fixes, C3)", () => {
  it("shows an icon, the title in bold and the body, as a polite status", () => {
    render(<AuthAlert tone="info" title="Head of Family changed">Sign in with the new email.</AuthAlert>);
    const status = screen.getByRole("status");
    expect(screen.getByTestId("auth-alert-title")).toHaveTextContent("Head of Family changed");
    expect(status).toHaveTextContent("Sign in with the new email.");
    expect(status.querySelector("svg")).not.toBeNull();
    expect(status.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
  it("without a title it looks exactly as before: no icon, no title element, one paragraph", () => {
    const { container } = render(<AuthAlert tone="info">Code sent.</AuthAlert>);
    expect(screen.queryByTestId("auth-alert-title")).toBeNull();
    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelectorAll("p")).toHaveLength(1);
  });
});

describe("LoginEntry with a notice (QA fixes, C3)", () => {
  const mount = (notice: Parameters<typeof LoginEntry>[0]["notice"]) =>
    render(<LoginEntry error={null} submitting={false} onSubmitEmail={vi.fn()} onSubmitPhone={vi.fn()} onSignUp={vi.fn()} notice={notice} />);

  it("draws a notice object as a card with the title and the body above the form", () => {
    mount(NOTICE);
    expect(screen.getByTestId("auth-alert-title")).toHaveTextContent("Head of Family changed");
    expect(screen.getByRole("status")).toHaveTextContent("Sign in with ra••••••@example.in or +91 ••••• 45678. Siddharth Surve can no longer sign in.");
    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
  });
  it("still draws a plain sentence as before", () => {
    mount("You were signed out. Log in again to continue.");
    expect(screen.getByRole("status")).toHaveTextContent("You were signed out. Log in again to continue.");
    expect(screen.queryByTestId("auth-alert-title")).toBeNull();
  });
  it("draws nothing for no notice", () => {
    mount(null);
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("never shows a full email address or phone number that was not in the notice", () => {
    mount(NOTICE);
    expect(document.body.textContent).not.toContain("ramesh@");
    expect(document.body.textContent).not.toContain("9812345678");
  });
});
