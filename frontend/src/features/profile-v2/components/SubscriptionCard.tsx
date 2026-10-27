export function SubscriptionCard() {
  return (
    <section
      data-testid="subscription-card"
      className="rounded-[14px] border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-semibold text-[var(--ui-text)]">
            Subscription &amp; Billing
          </h2>
          <p className="mt-1 text-sm text-[var(--shell-text-body)]">Your plan.</p>
        </div>
        <span
          data-testid="plan-badge"
          className="rounded-full bg-[var(--pos-bg)] px-3 py-1 text-xs font-semibold text-[var(--pos-text)]"
        >
          Active
        </span>
      </div>

      <dl className="mt-4">
        <div
          data-testid="plan-row"
          className="rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] px-4 py-3"
        >
          <dt className="text-xs font-medium text-[var(--ui-text-muted)]">
            Current plan
          </dt>
          <dd className="mt-1 text-sm font-semibold text-[var(--ui-text)]">
            Early access
          </dd>
        </div>
      </dl>

      <p className="mt-4 text-sm text-[var(--shell-text-body)]">
        You are using Unifolio during early access.
      </p>
    </section>
  );
}
