/**
 * Official AMC Domain & Brand Asset Map for Indian Mutual Fund AMCs.
 * Resolves official high-resolution brand logos directly from AMC official domains.
 */

export interface AmcInfo {
  key: string;
  name: string;
  domain: string;
  officialLogoUrl: string;
  clearbitLogoUrl: string;
}

const AMC_DOMAIN_MAP: Record<string, { name: string; domain: string }> = {
  hdfc: { name: "HDFC Mutual Fund", domain: "hdfcfund.com" },
  icici: { name: "ICICI Prudential Mutual Fund", domain: "icicipruamc.com" },
  sbi: { name: "SBI Mutual Fund", domain: "sbimf.com" },
  edelweiss: { name: "Edelweiss Mutual Fund", domain: "edelweissmf.com" },
  axis: { name: "Axis Mutual Fund", domain: "axismf.com" },
  nippon: { name: "Nippon India Mutual Fund", domain: "nipponindiamf.com" },
  kotak: { name: "Kotak Mutual Fund", domain: "kotakmf.com" },
  mirae: { name: "Mirae Asset Mutual Fund", domain: "miraeassetmf.co.in" },
  uti: { name: "UTI Mutual Fund", domain: "utimf.com" },
  birla: { name: "Aditya Birla Sun Life Mutual Fund", domain: "adityabirlacapital.com" },
  dsp: { name: "DSP Mutual Fund", domain: "dspim.com" },
  ppfas: { name: "Parag Parikh Mutual Fund", domain: "amc.ppfas.com" },
  tata: { name: "Tata Mutual Fund", domain: "tatamutualfund.com" },
  franklin: { name: "Franklin Templeton Mutual Fund", domain: "franklintempletonindia.com" },
  bandhan: { name: "Bandhan Mutual Fund", domain: "bandhanmutual.com" },
  sundaram: { name: "Sundaram Mutual Fund", domain: "sundarammutual.com" },
  quant: { name: "Quant Mutual Fund", domain: "quantmutual.com" },
  motilal: { name: "Motilal Oswal Mutual Fund", domain: "motilaloswalmf.com" },
  canara: { name: "Canara Robeco Mutual Fund", domain: "canararobeco.com" },
  invesco: { name: "Invesco Mutual Fund", domain: "invescomutualfund.com" },
  hsbc: { name: "HSBC Mutual Fund", domain: "assetmanagement.hsbc.co.in" },
  groww: { name: "Groww Mutual Fund", domain: "groww.in" },
  zerodha: { name: "Zerodha Mutual Fund", domain: "zerodhafundhouse.com" },
  navi: { name: "Navi Mutual Fund", domain: "navi.com" },
  pgim: { name: "PGIM India Mutual Fund", domain: "pgimindiamf.com" },
  mahindra: { name: "Mahindra Manulife Mutual Fund", domain: "mahindramanulife.com" },
  union: { name: "Union Mutual Fund", domain: "unionmf.com" },
  whiteoak: { name: "WhiteOak Capital Mutual Fund", domain: "whiteoakcapitalmf.in" },
  "360one": { name: "360 ONE Mutual Fund", domain: "360.one" },
  baroda: { name: "Baroda BNP Paribas Mutual Fund", domain: "barodabnpparibasmf.in" },
  lic: { name: "LIC Mutual Fund", domain: "licmf.com" },
  quantum: { name: "Quantum Mutual Fund", domain: "quantumamc.com" },
  samco: { name: "Samco Mutual Fund", domain: "samcomf.com" },
  helios: { name: "Helios Mutual Fund", domain: "heliosmf.in" },
  oldbridge: { name: "Old Bridge Mutual Fund", domain: "oldbridgemf.com" },
};

/**
 * Alias mapping to normalize raw AMC names or scheme names.
 */
const ALIAS_MAP: Record<string, string> = {
  hdfc: "hdfc",

  icici: "icici",
  "icici prudential": "icici",
  icicipru: "icici",
  ipru: "icici",

  sbi: "sbi",
  "state bank of india": "sbi",

  edelweiss: "edelweiss",

  axis: "axis",

  nippon: "nippon",
  "nippon india": "nippon",
  reliance: "nippon",

  kotak: "kotak",
  "kotak mahindra": "kotak",

  mirae: "mirae",
  "mirae asset": "mirae",

  uti: "uti",

  birla: "birla",
  "aditya birla": "birla",
  "aditya birla sun life": "birla",
  absl: "birla",
  sunlife: "birla",

  dsp: "dsp",
  "dsp blackrock": "dsp",

  ppfas: "ppfas",
  "parag parikh": "ppfas",

  tata: "tata",

  franklin: "franklin",
  "franklin templeton": "franklin",

  bandhan: "bandhan",
  idfc: "bandhan",

  sundaram: "sundaram",

  quant: "quant",

  motilal: "motilal",
  "motilal oswal": "motilal",

  canara: "canara",
  "canara robeco": "canara",

  invesco: "invesco",

  hsbc: "hsbc",
  lnt: "hsbc",
  "l&t": "hsbc",

  groww: "groww",
  indiabulls: "groww",

  zerodha: "zerodha",

  navi: "navi",

  pgim: "pgim",
  "pgim india": "pgim",

  mahindra: "mahindra",
  "mahindra manulife": "mahindra",

  union: "union",

  whiteoak: "whiteoak",
  "whiteoak capital": "whiteoak",

  "360one": "360one",
  "360 one": "360one",
  iifl: "360one",

  baroda: "baroda",
  "baroda bnp": "baroda",
  "baroda bnp paribas": "baroda",

  lic: "lic",
  quantum: "quantum",
  samco: "samco",
  helios: "helios",
  oldbridge: "oldbridge",
  "old bridge": "oldbridge",
};

/**
 * Returns full AMC info including official logo URLs for a given AMC or scheme name.
 */
export function getAmcInfo(
  amcName?: string | null,
  schemeName?: string | null
): AmcInfo | null {
  const normalize = (text: string) =>
    text
      .toLowerCase()
      .replace(/mutual\s+fund/g, "")
      .replace(/asset\s+management/g, "")
      .replace(/pvt\.?\s*ltd\.?/g, "")
      .replace(/limited/g, "")
      .replace(/mf/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .trim();

  const candidates: string[] = [];

  if (amcName) candidates.push(normalize(amcName));
  if (schemeName) candidates.push(normalize(schemeName));

  for (const text of candidates) {
    if (!text) continue;

    // Direct key match
    const alias = ALIAS_MAP[text];
    if (alias && AMC_DOMAIN_MAP[alias]) {
      const data = AMC_DOMAIN_MAP[alias];
      return {
        key: alias,
        name: data.name,
        domain: data.domain,
        officialLogoUrl: `https://www.google.com/s2/favicons?domain=${data.domain}&sz=128`,
        clearbitLogoUrl: `https://logo.clearbit.com/${data.domain}`,
      };
    }

    // Tokenized word search
    for (const [key, mapTarget] of Object.entries(ALIAS_MAP)) {
      if (text.includes(key) && AMC_DOMAIN_MAP[mapTarget]) {
        const data = AMC_DOMAIN_MAP[mapTarget];
        return {
          key: mapTarget,
          name: data.name,
          domain: data.domain,
          officialLogoUrl: `https://www.google.com/s2/favicons?domain=${data.domain}&sz=128`,
          clearbitLogoUrl: `https://logo.clearbit.com/${data.domain}`,
        };
      }
    }
  }

  return null;
}

/**
 * Returns an official high-resolution logo URL for a given AMC or scheme name.
 * Returns null if no matching logo is found, allowing graceful fallback.
 */
export function getAmcLogo(
  amcName?: string | null,
  schemeName?: string | null
): string | null {
  const info = getAmcInfo(amcName, schemeName);
  return info ? info.officialLogoUrl : null;
}
