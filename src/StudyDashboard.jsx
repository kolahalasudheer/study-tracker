import React, { useState } from "react";
import {
  RefreshCw,
  Trophy,
  Flame,
  Clock,
  Calendar,
  Target,
  Copy,
  Check,
  UserPlus,
  Radio,
  Zap,
  Sparkles,
  Award,
} from "lucide-react";
import { formatSessionBlock } from "./statsUtils";

function fmtMinutes(min) {
  if (min <= 0) return "0m";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function fmtHMS(totalSeconds = 0) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) {
    return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  }
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

export default function StudyDashboard({
  user,
  rows = [],
  loading,
  onRefresh,
  buddyCode,
  buddyInput,
  setBuddyInput,
  onAddBuddy,
  buddyMsg,
  displayName,
  editingName,
  nameInput,
  setNameInput,
  onSaveName,
  onEditName,
}) {
  const [copiedCode, setCopiedCode] = useState(false);
  const [showConnect, setShowConnect] = useState(false);

  const handleCopyCode = () => {
    if (!buddyCode) return;
    navigator.clipboard.writeText(buddyCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const maxToday = Math.max(1, ...rows.map((r) => r.todayMinutes || 0));
  const maxWeek = Math.max(1, ...rows.map((r) => r.weekMinutes || 0));

  // Determine head-to-head status if 2 players
  const player1 = rows[0];
  const player2 = rows[1];
  let duelText = "";
  let duelSub = "";
  let p1Ratio = 50;

  if (player1 && player2) {
    const p1Min = player1.todayMinutes || 0;
    const p2Min = player2.todayMinutes || 0;
    const diff = Math.abs(p1Min - p2Min);
    const totalMin = Math.max(1, p1Min + p2Min);
    p1Ratio = Math.round((p1Min / totalMin) * 100);

    if (p1Min === p2Min) {
      duelText = `Tied today at ${fmtMinutes(p1Min)}!`;
      duelSub = "Both studying shoulder-to-shoulder";
    } else if (player1.isYou) {
      duelText = `👑 You're leading by ${fmtMinutes(diff)} today!`;
      duelSub = `Keep the momentum going strong`;
    } else {
      duelText = `🔥 ${player1.name || "Buddy"} is leading by ${fmtMinutes(diff)} today`;
      duelSub = player2.isYou ? `Push a study session to catch up!` : `Intense focus competition`;
    }
  }

  return (
    <div className="scoreboard-container">
      {/* 1. SCOREBOARD HEADER */}
      <div className="scoreboard-header-card">
        <div className="scoreboard-top-bar">
          <div className="scoreboard-badge-pill">
            <span className="live-pulse-dot" />
            <span className="scoreboard-live-text">Live Scoreboard</span>
          </div>

          {user && (
            <button
              onClick={onRefresh}
              className={`scoreboard-refresh-btn ${loading ? "spinning" : ""}`}
              title="Refresh Leaderboard"
            >
              <RefreshCw size={16} />
              <span>{loading ? "Syncing..." : "Sync"}</span>
            </button>
          )}
        </div>

        {/* HEAD TO HEAD DUEL BANNER */}
        {player1 && player2 && (
          <div className="duel-banner">
            <div className="duel-title-row">
              <span className="duel-main-text">{duelText}</span>
              <span className="duel-sub-text">{duelSub}</span>
            </div>

            <div className="duel-bar-wrap">
              <div className="duel-bar-names">
                <span className="duel-p-name">{player1.name?.split(" ")[0]} ({fmtMinutes(player1.todayMinutes || 0)})</span>
                <span className="duel-p-name">{player2.name?.split(" ")[0]} ({fmtMinutes(player2.todayMinutes || 0)})</span>
              </div>
              <div className="duel-bar-track">
                <div className="duel-bar-fill-left" style={{ width: `${Math.max(10, Math.min(90, p1Ratio))}%` }} />
                <div className="duel-bar-fill-right" style={{ width: `${Math.max(10, Math.min(90, 100 - p1Ratio))}%` }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. PLAYER SCOREBOARD CARDS */}
      {!user ? (
        <div className="modern-card" style={{ textAlign: "center", padding: "30px 20px" }}>
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Sign in to view real-time study buddy scoreboard.</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="modern-card" style={{ textAlign: "center", padding: "30px 20px" }}>
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Loading scoreboard...</p>
        </div>
      ) : (
        rows.map((entry, index) => {
          const isYou = entry.isYou;
          const rank = index + 1;
          const isStudying = entry.isStudyingNow;
          const isPaused = entry.isPausedNow;
          const todayTargetMin = (entry.targetHours || 4) * 60;
          const goalPct = Math.min(100, Math.round(((entry.todayMinutes || 0) / todayTargetMin) * 100));

          return (
            <div
              key={entry.uid || index}
              className={`player-score-card ${isYou ? "you-card" : "buddy-card"} ${isStudying ? "live-studying" : ""}`}
            >
              {/* CARD TOP ROW */}
              <div className="player-card-header">
                <div className="player-avatar-rank-group">
                  <div className="rank-podium-badge">
                    {rank === 1 ? (
                      <span className="rank-gold">🥇 #1</span>
                    ) : rank === 2 ? (
                      <span className="rank-silver">🥈 #2</span>
                    ) : (
                      <span className="rank-bronze">#{rank}</span>
                    )}
                  </div>

                  <div className={`player-avatar-circle ${isStudying ? "avatar-pulse" : ""}`}>
                    {(entry.name || "S").trim().charAt(0).toUpperCase()}
                  </div>

                  <div className="player-info-meta">
                    <div className="player-display-name">
                      {entry.name || "Student"}
                      {isYou && <span className="you-pill-tag">You</span>}
                    </div>

                    {/* LIVE STATUS PILL */}
                    {isStudying ? (
                      <div className="live-status-pill studying">
                        <Radio size={12} className="pulse-icon" />
                        <span>Studying {entry.activeSubject || "Session"}</span>
                      </div>
                    ) : isPaused ? (
                      <div className="live-status-pill paused">
                        <span>⏸️ Paused {entry.activeSubject || ""}</span>
                      </div>
                    ) : (entry.todayMinutes || 0) > 0 ? (
                      <div className="live-status-pill done">
                        <span>⚡ Active Today</span>
                      </div>
                    ) : (
                      <div className="live-status-pill idle">
                        <span>💤 Not studying yet today</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* TODAY HERO TIME */}
                <div className="player-today-hero">
                  <div className="today-hero-label">Today</div>
                  <div className="today-hero-val">{fmtMinutes(entry.todayMinutes || 0)}</div>
                  {isStudying && entry.activeElapsed > 0 && (
                    <div className="today-live-ticking">{fmtHMS(entry.activeElapsed)}</div>
                  )}
                </div>
              </div>

              {/* STATS MATRIX GRID */}
              <div className="scoreboard-stat-grid">
                <div className="score-tile">
                  <div className="score-tile-icon"><Clock size={14} /></div>
                  <div className="score-tile-body">
                    <span className="score-tile-lbl">This Week</span>
                    <strong className="score-tile-num">{fmtMinutes(entry.weekMinutes || 0)}</strong>
                  </div>
                </div>

                <div className="score-tile">
                  <div className="score-tile-icon"><Flame size={14} color="#f97316" /></div>
                  <div className="score-tile-body">
                    <span className="score-tile-lbl">Streak</span>
                    <strong className="score-tile-num">{entry.streak || 0}d</strong>
                  </div>
                </div>

                <div className="score-tile">
                  <div className="score-tile-icon"><Target size={14} color="#8b5cf6" /></div>
                  <div className="score-tile-body">
                    <span className="score-tile-lbl">Daily Goal</span>
                    <strong className="score-tile-num">{goalPct}%</strong>
                  </div>
                </div>
              </div>

              {/* TODAY SESSIONS TIMELINE */}
              <div className="sessions-timeline-wrap">
                <div className="sessions-timeline-head">
                  <span>Today&apos;s Study Logs</span>
                  <span className="session-count-badge">{(entry.todaySessions || []).length}</span>
                </div>

                {(entry.todaySessions || []).length === 0 ? (
                  <div className="empty-session-notice">No study sessions completed today yet.</div>
                ) : (
                  <div className="sessions-timeline-list">
                    {entry.todaySessions.map((s, si) => {
                      const isLiveItem = s.isLive;
                      return (
                        <div
                          key={s.startedAt || s.ts || si}
                          className={`session-timeline-row ${isLiveItem ? "active-live-row" : ""}`}
                        >
                          <div className="session-timeline-indicator">
                            <span className={`timeline-dot ${isLiveItem ? "dot-live" : ""}`} />
                          </div>
                          <div className="session-timeline-details">
                            <div className="session-row-subj">
                              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                <strong>{s.subject}</strong>
                                {s.note && <span className="session-note-pill">{s.note}</span>}
                              </div>
                              {isLiveItem ? (
                                <span className="in-progress-tag">Live Session</span>
                              ) : (
                                <span className="session-duration-tag">{fmtMinutes(s.minutes)}</span>
                              )}
                            </div>
                            <div className="session-row-time">
                              {isLiveItem ? `Started ${fmtHMS(s.elapsedSeconds || 0)} ago` : formatSessionBlock(s)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })
      )}

      {/* 3. BUDDY CONNECTION / PAIRING CARD */}
      {user && (
        <div className="modern-card connect-card">
          <div className="connect-header-row">
            <div>
              <h3 className="connect-title">Connect with Study Buddy</h3>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setShowConnect((v) => !v)}
            >
              {showConnect ? "Hide" : "Manage"}
            </button>
          </div>

          {showConnect && (
            <div className="connect-content-body">
              {/* DISPLAY NAME */}
              <div className="connect-field-block">
                <label className="field-label-small">Your Display Name</label>
                {editingName ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      className="input"
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      placeholder="Your name"
                    />
                    <button className="btn btn-primary" onClick={onSaveName}>
                      Save
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontWeight: 700, color: "var(--text)" }}>{displayName || "Set your name"}</span>
                    <button className="btn btn-ghost btn-sm" onClick={onEditName}>
                      Edit
                    </button>
                  </div>
                )}
              </div>

              {/* SHARE BUDDY CODE */}
              {buddyCode && (
                <div className="connect-field-block">
                  <label className="field-label-small">Your Shareable Buddy Code</label>
                  <div className="buddy-code-box">
                    <span className="buddy-code-digits">{buddyCode}</span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm copy-btn"
                      onClick={handleCopyCode}
                      title="Copy code"
                    >
                      {copiedCode ? <Check size={16} color="#10b981" /> : <Copy size={16} />}
                      <span>{copiedCode ? "Copied!" : "Copy"}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* ADD BUDDY CODE */}
              <div className="connect-field-block">
                <label className="field-label-small">Enter Brother&apos;s Buddy Code</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    className="input"
                    value={buddyInput}
                    onChange={(e) => setBuddyInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === "Enter" && onAddBuddy()}
                    placeholder="e.g. A3F8K9"
                    maxLength={10}
                  />
                  <button className="btn btn-primary" onClick={onAddBuddy}>
                    <UserPlus size={16} /> Add
                  </button>
                </div>
                {buddyMsg && (
                  <div className="buddy-msg-feedback">{buddyMsg}</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
