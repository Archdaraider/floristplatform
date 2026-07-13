import { MARKET_TIMEZONE } from "./types";

const singaporeDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: MARKET_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function nowIso(): string {
  return new Date().toISOString();
}

export function singaporeDate(date = new Date()): string {
  const parts = singaporeDateFormatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function addLocalDays(dateLocal: string, days: number): string {
  const [year, month, day] = dateLocal.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 4, 0, 0));
  return singaporeDate(date);
}

export function localDateFromNow(days: number): string {
  return addLocalDays(singaporeDate(), days);
}

export function addMinutesIso(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

/** Uses Singapore midnight (UTC+08:00) as the start of a requested local date. */
export function singaporeDateStartUtc(dateLocal: string): Date {
  return new Date(`${dateLocal}T00:00:00+08:00`);
}

export function hoursUntilSingaporeDate(dateLocal: string, from = new Date()): number {
  return (singaporeDateStartUtc(dateLocal).getTime() - from.getTime()) / 3_600_000;
}

export function isValidLocalDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}
