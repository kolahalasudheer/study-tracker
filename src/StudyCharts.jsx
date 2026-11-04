import React, { useMemo, useState, useEffect, useCallback } from "react";
import { Users, User, ChevronDown, Sparkles, Target } from "lucide-react";
import { formatDateKey, todayKey, parseDateKey, addDaysToDateKey } from "./dateUtils";

const YOU_COLOR = "#6366f1";
const BUDDY_COLORS = ["#10b981", "#ec4899", "#f59e0b", "#06b6d4", "#8b5cf6"];

function fmtHours(min) {
  if (min <= 0) return "0h";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function fmtDecHours(min) {
  return `${(Math.max(0, min) / 60).toFixed(1)}h`;
}

/** Catmull-Rom → Cubic Bézier smooth path calculation */
function smoothPath(pts) {
  if (!pts || pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x},${pts[0].y}`;
  let d = `M ${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cx1 = p1.x + (p2.x - p0.x) / 6;
    const cy1 = p1.y + (p2.y - p0.y) / 6;
    const cx2 = p2.x - (p3.x - p1.x) / 6;
    const cy2 = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cx1.toFixed(1)},${cy1.toFixed(1)} ${cx2.toFixed(1)},${cy2.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

function areaPath(pts, baseY) {
  if (!pts || pts.length === 0) return "";
  return `${smoothPath(pts)} L ${pts[pts.length - 1].x},${baseY} L ${pts[0].x},${baseY} Z`;
}

export default function StudyCharts({
  userName = "You",
  minutesByDate = {},
  buddies = [],
  fetchDayLogs,
  targetHours = 6,
}) {
  // Friends list (excluding self)
  const friends = useMemo(() => (buddies || []).filter((b) => !b.isYou && b.uid), [buddies]);

  // Selected filter: "you" (only me), or buddy's uid, or "all"
  const [selectedFilter, setSelectedFilter] = useState("all");
  const [buddyLogsMap, setBuddyLogsMap] = useState({}); // uid -> { dateKey: minutes }
  const [tappedIdx, setTappedIdx] = useState(null);

  const todayKeyVal = todayKey();

  // Load actual day logs from Supabase for all connected buddies
  useEffect(() => {
    if (!fetchDayLogs || friends.length === 0) return;
    let isMounted = true;

    friends.forEach(async (f) => {
      if (!f.uid) return;
      try {
        const logs = await fetchDayLogs(f.uid);
        if (!isMounted) return;
        const map = {};
        (logs || []).forEach((l) => {
          if (l.date) map[l.date] = (map[l.date] || 0) + (l.totalMinutes || 0);
        });
        // Also merge any weekDaily / todaySessions from live state
        if (Array.isArray(f.weekDaily)) {
          f.weekDaily.forEach((d) => {
            if (d?.date) map[d.date] = Math.max(map[d.date] || 0, d.minutes || 0);
          });
        }
        if (f.todayMinutes) {
          map[todayKeyVal] = Math.max(map[todayKeyVal] || 0, f.todayMinutes);
        }
        setBuddyLogsMap((prev) => ({ ...prev, [f.uid]: map }));
      } catch (e) {
        console.warn("Could not fetch day logs for buddy:", f.uid, e);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [friends, fetchDayLogs, todayKeyVal]);

  // Default selected filter if only 1 friend
  useEffect(() => {
    if (friends.length === 1 && selectedFilter === "all") {
      setSelectedFilter(friends[0].uid);
    }
  }, [friends, selectedFilter]);

  // Determine which buddies to plot
  const activeBuddies = useMemo(() => {
    if (selectedFilter === "you") return [];
    if (selectedFilter === "all") return friends;
    return friends.filter((f) => f.uid === selectedFilter);
  }, [selectedFilter, friends]);

  // Collect chronological date list across You and all active buddies
  const timeline = useMemo(() => {
    const dateSet = new Set();
    // 1. Add your dates
    Object.keys(minutesByDate || {}).forEach((d) => dateSet.add(d));

    // 2. Add buddies' dates
    activeBuddies.forEach((f) => {
      const bMap = buddyLogsMap[f.uid] || {};
      Object.keys(bMap).forEach((d) => dateSet.add(d));
      if (Array.isArray(f.weekDaily)) {
        f.weekDaily.forEach((d) => d?.date && dateSet.add(d.date));
      }
    });

    // Always include today
    dateSet.add(todayKeyVal);

    let sorted = Array.from(dateSet).sort();

    // Ensure at least 5 points for smooth curve presentation
    if (sorted.length < 5) {
      const first = sorted[0] || todayKeyVal;
      const needed = 5 - sorted.length;
      for (let i = needed; i >= 1; i--) {
        const pastDate = addDaysToDateKey(first, -i);
        sorted.unshift(pastDate);
      }
    }

    return sorted.map((dateKey, index) => {
      const youMin = minutesByDate[dateKey] || 0;
      const buddyData = {};

      activeBuddies.forEach((f) => {
        const bMap = buddyLogsMap[f.uid] || {};
        let bMin = bMap[dateKey] || 0;
        if (dateKey === todayKeyVal && f.todayMinutes) {
          bMin = Math.max(bMin, f.todayMinutes);
        }
        buddyData[f.uid] = bMin;
      });

      return {
        id: index,
        date: dateKey,
        label: formatDateKey(dateKey, { weekday: "short", month: "short", day: "numeric" }),
        shortLabel: formatDateKey(dateKey, { month: "short", day: "numeric" }),
        youMin,
        youHours: Math.round((youMin / 60) * 10) / 10,
        buddies: buddyData,
        isToday: dateKey === todayKeyVal,
      };
    });
  }, [minutesByDate, activeBuddies, buddyLogsMap, todayKeyVal]);

  // Default to today's node selected
  useEffect(() => {
    if (timeline.length > 0) {
      setTappedIdx(timeline.length - 1);
    }
  }, [timeline.length]);

  // FIXED SVG VIEWPORT DIMENSIONS (100% responsive, auto-scales viewBox)
  const SVG_W = 600;
  const SVG_H = 220;
  const padL = 40;
  const padR = 20;
  const padT = 24;
  const padB = 24; // clean compact bottom without text clutter
  const plotW = SVG_W - padL - padR;
  const plotH = SVG_H - padT - padB;
  const baseY = padT + plotH;

  // Dynamic Y-axis scale (0h to peak hours)
  const maxYHours = useMemo(() => {
    const all = [targetHours];
    timeline.forEach((d) => {
      all.push(d.youHours);
      Object.values(d.buddies || {}).forEach((m) => all.push(m / 60));
    });
    const peak = Math.max(6, ...all);
    return Math.ceil(peak / 2) * 2; // snap to even hours (e.g. 6, 8, 10, 12)
  }, [timeline, targetHours]);

  // Y-axis grid levels
  const yTicks = useMemo(() => {
    const ticks = [];
    const step = maxYHours / 4;
    for (let i = 0; i <= 4; i++) {
      const val = Math.round(step * i * 10) / 10;
      const y = baseY - (val / maxYHours) * plotH;
      ticks.push({ val, y, label: `${val}h` });
    }
    return ticks;
  }, [maxYHours, baseY, plotH]);

  // Target Benchmark Line
  const targetY = baseY - (targetHours / maxYHours) * plotH;

  // Calculate points for You and each Buddy
  const { youPts, buddyPtMap } = useMemo(() => {
    const n = timeline.length;
    const youP = [];
    const bMap = {};

    activeBuddies.forEach((f) => {
      bMap[f.uid] = [];
    });

    timeline.forEach((d, i) => {
      const x = n <= 1 ? padL + plotW / 2 : padL + (i / (n - 1)) * plotW;
      const yYou = baseY - ((d.youMin / 60) / maxYHours) * plotH;
      youP.push({ x, y: yYou });

      activeBuddies.forEach((f) => {
        const min = d.buddies[f.uid] || 0;
        const yBud = baseY - ((min / 60) / maxYHours) * plotH;
        bMap[f.uid].push({ x, y: yBud });
      });
    });

    return { youPts: youP, buddyPtMap: bMap };
  }, [timeline, activeBuddies, maxYHours, baseY, plotH, padL, plotW]);

  const tappedDay = tappedIdx !== null && timeline[tappedIdx] ? timeline[tappedIdx] : timeline[timeline.length - 1];

  return (
    <div className="daily-analytics-card modern-card">
      {/* 1. HEADER WITH FRIEND DROPDOWN */}
      <div className="dac-header">
        <div>
          <h3 className="section-title" style={{ margin: 0 }}>Daily Study Analytics</h3>
        </div>

        {/* DROPDOWN SELECTOR */}
        <div className="dac-filter-box">
          <select
            className="dac-select"
            value={selectedFilter}
            onChange={(e) => setSelectedFilter(e.target.value)}
          >
            <option value="you">👤 Only Me ({userName})</option>
            {friends.length > 1 && (
              <option value="all">👥 Compare: All Friends ({friends.length})</option>
            )}
            {friends.map((f) => (
              <option key={f.uid} value={f.uid}>
                👥 Compare: You vs {f.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 2. AUTO-FITTING FIXED VIEWPORT GRAPH */}
      <div className="dac-canvas-wrap">
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="dac-svg"
        >
          <defs>
            <linearGradient id="youAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={YOU_COLOR} stopOpacity="0.25" />
              <stop offset="100%" stopColor={YOU_COLOR} stopOpacity="0.01" />
            </linearGradient>
            {activeBuddies.map((f, i) => {
              const color = BUDDY_COLORS[i % BUDDY_COLORS.length];
              return (
                <linearGradient key={`grad-${f.uid}`} id={`buddyGrad-${f.uid}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity="0.18" />
                  <stop offset="100%" stopColor={color} stopOpacity="0.01" />
                </linearGradient>
              );
            })}
          </defs>

          {/* HORIZONTAL GRID LINES & Y LABELS */}
          {yTicks.map((t, i) => (
            <g key={`yt-${i}`}>
              <line
                x1={padL}
                y1={t.y}
                x2={SVG_W - padR}
                y2={t.y}
                stroke={i === 0 ? "#cbd5e1" : "#f1f5f9"}
                strokeWidth={i === 0 ? "1.5" : "1"}
                strokeDasharray={i === 0 ? "0" : "4,3"}
              />
              <text x={padL - 8} y={t.y + 4} textAnchor="end" className="dac-y-label">
                {t.label}
              </text>
            </g>
          ))}

          {/* TARGET BENCHMARK LINE */}
          <line
            x1={padL}
            y1={targetY}
            x2={SVG_W - padR}
            y2={targetY}
            stroke="#94a3b8"
            strokeWidth="1.5"
            strokeDasharray="4,4"
          />
          <text x={padL + 6} y={targetY - 6} className="dac-target-label">
            Daily Target: {targetHours}h
          </text>

          {/* BUDDY AREA FILLS */}
          {activeBuddies.map((f) => {
            const pts = buddyPtMap[f.uid] || [];
            if (pts.length <= 1) return null;
            return (
              <path
                key={`area-${f.uid}`}
                d={areaPath(pts, baseY)}
                fill={`url(#buddyGrad-${f.uid})`}
              />
            );
          })}

          {/* YOU AREA FILL */}
          {youPts.length > 1 && (
            <path d={areaPath(youPts, baseY)} fill="url(#youAreaGrad)" />
          )}

          {/* BUDDY SMOOTH LINES */}
          {activeBuddies.map((f, i) => {
            const pts = buddyPtMap[f.uid] || [];
            if (pts.length <= 1) return null;
            const color = BUDDY_COLORS[i % BUDDY_COLORS.length];
            return (
              <path
                key={`line-${f.uid}`}
                d={smoothPath(pts)}
                fill="none"
                stroke={color}
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            );
          })}

          {/* YOU SMOOTH LINE */}
          {youPts.length > 1 && (
            <path
              d={smoothPath(youPts)}
              fill="none"
              stroke={YOU_COLOR}
              strokeWidth="3.5"
              strokeLinecap="round"
            />
          )}

          {/* INTERACTIVE NODES & CLICKS */}
          {timeline.map((d, idx) => {
            const youP = youPts[idx];
            const isSelected = tappedIdx === idx;

            return (
              <g key={`pt-${d.date || idx}`}>
                {/* Wide invisible click zone */}
                <rect
                  x={youP.x - (plotW / timeline.length) / 2}
                  y={padT}
                  width={plotW / timeline.length}
                  height={plotH + padB}
                  fill="transparent"
                  style={{ cursor: "pointer" }}
                  onClick={() => setTappedIdx(idx)}
                />

                {/* Vertical crosshair line */}
                {isSelected && (
                  <line
                    x1={youP.x}
                    y1={padT}
                    x2={youP.x}
                    y2={baseY}
                    stroke="#a5b4fc"
                    strokeWidth="1.5"
                    strokeDasharray="3,3"
                    pointerEvents="none"
                  />
                )}

                {/* Buddy Nodes */}
                {activeBuddies.map((f, bIdx) => {
                  const pts = buddyPtMap[f.uid] || [];
                  const budP = pts[idx];
                  if (!budP) return null;
                  const color = BUDDY_COLORS[bIdx % BUDDY_COLORS.length];
                  return (
                    <circle
                      key={`bdot-${f.uid}-${idx}`}
                      cx={budP.x}
                      cy={budP.y}
                      r={isSelected ? 6 : 4}
                      fill="#ffffff"
                      stroke={color}
                      strokeWidth="2.5"
                      className="dac-node"
                    />
                  );
                })}

                {/* You Node */}
                <circle
                  cx={youP.x}
                  cy={youP.y}
                  r={isSelected ? 7 : 4.5}
                  fill="#ffffff"
                  stroke={YOU_COLOR}
                  strokeWidth="3"
                  className="dac-node"
                />
              </g>
            );
          })}
        </svg>
      </div>

      {/* 3. INTERACTIVE NODE DETAILS POPUP */}
      {tappedDay && (
        <div className="dac-popup-card">
          <div className="dac-popup-head">
            <span className="dac-popup-date">
              {tappedDay.label} {tappedDay.isToday ? "(Today)" : ""}
            </span>
            <span className={`dac-status-pill ${tappedDay.youMin >= targetHours * 60 ? "met" : "ongoing"}`}>
              {tappedDay.youMin >= targetHours * 60 ? "🎯 Target Met" : `${Math.round((tappedDay.youMin / (targetHours * 60)) * 100)}% of Target`}
            </span>
          </div>

          <div className="dac-metrics-row">
            {/* YOU PILL */}
            <div className="dac-pill you">
              <span className="dac-dot" style={{ background: YOU_COLOR }} />
              <span><strong>{userName}:</strong> {fmtHours(tappedDay.youMin)}</span>
            </div>

            {/* BUDDIES PILLS */}
            {activeBuddies.map((f, i) => {
              const color = BUDDY_COLORS[i % BUDDY_COLORS.length];
              const bMin = tappedDay.buddies[f.uid] || 0;
              return (
                <div key={`pill-${f.uid}`} className="dac-pill buddy">
                  <span className="dac-dot" style={{ background: color }} />
                  <span><strong>{f.name}:</strong> {fmtHours(bMin)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
