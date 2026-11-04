import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Play,
  Pause,
  Square,
  Plus,
  X,
  Pencil,
  Check,
  Users,
  BarChart3,
  Timer,
  Trash2,
  BookOpen,
  MessageSquare,
  Settings,
  RotateCcw,
  FastForward,
  Bell,
  BellRing,
  BellOff,
} from "lucide-react";
import { useAuth, readLocalState, DEFAULT_STATE } from "./AuthContext";
import { buildWeekDaily, buildTodayBySubject, mergeActiveTimer, todayKey, fmtDate, formatSessionBlock, normalizeSession, computeDailyAverage } from "./statsUtils";
import { startOfWeekKey, addDaysToDateKey } from "./dateUtils";
import StudyDashboard from "./StudyDashboard";
import StudyHeatmap from "./StudyHeatmap";
import StudyCharts from "./StudyCharts";
import StudyCalendar from "./StudyCalendar";
import StudyProgress from "./StudyProgress";
import StudyChat from "./StudyChat";
import MockTests from "./MockTests";
import ManualLogModal from "./ManualLogModal";
import PomodoroSettingsModal, { DEFAULT_POMO_SETTINGS } from "./PomodoroSettingsModal";
import { startContinuousAlarm, stopContinuousAlarm, playChime, unlockAudio } from "./soundUtils";

const DEFAULT_TARGET_HOURS = DEFAULT_STATE.targetHours;

function fmtHMS(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function fmtMS(totalSeconds) {
  const m = Math.floor(Math.max(0, totalSeconds) / 60);
  const s = Math.max(0, totalSeconds) % 60;
  return `${pad(m)}:${pad(s)}`;
}

function fmtMinutes(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function hydrateFromData(data, setters) {
  const subs = data.subjects?.length ? data.subjects : [];
  setters.setSessions(data.sessions || []);
  setters.setSubjects(subs);
  setters.setSubject(subs[0] || "");
  setters.setTargetHours(data.targetHours ?? DEFAULT_TARGET_HOURS);
  setters.setTargetInput(String(data.targetHours ?? DEFAULT_TARGET_HOURS));
  setters.setTargetHistory(data.targetHistory || {});
  setters.setChecklist(data.checklist || []);
  setters.setDisplayName(data.displayName || "");
  setters.setNameInput(data.displayName || "");

  const active = data.activeTimer;
  if (active) {
    const today = todayKey();
    if (active.date && active.date !== today) return;

    setters.setSubject(active.subject || subs[0]);
    setters.setAccumulated(active.accumulated || 0);
    setters.setSessionStartedAt(
      active.sessionStartedAt
        || (active.startTime ? active.startTime - (active.accumulated || 0) * 1000 : null)
    );
    if (active.paused) {
      setters.setPaused(true);
      setters.setRunning(false);
      setters.setStartTime(null);
      setters.setElapsed(active.accumulated || 0);
    } else if (active.startTime) {
      setters.setPaused(false);
      setters.setRunning(true);
      setters.setStartTime(active.startTime);
      setters.setElapsed((active.accumulated || 0) + Math.floor((Date.now() - active.startTime) / 1000));
    }
  }
}

function initials(name) {
  return (name || "S").trim().charAt(0).toUpperCase();
}

/** Remove duplicate sessions based on startedAt + endedAt + subject + minutes */
function deduplicateSessions(sessions) {
  const seen = new Set();
  const result = [];
  for (const s of sessions) {
    const key = `${s.startedAt || ''}-${s.endedAt || s.ts || ''}-${s.subject}-${s.minutes}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(s);
    }
  }
  return result;
}

export default function StudyTracker() {
  const {
    user,
    authReady,
    supabaseConfigured,
    cloudState,
    buddyCode,
    buddyStats,
    syncError,
    savePartial,
    publishStats,
    syncDayLogs,
    fetchDayLogs,
    addBuddy,
    signInWithGoogle,
    signOut,
    refreshBuddies,
  } = useAuth();

  const [loaded, setLoaded] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [subject, setSubject] = useState("");
  const [newSubject, setNewSubject] = useState("");
  const [showAddSubject, setShowAddSubject] = useState(false);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [startTime, setStartTime] = useState(null);
  const [accumulated, setAccumulated] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [sessionStartedAt, setSessionStartedAt] = useState(null);
  const [saveError, setSaveError] = useState(false);
  const [targetHours, setTargetHours] = useState(DEFAULT_TARGET_HOURS);
  const [targetHistory, setTargetHistory] = useState({});
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetInput, setTargetInput] = useState(String(DEFAULT_TARGET_HOURS));
  const [checklist, setChecklist] = useState([]);
  const [newChecklistItem, setNewChecklistItem] = useState("");
  const [showChecklist, setShowChecklist] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [buddyInput, setBuddyInput] = useState("");
  const [buddyMsg, setBuddyMsg] = useState("");
  const [authMsg, setAuthMsg] = useState("");
  const [activeTab, setActiveTab] = useState("timer");
  const [showTodayLogs, setShowTodayLogs] = useState(true);
  const [showManualModal, setShowManualModal] = useState(false);
  const [editingSession, setEditingSession] = useState(null);

  // Pomodoro Technique States
  const [timerMode, setTimerMode] = useState("stopwatch"); // "stopwatch" | "pomodoro"
  const [pomoSettings, setPomoSettings] = useState(() => {
    try {
      const saved = localStorage.getItem("study_pomo_settings");
      return saved ? { ...DEFAULT_POMO_SETTINGS, ...JSON.parse(saved) } : DEFAULT_POMO_SETTINGS;
    } catch {
      return DEFAULT_POMO_SETTINGS;
    }
  });
  const [showPomoSettings, setShowPomoSettings] = useState(false);
  const [pomoPhase, setPomoPhase] = useState("focus"); // "focus" | "short_break" | "long_break"
  const [pomoSecondsLeft, setPomoSecondsLeft] = useState(() => (DEFAULT_POMO_SETTINGS.focusMinutes * 60));
  const [pomoRunning, setPomoRunning] = useState(false);
  const [pomoPaused, setPomoPaused] = useState(false);
  const [pomoCycle, setPomoCycle] = useState(0); // 0 to pomoSettings.longBreakInterval
  const [pomoTotalCompleted, setPomoTotalCompleted] = useState(0);
  const [pomoSessionStartedAt, setPomoSessionStartedAt] = useState(null);
  const pomoTickRef = useRef(null);

  // Continuous Alarm State
  const [alarmActive, setAlarmActive] = useState(false);
  const [alarmMessage, setAlarmMessage] = useState("");

  const handleStopAlarm = useCallback(() => {
    stopContinuousAlarm();
    setAlarmActive(false);
    setAlarmMessage("");
  }, []);

  useEffect(() => {
    if (!alarmActive) return;
    const originalTitle = document.title;
    let flip = false;
    const titleInterval = setInterval(() => {
      document.title = flip ? "🔔 TIME'S UP! — Study Tracker" : "⏰ TIME'S UP! — Study Tracker";
      flip = !flip;
    }, 1000);

    return () => {
      clearInterval(titleInterval);
      document.title = originalTitle;
    };
  }, [alarmActive]);

  useEffect(() => {
    return () => {
      stopContinuousAlarm();
    };
  }, []);
  const tickRef = useRef(null);
  const lastPublishRef = useRef(0);
  const hydratedRef = useRef(false);
  const stoppingRef = useRef(false);
  const displayNameResolved =
    displayName || user?.user_metadata?.full_name || user?.user_metadata?.name || "";

  useEffect(() => {
    hydratedRef.current = false;
  }, [user?.id]);

  const cloudReady = !user || !!cloudState;

  useEffect(() => {
    if (!authReady || !cloudReady) return;
    if (hydratedRef.current) return;

    const local = readLocalState();
    const base = user && cloudState ? { ...cloudState, targetHours: cloudState.targetHours ?? local.targetHours } : { ...local };
    const mergedTimer = mergeActiveTimer(base.activeTimer, local.activeTimer);
    let data = { ...base, activeTimer: mergedTimer };

    // Deduplicate sessions on load to clean up any existing duplicates
    if (data.sessions?.length) {
      const deduped = deduplicateSessions(data.sessions);
      if (deduped.length !== data.sessions.length) {
        data = { ...data, sessions: deduped };
        savePartial({ sessions: deduped });
      }
    }

    const todayKeyVal = todayKey();
    if (data.activeTimer) {
      const active = data.activeTimer;
      const isWrongDate = active.date && active.date !== todayKeyVal;
      const isAlreadyLogged = (data.sessions || []).some((s) => {
        if (s.subject !== active.subject) return false;
        const sStart = s.startedAt || (s.ts ? s.ts - s.minutes * 60000 : 0);
        const aStart = active.sessionStartedAt || (active.startTime ? active.startTime - (active.accumulated || 0) * 1000 : 0);
        if (sStart && aStart && Math.abs(sStart - aStart) < 5000) return true;
        if (active.accumulated > 0 && Math.abs(s.minutes - Math.round(active.accumulated / 60)) === 0 && (s.date === todayKeyVal || s.date === active.date)) {
          return true;
        }
        return false;
      });

      if (isWrongDate || isAlreadyLogged) {
        data = { ...data, activeTimer: null };
        savePartial({ activeTimer: null });
      }
    } else if (mergedTimer && mergedTimer !== base.activeTimer) {
      savePartial({ activeTimer: mergedTimer });
    }

    let history = { ...(data.targetHistory || {}) };
    const targetH = data.targetHours ?? DEFAULT_TARGET_HOURS;
    if (!(todayKeyVal in history)) {
      history = { ...history, [todayKeyVal]: targetH * 60 };
      savePartial({ targetHistory: history });
    }

    hydrateFromData({ ...data, targetHistory: history }, {
      setSessions,
      setSubjects,
      setSubject,
      setTargetHours,
      setTargetInput,
      setTargetHistory,
      setChecklist,
      setDisplayName,
      setNameInput,
      setPaused,
      setRunning,
      setStartTime,
      setElapsed,
      setAccumulated,
      setSessionStartedAt,
    });

    hydratedRef.current = true;
    setLoaded(true);
  }, [authReady, user?.id, cloudReady, cloudState, savePartial]);

  useEffect(() => {
    setSaveError(syncError);
  }, [syncError]);

  useEffect(() => {
    if (running && startTime) {
      tickRef.current = setInterval(() => {
        setElapsed(accumulated + Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
    } else if (tickRef.current) {
      clearInterval(tickRef.current);
    }
    return () => tickRef.current && clearInterval(tickRef.current);
  }, [running, startTime, accumulated]);

  const buildTimerSnapshot = useCallback(
    () => ({
      subject,
      accumulated,
      startTime: running ? startTime : null,
      paused: paused && !running,
      sessionStartedAt,
    }),
    [subject, accumulated, startTime, running, paused, sessionStartedAt]
  );

  const persistActiveTimer = useCallback(
    async (timer) => {
      const payload = timer
        ? { ...timer, date: todayKey(), updatedAt: Date.now() }
        : null;
      const ok = await savePartial({ activeTimer: payload });
      if (!ok) setSaveError(true);
    },
    [savePartial]
  );

  useEffect(() => {
    if (!loaded || (!running && !paused)) return;

    const saveSnapshot = () => {
      persistActiveTimer(buildTimerSnapshot());
    };

    const onHide = () => saveSnapshot();
    window.addEventListener("pagehide", onHide);

    const iv = setInterval(saveSnapshot, 30000);
    return () => {
      clearInterval(iv);
      window.removeEventListener("pagehide", onHide);
    };
  }, [loaded, running, paused, buildTimerSnapshot, persistActiveTimer]);

  const persistSessions = useCallback(
    async (next) => {
      setSessions(next);
      const ok = await savePartial({ sessions: next });
      if (!ok) setSaveError(true);
      if (user) await syncDayLogs(user.id, next);
    },
    [savePartial, user, syncDayLogs]
  );

  const persistSubjects = useCallback(
    async (next) => {
      setSubjects(next);
      const ok = await savePartial({ subjects: next });
      if (!ok) setSaveError(true);
    },
    [savePartial]
  );

  const persistTargetHistory = useCallback(
    async (next) => {
      setTargetHistory(next);
      const ok = await savePartial({ targetHistory: next });
      if (!ok) setSaveError(true);
    },
    [savePartial]
  );

  const persistChecklist = useCallback(
    async (next) => {
      setChecklist(next);
      const ok = await savePartial({ checklist: next });
      if (!ok) setSaveError(true);
    },
    [savePartial]
  );

  const loadLeaderboard = useCallback(async () => {
    setLeaderboardLoading(true);
    await refreshBuddies();
    setLeaderboardLoading(false);
  }, [refreshBuddies]);

  const handleSaveName = async () => {
    const name = nameInput.trim();
    if (!name) {
      setEditingName(false);
      return;
    }
    setDisplayName(name);
    setEditingName(false);
    const ok = await savePartial({ displayName: name });
    if (!ok) setSaveError(true);
    lastPublishRef.current = 0;
  };

  const handleAddBuddy = async () => {
    const result = await addBuddy(buddyInput);
    setBuddyMsg(result.ok ? "Connected! You can both see each other now." : result.error || "Could not add buddy");
    if (result.ok) setBuddyInput("");
  };

  const handleGoogleSignIn = async () => {
    setAuthMsg("");
    const result = await signInWithGoogle();
    if (result.error) setAuthMsg(result.error);
  };

  const handleAddChecklistItem = () => {
    const text = newChecklistItem.trim();
    if (!text) return;
    persistChecklist([...checklist, { id: Date.now(), text, done: false }]);
    setNewChecklistItem("");
  };

  const handleToggleChecklistItem = (id) => {
    persistChecklist(checklist.map((item) => (item.id === id ? { ...item, done: !item.done } : item)));
  };

  const handleRemoveChecklistItem = (id) => {
    persistChecklist(checklist.filter((item) => item.id !== id));
  };

  const handleSaveTarget = async () => {
    const hours = parseFloat(targetInput);
    if (isNaN(hours) || hours <= 0) {
      setTargetInput(String(targetHours));
      setEditingTarget(false);
      return;
    }
    setTargetHours(hours);
    setEditingTarget(false);
    const todayKeyVal = todayKey();
    const nextHistory = { ...targetHistory, [todayKeyVal]: hours * 60 };
    setTargetHistory(nextHistory);
    const ok = await savePartial({
      targetHours: hours,
      targetHistory: nextHistory,
      targetUpdatedAt: Date.now(),
    });
    if (!ok) setSaveError(true);
  };

  const handleAddSubject = () => {
    const name = newSubject.trim();
    if (!name || subjects.includes(name)) {
      setNewSubject("");
      setShowAddSubject(false);
      return;
    }
    persistSubjects([...subjects, name]);
    setSubject(name);
    setNewSubject("");
    setShowAddSubject(false);
  };

  const handleRemoveSubject = (name) => {
    if (running || paused) return;
    const next = subjects.filter((s) => s !== name);
    persistSubjects(next);
    if (subject === name) setSubject(next[0] || "");
  };

  const handleStart = async () => {
    if (!subject.trim()) return;
    unlockAudio();
    const t = Date.now();
    setSessionStartedAt(t);
    setStartTime(t);
    setAccumulated(0);
    setElapsed(0);
    setRunning(true);
    setPaused(false);
    await persistActiveTimer({ subject, accumulated: 0, startTime: t, paused: false, sessionStartedAt: t });
  };

  const handlePause = async () => {
    if (!startTime) return;
    const banked = accumulated + Math.floor((Date.now() - startTime) / 1000);
    setAccumulated(banked);
    setElapsed(banked);
    setStartTime(null);
    setRunning(false);
    setPaused(true);
    await persistActiveTimer({
      subject,
      accumulated: banked,
      startTime: null,
      paused: true,
      sessionStartedAt,
    });
  };

  const handleResume = async () => {
    const t = Date.now();
    setStartTime(t);
    setRunning(true);
    setPaused(false);
    await persistActiveTimer({
      subject,
      accumulated,
      startTime: t,
      paused: false,
      sessionStartedAt,
    });
  };

  const minutesByDate = {};
  const minutesBySubject = {};
  for (const s of sessions) {
    minutesByDate[s.date] = (minutesByDate[s.date] || 0) + s.minutes;
    minutesBySubject[s.subject] = (minutesBySubject[s.subject] || 0) + s.minutes;
  }

  const todayKeyVal = todayKey();
  const liveStopwatchMinutes = running || paused ? Math.floor(elapsed / 60) : 0;
  const livePomoMinutes = timerMode === "pomodoro" && pomoPhase === "focus" && (pomoRunning || pomoPaused)
    ? Math.floor((pomoSettings.focusMinutes * 60 - pomoSecondsLeft) / 60)
    : 0;
  const liveExtraMinutes = timerMode === "pomodoro" ? livePomoMinutes : liveStopwatchMinutes;
  const isStudyingActive = timerMode === "pomodoro"
    ? (pomoPhase === "focus" && pomoRunning)
    : running;
  const isPausedActive = timerMode === "pomodoro"
    ? (pomoPhase === "focus" && pomoPaused)
    : paused;

  const todayMinutes = (minutesByDate[todayKeyVal] || 0) + liveExtraMinutes;

  const weekStartKey = startOfWeekKey(todayKeyVal);
  let weekMinutes = 0;
  for (const [dateKey, min] of Object.entries(minutesByDate)) {
    if (dateKey >= weekStartKey) weekMinutes += min;
  }
  weekMinutes += liveExtraMinutes;

  const todayTargetMinutes = targetHistory[todayKeyVal] ?? targetHours * 60;
  const targetPct = Math.min(100, Math.round((todayMinutes / todayTargetMinutes) * 100));

  const totalMinutesAll = sessions.reduce((a, s) => a + s.minutes, 0) + liveExtraMinutes;
  const { avgDailyMinutes, activeDaysCount, exactAvgHours } = computeDailyAverage(sessions, liveExtraMinutes, todayKeyVal);

  let streak = 0;
  {
    let cursorKey = todayKeyVal;
    if (!minutesByDate[cursorKey] && !isStudyingActive && !isPausedActive) {
      cursorKey = addDaysToDateKey(cursorKey, -1);
    }
    while (minutesByDate[cursorKey] || (cursorKey === todayKeyVal && (isStudyingActive || isPausedActive))) {
      streak += 1;
      cursorKey = addDaysToDateKey(cursorKey, -1);
    }
  }

  const todaySessions = useMemo(
    () => sessions.filter((s) => s.date === todayKeyVal).sort((a, b) => (b.ts || 0) - (a.ts || 0)),
    [sessions, todayKeyVal]
  );

  const todaySessionsWithActive = useMemo(() => {
    const base = sessions.filter((s) => s.date === todayKeyVal).sort((a, b) => (b.ts || 0) - (a.ts || 0));
    if (timerMode === "pomodoro" && pomoPhase === "focus" && (pomoRunning || pomoPaused) && subject) {
      const elapsedPomoSec = pomoSettings.focusMinutes * 60 - pomoSecondsLeft;
      const activeEntry = {
        isLive: true,
        isRunning: pomoRunning,
        isPaused: pomoPaused,
        subject,
        minutes: Math.max(1, Math.floor(elapsedPomoSec / 60)),
        elapsedSeconds: elapsedPomoSec,
        startedAt: pomoSessionStartedAt || (Date.now() - elapsedPomoSec * 1000),
        ts: Date.now(),
        date: todayKeyVal,
      };
      return [activeEntry, ...base];
    }
    if ((running || paused) && subject) {
      const activeEntry = {
        isLive: true,
        isRunning: running,
        isPaused: paused,
        subject,
        minutes: Math.max(1, Math.floor(elapsed / 60)),
        elapsedSeconds: elapsed,
        startedAt: sessionStartedAt || (startTime ? startTime - accumulated * 1000 : Date.now() - elapsed * 1000),
        ts: Date.now(),
        date: todayKeyVal,
      };
      return [activeEntry, ...base];
    }
    return base;
  }, [sessions, todayKeyVal, running, paused, subject, elapsed, sessionStartedAt, startTime, accumulated, timerMode, pomoPhase, pomoRunning, pomoPaused, pomoSettings.focusMinutes, pomoSecondsLeft, pomoSessionStartedAt]);

  const weekDaily = useMemo(
    () => buildWeekDaily(sessions, liveExtraMinutes, todayKeyVal),
    [sessions, liveExtraMinutes, todayKeyVal]
  );

  const todayBySubject = useMemo(
    () => buildTodayBySubject(sessions, liveExtraMinutes, todayKeyVal, (running || paused) ? subject : ""),
    [sessions, liveExtraMinutes, todayKeyVal, running, paused, subject]
  );

  const publishLeaderboard = useCallback(
    async (name, stats, force) => {
      if (!name) return;
      const now = Date.now();
      const throttle = running || paused ? 2500 : 10000;
      if (!force && now - lastPublishRef.current < throttle) return;
      lastPublishRef.current = now;
      await publishStats({
        name,
        ...stats,
        todaySessions: stats.todaySessions ?? todaySessionsWithActive,
        weekDaily: stats.weekDaily ?? weekDaily,
      });
    },
    [publishStats, running, paused, todaySessionsWithActive, weekDaily]
  );

  const handleStop = async () => {
    // Guard: prevent re-entry from double-clicks or rapid state updates
    if (!running && !paused) return;
    if (stoppingRef.current) return;
    stoppingRef.current = true;

    try {
      // Capture all timer values IMMEDIATELY before any async work
      const capturedAccumulated = accumulated;
      const capturedStartTime = startTime;
      const capturedSubject = subject;
      const capturedSessionStartedAt = sessionStartedAt;
      const capturedRunning = running;

      // Reset timer state FIRST to prevent UI from allowing another stop
      setRunning(false);
      setPaused(false);
      setStartTime(null);
      setAccumulated(0);
      setElapsed(0);
      setSessionStartedAt(null);

      const endedAt = Date.now();
      const totalSeconds = capturedAccumulated + (capturedRunning && capturedStartTime ? Math.floor((endedAt - capturedStartTime) / 1000) : 0);
      const minutes = Math.max(1, Math.round(totalSeconds / 60));
      const startedAtVal = capturedSessionStartedAt || endedAt - totalSeconds * 1000;
      const entry = {
        date: fmtDate(startedAtVal),
        subject: capturedSubject,
        minutes,
        startedAt: startedAtVal,
        endedAt,
        ts: endedAt,
      };

      // Deduplicate: skip if an identical session already exists
      const isDupe = sessions.some(s =>
        s.startedAt === entry.startedAt &&
        s.subject === entry.subject &&
        s.minutes === entry.minutes
      );

      const next = isDupe ? sessions : [...sessions, entry];
      setSessions(next);

      // ATOMIC SAVE: Save updated sessions AND clear activeTimer in ONE single call!
      await savePartial({ sessions: next, activeTimer: null });
      if (user) await syncDayLogs(user.id, next);

      if (!(entry.date in targetHistory)) {
        await persistTargetHistory({ ...targetHistory, [entry.date]: targetHours * 60 });
      }

      if (displayNameResolved && user) {
        const freshMinutesByDate = {};
        for (const s of next) freshMinutesByDate[s.date] = (freshMinutesByDate[s.date] || 0) + s.minutes;
        const wStart = startOfWeekKey(entry.date);
        let freshWeek = 0;
        for (const [dk, m] of Object.entries(freshMinutesByDate)) {
          if (dk >= wStart) freshWeek += m;
        }
        let freshStreak = 0;
        {
          let cKey = entry.date;
          while (freshMinutesByDate[cKey]) {
            freshStreak += 1;
            cKey = addDaysToDateKey(cKey, -1);
          }
        }
        const freshTodaySessions = next.filter((s) => s.date === entry.date).sort((a, b) => (b.ts || 0) - (a.ts || 0));
        publishLeaderboard(
          displayNameResolved,
          {
            todayMinutes: freshMinutesByDate[entry.date] || 0,
            weekMinutes: freshWeek,
            streak: freshStreak,
            totalMinutes: next.reduce((a, s) => a + s.minutes, 0),
            todaySessions: freshTodaySessions,
            weekDaily: buildWeekDaily(next, 0, entry.date),
            sessions: next,
          },
          true
        );
      }
    } finally {
      stoppingRef.current = false;
    }
  };

  // Synchronized refs for Pomodoro timer to avoid stale closures
  const pomoSettingsRef = useRef(pomoSettings);
  pomoSettingsRef.current = pomoSettings;
  const pomoPhaseRef = useRef(pomoPhase);
  pomoPhaseRef.current = pomoPhase;
  const pomoCycleRef = useRef(pomoCycle);
  pomoCycleRef.current = pomoCycle;
  const subjectRef = useRef(subject);
  subjectRef.current = subject;
  const pomoSessionStartedAtRef = useRef(pomoSessionStartedAt);
  pomoSessionStartedAtRef.current = pomoSessionStartedAt;

  // Log completed or partial Pomodoro focus session
  const handleLogPomoSession = useCallback(
    async (minutesToLog, note) => {
      if (minutesToLog <= 0) return;
      const currentSubject = subjectRef.current || subjects[0] || "Study";
      const endedAt = Date.now();
      const startedAtVal = pomoSessionStartedAtRef.current || (endedAt - minutesToLog * 60 * 1000);
      const entry = {
        date: fmtDate(startedAtVal),
        subject: currentSubject,
        minutes: minutesToLog,
        startedAt: startedAtVal,
        endedAt,
        ts: endedAt,
        note: note || `🍅 Pomodoro`,
        source: "pomodoro",
      };

      const next = [...sessions, entry];
      setSessions(next);
      await persistSessions(next);
      if (user) await syncDayLogs(user.id, next);

      if (!(entry.date in targetHistory)) {
        await persistTargetHistory({ ...targetHistory, [entry.date]: targetHours * 60 });
      }

      if (displayNameResolved && user) {
        const todayKeyVal = todayKey();
        const freshMinutesByDate = {};
        for (const s of next) freshMinutesByDate[s.date] = (freshMinutesByDate[s.date] || 0) + s.minutes;
        const wStart = startOfWeekKey(todayKeyVal);
        let freshWeek = 0;
        for (const [dk, m] of Object.entries(freshMinutesByDate)) {
          if (dk >= wStart) freshWeek += m;
        }
        let freshStreak = 0;
        {
          let cKey = todayKeyVal;
          if (!freshMinutesByDate[cKey]) cKey = addDaysToDateKey(cKey, -1);
          while (freshMinutesByDate[cKey]) {
            freshStreak += 1;
            cKey = addDaysToDateKey(cKey, -1);
          }
        }
        const freshTodaySessions = next.filter((s) => s.date === todayKeyVal).sort((a, b) => (b.ts || 0) - (a.ts || 0));
        publishLeaderboard(
          displayNameResolved,
          {
            todayMinutes: freshMinutesByDate[todayKeyVal] || 0,
            weekMinutes: freshWeek,
            streak: freshStreak,
            totalMinutes: next.reduce((a, s) => a + s.minutes, 0),
            todaySessions: freshTodaySessions,
            weekDaily: buildWeekDaily(next, 0, todayKeyVal),
            sessions: next,
          },
          true
        );
      }
    },
    [sessions, persistSessions, user, syncDayLogs, targetHistory, persistTargetHistory, targetHours, displayNameResolved, publishLeaderboard, subjects]
  );

  // Handle Pomodoro countdown phase completion
  const handlePomoPhaseComplete = useCallback(() => {
    const curPhase = pomoPhaseRef.current;
    const curSettings = pomoSettingsRef.current;

    if (curPhase === "focus") {
      setAlarmActive(true);
      setAlarmMessage(`🎯 Focus session complete (${curSettings.focusMinutes}m)! Time for a well-deserved break.`);
      if (curSettings.soundEnabled) {
        startContinuousAlarm("focus_complete");
      }
      handleLogPomoSession(curSettings.focusMinutes, `🍅 Pomodoro #${pomoCycleRef.current + 1}`);

      setPomoTotalCompleted((c) => c + 1);
      const nextCycle = pomoCycleRef.current + 1;
      const isLongBreak = nextCycle >= curSettings.longBreakInterval;

      if (isLongBreak) {
        setPomoPhase("long_break");
        setPomoCycle(0);
        setPomoSecondsLeft(curSettings.longBreakMinutes * 60);
      } else {
        setPomoPhase("short_break");
        setPomoCycle(nextCycle);
        setPomoSecondsLeft(curSettings.shortBreakMinutes * 60);
      }

      if (curSettings.autoStartBreaks) {
        setPomoRunning(true);
        setPomoPaused(false);
      } else {
        setPomoRunning(false);
        setPomoPaused(false);
      }
    } else {
      // Break complete
      setAlarmActive(true);
      setAlarmMessage(`☕ Break time is over! Ready for your next focus session?`);
      if (curSettings.soundEnabled) {
        startContinuousAlarm("break_complete");
      }
      setPomoPhase("focus");
      setPomoSecondsLeft(curSettings.focusMinutes * 60);

      if (curSettings.autoStartPomodoros) {
        setPomoSessionStartedAt(Date.now());
        setPomoRunning(true);
        setPomoPaused(false);
      } else {
        setPomoRunning(false);
        setPomoPaused(false);
      }
    }
  }, [handleLogPomoSession]);

  // Pomodoro countdown timer tick
  useEffect(() => {
    if (!pomoRunning) {
      if (pomoTickRef.current) clearInterval(pomoTickRef.current);
      return;
    }

    pomoTickRef.current = setInterval(() => {
      setPomoSecondsLeft((prev) => {
        if (prev <= 1) {
          handlePomoPhaseComplete();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (pomoTickRef.current) clearInterval(pomoTickRef.current);
    };
  }, [pomoRunning, handlePomoPhaseComplete]);

  // Pomodoro Actions
  const handlePomoStart = () => {
    handleStopAlarm();
    unlockAudio();
    if (pomoPhase === "focus" && !subject.trim()) {
      if (subjects.length > 0) setSubject(subjects[0]);
    }
    if (pomoPhase === "focus") {
      setPomoSessionStartedAt(Date.now());
    }
    setPomoRunning(true);
    setPomoPaused(false);
  };

  const handlePomoPause = () => {
    handleStopAlarm();
    setPomoRunning(false);
    setPomoPaused(true);
  };

  const handlePomoResume = () => {
    handleStopAlarm();
    setPomoRunning(true);
    setPomoPaused(false);
  };

  const handlePomoReset = () => {
    handleStopAlarm();
    setPomoRunning(false);
    setPomoPaused(false);
    const cur = pomoSettingsRef.current;
    if (pomoPhase === "focus") {
      setPomoSecondsLeft(cur.focusMinutes * 60);
    } else if (pomoPhase === "short_break") {
      setPomoSecondsLeft(cur.shortBreakMinutes * 60);
    } else {
      setPomoSecondsLeft(cur.longBreakMinutes * 60);
    }
  };

  const handlePomoSkipBreak = () => {
    handleStopAlarm();
    setPomoRunning(false);
    setPomoPaused(false);
    setPomoPhase("focus");
    setPomoSecondsLeft(pomoSettingsRef.current.focusMinutes * 60);
  };

  const handlePomoStopEarly = async () => {
    handleStopAlarm();
    if (pomoPhase === "focus") {
      const elapsedSec = pomoSettings.focusMinutes * 60 - pomoSecondsLeft;
      const elapsedMin = Math.floor(elapsedSec / 60);
      if (elapsedMin >= 1) {
        await handleLogPomoSession(elapsedMin, `🍅 Partial Pomodoro (${elapsedMin}m)`);
      }
    }
    handlePomoReset();
  };

  const handleSavePomoSettings = (newSettings) => {
    setPomoSettings(newSettings);
    try {
      localStorage.setItem("study_pomo_settings", JSON.stringify(newSettings));
    } catch {}
    if (!pomoRunning && !pomoPaused) {
      if (pomoPhase === "focus") {
        setPomoSecondsLeft(newSettings.focusMinutes * 60);
      } else if (pomoPhase === "short_break") {
        setPomoSecondsLeft(newSettings.shortBreakMinutes * 60);
      } else {
        setPomoSecondsLeft(newSettings.longBreakMinutes * 60);
      }
    }
  };

  const handleDeleteSession = useCallback(
    async (sessionToDelete) => {
      let removed = false;
      const targetNorm = normalizeSession(sessionToDelete);
      const next = sessions.filter((s) => {
        if (removed) return true;
        const sNorm = normalizeSession(s);
        const match =
          (sessionToDelete.id && s.id && s.id === sessionToDelete.id) ||
          (s.date === sessionToDelete.date &&
            s.subject === sessionToDelete.subject &&
            s.minutes === sessionToDelete.minutes &&
            Math.abs((sNorm.startedAt || 0) - (targetNorm.startedAt || 0)) < 2000 &&
            Math.abs((sNorm.endedAt || 0) - (targetNorm.endedAt || 0)) < 2000) ||
          (s.date === sessionToDelete.date &&
            s.subject === sessionToDelete.subject &&
            s.minutes === sessionToDelete.minutes &&
            (!s.startedAt || !sessionToDelete.startedAt));
        if (match) {
          removed = true;
          return false;
        }
        return true;
      });
      setSessions(next);
      await persistSessions(next);
      if (user) await syncDayLogs(user.id, next);

      // Re-publish leaderboard with updated sessions
      if (displayNameResolved && user) {
        const todayKeyVal = todayKey();
        const freshMinutesByDate = {};
        for (const s of next) freshMinutesByDate[s.date] = (freshMinutesByDate[s.date] || 0) + s.minutes;
        const wStart = startOfWeekKey(todayKeyVal);
        let freshWeek = 0;
        for (const [dk, m] of Object.entries(freshMinutesByDate)) {
          if (dk >= wStart) freshWeek += m;
        }
        let freshStreak = 0;
        {
          let cKey = todayKeyVal;
          if (!freshMinutesByDate[cKey]) cKey = addDaysToDateKey(cKey, -1);
          while (freshMinutesByDate[cKey]) {
            freshStreak += 1;
            cKey = addDaysToDateKey(cKey, -1);
          }
        }
        publishLeaderboard(
          displayNameResolved,
          {
            todayMinutes: freshMinutesByDate[todayKeyVal] || 0,
            weekMinutes: freshWeek,
            streak: freshStreak,
            totalMinutes: next.reduce((a, s) => a + s.minutes, 0),
            todaySessions: next.filter((s) => s.date === todayKeyVal).sort((a, b) => (b.ts || 0) - (a.ts || 0)),
            weekDaily: buildWeekDaily(next, 0, todayKeyVal),
            sessions: next,
          },
          true
        );
      }
    },
    [sessions, persistSessions, user, syncDayLogs, displayNameResolved, publishLeaderboard]
  );

  const handleSaveManualLog = useCallback(
    async (entry) => {
      // Ensure subject is in subjects list
      if (entry.subject && !subjects.includes(entry.subject)) {
        const nextSubs = [...subjects, entry.subject];
        setSubjects(nextSubs);
        await savePartial({ subjects: nextSubs });
      }

      let next;
      if (editingSession) {
        let replaced = false;
        const targetNorm = normalizeSession(editingSession);
        next = sessions.map((s) => {
          if (replaced) return s;
          const sNorm = normalizeSession(s);
          const match =
            (editingSession.id && s.id && s.id === editingSession.id) ||
            (s.date === editingSession.date &&
              s.subject === editingSession.subject &&
              s.minutes === editingSession.minutes &&
              Math.abs((sNorm.startedAt || 0) - (targetNorm.startedAt || 0)) < 2000 &&
              Math.abs((sNorm.endedAt || 0) - (targetNorm.endedAt || 0)) < 2000) ||
            (s.date === editingSession.date &&
              s.subject === editingSession.subject &&
              s.minutes === editingSession.minutes &&
              (!s.startedAt || !editingSession.startedAt));
          if (match) {
            replaced = true;
            return { ...entry, id: editingSession.id || s.id || undefined };
          }
          return s;
        });
        if (!replaced) {
          next.push(entry);
        }
        setEditingSession(null);
      } else {
        next = [...sessions, entry];
      }

      setSessions(next);
      await persistSessions(next);
      if (user) await syncDayLogs(user.id, next);

      if (!(entry.date in targetHistory)) {
        await persistTargetHistory({ ...targetHistory, [entry.date]: targetHours * 60 });
      }

      if (displayNameResolved && user) {
        const todayKeyVal = todayKey();
        const freshMinutesByDate = {};
        for (const s of next) freshMinutesByDate[s.date] = (freshMinutesByDate[s.date] || 0) + s.minutes;
        const wStart = startOfWeekKey(todayKeyVal);
        let freshWeek = 0;
        for (const [dk, m] of Object.entries(freshMinutesByDate)) {
          if (dk >= wStart) freshWeek += m;
        }
        let freshStreak = 0;
        {
          let cKey = todayKeyVal;
          if (!freshMinutesByDate[cKey]) cKey = addDaysToDateKey(cKey, -1);
          while (freshMinutesByDate[cKey]) {
            freshStreak += 1;
            cKey = addDaysToDateKey(cKey, -1);
          }
        }
        const freshTodaySessions = next.filter((s) => s.date === todayKeyVal).sort((a, b) => (b.ts || 0) - (a.ts || 0));
        publishLeaderboard(
          displayNameResolved,
          {
            todayMinutes: freshMinutesByDate[todayKeyVal] || 0,
            weekMinutes: freshWeek,
            streak: freshStreak,
            totalMinutes: next.reduce((a, s) => a + s.minutes, 0),
            todaySessions: freshTodaySessions,
            weekDaily: buildWeekDaily(next, 0, todayKeyVal),
            sessions: next,
          },
          true
        );
      }
    },
    [sessions, persistSessions, user, syncDayLogs, targetHistory, persistTargetHistory, targetHours, displayNameResolved, publishLeaderboard, subjects, savePartial, editingSession]
  );

  const handleStartEditSession = useCallback((session) => {
    setEditingSession(session);
    setShowManualModal(true);
  }, []);

  useEffect(() => {
    if (loaded && displayNameResolved && user) {
      publishLeaderboard(displayNameResolved, {
        todayMinutes,
        weekMinutes,
        streak,
        totalMinutes: totalMinutesAll,
        sessions,
        todaySessions: todaySessionsWithActive,
        weekDaily,
      });
    }
  }, [loaded, user, displayNameResolved, todayMinutes, weekMinutes, streak, totalMinutesAll, sessions, todaySessionsWithActive, weekDaily, publishLeaderboard]);

  useEffect(() => {
    if (!loaded || !user) return;
    loadLeaderboard();
    const iv = setInterval(loadLeaderboard, 6000);
    return () => clearInterval(iv);
  }, [loaded, user, loadLeaderboard]);

  useEffect(() => {
    if (!loaded || !user || !displayNameResolved || (!running && !paused)) return;
    const iv = setInterval(() => {
      publishLeaderboard(displayNameResolved, {
        todayMinutes,
        weekMinutes,
        streak,
        totalMinutes: totalMinutesAll,
        sessions,
        todaySessions: todaySessionsWithActive,
        weekDaily,
      }, true);
    }, 2500);
    return () => clearInterval(iv);
  }, [loaded, user, displayNameResolved, running, paused, todayMinutes, weekMinutes, streak, totalMinutesAll, sessions, todaySessionsWithActive, weekDaily, publishLeaderboard]);

  const subjectRows = subjects
    .map((s) => ({ name: s, minutes: minutesBySubject[s] || 0 }))
    .sort((a, b) => b.minutes - a.minutes);
  const maxSubjectMinutes = Math.max(1, ...subjectRows.map((r) => r.minutes));

  const dashboardRows = useMemo(() => {
    if (!user) return [];
    const curTodayKey = todayKeyVal;
    const curWeekStartKey = weekStartKey;

    let rows = buddyStats.map((e) => {
      const isYou = e.uid === user.id;
      if (isYou) {
        return {
          ...e,
          todayMinutes,
          weekMinutes,
          name: displayNameResolved,
          todaySessions: todaySessionsWithActive,
          weekDaily,
          isYou: true,
          isStudyingNow: running && !paused,
          isPausedNow: paused,
          activeSubject: (running || paused) ? subject : "",
          activeElapsed: elapsed,
          targetHours,
        };
      }

      // For buddy: filter today's sessions strictly by todayKeyVal (in IST)
      const rawSessions = Array.isArray(e.todaySessions) ? e.todaySessions : [];
      const validTodaySessions = rawSessions.filter((s) => {
        if (s.isLive) {
          // Check if heartbeat is recent (within last 3 minutes)
          const isRecent = s.ts ? (Date.now() - s.ts < 180000) : true;
          return isRecent;
        }
        const sessionDate = s.date || (s.startedAt || s.ts ? fmtDate(s.startedAt || s.ts) : null);
        return sessionDate === curTodayKey;
      });

      // Check if buddy is currently studying live
      const activeLiveSession = validTodaySessions.find((s) => s.isLive);
      const isStudyingNow = !!(activeLiveSession && activeLiveSession.isRunning);
      const isPausedNow = !!(activeLiveSession && activeLiveSession.isPaused);
      const activeSubject = activeLiveSession?.subject || "";
      const activeElapsed = activeLiveSession?.elapsedSeconds || (activeLiveSession?.minutes ? activeLiveSession.minutes * 60 : 0);

      // Check if the buddy's updated_at is actually from today (in IST)
      const updatedDateKey = e.updatedAt ? fmtDate(new Date(e.updatedAt)) : null;
      const isUpdatedToday = updatedDateKey === curTodayKey;

      let buddyTodayMinutes = 0;
      if (validTodaySessions.length > 0) {
        buddyTodayMinutes = validTodaySessions.reduce((sum, s) => sum + (s.minutes || 0), 0);
      } else if (isUpdatedToday && e.todayMinutes) {
        buddyTodayMinutes = e.todayMinutes;
      } else {
        buddyTodayMinutes = 0; // Stale data from previous days!
      }

      // Check week minutes
      let buddyWeekMinutes = e.weekMinutes || 0;
      if (updatedDateKey && updatedDateKey < curWeekStartKey) {
        buddyWeekMinutes = buddyTodayMinutes;
      }

      return {
        ...e,
        todayMinutes: buddyTodayMinutes,
        weekMinutes: buddyWeekMinutes,
        name: e.name || "Study Buddy",
        todaySessions: validTodaySessions,
        weekDaily: e.weekDaily || [],
        isYou: false,
        isStudyingNow,
        isPausedNow,
        activeSubject,
        activeElapsed,
        targetHours: e.targetHours || 4,
      };
    });

    if (!rows.some((r) => r.uid === user.id)) {
      rows = [{
        uid: user.id,
        name: displayNameResolved,
        todayMinutes,
        weekMinutes,
        streak,
        todaySessions: todaySessionsWithActive,
        weekDaily,
        isYou: true,
        isStudyingNow: running && !paused,
        isPausedNow: paused,
        activeSubject: (running || paused) ? subject : "",
        activeElapsed: elapsed,
        targetHours,
      }, ...rows];
    }

    return rows.sort((a, b) => (b.todayMinutes || 0) - (a.todayMinutes || 0));
  }, [user, buddyStats, todayMinutes, weekMinutes, displayNameResolved, streak, todaySessionsWithActive, weekDaily, todayKeyVal, weekStartKey, running, paused, subject, elapsed, targetHours]);

  if (!authReady || !loaded) {
    return <div className="loading-screen">Loading…</div>;
  }

  const timerStatusClass = running ? "running" : paused ? "paused" : "ready";
  const timerStatusText = running ? "● Studying now" : paused ? "⏸ Paused" : "Ready to study";

  return (
    <div className="app-shell">
      {saveError && <div className="alert">Could not save — check your connection.</div>}

      <header className="page-header">
        <div>
          <p className="greeting">Hey {displayNameResolved.split(" ")[0] || "there"} 👋</p>
          <h1 className="page-title">
            {activeTab === "timer" && "Study Timer"}
            {activeTab === "buddies" && "Leaderboard"}
            {activeTab === "progress" && "Your Progress"}
            {activeTab === "mock-tests" && "Mock Tests"}
          </h1>
        </div>
        <div className="avatar">{initials(displayNameResolved)}</div>
      </header>

      {!user && (
        <div className="glass-card" style={{ textAlign: "center" }}>
          {supabaseConfigured ? (
            <button className="btn btn-primary btn-block" onClick={handleGoogleSignIn}>Sign in with Google</button>
          ) : (
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Add Supabase keys in .env</p>
          )}
          {authMsg && <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 10 }}>{authMsg}</p>}
        </div>
      )}

      {user && activeTab === "timer" && (
        <>
          <div className="stat-grid">
            <div
              className="stat-pill blue"
              title={`${exactAvgHours} hrs/day exact average across ${activeDaysCount} active study day${activeDaysCount === 1 ? "" : "s"}`}
            >
              <div className="stat-pill-label">Avg Studied</div>
              <div className="stat-pill-value">{fmtMinutes(avgDailyMinutes)}</div>
              <div className="stat-pill-sub">Today {fmtMinutes(todayMinutes)}</div>
            </div>
            <div className="stat-pill purple">
              <div className="stat-pill-label">This week</div>
              <div className="stat-pill-value">{fmtMinutes(weekMinutes)}</div>
              <div className="stat-pill-sub">{sessions.length} sessions</div>
            </div>
            <div className="stat-pill green">
              <div className="stat-pill-label">Streak</div>
              <div className="stat-pill-value">{streak}d</div>
              <div className="stat-pill-sub">Keep it going</div>
            </div>
            <div className="stat-pill yellow">
              <div className="stat-pill-label">Daily target</div>
              <div className="stat-pill-value">{targetHours}h</div>
              <div className="stat-pill-sub">{targetPct}% done</div>
            </div>
          </div>

          <div className="glass-card">
            {/* CONTINUOUS ALARM BANNER */}
            {alarmActive && (
              <div className="alarm-active-banner">
                <div className="alarm-bell-icon">
                  <BellRing size={20} className="alarm-shake-anim" />
                </div>
                <div className="alarm-text-group">
                  <div className="alarm-heading">Time is up!</div>
                  <div className="alarm-subtext">{alarmMessage}</div>
                </div>
                <button
                  type="button"
                  className="btn btn-stop-alarm"
                  onClick={handleStopAlarm}
                  title="Click to stop alarm sound"
                >
                  <BellOff size={16} />
                  <span>Stop Alarm</span>
                </button>
              </div>
            )}

            {/* TIMER MODE SWITCHER */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
              <div className="timer-mode-switcher" style={{ margin: 0 }}>
                <button
                  type="button"
                  className={`timer-mode-btn ${timerMode === "stopwatch" ? "active" : ""}`}
                  onClick={() => setTimerMode("stopwatch")}
                >
                  ⏱️ Stopwatch
                </button>
                <button
                  type="button"
                  className={`timer-mode-btn ${timerMode === "pomodoro" ? "active" : ""}`}
                  onClick={() => setTimerMode("pomodoro")}
                >
                  🍅 Pomodoro
                </button>
              </div>

              {timerMode === "pomodoro" && (
                <button
                  type="button"
                  className="pomo-settings-gear-btn"
                  onClick={() => setShowPomoSettings(true)}
                  title="Customize focus & break durations"
                >
                  <Settings size={14} />
                  <span>Configure ({pomoSettings.focusMinutes}m / {pomoSettings.shortBreakMinutes}m)</span>
                </button>
              )}
            </div>

            <div className="field-label">Subject</div>
            {subjects.length === 0 && !running && !paused && !pomoRunning && !pomoPaused ? (
              <>
                <p className="section-sub" style={{ marginBottom: 12 }}>Add your own subject names — e.g. Physics, Maths, Chemistry.</p>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    className="input"
                    value={newSubject}
                    onChange={(e) => setNewSubject(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddSubject()}
                    placeholder="Enter subject name"
                  />
                  <button className="btn btn-primary" onClick={handleAddSubject}><Plus size={16} /></button>
                </div>
              </>
            ) : (
              <>
                <select className="select" value={subject} disabled={running || paused || pomoRunning || pomoPaused} onChange={(e) => setSubject(e.target.value)}>
                  {!subject && <option value="">Select subject</option>}
                  {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                {!running && !paused && !pomoRunning && !pomoPaused && (
                  <div className="chip-row">
                    {subjects.map((s) => (
                      <button key={s} className={`chip${subject === s ? " active" : ""}`} onClick={() => setSubject(s)}>{s}</button>
                    ))}
                    <button className="chip" onClick={() => setShowAddSubject((v) => !v)}>+ Add</button>
                  </div>
                )}
                {showAddSubject && !running && !paused && !pomoRunning && !pomoPaused && (
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <input className="input" value={newSubject} onChange={(e) => setNewSubject(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAddSubject()} placeholder="New subject" />
                    <button className="btn btn-primary" onClick={handleAddSubject}><Check size={16} /></button>
                  </div>
                )}
              </>
            )}

            {/* 1. STOPWATCH MODE */}
            {timerMode === "stopwatch" && (
              <>
                <div className="timer-display" style={{ marginTop: 24 }}>{fmtHMS(elapsed)}</div>
                <div className={`timer-status ${timerStatusClass}`}>{timerStatusText}</div>
                <div className="btn-row">
                  {!running && !paused && (
                    <>
                      <button className="btn btn-primary" onClick={handleStart} disabled={!subject.trim()}>
                        <Play size={18} /> Start Timer
                      </button>
                      <button className="btn btn-secondary" onClick={() => { setEditingSession(null); setShowManualModal(true); }} title="Log study done offline in college/library">
                        <BookOpen size={16} /> + Offline / College Log
                      </button>
                    </>
                  )}
                  {running && <button className="btn btn-warning" onClick={handlePause}><Pause size={18} /> Pause</button>}
                  {paused && <button className="btn btn-primary" onClick={handleResume}><Play size={18} /> Resume</button>}
                  {(running || paused) && <button className="btn btn-danger" onClick={handleStop}><Square size={18} /> Stop &amp; Log</button>}
                </div>
              </>
            )}

            {/* 2. POMODORO MODE */}
            {timerMode === "pomodoro" && (() => {
              const totalPhaseSec = pomoPhase === "focus"
                ? pomoSettings.focusMinutes * 60
                : pomoPhase === "short_break"
                  ? pomoSettings.shortBreakMinutes * 60
                  : pomoSettings.longBreakMinutes * 60;
              const pomoPct = Math.max(0, Math.min(100, Math.round(((totalPhaseSec - pomoSecondsLeft) / totalPhaseSec) * 100)));
              const pomoStatusClass = pomoRunning ? "running" : pomoPaused ? "paused" : "ready";
              const pomoStatusText = pomoRunning
                ? (pomoPhase === "focus" ? `● Focusing on ${subject || "study"}` : "☕ Resting & recharging")
                : pomoPaused
                  ? (pomoPhase === "focus" ? "⏸ Focus paused" : "⏸ Break paused")
                  : (pomoPhase === "focus" ? `Ready to focus (${pomoSettings.focusMinutes} min)` : "Ready for break");

              return (
                <div style={{ marginTop: 18 }}>
                  {/* Phase Banner */}
                  <div className="pomo-phase-banner">
                    <span className={`pomo-phase-badge ${pomoPhase}`}>
                      {pomoPhase === "focus" && `🎯 Focus (${pomoSettings.focusMinutes}m)`}
                      {pomoPhase === "short_break" && `☕ Short Break (${pomoSettings.shortBreakMinutes}m)`}
                      {pomoPhase === "long_break" && `🌴 Long Break (${pomoSettings.longBreakMinutes}m)`}
                    </span>

                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)" }}>
                      Cycle {pomoCycle + 1} of {pomoSettings.longBreakInterval}
                    </span>
                  </div>

                  {/* Rounds Tracker */}
                  <div className="pomo-rounds-wrap">
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontWeight: 600 }}>Rounds:</span>
                      <div className="pomo-dots-row">
                        {Array.from({ length: pomoSettings.longBreakInterval }).map((_, idx) => (
                          <div
                            key={idx}
                            className={`pomo-dot ${idx < pomoCycle ? "filled" : idx === pomoCycle && pomoPhase === "focus" && (pomoRunning || pomoPaused) ? "active" : ""}`}
                            title={`Round ${idx + 1}`}
                          />
                        ))}
                      </div>
                    </div>
                    {pomoTotalCompleted > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: "#ef4444" }}>
                        🍅 {pomoTotalCompleted} completed today
                      </span>
                    )}
                  </div>

                  {/* Progress Bar */}
                  <div className="pomo-progress-track">
                    <div
                      className={`pomo-progress-fill ${pomoPhase}`}
                      style={{ width: `${pomoPct}%` }}
                    />
                  </div>

                  {/* Timer Display */}
                  <div className="timer-display" style={{ marginTop: 8 }}>{fmtMS(pomoSecondsLeft)}</div>
                  <div className={`timer-status ${pomoStatusClass}`}>{pomoStatusText}</div>

                  {/* Pomodoro Action Buttons */}
                  <div className="btn-row">
                    {!pomoRunning && !pomoPaused && (
                      <>
                        <button
                          className="btn btn-primary"
                          onClick={handlePomoStart}
                          disabled={pomoPhase === "focus" && !subject.trim()}
                        >
                          <Play size={18} /> {pomoPhase === "focus" ? "Start Focus" : "Start Break"}
                        </button>
                        {pomoPhase !== "focus" && (
                          <button
                            className="btn btn-secondary"
                            onClick={handlePomoSkipBreak}
                            title="Skip break and go straight to focus"
                          >
                            <FastForward size={16} /> Skip Break
                          </button>
                        )}
                        <button
                          className="btn btn-secondary"
                          onClick={() => { setEditingSession(null); setShowManualModal(true); }}
                          title="Log study done offline in college/library"
                        >
                          <BookOpen size={16} /> + Offline Log
                        </button>
                      </>
                    )}

                    {pomoRunning && (
                      <>
                        <button className="btn btn-warning" onClick={handlePomoPause}>
                          <Pause size={18} /> Pause
                        </button>
                        {pomoPhase === "focus" && (
                          <button
                            className="btn btn-danger"
                            onClick={handlePomoStopEarly}
                            title="Log completed minutes and reset round"
                          >
                            <Square size={18} /> Stop &amp; Log Early
                          </button>
                        )}
                        {pomoPhase !== "focus" && (
                          <button className="btn btn-secondary" onClick={handlePomoSkipBreak}>
                            <FastForward size={16} /> Skip Break
                          </button>
                        )}
                      </>
                    )}

                    {pomoPaused && (
                      <>
                        <button className="btn btn-primary" onClick={handlePomoResume}>
                          <Play size={18} /> Resume
                        </button>
                        <button
                          className="btn btn-ghost"
                          onClick={handlePomoReset}
                          title="Reset countdown for this round"
                        >
                          <RotateCcw size={16} /> Reset
                        </button>
                        {pomoPhase === "focus" && (
                          <button className="btn btn-danger" onClick={handlePomoStopEarly}>
                            <Square size={18} /> Stop &amp; Log Early
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
          <div className="glass-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
              <div>
                <h2 className="section-title" style={{ margin: 0 }}>Today&apos;s study blocks</h2>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button className="btn btn-secondary btn-sm" onClick={() => { setEditingSession(null); setShowManualModal(true); }}>
                  <Plus size={14} /> Log Offline
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowTodayLogs((v) => !v)}>
                  {showTodayLogs ? "Hide" : "Show"}
                </button>
              </div>
            </div>
            {showTodayLogs && (
              <>
                {todaySessions.length === 0 ? (
                  <p style={{ color: "var(--text-muted)", fontSize: 14 }}>No sessions logged today yet.</p>
                ) : (
                  todaySessions.map((s, i) => (
                    <div key={`${s.startedAt}-${s.endedAt}-${i}`} className="session-block">
                      <div className="session-block-info">
                        <div className="session-block-subject-row">
                          <span className="session-block-subject">{s.subject}</span>
                          {s.note && <span className="session-note-pill">{s.note}</span>}
                        </div>
                        <div className="session-block-time">{formatSessionBlock(s)}</div>
                      </div>
                      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        <button
                          className="btn btn-ghost session-action-btn"
                          onClick={() => handleStartEditSession({ ...s, date: todayKeyVal })}
                          title="Edit this session"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          className="btn btn-ghost session-delete-btn"
                          onClick={() => {
                            if (window.confirm("Delete this study session? This cannot be undone.")) {
                              handleDeleteSession({ ...s, date: todayKeyVal });
                            }
                          }}
                          title="Delete this session"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </>
            )}
          </div>
          <div className="glass-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h2 className="section-title" style={{ margin: 0 }}>Today&apos;s tasks</h2>
              <button className="btn btn-ghost" onClick={() => setShowChecklist((v) => !v)}>{showChecklist ? "Hide" : "Show"}</button>
            </div>
            {showChecklist && (
              <>
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  <input className="input" value={newChecklistItem} onChange={(e) => setNewChecklistItem(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAddChecklistItem()} placeholder="Add a task" />
                  <button className="btn btn-secondary" onClick={handleAddChecklistItem}><Plus size={16} /></button>
                </div>
                {checklist.length === 0 && <p style={{ color: "var(--text-muted)", fontSize: 14 }}>No tasks yet</p>}
                {checklist.map((item) => (
                  <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <button onClick={() => handleToggleChecklistItem(item.id)} style={{ width: 24, height: 24, borderRadius: 8, border: "2px solid #ddd6fe", background: item.done ? "var(--primary)" : "#fff", cursor: "pointer", display: "grid", placeItems: "center" }}>
                      {item.done && <Check size={14} color="#fff" />}
                    </button>
                    <span style={{ flex: 1, textDecoration: item.done ? "line-through" : "none", color: item.done ? "var(--text-muted)" : "var(--text)" }}>{item.text}</span>
                    <button className="btn btn-ghost" onClick={() => handleRemoveChecklistItem(item.id)}><X size={14} /></button>
                  </div>
                ))}
              </>
            )}
          </div>
          <button className="btn btn-ghost btn-block" onClick={signOut} style={{ color: "rgba(255,255,255,0.9)" }}>Sign out</button>
        </>
      )}

      {user && activeTab === "buddies" && (
        <StudyDashboard
          user={user}
          rows={dashboardRows}
          loading={leaderboardLoading}
          onRefresh={loadLeaderboard}
          buddyCode={buddyCode}
          buddyInput={buddyInput}
          setBuddyInput={setBuddyInput}
          onAddBuddy={handleAddBuddy}
          buddyMsg={buddyMsg}
          displayName={displayNameResolved}
          editingName={editingName}
          nameInput={nameInput}
          setNameInput={setNameInput}
          onSaveName={handleSaveName}
          onEditName={() => setEditingName(true)}
        />
      )}

      {user && activeTab === "progress" && (
        <StudyProgress
          user={user}
          displayName={displayNameResolved}
          sessions={sessions}
          subjects={subjects}
          targetHours={targetHours}
          targetHistory={targetHistory}
          editingTarget={editingTarget}
          targetInput={targetInput}
          setTargetInput={setTargetInput}
          setEditingTarget={setEditingTarget}
          handleSaveTarget={handleSaveTarget}
          dashboardRows={dashboardRows}
          fetchDayLogs={fetchDayLogs}
          liveExtraMinutes={liveExtraMinutes}
          liveSubject={(running || paused) ? subject : ""}
          todayKey={todayKeyVal}
          onDeleteSession={handleDeleteSession}
          onEditSession={handleStartEditSession}
        />
      )}

      {user && activeTab === "mock-tests" && (
        <MockTests user={user} />
      )}

      {user && activeTab === "chat" && (
        <StudyChat
          user={user}
          userName={displayNameResolved}
          buddies={dashboardRows}
        />
      )}

      {user && (
        <nav className="bottom-nav">
          <button className={`nav-item${activeTab === "timer" ? " active" : ""}`} onClick={() => setActiveTab("timer")}>
            <Timer size={18} />
            <span>Timer</span>
          </button>
          <button className={`nav-item${activeTab === "buddies" ? " active" : ""}`} onClick={() => setActiveTab("buddies")}>
            <Users size={18} />
            <span>Buddies</span>
          </button>
          <button className={`nav-item${activeTab === "chat" ? " active" : ""}`} onClick={() => setActiveTab("chat")}>
            <MessageSquare size={18} />
            <span>Chat</span>
          </button>
          <button className={`nav-item${activeTab === "progress" ? " active" : ""}`} onClick={() => setActiveTab("progress")}>
            <BarChart3 size={18} />
            <span>Progress</span>
          </button>
          <button className={`nav-item${activeTab === "mock-tests" ? " active" : ""}`} onClick={() => setActiveTab("mock-tests")}>
            <BookOpen size={18} />
            <span>Mock Tests</span>
          </button>
        </nav>
      )}

      <ManualLogModal
        isOpen={showManualModal}
        onClose={() => {
          setShowManualModal(false);
          setEditingSession(null);
        }}
        onSave={handleSaveManualLog}
        existingSubjects={subjects}
        editSession={editingSession}
      />

      <PomodoroSettingsModal
        isOpen={showPomoSettings}
        onClose={() => setShowPomoSettings(false)}
        settings={pomoSettings}
        onSaveSettings={handleSavePomoSettings}
      />
    </div>
  );
}
