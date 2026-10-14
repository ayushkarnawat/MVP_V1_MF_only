# Attribute 15 real-sample fixtures

Captured on 2026-10-14 by plain HTTP. Tests use MockTransport and local files;
`tests.offline_http` blocks real HTTP transports during the affected-test gate.
No cookie or crumb is stored.

- `pe_121026.csv`: NSE PE_121026.csv, 12-Oct-2026, 250 real rows.
  Preserves SYMBOL P/E and ADJUSTED P/E; runtime uses SYMBOL P/E only.
- `security_12102026.csv`: decompressed NSE_CM_security_12102026.csv.gz,
  12-Oct-2026, 276 real rows, original columns and series retained.
  Both samples retain the first 200 source rows plus relevant Nifty 50 and
  Motilal Oswal YO58 symbols. They are samples, not complete security masters.
- `nifty50.csv` / `nifty500.csv`: complete small constituent CSVs from the
  handoff's verified NSE/Nifty endpoints (Company Name, Industry, Symbol,
  Series, ISIN Code).
- `yahoo_<SYMBOL>.json`: 22 unmodified successful quoteSummary responses,
  modules defaultKeyStatistics,summaryDetail. Retrieved using one documented
  fc.yahoo.com cookie -> quote page -> getcrumb handshake. The cookie endpoint
  returns 404 while setting its cookie; subsequent requests returned 200.
- `screener_reliance.html`: real top-ratios HTML fragment from
  https://www.screener.in/company/RELIANCE/consolidated/; preserves nested
  Current Price and Book Value markup for the fallback parser.
- `index_nifty50.json` / `index_nifty500.json`: unmodified BackPage P/E/P/B
  responses for 05–14 Oct 2026, latest supplied date 13-Oct-2026.
- `fixture_symbols.json`: capture manifest for the 22 Yahoo symbols.

Source URLs:
https://nsearchives.nseindia.com/content/equities/peDetail/PE_121026.csv
https://nsearchives.nseindia.com/content/cm/NSE_CM_security_12102026.csv.gz
https://archives.nseindia.com/content/indices/ind_nifty500list.csv
https://www.niftyindices.com/IndexConstituent/ind_nifty50list.csv
https://query2.finance.yahoo.com/v10/finance/quoteSummary/<SYMBOL>.NS
https://www.niftyindices.com/BackPage/getpepbHistoricaldataDBtoString

The real portfolio test parses/writes the committed Motilal Oswal YO58
Sep-2026 disclosure through the engine. All 27 equity ISINs resolve; 22 have
positive NSE P/E and captured Yahoo P/B, covering 72.7175425452% of equity.
Only matching real Yahoo responses are accepted for this real-data test;
missing sample symbols have failing fallback responses, so no other stock's
ratio is substituted. The resulting harmonic P/E is 33.516556 and P/B 4.367072.
Stock as_of_date records the NSE P/E file date; Yahoo samples were captured
on 14-Oct-2026. Index figures on 13-Oct are Nifty 50 19.41 / 2.79 and
Nifty 500 21.76 / 3.10.
