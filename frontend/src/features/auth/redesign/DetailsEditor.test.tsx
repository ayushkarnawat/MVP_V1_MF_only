import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../lib/apiClient";
import { DetailsEditor } from "./DetailsEditor";

const auth = vi.hoisted(() => ({ requestContactChange: vi.fn(), verifyContactChange: vi.fn() }));
vi.mock("../AuthContext", () => ({ useAuth: () => auth }));
const api = vi.hoisted(() => ({ listHouseholdMembers: vi.fn(), updateMemberProfile: vi.fn() }));
vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return { ...actual, ...api };
});

function mount() {
  const handlers = { onDone: vi.fn(), onBack: vi.fn() };
  api.listHouseholdMembers.mockResolvedValue([{ id: "self-1", relationship: "self", name: "Asha Rao" }]);
  api.updateMemberProfile.mockResolvedValue({});
  render(<DetailsEditor initialName="Asha Rao" initialEmail="asha@example.com" {...handlers} />);
  return handlers;
}
const nameField = () => screen.getByLabelText("Full name (as per PAN card)") as HTMLInputElement;
const emailField = () => screen.getByLabelText("Email address") as HTMLInputElement;
const next = () => fireEvent.click(screen.getByRole("button", { name: "Continue" }));
const change = (field: HTMLInputElement, value: string) => fireEvent.change(field, { target: { value } });
const fillCode = (code: string) => {
  const cells = screen.getAllByRole("textbox");
  [...code].forEach((digit, index) => fireEvent.change(cells[index], { target: { value: digit } }));
};

afterEach(() => vi.clearAllMocks());

describe("DetailsEditor, the return trip to screen 3 (task 6.11)", () => {
  it("shows both fields filled and editable, with the note about a new code", () => {
    mount();
    expect(nameField().value).toBe("Asha Rao");
    expect(emailField().value).toBe("asha@example.com");
    expect(emailField()).not.toHaveAttribute("readonly");
    expect(screen.getByText(/If you change it, we send a new code to the new address\./)).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Step 3 of 5" })).toBeInTheDocument();
  });
  it("Back leaves without any request", () => {
    const { onBack } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(api.updateMemberProfile).not.toHaveBeenCalled();
    expect(auth.requestContactChange).not.toHaveBeenCalled();
  });
  it("an unchanged screen moves on without any request", async () => {
    const { onDone } = mount();
    next();
    await waitFor(() => expect(onDone).toHaveBeenCalledWith({ name: "Asha Rao" }));
    expect(api.listHouseholdMembers).not.toHaveBeenCalled();
    expect(api.updateMemberProfile).not.toHaveBeenCalled();
    expect(auth.requestContactChange).not.toHaveBeenCalled();
  });
  it("a different letter case in the email is not a change", async () => {
    const { onDone } = mount();
    change(emailField(), "Asha@Example.com");
    next();
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(auth.requestContactChange).not.toHaveBeenCalled();
  });
  it("a changed name is saved on the self member and nothing else is requested", async () => {
    const { onDone } = mount();
    change(nameField(), "Asha  R. Rao");
    next();
    await waitFor(() => expect(onDone).toHaveBeenCalledWith({ name: "Asha R. Rao" }));
    expect(api.updateMemberProfile).toHaveBeenCalledWith("self-1", { name: "Asha R. Rao" });
    expect(auth.requestContactChange).not.toHaveBeenCalled();
  });
  it("a changed email asks for a code at the NEW address and shows the verify screen", async () => {
    auth.requestContactChange.mockResolvedValue({ message: "sent", otp: "135790" });
    const { onDone } = mount();
    change(emailField(), "new@example.com");
    next();
    expect(await screen.findByRole("heading", { name: "Verify your email address" })).toBeInTheDocument();
    expect(auth.requestContactChange).toHaveBeenCalledWith("email", "new@example.com");
    expect(screen.getAllByText("ne••••••@example.com").length).toBeGreaterThan(0);
    expect(screen.getByText(/135 790/)).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Step 3 of 5" })).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
  });
  it("a correct code verifies the change and continues", async () => {
    auth.requestContactChange.mockResolvedValue({ message: "sent", otp: null });
    auth.verifyContactChange.mockResolvedValue(undefined);
    const { onDone } = mount();
    change(emailField(), "new@example.com");
    next();
    await screen.findByRole("heading", { name: "Verify your email address" });
    fillCode("123456");
    fireEvent.click(screen.getByRole("button", { name: "Verify & Continue" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith({ name: "Asha Rao" }));
    expect(auth.verifyContactChange).toHaveBeenCalledWith("email", "new@example.com", "123456");
  });
  it("a wrong code shows the message and stays on the verify screen", async () => {
    auth.requestContactChange.mockResolvedValue({ message: "sent", otp: null });
    auth.verifyContactChange.mockRejectedValue(new ApiError(400, "That code didn't work. Try again."));
    const { onDone } = mount();
    change(emailField(), "new@example.com");
    next();
    await screen.findByRole("heading", { name: "Verify your email address" });
    fillCode("111111");
    fireEvent.click(screen.getByRole("button", { name: "Verify & Continue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That code didn't work.");
    expect(onDone).not.toHaveBeenCalled();
  });
  it("Back from the verify screen returns with the typed address kept and verifies nothing", async () => {
    auth.requestContactChange.mockResolvedValue({ message: "sent", otp: null });
    mount();
    change(emailField(), "new@example.com");
    next();
    await screen.findByRole("heading", { name: "Verify your email address" });
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("heading", { name: "Create your account" })).toBeInTheDocument();
    expect(emailField().value).toBe("new@example.com");
    expect(auth.verifyContactChange).not.toHaveBeenCalled();
  });
  it("an address that another account uses shows the backend's message on screen 3", async () => {
    auth.requestContactChange.mockRejectedValue(new ApiError(409, "That email address is already in use."));
    mount();
    change(emailField(), "taken@example.com");
    next();
    expect(await screen.findByRole("alert")).toHaveTextContent("That email address is already in use.");
    expect(screen.getByRole("heading", { name: "Create your account" })).toBeInTheDocument();
  });
  it("a too-soon request (429) shows the wait message", async () => {
    auth.requestContactChange.mockRejectedValue(new ApiError(429, "Please wait 60 seconds before asking for another code."));
    mount();
    change(emailField(), "new@example.com");
    next();
    expect(await screen.findByRole("alert")).toHaveTextContent("Please wait 60 seconds");
  });
  it("both changed: the name is saved first, then the email code is requested", async () => {
    const order: string[] = [];
    api.updateMemberProfile.mockImplementation(async () => { order.push("name"); return {}; });
    auth.requestContactChange.mockImplementation(async () => { order.push("email"); return { message: "sent", otp: null }; });
    api.listHouseholdMembers.mockResolvedValue([{ id: "self-1", relationship: "self", name: "Asha Rao" }]);
    render(<DetailsEditor initialName="Asha Rao" initialEmail="asha@example.com" onDone={vi.fn()} onBack={vi.fn()} />);
    change(nameField(), "Asha Kumar");
    change(emailField(), "new@example.com");
    next();
    await screen.findByRole("heading", { name: "Verify your email address" });
    expect(order).toEqual(["name", "email"]);
  });
  it("a name already saved is not saved again after Back from the verify screen", async () => {
    auth.requestContactChange.mockResolvedValue({ message: "sent", otp: null });
    mount();
    change(nameField(), "Asha Kumar");
    change(emailField(), "new@example.com");
    next();
    await screen.findByRole("heading", { name: "Verify your email address" });
    fireEvent.click(screen.getByRole("button", { name: "Edit email address" }));
    await screen.findByRole("heading", { name: "Create your account" });
    next();
    await screen.findByRole("heading", { name: "Verify your email address" });
    expect(api.updateMemberProfile).toHaveBeenCalledTimes(1);
  });
});
