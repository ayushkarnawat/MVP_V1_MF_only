import type { ComponentType } from "react";
import {
  Building2,
  Car,
  ChartCandlestick,
  ChartPie,
  Coins,
  Cpu,
  Fuel,
  Landmark,
  Newspaper,
  Percent,
  Pickaxe,
  Pill,
  Scale,
  ShoppingBasket,
} from "lucide-react";
import type { LucideProps } from "lucide-react";
import type { NewsIconKey } from "../types";

const ICONS: Record<NewsIconKey, { name: string; Icon: ComponentType<LucideProps> }> = {
  banks_financials: { name: "landmark", Icon: Landmark },
  it_tech: { name: "cpu", Icon: Cpu },
  pharma_health: { name: "pill", Icon: Pill },
  auto_ev: { name: "car", Icon: Car },
  consumer_fmcg: { name: "shopping-basket", Icon: ShoppingBasket },
  energy: { name: "fuel", Icon: Fuel },
  metals_mining: { name: "pickaxe", Icon: Pickaxe },
  realty_infra: { name: "building-2", Icon: Building2 },
  gold_silver: { name: "coins", Icon: Coins },
  rates_rbi: { name: "percent", Icon: Percent },
  funds_amc: { name: "chart-pie", Icon: ChartPie },
  markets: { name: "chart-candlestick", Icon: ChartCandlestick },
  regulation: { name: "scale", Icon: Scale },
  general: { name: "newspaper", Icon: Newspaper },
};

export function NewsCategoryIcon({ iconKey }: { iconKey: NewsIconKey }) {
  const entry = ICONS[iconKey] ?? ICONS.general;
  const { Icon } = entry;
  return (
    <span
      data-testid="news-icon"
      data-icon={entry.name}
      aria-hidden="true"
      className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-[var(--ui-card)] text-[var(--ui-text)]"
    >
      <Icon size={20} aria-hidden="true" />
    </span>
  );
}
