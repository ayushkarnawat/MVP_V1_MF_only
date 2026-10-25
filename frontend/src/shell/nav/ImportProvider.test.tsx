import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes, useLocation, useNavigate } from "react-router";
import { StrictMode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { clearCasResumeStep2 } from "../../features/import/casResumeState";
import { FocusLayout } from "../layout/FocusLayout";
import ImportWrapper from "../wrappers/ImportWrapper";
import { TestScopeProvider } from "../testing";
import { useImport } from "../scope/ScopeContext";
import { ImportProvider } from "./ImportProvider";

vi.mock("../../features/import/casResumeState", () => ({ clearCasResumeStep2: vi.fn() }));
vi.mock("../../features/auth/AuthContext", () => ({ useAuth: () => ({ me: { user_id: "u-1" } }) }));
const flow = vi.hoisted(() => ({ mounted: [] as string[], unmounted: [] as string[] }));
vi.mock("../../features/import/ImportFlow", () => ({ ImportFlow: ({ householdMemberId, onDone }: { householdMemberId: string; onDone: (notice?: { text: string; details?: string[] }) => void }) => {
  useEffect(() => { flow.mounted.push(householdMemberId); return () => { flow.unmounted.push(householdMemberId); }; }, [householdMemberId]);
  return <><output data-testid="flow">{householdMemberId}</output><button onClick={() => onDone({ text: "Imported", details: ["Ready"] })}>Complete import</button></>;
} }));
beforeEach(() => { vi.clearAllMocks(); flow.mounted = []; flow.unmounted = []; });

function Probe() {
  const { openImport } = useImport();
  const location = useLocation();
  return <>
    <button onClick={() => openImport()}>Generic import</button>
    <button onClick={() => openImport("b /?&")}>Explicit import</button>
    <output>{JSON.stringify({ path: location.pathname + location.search, state: location.state })}</output>
  </>;
}

it.each([
  ["aggregate", "Generic import", "/import"],
  ["member", "Generic import", "/import?member=a"],
  ["aggregate", "Explicit import", "/import?member=b%20%2F%3F%26"],
] as const)("opens %s scope via %s with its origin", (viewMode, button, path) => {
  render(<MemoryRouter initialEntries={["/portfolio/mutual-funds/analytics?period=1"]}>
    <TestScopeProvider scope={{ viewMode, memberId: "a", members: [{ id: "a", name: "Alice" }] }}>
      <ImportProvider><Probe /></ImportProvider>
    </TestScopeProvider>
  </MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: button }));
  expect(JSON.parse(screen.getByRole("status").textContent!)).toEqual({ path, state: { origin: "/portfolio/mutual-funds/analytics" } });
});

function ImportLocation() {
  const location = useLocation();
  const navigate = useNavigate();
  return <><output data-testid="location">{JSON.stringify({ path: location.pathname, state: location.state })}</output><button onClick={() => { void navigate(-1); }}>History back</button><Outlet /></>;
}

function mountImport({ path = "/import", origin, viewMode = "aggregate", strict = false }: { path?: string; origin?: string; viewMode?: "member" | "aggregate"; strict?: boolean } = {}) {
  const Wrap = strict ? StrictMode : ({ children }: { children: React.ReactNode }) => <>{children}</>;
  return render(<Wrap><MemoryRouter initialEntries={["/earlier", { pathname: path.split("?")[0], search: path.includes("?") ? `?${path.split("?")[1]}` : "", state: origin ? { origin } : undefined }]} initialIndex={1}>
    <TestScopeProvider scope={{ viewMode, memberId: "a", members: [{ id: "a", name: "Alice" }, { id: "b", name: "Bob" }] }}>
      <ImportProvider><Routes><Route element={<ImportLocation />}><Route element={<FocusLayout />}><Route path="/import" element={<ImportWrapper />} /></Route><Route path="*" element={<h1>Destination</h1>} /></Route></Routes></ImportProvider>
    </TestScopeProvider>
  </MemoryRouter></Wrap>);
}

it("offers member choice in the focus header from aggregate scope and keys the flow by member", async () => {
  mountImport();
  const picker = await screen.findByRole("combobox", { name: "Select family member to import for" });
  expect(picker.closest("header")).not.toBeNull();
  expect(screen.getByTestId("flow")).toHaveTextContent("a");
  fireEvent.keyDown(picker, { key: "ArrowDown" });
  const bob = await screen.findByRole("option", { name: "Bob" });
  fireEvent.click(bob);
  await waitFor(() => expect(screen.getByTestId("flow")).toHaveTextContent("b"));
  expect(flow.unmounted).toContain("a");
  expect(flow.mounted).toEqual(["a", "b"]);
});

it("honours a deep-linked member over scope and shows only its chip in the header", async () => {
  mountImport({ path: "/import?member=b" });
  await waitFor(() => expect(screen.getByTestId("flow")).toHaveTextContent("b"));
  const chip = screen.getByText(/Importing for/);
  expect(chip).toHaveTextContent("Bob");
  expect(chip.closest("header")).not.toBeNull();
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
});

it("uses the selected member without a chooser in member mode", async () => {
  mountImport({ viewMode: "member" });
  expect(await screen.findByText(/Importing for/)).toHaveTextContent("Alice");
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
});

it.each(["/portfolio", "/home", undefined])("replaces import with its completion destination for origin %s and passes the notice", async origin => {
  mountImport({ path: "/import?member=b", origin });
  fireEvent.click(await screen.findByRole("button", { name: "Complete import" }));
  const destination = origin === "/portfolio" ? "/portfolio" : "/portfolio/mutual-funds";
  await waitFor(() => expect(JSON.parse(screen.getByTestId("location").textContent!)).toEqual({ path: destination, state: { importNotice: { text: "Imported", details: ["Ready"] }, importNoticeUser: "u-1" } }));
  await waitFor(() => expect(clearCasResumeStep2).toHaveBeenCalledWith("b"));
  fireEvent.click(screen.getByRole("button", { name: "History back" }));
  await waitFor(() => expect(JSON.parse(screen.getByTestId("location").textContent!).path).toBe("/earlier"));
});

it.each(["/portfolio", undefined])("returns Back to origin %s and clears resume state", async origin => {
  mountImport({ path: "/import?member=b", origin });
  const back = screen.getByRole("link", { name: "Back" });
  expect(back).toHaveAttribute("href", origin ?? "/portfolio/mutual-funds");
  fireEvent.click(back);
  await screen.findByRole("heading", { name: "Destination" });
  await waitFor(() => expect(clearCasResumeStep2).toHaveBeenCalledWith("b"));
});

it("does not clear resume state while import stays mounted under StrictMode", async () => {
  mountImport({ path: "/import?member=b", strict: true });
  await screen.findByTestId("flow");
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(clearCasResumeStep2).not.toHaveBeenCalled();
});
