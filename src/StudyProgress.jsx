import React, { useState, useMemo } from "react";
import {
  Flame,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Star,
  Pencil,
  Check,
  Award,
  Sparkles,
} from "lucide-react";
import {
  fmtDate,
  todayKey as getTodayKey,
  startOfWeekKey,
  addDaysToDateKey,
  formatDateKey,
  parseDateKey,
} from "./dateUtils";
import { fmtMinutesLong } from "./statsUtils";
import StudyCalendar from "./StudyCalendar";
import StudyHeatmap from "./StudyHeatmap";
import StudyCharts from "./StudyCharts";

const SUBJECT_COLORS = [
  { bg: "#3b82f6", gradient: "linear-gradient(180deg, #60a5fa 0%, #2563eb 100%)", label: "Blue" },
  { bg: "#ec4899", gradient: "linear-gradient(180deg, #f472b6 0%, #db2777 100%)", label: "Pink" },
  { bg: "#f97316", gradient: "linear-gradient(180deg, #fb923c 0%, #ea580c 100%)", label: "Orange" },
  { bg: "#8b5cf6", gradient: "linear-gradient(180deg, #a78bfa 0%, #7c3aed 100%)", label: "Purple" },
  { bg: "#10b981", gradient: "linear-gradient(180deg, #34d399 0%, #059669 100%)", label: "Green" },
  { bg: "#06b6d4", gradient: "linear-gradient(180deg, #22d3ee 0%, #0891b2 100%)", label: "Cyan" },
  { bg: "#f59e0b", gradient: "linear-gradient(180deg, #fbbf24 0%, #d97706 100%)", label: "Amber" },
];

function fmtMinutesShort(min) {
  if (min <= 0) return "0 mins";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} mins`;
  if (m === 0) return `${h} hrs`;
  return `${h}h ${m}m`;
}

export default function StudyProgress({
  user,
  displayName,
  sessions,
  subjects: allSubjects = [],
  targetHours,
  targetHistory = {},
  editingTarget,
  targetInput,
  setTargetInput,
  setEditingTarget,
  handleSaveTarget,
  dashboardRows,
  fetchDayLogs,
  liveExtraMinutes = 0,
  liveSubject = "",
  todayKey = getTodayKey(),
  onDeleteSession,
  onEditSession,
}) {
  const [weekOffset, setWeekOffset] = useState(0); // 0 = current week, -1 = last week, etc.
  const [showStreakDetails, setShowStreakDetails] = useState(false);
  const [showSummaryDetails, setShowSummaryDetails] = useState(false);

  // Map subjects to consistent colors
  const subjectColorMap = useMemo(() => {
    const map = {};
    allSubjects.forEach((sub, i) => {
      map[sub] = SUBJECT_COLORS[i % SUBJECT_COLORS.length];
    });
    return map;
  }, [allSubjects]);

  // Aggregate minutes by date and subject
  const { minutesByDate, dateSubjectMap, todayMinutes, totalMinutesAll } = useMemo(() => {
    const minByDate = {};
    const dsMap = {};
    let total = 0;

    for (const s of sessions || []) {
      if (!s?.date || !s.minutes) continue;
      minByDate[s.date] = (minByDate[s.date] || 0) + s.minutes;
      total += s.minutes;

      if (!dsMap[s.date]) dsMap[s.date] = {};
      const sub = s.subject || "Study";
      dsMap[s.date][sub] = (dsMap[s.date][sub] || 0) + s.minutes;
    }

    if (liveExtraMinutes > 0) {
      minByDate[todayKey] = (minByDate[todayKey] || 0) + liveExtraMinutes;
      total += liveExtraMinutes;
      if (!dsMap[todayKey]) dsMap[todayKey] = {};
      const curSub = liveSubject || allSubjects[0] || "Study";
      dsMap[todayKey][curSub] = (dsMap[todayKey][curSub] || 0) + liveExtraMinutes;
    }

    return {
      minutesByDate: minByDate,
      dateSubjectMap: dsMap,
      todayMinutes: minByDate[todayKey] || 0,
      totalMinutesAll: total,
    };
  }, [sessions, liveExtraMinutes, liveSubject, todayKey, allSubjects]);

  // Daily target calculation
  const todayTargetMinutes = (targetHistory[todayKey] ?? targetHours * 60) || 240;
  const completionRate = Math.min(100, Math.round((todayMinutes / todayTargetMinutes) * 100));

  // Compute 7 days for the selected week (Mon - Sun)
  const currentWeekDays = useMemo(() => {
    const baseDateKey = addDaysToDateKey(todayKey, weekOffset * 7);
    const startOfWeek = startOfWeekKey(baseDateKey); // Sunday or Monday
    // Standardize week starting from Monday (offset +1 if Sunday is 0)
    const mon = addDaysToDateKey(startOfWeek, 1); // Monday

    const days = [];
    for (let i = 0; i < 7; i++) {
      const dKey = addDaysToDateKey(mon, i);
      const parts = formatDateKey(dKey, { weekday: "short", month: "short", day: "numeric" });
      const dayName = formatDateKey(dKey, { weekday: "short" });
      const dayNum = formatDateKey(dKey, { day: "2-digit" });
      const minutes = minutesByDate[dKey] || 0;
      const isToday = dKey === todayKey;
      const isPastOrToday = dKey <= todayKey;
      const hasStudied = minutes > 0;
      const subBreakdown = dateSubjectMap[dKey] || {};

      days.push({
        dateKey: dKey,
        dayName,
        dayNum,
        label: parts,
        minutes,
        isToday,
        isPastOrToday,
        hasStudied,
        subBreakdown,
      });
    }
    return days;
  }, [todayKey, weekOffset, minutesByDate, dateSubjectMap]);

  // Month label for the active week
  const weekMonthLabel = useMemo(() => {
    const midDay = currentWeekDays[3]?.dateKey || todayKey;
    return formatDateKey(midDay, { month: "long", year: "numeric" });
  }, [currentWeekDays, todayKey]);

  // Find max minutes across the week for chart height scaling
  const maxDayMinutes = useMemo(() => {
    const max = Math.max(60, ...currentWeekDays.map((d) => d.minutes));
    return Math.ceil(max / 60) * 60; // Round up to nearest hour
  }, [currentWeekDays]);

  // Active subjects in this week
  const activeWeekSubjects = useMemo(() => {
    const seen = new Set();
    currentWeekDays.forEach((d) => {
      Object.keys(d.subBreakdown).forEach((sub) => seen.add(sub));
    });
    if (seen.size === 0 && allSubjects.length > 0) {
      allSubjects.slice(0, 3).forEach((s) => seen.add(s));
    }
    return Array.from(seen);
  }, [currentWeekDays, allSubjects]);

  // Subject rows for by-subject breakdown
  const subjectRows = useMemo(() => {
    const map = {};
    for (const s of sessions || []) {
      const sub = s.subject || "Study";
      map[sub] = (map[sub] || 0) + s.minutes;
    }
    return Object.entries(map)
      .map(([name, minutes]) => ({ name, minutes }))
      .sort((a, b) => b.minutes - a.minutes);
  }, [sessions]);
  const maxSubjectMinutes = Math.max(1, ...subjectRows.map((r) => r.minutes));

  return (
    <div className="progress-container">
      {/* 1. STREAK OVERVIEW CARD */}
      <div className="modern-card streak-card">
        <div className="card-top-row">
          <h2 className="card-heading">Streak Overview</h2>
          <div className="month-pager">
            <button
              type="button"
              className="icon-btn-subtle"
              onClick={() => setWeekOffset((w) => w - 1)}
              title="Previous week"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="month-label">
              <CalendarIcon size={14} className="cal-icon" />
              <span>{weekMonthLabel}</span>
            </div>
            <button
              type="button"
              className="icon-btn-subtle"
              onClick={() => setWeekOffset((w) => Math.min(0, w + 1))}
              disabled={weekOffset >= 0}
              title="Next week"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* 7-DAY STREAK ROW */}
        <div className="streak-week-strip">
          {currentWeekDays.map((day) => (
            <div
              key={day.dateKey}
              className={`streak-day-col ${day.isToday ? "today" : ""} ${day.hasStudied ? "active" : ""}`}
            >
              <span className="streak-day-name">{day.dayName}</span>
              <div className="streak-badge-slot">
                {day.hasStudied ? (
                  <div className="streak-flame-circle" title={`${day.label}: ${fmtMinutesShort(day.minutes)}`}>
                    <Flame size={18} className="flame-icon-active" />
                  </div>
                ) : (
                  <div className="streak-empty-circle">
                    <span className="day-num-text">{day.dayNum}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* CHALLENGE / DAILY TARGET PROGRESS */}
        <div className="challenge-section">
          <div className="challenge-header">
            <span className="challenge-target-text">{targetHours}h Daily Goal</span>
          </div>

          <div className="challenge-track-wrap">
            <div className="challenge-track">
              <div
                className="challenge-fill"
                style={{ width: `${Math.min(100, Math.max(6, completionRate))}%` }}
              >
                <div className="challenge-flame-thumb">
                  <Flame size={15} />
                </div>
              </div>
            </div>
            <div className={`challenge-star-end ${completionRate >= 100 ? "achieved" : ""}`}>
              <Star size={18} />
            </div>
          </div>
        </div>

        {/* DETAILS TOGGLE */}
        <button
          type="button"
          className="card-details-toggle"
          onClick={() => setShowStreakDetails((v) => !v)}
        >
          <span>{showStreakDetails ? "Hide Goal Settings" : "Daily Goal Details"}</span>
          {showStreakDetails ? <ChevronUp size={16} /> : <ChevronRight size={16} />}
        </button>

        {/* EXPANDED GOAL SETTINGS */}
        {showStreakDetails && (
          <div className="expanded-section">
            <div className="inner-detail-card">
              <div className="sub-header-row">
                <h3 className="section-title" style={{ margin: 0 }}>Edit Daily Target</h3>
                {editingTarget ? (
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      className="input"
                      style={{ width: 80, padding: "6px 10px" }}
                      value={targetInput}
                      onChange={(e) => setTargetInput(e.target.value)}
                    />
                    <span>hrs</span>
                    <button className="btn btn-primary btn-sm" onClick={handleSaveTarget}>
                      <Check size={16} />
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="stat-pill-value" style={{ fontSize: 18 }}>
                      {targetHours}h / day
                    </span>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditingTarget(true)}>
                      <Pencil size={15} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. SUMMARY & STACKED SUBJECT CHART CARD */}
      <div className="modern-card summary-card">
        <div className="card-top-row">
          <h2 className="card-heading">Summary</h2>
          <button
            type="button"
            className="icon-btn-subtle"
            onClick={() => setShowSummaryDetails((v) => !v)}
            title="Toggle Details"
          >
            {showSummaryDetails ? <ChevronUp size={18} /> : <ChevronRight size={18} />}
          </button>
        </div>

        {/* METRICS ROW */}
        <div className="summary-metrics-row">
          <div className="metric-box">
            <div className="metric-value-highlight">{completionRate}%</div>
            <div className="metric-sub-label">Completion Rate Today</div>
          </div>
          <div className="metric-box">
            <div className="metric-value-highlight">{fmtMinutesShort(todayMinutes)}</div>
            <div className="metric-sub-label">Focused Study Time</div>
          </div>
        </div>

        {/* STACKED ROUNDED PILL CHART */}
        <div className="stacked-chart-container">
          <div className="chart-y-guides">
            <span>{fmtMinutesShort(maxDayMinutes)}</span>
            <span>{fmtMinutesShort(Math.round(maxDayMinutes * 0.66))}</span>
            <span>{fmtMinutesShort(Math.round(maxDayMinutes * 0.33))}</span>
            <span>0m</span>
          </div>

          <div className="chart-bars-area">
            <div className="chart-grid-dotted-lines">
              <span />
              <span />
              <span />
              <span />
            </div>

            <div className="chart-columns-strip">
              {currentWeekDays.map((d) => {
                const subEntries = Object.entries(d.subBreakdown).filter(([, m]) => m > 0);
                const dayTotal = d.minutes;
                const columnHeightPct = Math.min(100, Math.max(0, (dayTotal / maxDayMinutes) * 100));

                return (
                  <div key={d.dateKey} className="chart-day-col">
                    <div className="chart-pillar-slot" title={`${d.label}: ${fmtMinutesShort(dayTotal)}`}>
                      {dayTotal > 0 ? (
                        <div
                          className="chart-stacked-pillar"
                          style={{ height: `${columnHeightPct}%` }}
                        >
                          {subEntries.map(([subName, subMin], sIdx) => {
                            const segPct = Math.max(16, (subMin / dayTotal) * 100);
                            const colConfig = subjectColorMap[subName] || SUBJECT_COLORS[sIdx % SUBJECT_COLORS.length];
                            return (
                              <div
                                key={subName}
                                className="chart-pill-segment"
                                style={{
                                  height: `${segPct}%`,
                                  background: colConfig.gradient,
                                }}
                                title={`${subName}: ${fmtMinutesShort(subMin)}`}
                              />
                            );
                          })}
                        </div>
                      ) : (
                        <div className="chart-pillar-placeholder" />
                      )}
                    </div>
                    <span className={`chart-col-label ${d.isToday ? "active" : ""}`}>{d.dayName}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* SUBJECT LEGEND PILLS */}
        {activeWeekSubjects.length > 0 && (
          <div className="chart-legend-strip">
            {activeWeekSubjects.map((sub, i) => {
              const colConfig = subjectColorMap[sub] || SUBJECT_COLORS[i % SUBJECT_COLORS.length];
              return (
                <div key={sub} className="legend-chip">
                  <span className="legend-dot" style={{ background: colConfig.bg }} />
                  <span className="legend-name">{sub}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* DETAILS LINK */}
        <button
          type="button"
          className="card-details-toggle"
          onClick={() => setShowSummaryDetails((v) => !v)}
        >
          <span>{showSummaryDetails ? "Hide Comparisons" : "Compare with Buddy"}</span>
          {showSummaryDetails ? <ChevronUp size={16} /> : <ChevronRight size={16} />}
        </button>

        {/* EXPANDED SUMMARY / COMPARISON / GOALS */}
        {showSummaryDetails && (
          <div className="expanded-section">
            <StudyCharts
              userName={displayName?.split(" ")[0] || "You"}
              minutesByDate={minutesByDate}
              buddies={dashboardRows}
              fetchDayLogs={fetchDayLogs}
              targetHours={targetHours}
            />

            {/* BY SUBJECT BREAKDOWN */}
            <div className="inner-detail-card">
              <h3 className="section-title" style={{ marginBottom: 12 }}>
                All-time by Subject
              </h3>
              {subjectRows.map((row, idx) => {
                const color = (subjectColorMap[row.name] || SUBJECT_COLORS[idx % SUBJECT_COLORS.length]).bg;
                return (
                  <div key={row.name} style={{ marginBottom: 12 }}>
                    <div className="sub-row">
                      <span style={{ fontWeight: 600 }}>{row.name}</span>
                      <strong>{fmtMinutesLong(row.minutes)}</strong>
                    </div>
                    <div className="progress-track">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${(row.minutes / maxSubjectMinutes) * 100}%`,
                          background: color,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
              <div style={{ textAlign: "center", fontSize: 13, color: "var(--text-muted)", marginTop: 10 }}>
                Total all-time logged: <strong>{fmtMinutesLong(totalMinutesAll)}</strong>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. HISTORICAL STUDY CALENDAR & LOGS */}
      <StudyCalendar
        userId={user?.id}
        userName={displayName?.split(" ")[0] || "You"}
        sessions={sessions}
        buddies={dashboardRows}
        fetchDayLogs={fetchDayLogs}
        liveExtraMinutes={liveExtraMinutes}
        liveSubject={liveSubject}
        todayKey={todayKey}
        onDeleteSession={onDeleteSession}
        onEditSession={onEditSession}
      />

      {/* 4. 52-WEEK ACTIVITY HEATMAP */}
      <StudyHeatmap
        minutesByDate={minutesByDate}
        todayKey={todayKey}
        liveExtraMinutes={liveExtraMinutes}
      />
    </div>
  );
}
