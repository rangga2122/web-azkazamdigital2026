export function matchesAdminSearch(
  query: string,
  ...values: Array<string | number | null | undefined>
) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  return values
    .filter((value) => value !== null && value !== undefined)
    .map((value) => String(value).toLowerCase())
    .join(" ")
    .includes(normalizedQuery);
}

export function compareAdminDates(
  left: string | null | undefined,
  right: string | null | undefined,
  direction: "asc" | "desc" = "desc"
) {
  const leftTime = left ? new Date(left).getTime() : 0;
  const rightTime = right ? new Date(right).getTime() : 0;
  return direction === "asc" ? leftTime - rightTime : rightTime - leftTime;
}

export function compareAdminNumbers(
  left: number | null | undefined,
  right: number | null | undefined,
  direction: "asc" | "desc" = "desc"
) {
  const safeLeft = left ?? 0;
  const safeRight = right ?? 0;
  return direction === "asc" ? safeLeft - safeRight : safeRight - safeLeft;
}

export function compareAdminStrings(
  left: string | null | undefined,
  right: string | null | undefined,
  direction: "asc" | "desc" = "asc"
) {
  const safeLeft = (left || "").toLowerCase();
  const safeRight = (right || "").toLowerCase();
  return direction === "asc"
    ? safeLeft.localeCompare(safeRight)
    : safeRight.localeCompare(safeLeft);
}
