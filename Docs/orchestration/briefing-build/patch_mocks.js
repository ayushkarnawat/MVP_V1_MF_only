  /* ================= 31 Oct round: mockups redrawn (inserted inside the mockup closure, so frame(), card(), rcard() etc. are in scope) ================= */
  var GREEN = "#22C55E";
  /* Fund logo tile: the real app shows the fund house logo image here (same component as the Mutual Funds list and the Individual Fund page). Initials stand in for the picture. */
  function flogo(ini, k, size) {
    var s = size || 32, pal = { g: ["#EAFBF0", "#15803d"], b: ["#DBEAFE", "#1d4ed8"], a: ["#FEF3E2", "#B45309"], p: ["#EDE9FE", "#6d28d9"], r: ["#fdecec", "#c1272d"], n: ["#F5F5F5", "#555"] }[k || "n"];
    return '<span class="n-logo" style="width:' + s + "px;height:" + s + "px;background:" + pal[0] + ";color:" + pal[1] + '">' + ini + "</span>";
  }
  function gbtn(t, dis) { return '<button class="mk-btn mk-btn-p"' + (dis ? " disabled" : "") + ">" + t + "</button>"; }

  /* ---------- 02, 08, 09: back to the earlier layouts (31 Oct, third round). The earlier mockups already exist in X at this point; only small post-processing is applied. ---------- */
  (function () {
    /* 02: the earlier table (split bar in the parent row, + opens member rows), with roomier spacing */
    var m2 = X["02"][0];
    m2.html = m2.html.replace('<div class="mk-tw"><table class="mk-t">', '<div class="mk-tw n-roomy"><table class="mk-t">');
    m2.notes = ["Back to the earlier layout: one row per fund with a split bar under the name that shows each member's share, and a + that opens one row per member with the masked folio. Every column of requirement 2.2 stays (units, average price, invested, current value, unrealised, realised, XIRR).", "Spacing is improved: taller rows, more padding in every cell, second lines on their own line, tinted member rows, and a wider table that scrolls sideways on a narrow screen instead of squeezing.", "Folio numbers are masked (D20). A fund held by one member shows no + and no bar. Parent XIRR uses all members' cash flows together; a member's XIRR uses only that member's. Direct and Regular plans stay as separate rows."];

    /* 08: the earlier lane layout, with the larger rank, one group heading plus a different card heading, and the plain banner */
    var m8 = X["08"][0], h = m8.html;
    h = h.replace('<div style="margin-top:12px"><div class="u-lane h">', '<div class="n-big" style="margin-top:12px"><div class="u-lane h">');
    h = h.replace(/<b style="color:(#[0-9A-Fa-f]{6})">(\d+)\/(\d+)<\/b>/g, '<b class="n-rn2" style="color:$1">$2<i>/$3</i></b>');
    h = h.replace('<div class="rl-h"><b>Performance Ranking</b>', '<div class="rl-h"><b>Rank in your fund\'s category</b>');
    h = h.replace('<b>Top quartile</b> in 9 of 11 periods. A rank is shown as Rank / Total, with a dot on a line from best (left) to last (right). The green stretch is the top quarter.',
      '<b>Your funds rank in the top quarter in 9 of 11 comparisons.</b> A rank such as 4/38 means this fund is 4th best out of 38 funds in the same category. Lower is better. The dot shows where the fund sits, from best (left) to last (right); the green stretch is the top quarter.');
    m8.html = h;
    m8.notes = ["The earlier lane layout is back: a row per fund and, per period, a dot on a line from best (left) to last (right) with the top quarter in green. The rank keeps the larger size from the redesign, so the number is read first.", "One group heading, 'Performance Ranking', and a card heading that differs. The earlier mockup printed the same words twice.", "The banner says what 4/38 means in plain words, then gives the answer.", "Index funds carry the agreed disclaimer (D5)."];

    /* 09: the earlier dot-on-a-line layout, with the plain banner wording */
    var m9 = X["09"][1];
    m9.html = m9.html.replace('<b>Your funds are ahead of their category average</b> in 10 of 11 comparisons across 1, 3 and 5 years. The one to watch: Nippon India Small Cap over 1 year (\u22122.1 pts).',
      '<b>Your funds beat their category average in 10 of 11 comparisons.</b> Each number is your fund\'s return minus the average return of funds in the same category, in percentage points (pts). Plus is better. The one to watch: Nippon India Small Cap over 1 year (\u22122.1 pts).');
    m9.notes = ["The earlier layout is back: a filled dot for your fund, a hollow dot for the category average and a coloured line for the gap (green ahead, red behind), with the exact figures beside it. The summary at the top answers the question first; the chips only filter the cards.", "The banner is the plain wording asked for on 31 Oct: what the number means, in percentage points, plus is better.", "No rank, no percentile, nothing to click.", "Known limit: when a gap is under about half a point the two dots almost touch, and the number beside the line (for example +0.3 pts) carries the information."];
  })();

  /* ---------- 13 Asset class: five slices, the fifth is Others ---------- */
  var ac5 = [{ p: 61, c: G, n: "Equity", v: "61.0%" }, { p: 25, c: B, n: "Debt (incl. cash)", v: "25.0%" }, { p: 7, c: A, n: "Gold", v: "7.0%" }, { p: 4, c: P, n: "Real Estate (REITs and InvITs)", v: "4.0%" }, { p: 3, c: GR, n: "Others", v: "3.0%" }];
  X["13"] = [m("Asset Class: five slices, with Others for anything that is not one of the four", "Investments › Mutual Funds › Allocation, Asset Class card.",
    frame("Allocation", card("Asset class (look-through)", '<div class="mk-row">' + donut(ac5, "₹12.9L", "covered value") + legend(ac5) + "</div>" +
      '<div class="u-fc" style="margin-top:12px"><b style="font-size:13px">Contributing funds · Others ₹38K</b><div class="u-flow"><div class="row"><span>HDFC Balanced Advantage</span><div class="bar"><i style="width:64%;background:#B8B8B8"></i></div><b>64.2%</b></div><div class="row"><span>Kotak Equity Hybrid</span><div class="bar"><i style="width:36%;background:#B8B8B8"></i></div><b>35.8%</b></div></div><div class="u-sub">Others = derivatives and holdings the fund house does not classify as equity, debt, gold or real estate.</div></div>' +
      note("Cash is included under Debt. 2 of 14 funds have no published portfolio and are not counted."), { info: 1 }), {}),
    ["Others is a fifth, grey slice. It holds whatever is not Equity, Debt (including cash), Gold or Real Estate: positive derivative lines and rows the fund house leaves unclassified. It always sits last and is hidden when it is 0%.", "Negative derivative lines (for example futures hedging an arbitrage fund) are still ignored, as today, and counted in the coverage note, so Others never goes negative.", "Clicking Others lists the funds behind it, like every other slice. No market cap ring."])];

  /* ---------- 03 Market cap: same picture, the note is explained ---------- */
  X["03"] = [m("Market Cap card with three slices adding to 100%", "Investments › Mutual Funds › Allocation, Market Cap card.",
    frame("Allocation", card("Market Cap", '<div class="mk-row">' + donut(cap, "₹9.8L", "of classified equity") + legend(cap) + "</div>" + note("6% of your equity could not be sorted into Large, Mid or Small (for example overseas stocks), so the three slices describe the other 94%."), { info: 1 }), {}),
    ["The three slices add to exactly 100.00%. The note says what the 100% is of: the part of your equity we could classify.", "Without the note, a user who holds an international fund would read the chart as a split of all their equity. The note is shown only when the unclassified part is 0.5% or more, and it can sit in a tooltip.", "If no equity could be classified the card shows 'Not enough classified equity to show a split'."])];

