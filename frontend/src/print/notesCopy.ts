import { formatDataDateTail } from "../lib/dataDates";

export interface NoteBlock {
  heading: string;
  paragraphs: string[];
}

export function pricesSentence(priceDate: string | null): string {
  const tail = formatDataDateTail("prices", priceDate);
  return tail ? `Prices are ${tail}.` : "Prices are the latest published NAVs.";
}

export function marketCapSentence(marketCapDate: string | null): string {
  const tail = formatDataDateTail("marketCapList", marketCapDate);
  return tail
    ? `The market-cap list is the AMFI classification ${tail}.`
    : "The market-cap list follows the latest AMFI classification.";
}

export function buildNotes(priceDate: string | null, marketCapDate: string | null): NoteBlock[] {
  return [
    {
      heading: "Current value",
      paragraphs: [`Units held multiplied by the latest published NAV for each fund. ${pricesSentence(priceDate)}`],
    },
    {
      heading: "Invested and gain",
      paragraphs: ["Invested is the money you put in less withdrawals. Gain is current value minus invested."],
    },
    {
      heading: "XIRR",
      paragraphs: [
        "The yearly return that makes all your purchases and withdrawals, on their own dates, grow to today's value.",
      ],
    },
    {
      heading: "Value over time and period returns",
      paragraphs: ["Built from the dated NAVs recorded in your statement, joined by straight lines between dates."],
    },
    {
      heading: "What the dates mean",
      paragraphs: [
        `Prices are daily. Holdings are monthly disclosures from fund houses. ${marketCapSentence(marketCapDate)}`,
      ],
    },
    {
      heading: "Important",
      paragraphs: [
        "These figures are indicators based on the statements you imported and are not a recommendation to buy, sell or hold any fund. Past performance does not guarantee future results.",
      ],
    },
  ];
}

export const NOTES: NoteBlock[] = buildNotes(null, null);
