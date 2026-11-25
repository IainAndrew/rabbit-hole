// Formatting shared by the site's components.

/** A rate from 0 to 1 as a whole percentage. */
export function percent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

/** A number with thousands separators. */
export function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}

/** Dollars to four places: most runs cost well under a cent. */
export function money(dollars: number): string {
  return `$${dollars.toFixed(4)}`;
}

/** A difference of rates in points, signed: "+9", "-55", "0". */
export function points(rate: number): string {
  const rounded = Math.round(rate * 100);
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

/** Join the class names that are set. */
export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}
