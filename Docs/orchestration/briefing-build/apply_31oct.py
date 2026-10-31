"""Applies the 31 Oct changes to the committed briefing (base = the file at bf2917af). Idempotent: always starts from the base.
Usage: python apply_31oct.py <scratch dir N> <base html> <output html>
"""
import os, re, sys
N, BASE, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
rd = lambda p: open(os.path.join(N, p), encoding="utf-8").read()
s = open(BASE, encoding="utf-8").read()
fails = []

def sub1(old, new, label, count=1):
    global s
    n = s.count(old)
    if n != count:
        fails.append(f"{label}: expected {count}, found {n}")
        return
    s = s.replace(old, new)

# ---------- A. CSS ----------
css = "<style>\n" + rd("patch.css") + "\n" + rd("patch2.css") + "\n</style>\n"
sub1("</head>", css + "</head>", "css")

# ---------- B. patch script (after the data script, before the card/decision script) ----------
# D40 is added to the decisions patch here so it exists for the references to it
d40 = r'''
  D.push({ id: "d40", tag: "D40 · Item 1",
    q: "Confirm the five open design points of Change Head of Family",
    ctx: "Raised by reading the sign-in, member and consent code. Each point has a recommendation in the Item 1 build section: (1) Self moves to the new head in the same transaction and the flag mirrors it; (2) a member with no PAN cannot become head; (3) the member's origin does not change; (4) the new head inherits the onboarding answers until they edit them; (5) head-change codes get a purpose column and a separate request table.",
    opts: [
      { n: "Accept all five recommendations", pro: ["Smallest change to existing code (the 15 places that test Self keep working)", "Closes every open point of item 1 at once"], con: ["A member without a PAN has to add one before becoming head"] },
      { n: "Accept most, change some (say which)", pro: ["Keeps the choices you care about"], con: ["Each change re-opens part of the design"] }],
    rec: 0, why: "The five points follow from decisions you already made (D3 option B, D29 option A, D31). Accepting them lets the backend run start without another round." });
'''
decisions_js = rd("patch_decisions.js").replace('  /* New decisions raised by the 31 Oct answers */', d40 + '\n  /* New decisions raised by the 31 Oct answers */')
patch_script = "<script>\n" + decisions_js + "\n" + rd("patch_items.js") + "\n" + rd("patch_audits.js") + "\n</script>\n"
marker = "<script>\nvar S = { done: \"Already built\""
sub1(marker, patch_script + marker, "patch script position")

# ---------- C. hooks ----------
sub1("DECISIONS = DECISIONS.concat(NEW_DECISIONS).concat(NEW_DECISIONS2).concat(NEW_DECISIONS3);",
     "DECISIONS = DECISIONS.concat(NEW_DECISIONS).concat(NEW_DECISIONS2).concat(NEW_DECISIONS3);\nif (window.PATCH_DECISIONS) window.PATCH_DECISIONS(DECISIONS);", "decisions hook")
sub1("\n  window.MOCKUPS = X;\n", "\n" + rd("patch_mocks.js") + "\n" + rd("patch_mocks2.js") + "\n  window.MOCKUPS = X;\n", "mock insert")
sub1('"Performance": "11 benchmark · 12 switches"', '"Performance": "11 benchmark"', "screen map performance")
sub1('"Transactions": "(no change)"', '"Transactions": "12 switches (include or exclude)"', "screen map transactions")
sub1('var LI_OPTS = { id:"li1", tag:"L1 · Item 4.4",', 'var LI_OPTS = { id:"li1", tag:"L1 · Item 4.4 · ON HOLD 31 Oct: LinkedIn work is paused; the hybrid answer stands for when it resumes",', "li tag")

# ---------- D. js2: tabs, start page, badges ----------
sub1('["p-items", "The changes", [idx, sec("deep1"), sec("valbuild")]]',
     '["p-items", "The changes", [idx, sec("deep1"), sec("i1b"), sec("i4b"), sec("rules"), sec("valbuild"), sec("valgaps"), sec("fscheck")]]', "tab items")
sub1('["p-plan", "Plan and timing", [sec("ord"), sec("tl0"),', '["p-plan", "Plan and timing", [sec("play0"), sec("spikes"), sec("ord"), sec("tl0"),', "tab plan")
sub1("Latest stakeholder update: 30 Oct (see below).", "Latest stakeholder update: 31 Oct (see below).", "start update")
sub1("Plan: six Codex runs, then documentation, then one staging pass. About 20 to 22 working days.", "Plan: Step 0 checks, seven Codex runs, then documentation, then one staging pass. About 26 to 28 working days (stopped SIPs and LinkedIn are on hold).", "start plan")
sub1("var blocking = { d14: 1, d19: 1, d22: 1, d29: 1, d32: 1, d35: 1 };", "var blocking = {};", "blocking set")
m = re.search(r'var SINCE = \{.*?\};', s, re.S)
if m:
    new_since = 'var SINCE = { "01": ["Updated 31 Oct", "Runs 5, 6"], "02": ["Updated 31 Oct", "Run 4"], "03": ["Updated 31 Oct", "Run 1"], "04": ["Updated 31 Oct", "Run 1"], "05": ["Updated 31 Oct", "Run 1"], "07": ["Updated 31 Oct", "Run 2"], "08": ["Updated 31 Oct", "Run 2"], "09": ["Updated 31 Oct", "Run 2"], "10": ["Changed 30 Oct", "Run 2"], "11": ["Updated 31 Oct", "Run 3"], "12": ["Updated 31 Oct", "Run 3"], "13": ["Updated 31 Oct", "Run 1"] };'
    s = s[:m.start()] + new_since + s[m.end():]
else:
    fails.append("SINCE not found")

# ---------- E. static sections ----------
new_sections = rd("sections/sec_i1.html") + rd("sections/sec_i45.html") + rd("sections/sec_valgaps.html") + rd("sections/sec_fscheck.html") + rd("sections/sec_spikes.html") + rd("sections/sec_play.html") + rd("sections/sec_step0r3.html")
sub1('  <section class="sec" aria-labelledby="ord">', new_sections + '  <section class="sec" aria-labelledby="ord">', "insert sections")
sub1("<p>Cheap, low-risk work first, so the analytics page gets simpler before we touch the heavier calculations.</p>",
     "<p>Cheap, low-risk work first, so the analytics page gets simpler before we touch the heavier calculations. The run order in the execution playbook is the current plan; this list is the earlier reasoning.</p>", "ord intro")

# ---------- F. item 7 build section (static) ----------
sub1("<li>The Portfolio Valuation vs. Benchmarks section stays as it is, still computed from stocks (the earlier decision for item 7). Only its two excluded lists become collapsible.</li>",
     "<li><b>Changed 31 Oct (Q4):</b> the Portfolio Valuation vs. Benchmarks section stays on the page and keeps its look and its two collapsible lists, but its P/E and P/B are now built the same way as the fund table (factsheet where printed, otherwise NSE/BSE), so the page uses one method. Forward versus trailing P/E in that total is decided by D39.</li>", "rule bullet")

# what we know block -> pointer to the new sections
a = s.index('<div class="block"><h3>What we know about factsheets today, and what we do not</h3>')
b = s.index('<div class="block"><h3>End to end, step by step</h3>')
s = s[:a] + '''<div class="block"><h3>What we know about factsheets today, and what we do not</h3>
        <p><b>Updated 31 Oct.</b> The earlier version of this block looked only at the 11 hand-import houses. The audit now covers 94 distinct factsheet PDFs and the saved text of the rest. <b>Five fund houses print a per-scheme P/E and P/B</b>: Invesco (forward P/E), ITI, Kotak, UTI and Aditya Birla Sun Life. HDFC and ICICI print only a glossary definition. Axis, Bandhan, Trust, WhiteOak and about 25 others print nothing. All the figures that exist are in text, not images. The table of houses, the benchmark findings and the monthly check are in the section <b>Monthly factsheet check</b>; the gaps are in <b>Item 7 methodology gaps</b>; the commands are in <b>Step 0</b>.</p>
        <p>Consequence: the computed path carries most funds, and the label must carry the basis because the printed figures are not alike.</p>
      </div>

      ''' + s[b:]

# frontend block: replace the old mock with the item 7 section's mock (same picture as the item 7 card)
a = s.index("<p>Proposed layout (sample numbers, same card style as the app):</p>")
b = s.index('<div class="block after"><h3>Verified on 30 Oct: what the NSE and BSE sources actually do</h3>')
s = s[:a] + '''<p><b>Layout (31 Oct):</b> this is the same picture as the Valuation by Fund mockup in item 7. The earlier table layout shown here is dropped. Labels: short Factsheet and NSE/BSE tags beside each number, with a compact hover note (tap on a phone) and a one-line footnote below.</p>
        <div class="mkscroll" id="valMock"></div>
      </div>

      ''' + s[b:]
# fill the host from the mockup list at load time (the mockup data is defined by then)
fill = '''<script>
(function () {
  var host = document.getElementById("valMock");
  var list = window.MOCKUPS && window.MOCKUPS["07"];
  if (host && list && list[2]) host.innerHTML = list[2].html;
})();
</script>
'''
sub1('<script>\nvar S = { done: "Already built"', fill + '<script>\nvar S = { done: "Already built"', "val mock fill")

sub1("<li><b>Coverage is unknown.</b> Only 3 of the 11 houses we hold publish the numbers. Until Step 0, we cannot say what share of your funds will show a factsheet value.</li>",
     "<li><b>Coverage is limited.</b> Only 5 fund houses print a per-scheme P/E and P/B (Invesco, ITI, Kotak, UTI, ABSL). The exact share of funds is known only after Step 0 (S2, S3) on the VM's files.</li>", "risk coverage")
sub1("Together they add roughly 5 to 8 working days to the earlier plan; the timeline and run table are not changed yet, to be merged once the other pending changes arrive.",
     "Together they add roughly 5 to 8 working days. The timeline and run table now include them (Phase A in Run 2; B and C optional).", "effort tail")

a = s.index('<div class="block"><h3>Questions to settle before building</h3>')
b = s.index("</article>", a)
s = s[:a] + '''<div class="block after"><h3>Questions Q1 to Q6: answered 31 Oct</h3>
        <ul>
          <li><b>Q1. How old can a factsheet value be?</b> Recommended option: use it if it is the latest factsheet and at most about 75 days old on the NAV date; otherwise compute.</li>
          <li><b>Q2. Forward next to trailing P/E?</b> Show the full factsheet basis in plain words (for example "Factsheet, forward earnings (FY27E)") with a short hover note that explains forward versus trailing.</li>
          <li><b>Q3. Phases?</b> Step 0 first (the factsheet checks and the VM spikes), then Phase A, then B, then C.</li>
          <li><b>Q4. Portfolio figure?</b> Built the same way as the fund table, for consistency (this raised D39, forward versus trailing in the total).</li>
          <li><b>Q5. Label wording?</b> Both: short labels with a hover note, plus a one-line footnote under the table.</li>
          <li><b>Q6. Averaging method?</b> Recommended option: weighted harmonic mean, with a plain-words disclaimer on why (D17).</li>
        </ul>
        <p>All six are also in the Decisions tab as answered.</p>
      </div>
    ''' + s[b:]

# ---------- G. LinkedIn section intro ----------
sub1("<p>This one needs more than a pick-one answer, because we have no LinkedIn data today and every way of getting it has a cost. First whether to do it at all, then how.</p>",
     "<p><b>ON HOLD (31 Oct): LinkedIn work is paused.</b> Item 4 ships without the LinkedIn table (migration 0048 stays reserved), the icon and the verification process. What was agreed stays on record for when it resumes: nothing is shown until two people have verified a profile, and wrong profiles are never shown. How a profile is matched to the right manager is written out in the item 3, 4 and 5 rules section.</p><p>This one needs more than a pick-one answer, because we have no LinkedIn data today and every way of getting it has a cost. First whether to do it at all, then how.</p>", "li intro")

sub1("Questions D10 to D34 are new.", "Questions D10 to D40 are new. Updated 31 Oct: stakeholder answers, the Step 0 checks and an execution playbook (see Plan and timing).", "header questions")

sub1("<p>New request from the stakeholder: the cancelled SIPs section is not working well. This is how it works today and how we would fix it.</p>",
     "<p><b>ON HOLD (31 Oct): stopped SIPs are paused.</b> Nothing below is built, and the questions D25 to D27 wait. The analysis stays here for when it resumes.</p><p>New request from the stakeholder: the cancelled SIPs section is not working well. This is how it works today and how we would fix it.</p>", "sip intro")
sub1("<p>Open a card for the line-by-line status, how we would do it, and what it touches. Difficulty reflects the work that is left, not the size of the document's wording.</p>",
     "<p><b>These 13 cards are the first draft of 29 Oct and are kept for history.</b> Where they disagree with the deep-dive cards in the The changes tab, the deep-dive cards are current (for example, item 5 here still lists the DIY picker, which was dropped, and item 10 still says remove). Open a card for the line-by-line status, how we would do it, and what it touches. Difficulty reflects the work that is left, not the size of the document's wording.</p>", "background intro")
sub1("<td>Run 3</td><td>Extra item</td></tr></tbody>", "<td>On hold</td><td>Extra item, on hold</td></tr></tbody>", "index sip row")

# ---------- H. header meta ----------
sub1("NOTHING IMPLEMENTED YET", "UPDATED 31 OCT · NOTHING IMPLEMENTED YET", "meta line")

open(OUT, "w", encoding="utf-8").write(s)
print("output bytes", len(s.encode("utf-8")))
print("FAILS:" if fails else "all replacements applied", *fails, sep="\n  ")
sys.exit(1 if fails else 0)
