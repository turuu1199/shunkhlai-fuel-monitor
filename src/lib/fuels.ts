/** Fuel types reported by the source. Alerts are sent for ai92 only. */
export const FUEL_TYPES = ["ai92", "ai95", "ai98", "euro92", "diesel"] as const;
export type FuelType = (typeof FUEL_TYPES)[number];

export const FUEL_LABEL: Record<FuelType, { mn: string; en: string }> = {
  ai92: { mn: "АИ-92", en: "A92" },
  ai95: { mn: "АИ-95", en: "A95" },
  ai98: { mn: "АИ-98", en: "A98" },
  euro92: { mn: "Евро-92", en: "Euro-92" },
  diesel: { mn: "Дизель", en: "Diesel" },
};
