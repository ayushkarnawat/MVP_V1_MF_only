import { describe, it, expect } from "vitest";
import { getAmcInfo, getAmcLogo } from "./amcLogos";

describe("amcLogos utility", () => {
  it("resolves official HDFC logo from AMC name", () => {
    const info = getAmcInfo("HDFC Mutual Fund");
    expect(info?.key).toBe("hdfc");
    expect(info?.domain).toBe("hdfcfund.com");
    expect(info?.officialLogoUrl).toContain("hdfcfund.com");
  });

  it("resolves official Edelweiss logo from AMC name", () => {
    const info = getAmcInfo("Edelweiss Asset Management");
    expect(info?.key).toBe("edelweiss");
    expect(info?.domain).toBe("edelweissmf.com");
    expect(info?.officialLogoUrl).toContain("edelweissmf.com");
  });

  it("resolves official ICICI Prudential logo from alias", () => {
    const info = getAmcInfo("ICICI Prudential Mutual Fund");
    expect(info?.key).toBe("icici");
    expect(info?.domain).toBe("icicipruamc.com");
    expect(info?.officialLogoUrl).toContain("icicipruamc.com");
  });

  it("resolves official SBI logo from AMC name", () => {
    const info = getAmcInfo("SBI Mutual Fund");
    expect(info?.key).toBe("sbi");
    expect(info?.domain).toBe("sbimf.com");
    expect(info?.officialLogoUrl).toContain("sbimf.com");
  });

  it("resolves official Axis logo from AMC name", () => {
    const info = getAmcInfo("Axis Mutual Fund");
    expect(info?.key).toBe("axis");
    expect(info?.domain).toBe("axismf.com");
  });

  it("resolves official logo from scheme name when AMC name is empty", () => {
    const url = getAmcLogo(null, "Nippon India Small Cap Fund Direct Growth");
    expect(url).toContain("nipponindiamf.com");
  });

  it("fallback_tile_renders_for_a_fund_house_not_in_the_map", () => {
    const info = getAmcInfo("Unlisted Boutique Mutual Fund", "Unlisted Boutique Opportunities Fund");
    expect(info).toBeNull();
  });

  it("logo_map_matches_the_real_list_of_fund_houses", () => {
    expect(getAmcInfo("Quantum Mutual Fund")?.key).toBe("quantum");
    expect(getAmcInfo(undefined, "Quantum Long Term Equity Value Fund")?.key).toBe("quantum");
    expect(getAmcInfo("Quant Mutual Fund")?.key).toBe("quant");
    expect(getAmcInfo(undefined, "Quant Small Cap Fund")?.key).toBe("quant");
    expect(getAmcInfo("Bank of India Mutual Fund")?.key).toBe("boi");
    expect(getAmcInfo(undefined, "Bank of India Flexi Cap Fund")?.key).toBe("boi");
    expect(getAmcInfo("ITI Mutual Fund")?.key).toBe("iti");
    expect(getAmcInfo("UTI Mutual Fund")?.key).toBe("uti");
    expect(getAmcInfo("LIC Mutual Fund")?.key).toBe("lic");
    expect(getAmcInfo("Alpha Opportunities Mutual Fund", "Alpha Opportunities Fund")).toBeNull();
    expect(getAmcInfo("Public Sector Mutual Fund", "Public Equity Fund")).toBeNull();
    expect(getAmcInfo("Retirement Solutions Mutual Fund", "Retirement Solutions Fund")).toBeNull();
    expect(getAmcInfo("Unlisted Boutique Mutual Fund", "Unlisted Boutique Opportunities Fund")).toBeNull();
  });

  it("the_fund_house_named_first_wins_over_a_generic_word_later_in_the_name", () => {
    expect(getAmcInfo(undefined, "Tata Quant Fund Direct Growth")?.key).toBe("tata");
    expect(getAmcInfo(undefined, "DSP Quant Fund")?.key).toBe("dsp");
    expect(getAmcInfo(undefined, "Axis Quant Fund")?.key).toBe("axis");
    expect(getAmcInfo(undefined, "SBI Quant Fund")?.key).toBe("sbi");
    expect(getAmcInfo(undefined, "UTI Quant Fund")?.key).toBe("uti");
    expect(getAmcInfo(undefined, "Groww Quant Fund")?.key).toBe("groww");
    expect(getAmcInfo(undefined, "Quant Tata Fund")?.key).toBe("quant");
    // A longer alias that starts at the same place still beats its shorter prefix.
    expect(getAmcInfo(undefined, "Quantum Long Term Equity Value Fund")?.key).toBe("quantum");
  });
});
