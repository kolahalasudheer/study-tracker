import {
  fmtDate,
  todayKey,
  startOfWeekKey,
  addDaysToDateKey,
  formatDateKey,
  formatTimeIST,
  formatTimeRangeIST,
} from "./dateUtils";

export { fmtDate, todayKey, formatDateKey, formatTimeIST, formatTimeRangeIST, nowISTLabel } from "./dateUtils";

/** Ensure session has startedAt / endedAt (backfill from legacy ts-only rows) */
export function normalizeSession(s) {
  const minutes = s.minutes || 0;
  const endedAt = s.endedAt || s.ts || 0;
  const startedAt = s.startedAt || (endedAt ? endedAt - minutes * 60000 : 0);
  return {
    ...s,
    subject: s.subject || "Study",
    minutes,
    startedAt,
    endedAt,
    ts: endedAt,
  };
}

export function sessionLogFields(s) {
  const n = normalizeSession(s);
  return {
    subject: n.subject,
    minutes: n.minutes,
    startedAt: n.startedAt,
    endedAt: n.endedAt,
    ts: n.endedAt,
  };
}

export function formatSessionBlock(s) {
  if (s?.isDurationOnly || s?.noExactTime) {
    return fmtMinutesLong(s.minutes || 0);
  }
  const n = normalizeSession(s);
  const range = formatTimeRangeIST(n.startedAt, n.endedAt);
  const duration = fmtMinutesLong(n.minutes);
  return range ? `${range} · ${duration}` : duration;
}
export function resolveDisplayName(authUser, stateName) {
  if (stateName?.trim()) return stateName.trim();
  const meta = authUser?.user_metadata || {};
  return meta.full_name || meta.name || authUser?.email?.split("@")[0] || "Student";
}

export function computeStudyStats(sessions = [], liveExtraMinutes = 0) {
  const todayKeyVal = todayKey();
  const minutesByDate = {};

  for (const s of sessions) {
    minutesByDate[s.date] = (minutesByDate[s.date] || 0) + s.minutes;
  }

  const todayMinutes = (minutesByDate[todayKeyVal] || 0) + liveExtraMinutes;
  const weekStartKey = startOfWeekKey(todayKeyVal);
  let weekMinutes = 0;

  for (const [dateKey, min] of Object.entries(minutesByDate)) {
    if (dateKey >= weekStartKey) weekMinutes += min;
  }
  weekMinutes += liveExtraMinutes;

  let streak = 0;
  let cursorKey = todayKeyVal;
  if (!minutesByDate[cursorKey] && liveExtraMinutes === 0) {
    cursorKey = addDaysToDateKey(cursorKey, -1);
  }
  while (minutesByDate[cursorKey] || (cursorKey === todayKeyVal && liveExtraMinutes > 0)) {
    streak += 1;
    cursorKey = addDaysToDateKey(cursorKey, -1);
  }

  const totalMinutes = sessions.reduce((a, s) => a + s.minutes, 0) + liveExtraMinutes;
  const todaySessions = sessions
    .filter((s) => s.date === todayKeyVal)
    .sort((a, b) => (b.ts || 0) - (a.ts || 0));

  const dailyAvg = computeDailyAverage(sessions, liveExtraMinutes, todayKeyVal);

  return {
    todayMinutes,
    weekMinutes,
    streak,
    totalMinutes,
    todaySessions,
    todayKey: todayKeyVal,
    weekDaily: buildWeekDaily(sessions, liveExtraMinutes, todayKeyVal),
    todayBySubject: buildTodayBySubject(sessions, liveExtraMinutes, todayKeyVal),
    avgDailyMinutes: dailyAvg.avgDailyMinutes,
    activeDaysCount: dailyAvg.activeDaysCount,
    exactAvgHours: dailyAvg.exactAvgHours,
  };
}

export function computeDailyAverage(sessions = [], liveExtraMinutes = 0, todayKeyVal = todayKey()) {
  const minutesByDate = {};
  for (const s of sessions) {
    if (!s?.date || !s.minutes) continue;
    minutesByDate[s.date] = (minutesByDate[s.date] || 0) + (Number(s.minutes) || 0);
  }
  if (liveExtraMinutes > 0) {
    minutesByDate[todayKeyVal] = (minutesByDate[todayKeyVal] || 0) + liveExtraMinutes;
  }
  const activeDays = Object.values(minutesByDate).filter((m) => m > 0);
  const activeDaysCount = activeDays.length;
  const totalActiveMinutes = activeDays.reduce((a, b) => a + b, 0);
  const avgDailyMinutes = activeDaysCount > 0 ? Math.round(totalActiveMinutes / activeDaysCount) : 0;
  const exactAvgHours = activeDaysCount > 0 ? (totalActiveMinutes / 60 / activeDaysCount).toFixed(1) : "0.0";
  return {
    avgDailyMinutes,
    activeDaysCount,
    totalActiveMinutes,
    exactAvgHours,
  };
}

export function buildWeekDaily(sessions = [], liveExtraMinutes = 0, todayKeyVal = todayKey()) {
  const days = [];

  for (let i = 6; i >= 0; i -= 1) {
    const key = addDaysToDateKey(todayKeyVal, -i);
    let minutes = 0;
    for (const s of sessions) {
      if (s.date === key) minutes += s.minutes;
    }
    if (key === todayKeyVal) minutes += liveExtraMinutes;
    days.push({
      date: key,
      label: formatDateKey(key, { weekday: "short" }),
      shortLabel: formatDateKey(key, { weekday: "narrow" }),
      minutes,
    });
  }

  return days;
}

export function buildTodayBySubject(sessions = [], liveExtraMinutes = 0, todayKeyVal = todayKey(), liveSubject = "") {
  const map = {};
  for (const s of sessions) {
    if (s.date === todayKeyVal) {
      map[s.subject] = (map[s.subject] || 0) + s.minutes;
    }
  }
  if (liveExtraMinutes > 0 && liveSubject) {
    map[liveSubject] = (map[liveSubject] || 0) + liveExtraMinutes;
  }
  return Object.entries(map)
    .map(([name, minutes]) => ({ name, minutes }))
    .sort((a, b) => b.minutes - a.minutes);
}

export function buildTodayBySubjectFromSessions(todaySessions = []) {
  const map = {};
  for (const s of todaySessions) {
    const subject = s.subject || "Study";
    map[subject] = (map[subject] || 0) + (s.minutes || 0);
  }
  return Object.entries(map)
    .map(([name, minutes]) => ({ name, minutes }))
    .sort((a, b) => b.minutes - a.minutes);
}

export function fmtChartMinutes(min) {
  if (min <= 0) return "0m";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h${m}m`;
}

export function activeTimerElapsedSeconds(timer) {
  if (!timer) return 0;
  let sec = timer.accumulated || 0;
  if (!timer.paused && timer.startTime) {
    sec += Math.floor((Date.now() - timer.startTime) / 1000);
  }
  return sec;
}

export function fmtMinutesLong(min) {
  if (min <= 0) return "0 min";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return m === 1 ? "1 min" : `${m} min`;
  if (m === 0) return h === 1 ? "1 hour" : `${h} hours`;
  return `${h}h ${m}m`;
}

export function buildDayLogsFromSessions(sessions = []) {
  const byDate = {};
  for (const s of sessions) {
    if (!s?.date || !s.minutes) continue;
    if (!byDate[s.date]) {
      byDate[s.date] = { date: s.date, totalMinutes: 0, bySubject: {}, sessions: [] };
    }
    const day = byDate[s.date];
    const subject = s.subject || "Study";
    day.totalMinutes += s.minutes;
    day.bySubject[subject] = (day.bySubject[subject] || 0) + s.minutes;
    day.sessions.push(sessionLogFields(s));
  }

  return Object.values(byDate).map((day) => ({
    ...day,
    sessions: day.sessions.sort((a, b) => (a.startedAt || a.ts || 0) - (b.startedAt || b.ts || 0)),
  }));
}

export function summarizeDayFromSessions(sessions = [], dateKey) {
  const daySessions = sessions
    .filter((s) => s.date === dateKey)
    .sort((a, b) => (a.startedAt || a.ts || 0) - (b.startedAt || b.ts || 0));
  const bySubject = {};
  let totalMinutes = 0;
  for (const s of daySessions) {
    const subject = s.subject || "Study";
    bySubject[subject] = (bySubject[subject] || 0) + s.minutes;
    totalMinutes += s.minutes;
  }
  return {
    date: dateKey,
    totalMinutes,
    bySubject,
    sessions: daySessions.map(sessionLogFields),
  };
}

export function mergeActiveTimer(cloudTimer, localTimer) {
  const today = todayKey();
  const valid = (timer) => {
    if (!timer) return null;
    if (timer.date && timer.date !== today) return null;
    return timer;
  };

  const cloud = valid(cloudTimer);
  const local = valid(localTimer);
  if (!cloud && !local) return null;
  if (!cloud) return local;
  if (!local) return cloud;

  if (!local.paused && local.startTime) return local;
  if (!cloud.paused && cloud.startTime) return cloud;

  const localAt = local.updatedAt || 0;
  const cloudAt = cloud.updatedAt || 0;
  return localAt >= cloudAt ? local : cloud;
}
