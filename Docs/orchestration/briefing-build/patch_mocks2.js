
  /* ---------- 01 Head of Family: stub code shown, the email, error states ---------- */
  var old01 = X["01"];
  function stubStrip(code) { return '<div class="n-stub"><b>Test mode</b> No SMS is sent yet. Your phone code is <b>' + code + "</b></div>"; }
  function errStrip(t) { return '<div class="n-err">' + t + "</div>"; }
  function boxRow(label, filled, state) { return "<small>" + label + "</small>" + otp(0, filled) + (state ? state : ""); }
  X["01"] = [
    old01[0],
    old01[1],
    m("Step 2: four codes, with the test phone code visible", "Same dialog. The two email codes arrive in real inboxes on staging; the two phone codes use the stub and show on screen.",
      frame("Family", dlg2(2, '<b style="margin-top:6px">Enter all four codes</b><p>Each person confirms their email and their phone. They expire in 10 minutes.</p><div class="mk-two">' +
        '<div class="u-who">' + uav("SS", "g") + "<b>Siddharth (current head)</b>" + boxRow("Email code sent to sid@example.com", 1, badge("Verified", "g")) + boxRow("Phone code for +91 98•••• 4521", 1, badge("Verified", "g") + stubStrip("482 913")) + "</div>" +
        '<div class="u-who">' + uav("AS", "b") + "<b>Aditi (new head)</b>" + boxRow("Email code sent to aditi@example.com", 1, badge("Verified", "g")) + boxRow("Phone code for +91 99•••• 1033", 0, badge("Waiting", "a") + stubStrip("715 204")) + "</div></div>" +
        '<div class="mk-actions"><button class="mk-btn">Cancel request</button><button class="mk-btn mk-btn-p" disabled>Confirm change</button></div>'), fo2),
      ["The 'Test mode' strip appears only when the server returned a code (stub mode). The server refuses stub mode in production, so it can never appear there.", "The same strip is used on the sign-in screens as 'Local Dev OTP', now one shared component.", "Confirm change stays disabled until all four boxes show Verified. Green button, white text."]),
    m("Step 3: exactly what changes", "Final confirmation (D10 option B).", old01[3].html, old01[3].notes),
    m("Error states the dialog handles, each next to its own box", "Four of the cases in the error table, drawn together.",
      frame("Family", dlg2(2, '<b style="margin-top:6px">Enter all four codes</b><div class="mk-two">' +
        '<div class="u-who">' + uav("AS", "b") + "<b>Aditi (new head)</b>" + boxRow("Email code", 0, errStrip("That code is not right. 3 tries left.")) + boxRow("Phone code", 0, stubStrip("715 204") + errStrip("Please wait 40 seconds before asking for another code.")) + "</div>" +
        '<div class="u-who">' + uav("PS", "p") + "<b>Pooja (not eligible)</b>" + errStrip("This person's PAN is already on another Unifolio account, so they cannot become head.") + errStrip("Add an email address and a phone number first.") + errStrip("The codes expired. Nothing has changed. Start again.") + "</div></div>"), fo2),
      ["Messages are plain sentences next to the box or member they belong to. Nothing says 'error 409'.", "Each message maps to one code in the table in the Item 1 build section."]),
    m("The email each person receives (the same template as sign-in codes, new wording)", "Email to the current head. The new head's email says 'Confirm you are becoming Head of Family'.",
      '<div class="n-mail"><div class="n-mh"><b>Subject:</b> Confirm a change of Head of Family<br><small>From Unifolio</small></div><div class="n-mb"><p>Your <b>confirmation code</b> to change the Head of Family on Unifolio is below.</p><div class="n-code">482 913</div><hr><p>This code expires in <b>10 minutes</b>. It will make <b>Aditi</b> the Head of Family and move sign-in to her. If you did not ask for this, do not share the code and contact support@unifolio.in.</p><p class="n-fine">Unifolio will never ask you for this code.</p></div></div>',
      ["Same layout, fonts and dark-mode behaviour as the sign-in code email. Only the headline, the note and the 10-minute time change.", "Two more emails are new: 'The Head of Family on Unifolio has changed' (both people) and the 24-hour undo link (old head)."])
  ];

  /* ---------- 12 Switches: Transactions, Cash Flow Over Time ---------- */
  function swCtl(on) { return '<span class="n-swc"><span class="n-tg' + (on ? " on" : "") + '"><i></i></span><b>Switches: ' + (on ? "Included" : "Excluded") + "</b></span>"; }
  function barsChart() {
    var h = [3, 5, 4, 9, 6, 4, 14, 7, 5, 11, 6, 4, 18, 8, 6, 5, 12, 7, 6, 10, 5, 4, 9, 6], s = "";
    h.forEach(function (v, i) { s += '<i style="height:' + v * 3 + "px;background:" + (i % 11 === 5 ? "#E5484D" : "#22C55E") + '"></i>'; });
    return '<div class="n-bars">' + s + "</div>";
  }
  function cashCard(on) {
    return card("Cash Flow Over Time",
      '<div class="u-grid4"><div class="u-tile"><span class="a">Invested</span><span class="b">' + (on ? "₹22,40,000" : "₹18,40,000") + '</span></div><div class="u-tile"><span class="a">Withdrawn</span><span class="b" style="color:#c1272d">' + (on ? "₹6,10,000" : "₹2,10,000") + '</span></div><div class="u-tile"><span class="a">Net switched</span><span class="b">₹0</span></div><div class="u-tile"><span class="a">Net invested*</span><span class="b">₹16,30,000</span></div></div>' +
      '<div class="n-swl"><span>Switched between funds: <b>₹4,00,000 in 2 switches</b></span>' + swCtl(on) + "</div>" +
      '<p class="rl-m" style="margin:0 0 8px">' + (on ? "Invested and Withdrawn include the ₹4,00,000 moved between funds." : "Invested and Withdrawn do not include the ₹4,00,000 moved between funds.") + "</p>" + barsChart() +
      '<div class="u-key" style="margin-top:8px"><span><i style="background:#22C55E"></i>Invested</span><span><i style="background:#E5484D"></i>Withdrawn' + (on ? " (including switched out)" : "") + "</span></div>" +
      note("*Net invested never includes switches, whichever way the switch is set."), {});
  }
  X["12"] = [
    m("Switches included: Transactions, Cash Flow Over Time", "Investments › Mutual Funds › Transactions. The control sits in the same place as the old 'Include switches' button: right of the 'Switched between funds' line, just under the tiles.", frame("Transactions", cashCard(true), {}),
      ["The old card's button had no visible state. This is a two-state switch with the state written in words, so it never depends on colour.", "Included: Invested and Withdrawn add the switched-in and switched-out money, and the bars follow. Net invested and the gain do not change.", "In the new UI the Transactions card is the counterpart of the old Investment & Withdrawal card; the Performance page's four tiles are a different thing (D19, to confirm)."]),
    m("Switches excluded", "Same card, switch off.", frame("Transactions", cashCard(false), {}), ["The PDF print always shows 'Switches: Excluded'."])
  ];
