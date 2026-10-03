export type EventDate = {
  event_date: string;
  event_annual?: number | boolean;
  event_timezone?: string;
  leap_day?: string;
};
export function validTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}
export function localDate(now: Date, timezone = "Europe/Paris") {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  return ["year", "month", "day"]
    .map((k) => p.find((v) => v.type === k)!.value)
    .join("-");
}
export function occurrenceInYear(event: EventDate, year: number) {
  const md = event.event_date.slice(5);
  if (md === "02-29" && new Date(Date.UTC(year, 1, 29)).getUTCMonth() !== 1) {
    return event.leap_day === "skip" ? null : `${year}-02-28`;
  }
  return `${year}-${md}`;
}
export function nextOccurrence(event: EventDate, now = new Date()) {
  if (!event.event_date) return null;
  const today = localDate(now, event.event_timezone);
  if (!event.event_annual)
    return event.event_date >= today ? event.event_date : null;
  const year = Number(today.slice(0, 4));
  for (let y = year; y <= year + 8; y++) {
    const candidate = occurrenceInYear(event, y);
    if (candidate && candidate >= today) return candidate;
  }
  return null;
}
export function daysUntil(date: string, now: Date, timezone: string) {
  return Math.round(
    (Date.parse(date + "T00:00:00Z") -
      Date.parse(localDate(now, timezone) + "T00:00:00Z")) /
      86400000,
  );
}
