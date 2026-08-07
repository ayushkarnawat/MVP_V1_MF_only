import "@testing-library/jest-dom/vitest";

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
