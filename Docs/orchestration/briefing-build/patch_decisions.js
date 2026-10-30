/* ===== 31 Oct patch: answers to the open decisions (applied to DECISIONS after js1 assembles it) ===== */
window.PATCH_DECISIONS = function (D) {
  var by = function (id) { return D.filter(function (d) { return d.id === id; })[0]; };
  var base = function (tag) { return tag.split(" · ").filter(function (p) { return !/^(ANSWERED|ON HOLD|SOLVED)/.test(p); }).join(" · "); };
  // kind: "ANSWERED" | "SOLVED"; note: short text after the badge; ans: index of the chosen option (optional)
  function mark(id, kind, note, ans, extra) {
    var d = by(id); if (!d) return;
    d.tag = base(d.tag) + " · " + kind + " 31 Oct: " + note;
    if (ans !== undefined) d.ans = ans; else delete d.ans;
    if (extra) Object.keys(extra).forEach(function (k) { d[k] = extra[k]; });
  }

  function pre(id, t) { var d = by(id); if (d) d.ctx = t + " " + d.ctx; }
  mark("d2", "SOLVED", "Fund Quality Scores is only hidden on Other Analytics and is still computed. The composite Fund Ranking is NOT kept: it is replaced by Performance Ranking (item 8) and its code and tables are deleted (D36, option B)");
  pre("d2", "Answer 31 Oct. Two different things were mixed in the original request. (1) The Fund Quality Score: hidden from Other Analytics only, still computed, still shown on the Individual Fund page, Home and Insights. (2) The composite Fund Ranking (five-factor rating and leaderboard): it does leave. Item 8's Performance Ranking replaces it on Other Analytics, its calculation leaves the recompute, and with D36 option B its code, route and tables (scheme_rankings, ranking_weights) are deleted in this release.");
  mark("d3", "ANSWERED", "option B; phone codes use the existing stub for now", 1);
  mark("d4", "ANSWERED", "option A, simple average of all funds in the category", 0);
  mark("d5", "ANSWERED", "option A, index funds are not ranked here, with a disclaimer", 0);
  mark("d6", "ANSWERED", "option A (cash into Debt, REITs and InvITs as Real Estate); plus a fifth slice, Others, for anything else", 0);
  pre("d6", "Answer 31 Oct: option A, plus one more slice. The card shows five slices: Equity, Debt (including cash), Gold, Real Estate (REITs and InvITs) and Others.");
  mark("d7", "ANSWERED", "option A: the main manager gets the full fund value; if no manager is marked main, the first listed is used (see D38 for the labelling)", 0);
  mark("d8", "ANSWERED", "option A, normalised over classified stocks with a short note", 0);
  mark("d9", "SOLVED", "no DIY picker is being built");
  mark("d12", "ANSWERED", "option B, new Mutual Funds pages only: the check found no PDF export in the new UI (it was hidden on purpose), so option A does not apply", 1);
  pre("d12", "Check done 31 Oct: the new Mutual Funds UI has no Export PDF or Download report action. DEFERRED_FEATURES.md and the page design (Q9) say it is hidden, not removed. The old button lives only in the legacy AnalyticsView, which no route reaches, and the /print/analytics page still exists behind it. Your rule therefore gives option B. Print and mobile keep the old layout, including Fund Ranking, until the PDF is brought back.");
  mark("d13", "ANSWERED", "option A, the Allocation card only; the fund page keeps the whole team", 0);
  mark("d14", "ANSWERED", "option A (category allowlist) plus anything else that is equity by definition (see the rule table in item 5)", 0);
  pre("d14", "Update 30 Oct: the Step 0 counts arrived. Households hold 32 categories. Every SEBI Equity category (about 80 funds, in two stored spellings) is included by name. About 8 hybrid funds (Multi Asset 4, Balanced Advantage 2, Equity Savings 1, Children's Fund 1) and 10 index funds fall under what equity means by definition. The plan decides those by the 65% data rule on their latest published portfolio instead of excluding them by default. Say 'keep excluded' if you prefer the default.");
  mark("d15", "SOLVED", "nothing is simplified; the page stays as it is");
  mark("d16", "ANSWERED", "option A, fund table plus the portfolio line", 0);
  mark("d17", "ANSWERED", "option A, keep the harmonic mean and add a plain-words disclaimer that says why", 0);
  mark("d18", "ANSWERED", "option A, keep both bases and label each clearly", 0);
  mark("d19", "ANSWERED", "same place as in the old screen: right of a 'Switched between funds' line directly under the tiles. In the new UI that screen is Transactions, Cash Flow Over Time (option B), not the Performance page", 1);
  pre("d19", "Answer 31 Oct plus a finding. Your rule is to put it where it sits in the old Investment & Withdrawal card (second screenshot): a line 'Switched between funds: none' with the Include switches button at its right, just under the five tiles. Reading the new code, that card's real counterpart is Transactions, Cash Flow Over Time (tiles Invested, Withdrawn, Net switched, Net invested, a bar chart and the SIP banner), not the Performance page, whose four tiles are a different thing. This moves the earlier recommendation from option A to option B. Confirmed 31 Oct.");
  mark("d21", "ANSWERED", "option A", 0);
  mark("d22", "ANSWERED", "option A, family (combined) view only", 0);
  mark("d24", "SOLVED", "answered by D34: an index fund's tracked index comes from the benchmark printed in its own factsheet, with the fund-name rule as the fallback (option C, both)");
  mark("d28", "SOLVED", "both phones are verified (stub for now); the account takes the new head's verified email and phone");
  mark("d29", "ANSWERED", "option A, and more situations are worked out (see the label table in item 1)", 0);
  mark("d30", "ANSWERED", "option A, block with a clear message", 0);
  mark("d31", "ANSWERED", "option A, re-confirm, emails to everyone and a 24-hour undo link", 0);
  mark("d32", "ANSWERED", "option A, keep computing the score, hide it on Other Analytics only", 0);
  mark("d33", "SOLVED", "item 8 and item 9 are two different things; both are built");
  mark("d34", "ANSWERED", "option C, each fund's own factsheet benchmark, with option B (the fixed category mapping) as the fallback", 2);
  mark("d35", "SOLVED", "defined by D34: when the factsheet benchmark is missing or has no index data, the fixed category mapping (option B) is shown, labelled as a proxy, with the declared name beside it");
  mark("d36", "ANSWERED", "option B, delete the composite ranking code and drop its tables with this release", 1);
  mark("d37", "ANSWERED", "stub mode for now: phone codes use the existing development stub");
  pre("d37", "Answer 31 Oct: none of the three options. Phone codes keep using the existing development stub (OTP_DELIVERY_MODE stub) for now, and the stub code is shown on screen the way it is elsewhere. A real SMS provider is a later task and does not block item 1.");


  /* New decisions raised by the 31 Oct answers */
  var add = [
    { id: "d38", tag: "D38 · Item 4",
      q: "Which manager is 'main' when no manager is marked as main, or when there are only co-managers?",
      ctx: "D7 option A gives the full fund value to the main manager and says 'else the first listed'. Many factsheets mark nobody as main (the layouts notes list ABSL and HDFC as examples), and some list two equal co-managers, or managers of separate sleeves (Equity Portion, Debt Portion, Overseas Investments, Gold/Silver). The case table in item 4 shows what happens in each situation. This question only asks how to label the guess.",
      opts: [
        { n: "First listed is main, marked 'assumed' on the card and in the data", pro: ["Follows D7 option A exactly", "Honest: the user can see it is an assumption", "One rule for every fund"], con: ["The first name on a factsheet is not always the lead", "A small label appears on some cards"] },
        { n: "Split equally between all managers when none is marked main", pro: ["No arbitrary pick", "Keeps today's number for those funds"], con: ["Contradicts 'full value to the main manager'", "Two methods on one card"] },
        { n: "Leave those funds out of the manager card and list them as 'no main manager identified'", pro: ["Never shows a guess"], con: ["Hides a large part of the portfolio on some houses", "The card covers less than it could"] }],
      rec: 0, why: "It follows your answer to D7, and the 'assumed' label keeps it honest. If you would rather not show a guess, option C is the cautious alternative." },
    { id: "d39", tag: "D39 · Item 7",
      q: "Some factsheets print a forward P/E, others a trailing one. How is the portfolio P/E built when you asked for the same method as the fund table?",
      ctx: "Q4 answered: the portfolio figure uses the same method as the fund table (factsheet where printed, otherwise computed from NSE/BSE data). Invesco prints a forward P/E (FY27E) and most others a trailing one. Mixing the two in one weighted figure is not like for like. The fund table itself is not affected: each fund shows its printed number with the label 'fwd' where it applies.",
      opts: [
        { n: "Portfolio line mixes the values as printed and says 'mixed basis'", pro: ["Simplest, no extra computation"], con: ["Not like for like", "Hard to explain in one line"] },
        { n: "Portfolio line uses one basis (trailing): a forward factsheet P/E is replaced by the computed trailing value in the portfolio total only", pro: ["Like for like, comparable with Nifty 50 and Nifty 500", "The fund table keeps the printed figure"], con: ["The portfolio figure is not purely from factsheets", "Needs the computed value for those funds"] },
        { n: "Compute the portfolio line from stocks only, as today", pro: ["Already built, one basis"], con: ["Not the same method as the fund table, which you asked for"] }],
      rec: 1, why: "It keeps the same two-source method you asked for and still compares like with like. The fund table keeps the exact printed number." }
  ];
  add.forEach(function (n) { D.push(n); });
  mark("d38", "ANSWERED", "option A: the first listed is main, marked assumed on the card and in the data", 0);
  mark("d39", "ANSWERED", "option B: the portfolio line uses one basis (trailing); a forward factsheet P/E is replaced by the computed trailing value in the total only", 1);
  mark("d40", "ANSWERED", "accepted all five recommendations", 0);
  ["d25", "d26", "d27"].forEach(function (id) { mark(id, "ON HOLD", "stopped SIPs are paused; nothing is built until you resume them"); });

  /* Item 7 questions Q1 to Q6, answered 31 Oct */
  function q(id, tagIdx, q_, ctx, opts, rec, ans, why, note) {
    D.push({ id: id, tag: tagIdx + " · Item 7 · ANSWERED 31 Oct: " + note, q: q_, ctx: ctx, opts: opts, rec: rec, ans: ans, why: why });
  }
  q("q1", "Q1", "How old can a factsheet P/E or P/B be before we stop using it?", "A printed value belongs to the factsheet month-end. The NAV date moves on every day.", [
    { n: "Use it when it is the latest factsheet and not more than about 75 days old on the NAV date; otherwise compute it", pro: ["Never shows a stale number", "Falls back by itself"], con: ["The cut-off is a judgement"] },
    { n: "Always show the latest factsheet value with its date", pro: ["Simple"], con: ["Can show a number months old"] }], 0, 0, "A figure older than two months stops describing the portfolio. The date is still shown beside every number.", "recommended option A");
  q("q2", "Q2", "How do we show a forward P/E next to trailing ones?", "Invesco prints a forward P/E (FY27E) and a trailing P/B. Others print trailing figures.", [
    { n: "Show it as printed, with the full basis in plain words (for example 'Factsheet, forward earnings (FY27E)') and a hover note", pro: ["Honest and complete", "Easy to read if the wording is plain"], con: ["A few more words on screen"] },
    { n: "Treat a forward P/E as not available and compute the trailing one", pro: ["One basis on the screen"], con: ["Drops a number the fund house prints"] }], 0, 0, "Show the factsheet figure with its full basis; the hover note explains forward versus trailing in one or two plain sentences.", "show the full factsheet basis, in plain words");
  q("q3", "Q3", "In which order do we build the three phases of item 7?", "Phase A: factsheet readers, the table, the fund-wise section and the date fix. Phase B: BSE price file for BSE-only stocks. Phase C: official filings for P/B.", [
    { n: "Phase A only now", pro: ["Smallest"], con: ["Leaves the computed path as weak as today"] },
    { n: "Phases A and B now, C later", pro: ["Covers BSE-only stocks"], con: ["C is the one that fixes P/B quality"] },
    { n: "Step 0 first (factsheet checks and the VM spikes), then A, then B, then C", pro: ["The checks decide how much of B and C is needed", "Nothing is built on an unverified source"], con: ["Longer, five to eight working days more"] }], 2, 2, "Step 0 first, then A, B and C in that order.", "Step 0 first, then A, B, C");
  q("q4", "Q4", "Is the portfolio P/E and P/B built the same way as the fund table?", "Today the portfolio figure is computed from all stocks. The fund table uses factsheet values first.", [
    { n: "Keep the portfolio figure computed from stocks", pro: ["Already built"], con: ["Two methods on one page"] },
    { n: "Build the portfolio figure from the fund figures (factsheet where printed, otherwise NSE/BSE)", pro: ["One method everywhere", "Consistent"], con: ["Mixes forward and trailing (see D39)"] }], 1, 1, "Use the same method for the portfolio figure as for the funds, so the page is consistent.", "same method for the portfolio, for consistency");
  q("q5", "Q5", "How are the 'Factsheet' and 'NSE/BSE' labels explained?", "Each number carries a small label. The detail (month, basis, method, coverage) needs somewhere to live.", [
    { n: "Short labels beside each number, with a compact note on hover", pro: ["Clean"], con: ["Hover does not exist on a phone"] },
    { n: "Full wording under the table only", pro: ["Always visible"], con: ["Longer page"] }], 0, 0, "Both: short labels with a hover note (a tap on a phone) and a one-line footnote under the table.", "both: labels, a hover note and a footnote");
  q("q6", "Q6", "Which averaging method for the computed path?", "Same as D17.", [
    { n: "Keep the weighted harmonic mean and explain why in plain words", pro: ["Correct for a portfolio ratio", "Value Research and Invesco use it too"], con: ["May differ from a factsheet that uses an arithmetic average"] },
    { n: "Switch to an arithmetic weighted average", pro: ["Closer to some factsheets"], con: ["Overstates the ratio"] }], 0, 0, "Harmonic, with the disclaimer from D17.", "recommended option A");
};
