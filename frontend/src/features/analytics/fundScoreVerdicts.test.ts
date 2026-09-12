import { describe, expect, it } from "vitest";
import {
  assessFactor,
  buildWhySentence,
  displayTierFromBackendTier,
  whatThisMeansForYou,
} from "./fundScoreVerdicts";

describe("displayTierFromBackendTier", () => {
  it("flips the backend 5=best convention to a 1=best display convention", () => {
    expect(displayTierFromBackendTier(5)).toBe(1);
    expect(displayTierFromBackendTier(4)).toBe(2);
    expect(displayTierFromBackendTier(3)).toBe(3);
    expect(displayTierFromBackendTier(2)).toBe(4);
    expect(displayTierFromBackendTier(1)).toBe(5);
  });
});

describe("assessFactor", () => {
  it("buckets p >= 50 as a green Strength", () => {
    expect(assessFactor("return", 50)).toMatchObject({ bucket: "strength", dotColor: "green", verdict: "strong" });
    expect(assessFactor("return", 100)).toMatchObject({ bucket: "strength", dotColor: "green", verdict: "excellent" });
  });

  it("buckets 20 <= p < 50 as an orange Watch-out", () => {
    expect(assessFactor("risk", 49)).toMatchObject({ bucket: "watchout", dotColor: "orange", verdict: "weak" });
    expect(assessFactor("risk", 20)).toMatchObject({ bucket: "watchout", dotColor: "orange", verdict: "weak" });
  });

  it("buckets p < 20 as a red Watch-out", () => {
    expect(assessFactor("consistency", 19)).toMatchObject({ bucket: "watchout", dotColor: "red", verdict: "poor" });
    expect(assessFactor("consistency", 0)).toMatchObject({ bucket: "watchout", dotColor: "red", verdict: "poor" });
  });

  it("crosses the excellent/strong boundary at p = 80", () => {
    expect(assessFactor("return", 79.99)).toMatchObject({ verdict: "strong" });
    expect(assessFactor("return", 80)).toMatchObject({ verdict: "excellent" });
  });

  it("returns a non-empty sentence distinct per factor", () => {
    const returnSentence = assessFactor("return", 90).sentence;
    const riskSentence = assessFactor("risk", 90).sentence;
    const consistencySentence = assessFactor("consistency", 90).sentence;
    expect(returnSentence).not.toBe(riskSentence);
    expect(riskSentence).not.toBe(consistencySentence);
    [returnSentence, riskSentence, consistencySentence].forEach((s) => expect(s.length).toBeGreaterThan(0));
  });
});

describe("buildWhySentence", () => {
  it("leads with the strongest factor and mentions low cost for top tiers", () => {
    const sentence = buildWhySentence({
      returnPct: 88,
      riskPct: 82,
      consistencyPct: 80,
      displayTier: 1,
      costAdjustment: 0.25,
    });
    expect(sentence).toBe("Scores well mainly due to strong long-term performance and low cost.");
  });

  it("omits the cost clause when there's no low-fee bonus", () => {
    const sentence = buildWhySentence({
      returnPct: 88,
      riskPct: 82,
      consistencyPct: 80,
      displayTier: 2,
      costAdjustment: null,
    });
    expect(sentence).toBe("Scores well mainly due to strong long-term performance.");
  });

  it("leads with the weakest factor and mentions high cost for bottom tiers", () => {
    const sentence = buildWhySentence({
      returnPct: 15,
      riskPct: 40,
      consistencyPct: 45,
      displayTier: 5,
      costAdjustment: -0.25,
    });
    expect(sentence).toBe("Held back mainly by weaker long-term performance and higher-than-average cost.");
  });

  it("balances strongest and weakest for the middle tier", () => {
    const sentence = buildWhySentence({
      returnPct: 70,
      riskPct: 30,
      consistencyPct: 50,
      displayTier: 3,
      costAdjustment: null,
    });
    expect(sentence).toBe(
      "Performs roughly in line with similar funds, with strength in strong long-term performance balanced by weaker downside protection."
    );
  });
});

describe("whatThisMeansForYou", () => {
  it("returns a distinct sentence for every display tier 1-5", () => {
    const sentences = [1, 2, 3, 4, 5].map(whatThisMeansForYou);
    expect(new Set(sentences).size).toBe(5);
    sentences.forEach((s) => expect(s.length).toBeGreaterThan(0));
  });
});
