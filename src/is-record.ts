// A check shared by every reader of outside data: API replies, files, traces.

/** True for any non-null object, so its fields can be read and checked. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
