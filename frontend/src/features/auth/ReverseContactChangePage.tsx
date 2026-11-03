import { useEffect, useRef, useState } from "react";
import { parseHeadChangeError, reverseContactChange } from "./api";

function readFragmentToken(): string | null {
  if (typeof window === "undefined") return null;
  const raw = window.location.hash.replace(/^#/, "");
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  const token = params.get("token")?.trim() ?? "";
  return token.length > 0 ? token : null;
}

function isPermanentReverseFailure(err: unknown, code: string | null): boolean {
  const status =
    err && typeof err === "object" && typeof (err as { status?: unknown }).status === "number"
      ? (err as { status: number }).status
      : null;
  return (
    status === 404 ||
    status === 410 ||
    code === "reverse_not_found" ||
    code === "reverse_expired"
  );
}

export function ReverseContactChangePage() {
  const [token] = useState<string | null>(() => readFragmentToken());
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [terminalError, setTerminalError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash) {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`,
      );
    }
  }, []);

  async function handleReverse() {
    if (!token || inFlightRef.current || submitting || done || terminalError) {
      return;
    }
    inFlightRef.current = true;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await reverseContactChange(token);
      setDone(true);
    } catch (err) {
      const parsed = parseHeadChangeError(err);
      setErrorMessage(parsed.message);
      if (isPermanentReverseFailure(err, parsed.code)) {
        setTerminalError(true);
      }
    } finally {
      inFlightRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text-primary)] px-6 py-12 flex items-center justify-center">
      <div className="w-full max-w-md rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm space-y-4">
        <div className="text-xs font-medium tracking-wide uppercase text-[var(--color-text-muted)]">
          Unifolio
        </div>
        <h1 className="text-xl font-semibold">
          The sign-in email or phone on your account was changed
        </h1>

        {!token ? (
          <div className="space-y-4">
            <p className="text-sm text-[var(--color-text-secondary)]" role="alert">
              This link is not valid.
            </p>
            <a
              href="/"
              className="inline-block text-sm font-medium text-[#22C55E] hover:underline"
            >
              Sign in
            </a>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-[var(--color-text-secondary)]">
              If this was you, you can close this page. If it was not you, you can undo the change
              now. Everyone will be signed out.
            </p>

            {done && (
              <div className="space-y-2 rounded-lg border border-[#22C55E]/30 bg-[#22C55E]/10 p-3">
                <p className="text-sm text-[var(--color-text-primary)]">
                  The change has been undone and everyone has been signed out. Sign in with your
                  usual email or phone number.
                </p>
                <a
                  href="/"
                  className="inline-block text-sm font-medium text-[#22C55E] hover:underline"
                >
                  Sign in
                </a>
              </div>
            )}

            {errorMessage && (
              <p className="text-sm text-red-500" role="alert">
                {errorMessage}
              </p>
            )}

            <button
              type="button"
              onClick={handleReverse}
              disabled={submitting || done || terminalError}
              className="w-full rounded-lg bg-[#22C55E] px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-50 disabled:cursor-not-allowed"
            >
              This was not me, undo the change
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

export default ReverseContactChangePage;
