import { render, screen, fireEvent } from "@testing-library/react";
import { vi, it, expect } from "vitest";
import { ImportHealth } from "./ImportHealth";
import * as api from "./api";

const body: api.ImportHealthResponse = {
  folios: [
    { folio_id: "f1", household_member_id: "m1", household_member_name: "Vikram", scheme_name: "PPFAS Flexi Cap", folio_number: "1047392/12",
      plan_type: "direct", cas_close_units: "18402.117", cas_statement_to: "2026-10-05", fresh_units: "18402.117", cached_units: "18402.117",
      cas_nav: "92.41", cas_nav_date: "2026-10-05", our_nav: "92.41", status: "match", diff_units: "0.000" },
    { folio_id: "f2", household_member_id: "m1", household_member_name: "Vikram", scheme_name: "Nippon Small Cap", folio_number: "4400918/3",
      plan_type: "regular", cas_close_units: "289301.004", cas_statement_to: "2026-10-05", fresh_units: "299034.210", cached_units: null,
      cas_nav: "168.92", cas_nav_date: "2026-10-05", our_nav: "168.92", status: "units_differ", diff_units: "9733.206" },
  ],
  history: [], warnings: ["Balance mismatch for folio 4400918/3"], last_import_at: "2026-10-06T06:12:00Z",
};

it("shows tiles, rows and warnings", async () => {
  vi.spyOn(api, "fetchImportHealth").mockResolvedValue(body);
  render(<ImportHealth onBack={() => {}} />);
  expect((await screen.findAllByText("1")).length).toBeGreaterThan(0);
  expect(screen.getByText(/folios match the CAS/)).toBeInTheDocument();
  expect(screen.getByText("✗ +9,733.206 units")).toBeInTheDocument();
  expect(screen.getByText(/Balance mismatch for folio 4400918\/3/)).toBeInTheDocument();
});

it("filters to problems only", async () => {
  vi.spyOn(api, "fetchImportHealth").mockResolvedValue(body);
  render(<ImportHealth onBack={() => {}} />);
  fireEvent.click(await screen.findByText(/Problems only/));
  expect(screen.queryByText("PPFAS Flexi Cap")).not.toBeInTheDocument();
  expect(screen.getByText("Nippon Small Cap")).toBeInTheDocument();
});

it("labels the measurements within each mobile folio card", async () => {
  vi.spyOn(api, "fetchImportHealth").mockResolvedValue(body);
  render(<ImportHealth onBack={() => {}} />);
  await screen.findByText("PPFAS Flexi Cap");
  for (const label of ["CAS closing units", "Our units (fresh)", "Our units (cached)", "NAV check", "History cache", "Status"]) {
    expect(screen.getAllByText(label).length).toBeGreaterThan(1);
  }
});
