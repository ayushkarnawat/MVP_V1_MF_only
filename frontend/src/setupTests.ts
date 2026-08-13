import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

// jsdom doesn't implement matchMedia — ThemeToggle (and anything else reading
// prefers-color-scheme) needs it to exist, even as a no-op, or every test that
// mounts it throws "window.matchMedia is not a function".
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

// jsdom doesn't implement these — Radix's Select (and other Radix primitives)
// call them internally on open/scroll, throwing "is not a function" in any
// test that clicks a shadcn Select trigger unless they're at least no-ops.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

if (!window.ResizeObserver) {
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver = ResizeObserver;
  globalThis.ResizeObserver = ResizeObserver;
}

let store: Record<string, string> = {};
const mockStorage: Storage = {
  getItem: (key: string) => (key in store ? store[key] : null),
  setItem: (key: string, value: string) => {
    store[key] = String(value);
  },
  removeItem: (key: string) => {
    delete store[key];
  },
  clear: () => {
    store = {};
  },
  key: (index: number) => Object.keys(store)[index] ?? null,
  get length() {
    return Object.keys(store).length;
  },
};
Object.defineProperty(window, "localStorage", { value: mockStorage, writable: true, configurable: true });
Object.defineProperty(globalThis, "localStorage", { value: mockStorage, writable: true, configurable: true });
Object.defineProperty(window, "sessionStorage", { value: mockStorage, writable: true, configurable: true });
Object.defineProperty(globalThis, "sessionStorage", { value: mockStorage, writable: true, configurable: true });

afterEach(() => {
  store = {};
});
