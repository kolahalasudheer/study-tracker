/** Indian Standard Time — used for all dates/times in the app */
export const IST = "Asia/Kolkata";
export const LOCALE = "en-IN";

function pad(n) {
  return String(n).padStart(2, "0");
}

export function getISTParts(input = new Date()) {
  const date = input instanceof Date ? input : new Date(input);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const pick = (type) => parts.find((p) => p.type === type)?.value ?? "0";
  return {
    year: Number(pick("year")),
    month: Number(pick("month")),
    day: Number(pick("day")),
    hour: Number(pick("hour")),
    minute: Number(pick("minute")),
    second: Number(pick("second")),
  };
}

/** YYYY-MM-DD in IST */
export function fmtDate(input = new Date()) {
  const { year, month, day } = getISTParts(input);
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function todayKey() {
  return fmtDate(new Date());
}

/** monthIndex is 0-based (Jan = 0) */
export function dateKeyFromParts(year, monthIndex, day) {
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
}

export function parseDateKey(dateKey) {
  return new Date(`${dateKey}T12:00:00+05:30`);
}

export function addDaysToDateKey(dateKey, days) {
  const ms = parseDateKey(dateKey).getTime() + days * 86400000;
  return fmtDate(ms);
}

export function istDayOfWeek(dateKey) {
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: IST,
    weekday: "short",
  }).format(parseDateKey(dateKey));
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[label] ?? 0;
}

export function startOfWeekKey(dateKey = todayKey()) {
  return addDaysToDateKey(dateKey, -istDayOfWeek(dateKey));
}

export function daysInMonth(year, monthIndex) {
  const first = dateKeyFromParts(year, monthIndex, 1);
  const nextMonth = monthIndex === 11
    ? dateKeyFromParts(year + 1, 0, 1)
    : dateKeyFromParts(year, monthIndex + 1, 1);
  const diff = (parseDateKey(nextMonth).getTime() - parseDateKey(first).getTime()) / 86400000;
  return Math.round(diff);
}

export function monthBounds(year, monthIndex) {
  const from = dateKeyFromParts(year, monthIndex, 1);
  const dim = daysInMonth(year, monthIndex);
  const to = dateKeyFromParts(year, monthIndex, dim);
  return { from, to, daysInMonth: dim, startDow: istDayOfWeek(from) };
}

export function formatDateKey(dateKey, options = {}) {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: IST,
    ...options,
  }).format(parseDateKey(dateKey));
}

export function formatTimeIST(ts) {
  if (!ts) return "";
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: IST,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(ts));
}

export function formatTimeRangeIST(startTs, endTs) {
  if (!startTs && !endTs) return "";
  if (!startTs) return formatTimeIST(endTs);
  if (!endTs) return formatTimeIST(startTs);
  return `${formatTimeIST(startTs)} – ${formatTimeIST(endTs)}`;
}

export function nowISTLabel() {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: IST,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date());
}

/** Create an exact timestamp in IST from dateKey (YYYY-MM-DD) and timeStr (HH:mm) */
export function makeISTTimestamp(dateKey, timeStr = "12:00") {
  const [sh, sm] = (timeStr || "12:00").split(":").map(Number);
  const pad2 = (n) => String(n || 0).padStart(2, "0");
  return new Date(`${dateKey}T${pad2(sh)}:${pad2(sm)}:00+05:30`).getTime();
}

/** Current time in IST formatted as HH:mm */
export function currentISTTimeStr() {
  const { hour, minute } = getISTParts(new Date());
  return `${pad(hour)}:${pad(minute)}`;
}

/** Add minutes to a HH:mm string (returns HH:mm in 24h format) */
export function addMinutesToTime(timeStr = "10:00", minutes = 0) {
  const [h, m] = (timeStr || "10:00").split(":").map(Number);
  const totalMin = (h * 60 + m + minutes) % 1440;
  const newH = Math.floor(totalMin / 60);
  const newM = totalMin % 60;
  return `${pad(newH)}:${pad(newM)}`;
}

/** Subtract minutes from a HH:mm string */
export function subtractMinutesFromTime(timeStr = "10:00", minutes = 0) {
  const [h, m] = (timeStr || "10:00").split(":").map(Number);
  let totalMin = h * 60 + m - minutes;
  if (totalMin < 0) totalMin = (totalMin % 1440) + 1440;
  const newH = Math.floor(totalMin / 60) % 24;
  const newM = totalMin % 60;
  return `${pad(newH)}:${pad(newM)}`;
}
