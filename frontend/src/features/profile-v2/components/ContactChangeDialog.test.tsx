import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContactChangeChannel } from "@/features/auth/types";
import { ContactChangeDialog } from "./ContactChangeDialog";

const auth = vi.hoisted(() => ({ requestContactChange: vi.fn(), verifyContactChange: vi.fn() }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => auth }));

const onClose = vi.fn();
const onChanged = vi.fn();

function mount(channel: ContactChangeChannel = "email") {
  return render(<ContactChangeDialog channel={channel} onClose={onClose} onChanged={onChanged} />);
}

// A promise the test settles by hand, to put a request "in flight" while the dialog is closed.
function deferred() {
  let resolve: () => void = () => {};
  let reject: (reason: Error) => void = () => {};
  const promise = new Promise<void>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

const identifier = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const type = (label: string, value: string) => fireEvent.change(identifier(label), { target: { value } });

async function reachCodeStep(channel: ContactChangeChannel = "email") {
  mount(channel);
  type(channel === "email" ? "New email" : "New mobile number", channel === "email" ? "new@example.in" : "+919811111111");
  fireEvent.click(screen.getByRole("button", { name: "Send code" }));
  await screen.findByLabelText("Verification code");
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.requestContactChange.mockResolvedValue({ message: "sent", otp: null });
  auth.verifyContactChange.mockResolvedValue(undefined);
});

describe("ContactChangeDialog: the first step", () => {
  it("for the email: titled 'Change email', one email field, Send code disabled until something is typed", () => {
    mount("email");
    expect(screen.getByRole("dialog", { name: "Change email" })).toBeInTheDocument();
    expect(identifier("New email")).toHaveAttribute("type", "email");
    expect(screen.getByRole("button", { name: "Send code" })).toBeDisabled();
    expect(screen.queryByLabelText("Verification code")).not.toBeInTheDocument();
    type("New email", "   ");
    expect(screen.getByRole("button", { name: "Send code" })).toBeDisabled();
    type("New email", "new@example.in");
    expect(screen.getByRole("button", { name: "Send code" })).toBeEnabled();
  });

  it("for the mobile number: titled 'Change mobile number', a phone field", () => {
    mount("phone");
    expect(screen.getByRole("dialog", { name: "Change mobile number" })).toBeInTheDocument();
    expect(identifier("New mobile number")).toHaveAttribute("type", "tel");
  });

  it("Cancel closes without calling anything", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(auth.requestContactChange).not.toHaveBeenCalled();
    expect(auth.verifyContactChange).not.toHaveBeenCalled();
  });
});

describe("ContactChangeDialog: asking for the code", () => {
  it("sends the value for the channel, then shows the code step with the field locked", async () => {
    mount("email");
    type("New email", "new@example.in");
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    expect(await screen.findByLabelText("Verification code")).toBeInTheDocument();
    expect(auth.requestContactChange).toHaveBeenCalledTimes(1);
    expect(auth.requestContactChange).toHaveBeenCalledWith("email", "new@example.in");
    expect(screen.getByText("We sent a code to your new email.")).toBeInTheDocument();
    expect(identifier("New email")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Send code" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Verify change" })).toBeDisabled();
  });

  it("uses the phone channel and its own wording for a mobile number, and sends it trimmed", async () => {
    mount("phone");
    type("New mobile number", "  +919811111111 ");
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    expect(await screen.findByText("We sent a code to your new mobile number.")).toBeInTheDocument();
    expect(auth.requestContactChange).toHaveBeenCalledWith("phone", "+919811111111");
  });

  it("shows 'Sending…' on a disabled button while the request is pending", async () => {
    const request = deferred();
    auth.requestContactChange.mockReturnValue(request.promise);
    mount();
    type("New email", "new@example.in");
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
    expect(identifier("New email")).toBeDisabled();
    await act(async () => { request.resolve(); });
    expect(screen.getByLabelText("Verification code")).toBeInTheDocument();
  });

  it("on failure: the error wording of the existing screen, still on the first step, and it can be tried again", async () => {
    auth.requestContactChange.mockRejectedValueOnce(new Error("boom"));
    mount();
    type("New email", "new@example.in");
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not send the verification code. Please try again.");
    expect(screen.queryByLabelText("Verification code")).not.toBeInTheDocument();
    expect(identifier("New email")).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    expect(await screen.findByLabelText("Verification code")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("ContactChangeDialog: verifying", () => {
  it("sends the trimmed value and code, then reports the change once (and does not close by itself)", async () => {
    await reachCodeStep("email");
    fireEvent.change(screen.getByLabelText("Verification code"), { target: { value: " 123456 " } });
    fireEvent.click(screen.getByRole("button", { name: "Verify change" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(auth.verifyContactChange).toHaveBeenCalledWith("email", "new@example.in", "123456");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows 'Verifying…' on a disabled button while the request is pending", async () => {
    const verify = deferred();
    auth.verifyContactChange.mockReturnValue(verify.promise);
    await reachCodeStep();
    fireEvent.change(screen.getByLabelText("Verification code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify change" }));
    expect(screen.getByRole("button", { name: "Verifying…" })).toBeDisabled();
    expect(screen.getByLabelText("Verification code")).toBeDisabled();
    await act(async () => { verify.resolve(); });
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("on failure: the error wording of the existing screen, the code field stays, and it can be tried again", async () => {
    auth.verifyContactChange.mockRejectedValueOnce(new Error("boom"));
    await reachCodeStep();
    fireEvent.change(screen.getByLabelText("Verification code"), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify change" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not verify the contact change. Please try again.");
    expect(onChanged).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Verification code")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Verify change" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Verify change" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(auth.verifyContactChange).toHaveBeenCalledTimes(2);
  });
});

describe("ContactChangeDialog: an answer that arrives after the dialog was closed changes nothing", () => {
  it("a code request that succeeds late does not open the code step", async () => {
    const request = deferred();
    auth.requestContactChange.mockReturnValue(request.promise);
    mount();
    type("New email", "new@example.in");
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await act(async () => { request.resolve(); });
    expect(screen.queryByLabelText("Verification code")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("a code request that fails late shows no error", async () => {
    const request = deferred();
    auth.requestContactChange.mockReturnValue(request.promise);
    mount();
    type("New email", "new@example.in");
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    fireEvent.click(screen.getByRole("button", { name: "Close modal" }));
    await act(async () => { request.reject(new Error("late")); });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("a verification that succeeds late does not report a change", async () => {
    const verify = deferred();
    auth.verifyContactChange.mockReturnValue(verify.promise);
    await reachCodeStep();
    fireEvent.change(screen.getByLabelText("Verification code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify change" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await act(async () => { verify.resolve(); });
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("a verification that fails late shows no error", async () => {
    const verify = deferred();
    auth.verifyContactChange.mockReturnValue(verify.promise);
    await reachCodeStep();
    fireEvent.change(screen.getByLabelText("Verification code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify change" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await act(async () => { verify.reject(new Error("late")); });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });
});
