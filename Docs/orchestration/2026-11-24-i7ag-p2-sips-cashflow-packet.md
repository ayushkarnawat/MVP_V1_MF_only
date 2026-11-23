# Packet I7-AG-2: the SIP table and the yearly cash flow chart with its table (Antigravity, front end, Batch I print components)
**Milestone M4.** Common rules for the four print component packets (read first, fully): `Docs/orchestration/2026-11-24-i7ag-common.md`. Audit and decision: `Docs/orchestration/2026-11-24-print-audit.md` (option C). Written by the orchestrator on 24 Nov 2026.
**Your clone:** `C:\Users\Dell\ag-p2` (branch `ag/p2-sips-cashflow`, cut from `batch/i-fe`). Check lane name for the checks: `ag-p2`.

## What you build
1. **`frontend/src/print/groups/overview/SipsPrintTable.tsx`**: `SipsPrintTable({ sips, stopped, monthlyTotal }: { sips: SipRow[]; stopped: SipRow[]; monthlyTotal: string })` (`SipRow` in `frontend/src/features/mutual-funds/types.ts`: `scheme_name`, `household_member_name`, `sip_date`, `sip_amount`, `next_due_date`, `series_count?`, `status?`).
2. **`frontend/src/print/groups/transactions/CashFlowYearlyPrint.tsx`**: `CashFlowYearlyPrint({ years }: { years: InvestmentWithdrawalBucket[] })` (`InvestmentWithdrawalBucket`: `period` "YYYY", `invested`, `withdrawn`, optional `switched_in`/`switched_out`; the **yearly** buckets of the `investment_withdrawal` result).
**Design: sample page `f05.png` (bottom card, "SIPs") and `f19.png` (both cards).**

## SIPs (f05 bottom)
Under a `<h3>` is not needed (the caller renders the section heading); the card is titled `Active SIPs` and holds a table. **Columns** (the sample has Fund, Member, Instalment, Day, Since, Instalments, Total invested; the app has no Since/Instalments/Total, so print **Fund, Member, Instalment, Day, Next due**): Fund name left (can wrap to two lines, no truncation), Member, Instalment right-aligned (`formatRupees`), Day as the screen's SIP card writes the day (read `overview/SipTimeline.tsx` for how it turns `sip_date` into words such as `5th of each month` and reuse that helper; if it is not exported, copy its small logic and say so in the report), Next due (`formatDate`). A final row **`Monthly SIP total`** (bold, top rule, the amount under Instalment) showing `monthlyTotal` formatted (the caller computes it with the screen's own rule: it counts a twin SIP `series_count` times). If `stopped` is non-empty, a **second card titled `Stopped SIPs`** with the same columns (no total row; use the screen's word for the status if it shows one). If `sips` is empty and `stopped` is empty: the screen's own empty sentence (`No active SIPs.`).

## Cash flow, yearly (f19)
Two cards. **Card 1 titled `Invested each year`** (the sample's title; the screen's cash-flow card shows invested and withdrawn bars: print **both** when any year has a non-zero `withdrawn`, with a two-item legend using the screen's colours and words; when nothing was withdrawn print the invested bars only, as the sample): an SVG bar chart, one group of bars per year in period order, **each bar labelled above with its value in the compact style** (`6.6L`, `0.5L`, as the sample), the year under it (small, muted), bar colour `var(--pos)` for invested and the screen's withdrawn colour (read `transactions/CashFlowBars.tsx` for the token) for withdrawn, bars with rounded tops, no gridlines needed (a baseline only), width 100%, height about 45 mm. **Card 2 titled `By year`** with a table **Year, Money in, Money out, Net** (right-aligned money; Net = invested minus withdrawn **from the same numbers**, formatted with the shared formatters) and a **Total row** (bold, top rule) as in the sample. Switch values (`switched_in`/`switched_out`) are **not** in these totals (the screen's default excludes them): ignore them. A year with zero in both: still a row. No buckets: the screen's empty sentence (`No transactions yet`).

## Tests (names)
`SipsPrintTable`: `lists every active SIP with fund, member, instalment, day and next due`; `shows the monthly total row from monthlyTotal`; `shows a Stopped SIPs card only when there are stopped SIPs`; `does not truncate long fund names`; `shows the empty sentence`; `rows do not split, header is a thead, no button, no title attribute`. `CashFlowYearlyPrint`: `draws one labelled bar per year for invested and a second series only when something was withdrawn`; `labels bars with the compact value`; `the table has one row per year with money in, money out and net equal to invested minus withdrawn`; `the total row sums the years`; `ignores switch values`; `shows the empty sentence`; `no button, no title attribute, no hex colour`.


## Paste-ready prompt
```
You are the frontend worker for Unifolio (Antigravity). Read, in order:
1. Docs/orchestration/ui-common-rules-antigravity.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-24-i7ag-common.md (rules common to the four print component packets: read it fully)
4. Docs/orchestration/2026-11-24-i7ag-p2-sips-cashflow-packet.md (your task: I7-AG-2)
Open the sample page image(s) named in the packet and build to them: the sample is the design. Work only in C:\Users\Dell\ag-p2 on branch ag/p2-sips-cashflow. Tests first: write the tests and show them fail, then make them pass. Create only the new files the packet lists. Never run a git command that changes anything. Touch nothing else. Reply with the report block from the common rules, nothing else.
```
