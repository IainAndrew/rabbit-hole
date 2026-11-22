// Small formatting helpers shared by the site's modules.

/** Text made safe to put inside HTML. */
export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

/** A rate from 0 to 1 as a whole percentage. */
export function percent(rate) {
  return `${Math.round(rate * 100)}%`;
}

/** A number with thousands separators. */
export function formatNumber(value) {
  return value.toLocaleString("en-US");
}
