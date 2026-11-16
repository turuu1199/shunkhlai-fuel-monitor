export type DistrictCode = "BZD" | "SBD" | "SHD" | "CHD" | "KHUD" | "BGD" | "BND" | "NLH" | "BHD";

export const DISTRICTS: { code: DistrictCode; mn: string; en: string }[] = [
  { code: "BZD", mn: "Баянзүрх", en: "Bayanzurkh" },
  { code: "SBD", mn: "Сүхбаатар", en: "Sukhbaatar" },
  { code: "CHD", mn: "Чингэлтэй", en: "Chingeltei" },
  { code: "BGD", mn: "Баянгол", en: "Bayangol" },
  { code: "KHUD", mn: "Хан-Уул", en: "Khan-Uul" },
  { code: "SHD", mn: "Сонгинохайрхан", en: "Songinokhairkhan" },
  { code: "NLH", mn: "Налайх", en: "Nalaikh" },
  { code: "BND", mn: "Багануур", en: "Baganuur" },
  { code: "BHD", mn: "Багахангай", en: "Bagakhangai" },
];

export const DISTRICT_CODES = DISTRICTS.map((d) => d.code) as [DistrictCode, ...DistrictCode[]];

export const DEFAULT_DISTRICT: DistrictCode = "BZD";

/** Preference value meaning "every Ulaanbaatar district". */
export const ALL_DISTRICTS = "ALL";

export function districtName(code: string | null | undefined, lang: "mn" | "en" = "mn"): string | null {
  if (code === ALL_DISTRICTS) return lang === "mn" ? "Бүх дүүрэг" : "All districts";
  const d = DISTRICTS.find((x) => x.code === code);
  return d ? `${d[lang]} ${lang === "mn" ? "дүүрэг" : "district"}` : null;
}

/** Sukhbaatar Square — only used as the initial map view when the user has no home location. */
export const UB_MAP_CENTER: [number, number] = [47.9189, 106.9176];

// Order matters: longer / more specific abbreviations first.
const PATTERNS: [RegExp, DistrictCode][] = [
  [/баянзүрх|бзд/, "BZD"],
  [/сүхбаатар|сбд/, "SBD"],
  [/сонгинохайрхан|схд/, "SHD"],
  [/чингэлтэй|чд(үүрэг|$|,)/, "CHD"],
  [/хан-?уул|худ/, "KHUD"],
  [/баянгол|бгд/, "BGD"],
  [/багануур/, "BND"],
  [/налайх/, "NLH"],
  [/багахангай/, "BHD"],
];

/** Parse district from free-text Mongolian address, e.g. "УБ хот, БЗДүүрэг, 8-р хороо". */
export function parseDistrict(address: string | null): DistrictCode | null {
  if (!address) return null;
  const s = address.toLowerCase().replace(/\s+/g, "");
  for (const [re, code] of PATTERNS) if (re.test(s)) return code;
  return null;
}

/** Expand abbreviations for display: "БЗДүүрэг" -> "Баянзүрх дүүрэг". */
export function prettifyAddress(address: string, district: DistrictCode | null): string {
  const name = districtName(district);
  let out = address.replace(/\s+/g, " ").trim();
  if (name) out = out.replace(/(^|,\s*)(БЗ|СБ|СХ|Ч|ХУ|БГ)\s*Д(үүрэг)?(\s*дүүрэг)?(?=,|$|\s)/u, `$1${name}`);
  out = out.replace(/^УБ хот,\s*/u, "");
  return out;
}

export function isUlaanbaatar(name: string, address: string | null): boolean {
  return /^УБ\s/u.test(name) || /УБ хот/u.test(address ?? "");
}

/** Does a station fall inside the user's home district preference ("ALL" = any Ulaanbaatar station)? */
export function inHomeDistrict(s: { district: string | null; isUB: boolean }, pref: string): boolean {
  return pref === ALL_DISTRICTS ? s.isUB : s.district === pref;
}
