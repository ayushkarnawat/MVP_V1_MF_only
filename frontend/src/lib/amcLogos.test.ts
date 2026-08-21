import { describe, it, expect } from "vitest";
import { getAmcLogo, getAmcInfo } from "./amcLogos";

describe("amcLogos utility", () => {
  it("resolves official HDFC logo URL from AMC name", () => {
    const info = getAmcInfo("HDFC Mutual Fund");
    expect(info).toBeTruthy();
    expect(info?.domain).toBe("hdfcfund.com");
    expect(info?.officialLogoUrl).toContain("domain=hdfcfund.com");
  });

  it("resolves official Edelweiss logo URL from AMC name", () => {
    const info = getAmcInfo("Edelweiss Asset Management");
    expect(info).toBeTruthy();
    expect(info?.domain).toBe("edelweissmf.com");
  });

  it("resolves official ICICI Prudential logo from alias", () => {
    const info = getAmcInfo("ICICI Prudential Mutual Fund");
    expect(info).toBeTruthy();
    expect(info?.domain).toBe("icicipruamc.com");
  });

  it("resolves official SBI logo from AMC name", () => {
    const info = getAmcInfo("SBI Mutual Fund");
    expect(info).toBeTruthy();
    expect(info?.domain).toBe("sbimf.com");
  });

  it("resolves official Axis logo from AMC name", () => {
    const info = getAmcInfo("Axis Mutual Fund");
    expect(info).toBeTruthy();
    expect(info?.domain).toBe("axismf.com");
  });

  it("resolves official logo from scheme name when AMC name is empty", () => {
    const logo = getAmcLogo(null, "Nippon India Small Cap Fund Direct Growth");
    expect(logo).toBeTruthy();
    expect(logo).toContain("domain=nipponindiamf.com");
  });

  it("returns null for unknown AMC without throwing", () => {
    const info = getAmcInfo("Unknown Global Fund");
    expect(info).toBeNull();
  });
});
