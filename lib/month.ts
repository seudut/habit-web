const MONTH_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidMonthKey(value: string | undefined | null): value is string {
  return typeof value === "string" && MONTH_KEY_PATTERN.test(value);
}

export function getMonthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function getMonthKeyFromDate(date: string) {
  return DATE_PATTERN.test(date) ? date.slice(0, 7) : null;
}
