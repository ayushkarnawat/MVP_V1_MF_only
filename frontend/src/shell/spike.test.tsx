import { lazy, Suspense } from "react";
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";

const LazyPage = lazy(() => import("./spikeFixture"));

it("renders a lazy page in a declarative route", async () => {
  render(
    <MemoryRouter initialEntries={["/a"]}>
      <Routes>
        <Route path="/a" element={<Suspense fallback={<p>Loading</p>}><LazyPage /></Suspense>} />
      </Routes>
    </MemoryRouter>,
  );
  expect(await screen.findByText("lazy ok")).toBeInTheDocument();
});

it("discovers the fixture with an eager import.meta.glob under Vitest", () => {
  const modules = import.meta.glob("./spikeFixture.tsx", { eager: true });
  expect(Object.keys(modules)).toEqual(["./spikeFixture.tsx"]);
  expect(modules["./spikeFixture.tsx"]).toHaveProperty("default");
});
