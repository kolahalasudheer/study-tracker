import React, { useMemo, useState, useRef, useEffect } from "react";
import { Flame, Calendar, Trophy, Zap } from "lucide-react";
import {
  addDaysToDateKey,
  formatDateKey,
  istDayOfWeek,
  parseDateKey,
} from "./dateUtils";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];
const WEEKS = 52;

const LEVEL_COLORS = ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39", "#0e4429"];
const LEVEL_LABELS = ["No study", "< 2h", "2–4h", "4–6h", "6–10h", "10h+"];

function fmtMinutes(min) {
  if (min <= 0) return "0m";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function fmtDayTotal(minutes) {
  if (minutes <= 0) return "0 hours";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hPart = h === 1 ? "1 hour" : `${h} hours`;
  if (h === 0) return m === 1 ? "1 minute" : `${m} minutes`;
  if (m === 0) return hPart;
  return `${hPart} ${m} min`;
}

function levelForMinutes(min) {
  if (min <= 0) return 0;
  if (min < 120) return 1;
  if (min < 240) return 2;
  if (min < 360) return 3;
  if (min < 600) return 4;
  return 5;
}

/** Calculate max streak and current streak in LeetCode style */
function calculateStreaks(minutesByDate, todayKey) {
  const dates = Object.keys(minutesByDate)
    .filter((d) => (minutesByDate[d] || 0) > 0)
    .sort();

  if (!dates.length) return { maxStreak: 0, currentStreak: 0 };

  // 1. Max Streak
  let best = 1;
  let run = 1;
  for (let i = 1; i < dates.length; i += 1) {
    const prev = parseDateKey(dates[i - 1]).getTime();
    const curr = parseDateKey(dates[i]).getTime();
    const diffDays = Math.round((curr - prev) / 86400000);
    if (diffDays === 1) {
      run += 1;
      best = Math.max(best, run);
    } else if (diffDays > 1) {
      run = 1;
    }
  }

  // 2. Current Streak (consecutive days ending at todayKey or yesterday)
  let curStreak = 0;
  let cursor = todayKey;
  if (!minutesByDate[cursor]) {
    // If today hasn't been studied yet, check if streak from yesterday is active
    cursor = addDaysToDateKey(cursor, -1);
  }
  while (minutesByDate[cursor] && (minutesByDate[cursor] || 0) > 0) {
    curStreak += 1;
    cursor = addDaysToDateKey(cursor, -1);
  }

  return { maxStreak: best, currentStreak: curStreak };
}

export default function StudyHeatmap({ minutesByDate = {}, todayKey, liveExtraMinutes = 0 }) {
  const [selected, setSelected] = useState(null);
  const scrollRef = useRef(null);

  const mergedMinutes = useMemo(() => {
    const map = { ...minutesByDate };
    const todayTotal = (map[todayKey] || 0) + liveExtraMinutes;
    if (todayTotal > 0) map[todayKey] = todayTotal;
    else if (liveExtraMinutes > 0) map[todayKey] = liveExtraMinutes;
    return map;
  }, [minutesByDate, todayKey, liveExtraMinutes]);

  // Rolling 52-week sliding window ending on the current week of todayKey
  const { columns, monthLabels, stats } = useMemo(() => {
    const endDow = istDayOfWeek(todayKey); // 0 (Sun) to 6 (Sat)
    const gridEnd = addDaysToDateKey(todayKey, 6 - endDow);
    const gridStart = addDaysToDateKey(gridEnd, -(WEEKS * 7 - 1));

    const cols = [];
    let cursor = gridStart;
    for (let w = 0; w < WEEKS; w += 1) {
      const col = [];
      for (let d = 0; d < 7; d += 1) {
        col.push(cursor);
        cursor = addDaysToDateKey(cursor, 1);
      }
      cols.push(col);
    }

    // LeetCode month labels: attach month label when a column contains the start of a month
    const labels = [];
    let lastMonth = -1;
    cols.forEach((col, wi) => {
      // Find if any day in this column is day 1 to 7 of a new month
      const firstOfMonthDay = col.find((dKey) => dKey.endsWith("-01"));
      const targetDay = firstOfMonthDay || col[0];
      const m = Number(targetDay.slice(5, 7)) - 1;
      if (m !== lastMonth) {
        labels.push({ wi, label: MONTH_NAMES[m] });
        lastMonth = m;
      }
    });

    let activeDays = 0;
    let yearMinutes = 0;
    for (const [dateKey, min] of Object.entries(mergedMinutes)) {
      if (dateKey >= gridStart && dateKey <= todayKey && min > 0) {
        activeDays += 1;
        yearMinutes += min;
      }
    }

    const { maxStreak, currentStreak } = calculateStreaks(mergedMinutes, todayKey);

    return {
      columns: cols,
      monthLabels: labels,
      stats: {
        activeDays,
        yearMinutes,
        maxStreak,
        currentStreak,
      },
    };
  }, [mergedMinutes, todayKey]);

  // Always auto-scroll to the rightmost column (Today)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [columns, todayKey]);

  const handleCellTap = (key, minutes, level, isFuture) => {
    if (isFuture) return;
    setSelected((prev) => (prev?.key === key ? null : {
      key,
      date: formatDateKey(key, { weekday: "short", month: "short", day: "numeric", year: "numeric" }),
      minutes,
      level,
    }));
  };

  return (
    <div className="glass-card heatmap-card">
      <div className="heatmap-header">
        <div>
          <h2 className="section-title">Study Activity Heatmap</h2>
          <p className="heatmap-summary">
            <strong>{fmtMinutes(stats.yearMinutes)}</strong> logged in the rolling 52-week window
          </p>
        </div>
        <div className="heatmap-stats">
          <div className="heatmap-stat-pill">
            <Calendar size={13} className="stat-icon" />
            <span>Active: <strong>{stats.activeDays}d</strong></span>
          </div>
          <div className="heatmap-stat-pill">
            <Flame size={13} className="stat-icon-orange" />
            <span>Current: <strong>{stats.currentStreak}d</strong></span>
          </div>
          <div className="heatmap-stat-pill">
            <Trophy size={13} className="stat-icon-gold" />
            <span>Best: <strong>{stats.maxStreak}d</strong></span>
          </div>
        </div>
      </div>

      <div className="heatmap-scroll" ref={scrollRef}>
        <div className="heatmap-grid-wrap">
          {/* MONTH LABELS */}
          <div className="heatmap-months">
            <div className="heatmap-month-spacer" />
            {columns.map((_, wi) => {
              const ml = monthLabels.find((m) => m.wi === wi);
              return (
                <div key={wi} className="heatmap-month-label">
                  {ml ? ml.label : ""}
                </div>
              );
            })}
          </div>

          {/* GRID BODY */}
          <div className="heatmap-body">
            <div className="heatmap-days">
              {DAY_LABELS.map((label, i) => (
                <div key={i} className="heatmap-day-label">{label}</div>
              ))}
            </div>

            <div className="heatmap-columns">
              {columns.map((col, wi) => (
                <div key={wi} className="heatmap-column">
                  {col.map((key) => {
                    const isFuture = key > todayKey;
                    const isToday = key === todayKey;
                    const minutes = isFuture ? 0 : mergedMinutes[key] || 0;
                    const level = isFuture ? 0 : levelForMinutes(minutes);
                    const isSelected = selected?.key === key;

                    return (
                      <button
                        type="button"
                        key={key}
                        disabled={isFuture}
                        className={`heatmap-cell ${isToday ? "today-cell" : ""} ${isFuture ? "future-cell" : ""} ${isSelected ? "selected" : ""}`}
                        style={{ background: isFuture ? "#f8fafc" : LEVEL_COLORS[level] }}
                        onClick={() => handleCellTap(key, minutes, level, isFuture)}
                        aria-label={`${key}: ${fmtDayTotal(minutes)} studied`}
                        title={isFuture ? "Future date" : `${key}: ${fmtDayTotal(minutes)}`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* INTERACTIVE CELL TOOLTIP */}
      <div className={`heatmap-tip${selected ? " active" : ""}`}>
        {selected ? (
          <>
            <div className="heatmap-tip-date">{selected.date}</div>
            <div className="heatmap-tip-hours">
              Total study: <strong>{fmtDayTotal(selected.minutes)}</strong>
              {selected.minutes > 0 && <span className="heatmap-tip-short">({fmtMinutes(selected.minutes)})</span>}
            </div>
            {selected.minutes > 0 && (
              <span className="heatmap-tip-level">{LEVEL_LABELS[selected.level]}</span>
            )}
          </>
        ) : (
          <span className="heatmap-tip-placeholder">Tap any square to see that day&apos;s logged study time</span>
        )}
      </div>

      {/* LEGEND */}
      <div className="heatmap-legend">
        <span className="heatmap-legend-label">Less</span>
        {LEVEL_COLORS.map((color, i) => (
          <span key={i} className="heatmap-legend-cell" style={{ background: color }} title={LEVEL_LABELS[i]} />
        ))}
        <span className="heatmap-legend-label">More</span>
      </div>
    </div>
  );
}
