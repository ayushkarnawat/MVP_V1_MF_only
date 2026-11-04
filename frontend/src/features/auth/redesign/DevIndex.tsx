import { DEV_SCREENS } from "./devScreens";

/** Every new auth screen with fake props, at /dev/auth-screens, in a development build only. */
export function DevIndex() {
  // ?screen=<id> shows one screen alone, full page, so it can be screenshotted at any desktop viewport.
  const only = new URLSearchParams(window.location.search).get("screen");
  const single = only ? DEV_SCREENS.find((screen) => screen.id === only) : undefined;
  if (single) return <>{single.render()}</>;
  return (
    <main className="mx-auto max-w-[1180px] space-y-10 p-6">
      <h1 className="text-2xl font-bold">Auth screens (development only)</h1>
      {DEV_SCREENS.map((screen) => (
        <section key={screen.id} data-testid="dev-screen" className="space-y-3">
          <h2 className="text-lg font-semibold">{screen.title}</h2>
          {screen.render()}
        </section>
      ))}
    </main>
  );
}
