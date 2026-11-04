import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Clock, Pencil, Trash2 } from "lucide-react";
import {
  dateKeyFromParts,
  formatDateKey,
  getISTParts,
  monthBounds,
  todayKey as getTodayKey,
} from "./dateUtils";
import { fmtMinutesLong, summarizeDayFromSessions, formatSessionBlock, sessionLogFields } from "./statsUtils";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function levelClass(minutes) {
  if (minutes <= 0) return "";
  if (minutes < 120) return "lvl-1";
  if (minutes < 240) return "lvl-2";
  if (minutes < 360) return "lvl-3";
  if (minutes < 600) return "lvl-4";
  return "lvl-5";
}

function subjectRows(bySubject = {}) {
  return Object.entries(bySubject)
    .map(([name, minutes]) => ({ name, minutes: Number(minutes) || 0 }))
    .filter((r) => r.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);
}

export default function StudyCalendar({
  userId,
  userName,
  sessions,
  buddies,
  fetchDayLogs,
  liveExtraMinutes = 0,
  liveSubject = "",
  todayKey,
  onDeleteSession,
  onEditSession,
}) {
  const istNow = getISTParts();
  const [viewYear, setViewYear] = useState(istNow.year);
  const [viewMonth, setViewMonth] = useState(istNow.month - 1);
  const [selectedDate, setSelectedDate] = useState(todayKey || getTodayKey());
  const [viewerId, setViewerId] = useState(userId || "");
  const [remoteLogs, setRemoteLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const friends = useMemo(
    () => (buddies || []).filter((b) => b.uid && b.uid !== userId),
    [buddies, userId]
  );

  const viewingSelf = !viewerId || viewerId === userId;
  const viewerName = viewingSelf
    ? userName || "You"
    : friends.find((f) => f.uid === viewerId)?.name || "Friend";

  const { from, to, daysInMonth, startDow } = useMemo(
    () => monthBounds(viewYear, viewMonth),
    [viewYear, viewMonth]
  );

  // Local day map from your own sessions (always available offline for you)
  const localDayMap = useMemo(() => {
    const map = {};
    for (const s of sessions || []) {
      if (!s?.date) continue;
      if (!map[s.date]) map[s.date] = { date: s.date, totalMinutes: 0, bySubject: {}, sessions: [] };
      const subject = s.subject || "Study";
      map[s.date].totalMinutes += s.minutes || 0;
      map[s.date].bySubject[subject] = (map[s.date].bySubject[subject] || 0) + (s.minutes || 0);
      map[s.date].sessions.push(sessionLogFields(s));
    }
    if (liveExtraMinutes > 0 && todayKey) {
      if (!map[todayKey]) map[todayKey] = { date: todayKey, totalMinutes: 0, bySubject: {}, sessions: [] };
      map[todayKey].totalMinutes += liveExtraMinutes;
      if (liveSubject) {
        map[todayKey].bySubject[liveSubject] = (map[todayKey].bySubject[liveSubject] || 0) + liveExtraMinutes;
      }
    }
    return map;
  }, [sessions, liveExtraMinutes, liveSubject, todayKey]);

  // Load permanent DB logs for the visible month (you or friend)
  useEffect(() => {
    if (!viewerId || !fetchDayLogs) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const logs = await fetchDayLogs(viewerId, from, to);
      if (!cancelled) {
        setRemoteLogs(logs);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewerId, from, to, fetchDayLogs, sessions?.length]);

  const dayMap = useMemo(() => {
    const map = {};
    for (const log of remoteLogs) {
      map[log.date] = log;
    }
    // Prefer fresher local data when viewing yourself
    if (viewingSelf) {
      for (const [date, local] of Object.entries(localDayMap)) {
        if (date < from || date > to) continue;
        const remote = map[date];
        if (!remote || local.totalMinutes >= (remote.totalMinutes || 0)) {
          map[date] = local;
        }
      }
    }
    return map;
  }, [remoteLogs, localDayMap, viewingSelf, from, to]);

  const selectedLog = useMemo(() => {
    if (dayMap[selectedDate]) return dayMap[selectedDate];
    if (viewingSelf) return summarizeDayFromSessions(sessions || [], selectedDate);
    return { date: selectedDate, totalMinutes: 0, bySubject: {}, sessions: [] };
  }, [dayMap, selectedDate, viewingSelf, sessions]);

  const subjects = subjectRows(selectedLog.bySubject);
  const maxSubject = Math.max(1, ...subjects.map((s) => s.minutes));

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else setViewMonth((m) => m - 1);
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else setViewMonth((m) => m + 1);
  };

  const cells = [];
  for (let i = 0; i < startDow; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) {
    const date = dateKeyFromParts(viewYear, viewMonth, d);
    cells.push(date);
  }

  const selectedLabel = formatDateKey(selectedDate, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className={`glass-card calendar-card${collapsed ? " collapsed" : ""}`}>
      <button
        type="button"
        className="calendar-toggle-head"
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
      >
        <div>
          <h2 className="section-title" style={{ marginBottom: 0 }}>Study calendar</h2>
        </div>
        <span className="calendar-toggle-btn" aria-hidden>
          {collapsed ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
        </span>
      </button>

      {!collapsed && (
        <>
      {friends.length > 0 && (
        <div className="calendar-viewer">
          <button
            type="button"
            className={`chip${viewingSelf ? " active" : ""}`}
            onClick={() => setViewerId(userId)}
          >
            You
          </button>
          {friends.map((f) => (
            <button
              key={f.uid}
              type="button"
              className={`chip${viewerId === f.uid ? " active" : ""}`}
              onClick={() => setViewerId(f.uid)}
            >
              {f.name?.split(" ")[0] || "Friend"}
            </button>
          ))}
        </div>
      )}

      <div className="calendar-nav">
        <button type="button" className="btn btn-ghost" onClick={prevMonth} aria-label="Previous month">
          <ChevronLeft size={18} />
        </button>
        <div className="calendar-month-title">
          {MONTHS[viewMonth]} {viewYear}
          {loading && <span className="calendar-loading"> · syncing</span>}
        </div>
        <button type="button" className="btn btn-ghost" onClick={nextMonth} aria-label="Next month">
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="calendar-weekdays">
        {WEEKDAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>

      <div className="calendar-grid">
        {cells.map((date, i) => {
          if (!date) return <div key={`e-${i}`} className="calendar-cell empty" />;
          const minutes = dayMap[date]?.totalMinutes || 0;
          const dayNum = Number(date.slice(-2));
          const isSelected = date === selectedDate;
          const isToday = date === todayKey;
          return (
            <button
              key={date}
              type="button"
              className={`calendar-cell${isSelected ? " selected" : ""}${isToday ? " today" : ""} ${levelClass(minutes)}`}
              onClick={() => setSelectedDate(date)}
            >
              <span className="calendar-day-num">{dayNum}</span>
              {minutes > 0 && <span className="calendar-day-mins">{fmtMinutesLong(minutes).replace(" hours", "h").replace(" hour", "h").replace(" min", "m")}</span>}
            </button>
          );
        })}
      </div>

      <div className="calendar-detail">
        <div className="calendar-detail-head">
          <div>
            <div className="calendar-detail-date">{selectedLabel}</div>
            <div className="calendar-detail-who">{viewerName}</div>
          </div>
          <div className="calendar-detail-total-badge">
            <span className="cal-total-label">Total Studied</span>
            <span className="cal-total-val">{fmtMinutesLong(selectedLog.totalMinutes || 0)}</span>
          </div>
        </div>

        {(selectedLog.sessions || []).length === 0 ? (
          <p className="chart-empty" style={{ margin: "14px 0 6px" }}>No study logged on this day.</p>
        ) : (
          <div className="calendar-logs-list">
            <div className="cal-logs-head">
              <span className="field-label" style={{ margin: 0 }}>Study Logs</span>
              <span className="cal-logs-count">{(selectedLog.sessions || []).length} session{(selectedLog.sessions || []).length > 1 ? "s" : ""}</span>
            </div>
            {(selectedLog.sessions || []).map((s, i) => (
              <div key={`${s.startedAt || s.ts}-${i}`} className="cal-session-item">
                <div className="cal-session-main">
                  <div className="cal-session-time">
                    <Clock size={14} color="#6366f1" />
                    <span>{formatSessionBlock(s)}</span>
                  </div>
                  <div className="cal-session-right">
                    {s.note && <span className="session-note-pill">{s.note}</span>}
                    {viewingSelf && onEditSession && onDeleteSession && (
                      <div className="cal-session-actions">
                        <button
                          type="button"
                          className="btn btn-ghost cal-session-action-btn"
                          title="Edit this session"
                          onClick={() => onEditSession({ ...s, date: selectedDate })}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost cal-session-action-btn cal-session-delete-btn"
                          title="Delete this session"
                          onClick={() => {
                            if (window.confirm("Delete this study session? This cannot be undone.")) {
                              onDeleteSession({ ...s, date: selectedDate });
                            }
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
        </>
      )}
    </div>
  );
}
