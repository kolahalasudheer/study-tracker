import React, { useState, useEffect } from "react";
import { X, Sliders, Volume2, VolumeX, Sparkles, Check, RotateCcw, Play, Square } from "lucide-react";
import { startContinuousAlarm, stopContinuousAlarm } from "./soundUtils";

export const DEFAULT_POMO_SETTINGS = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakInterval: 4,
  soundEnabled: true,
  autoStartBreaks: false,
  autoStartPomodoros: false,
};

const FOCUS_PRESETS = [20, 25, 30, 45, 50, 60];
const SHORT_BREAK_PRESETS = [3, 5, 10];
const LONG_BREAK_PRESETS = [15, 20, 25, 30];

export default function PomodoroSettingsModal({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
}) {
  const [form, setForm] = useState(() => ({
    ...DEFAULT_POMO_SETTINGS,
    ...(settings || {}),
  }));
  const [isPlayingTest, setIsPlayingTest] = useState(false);

  useEffect(() => {
    return () => {
      stopContinuousAlarm();
    };
  }, []);

  const handleClose = () => {
    stopContinuousAlarm();
    setIsPlayingTest(false);
    onClose();
  };

  const toggleTestAlarm = () => {
    if (isPlayingTest) {
      stopContinuousAlarm();
      setIsPlayingTest(false);
    } else {
      startContinuousAlarm("focus_complete");
      setIsPlayingTest(true);
    }
  };

  if (!isOpen) return null;

  const handlePresetFocus = (m) => setForm((prev) => ({ ...prev, focusMinutes: m }));
  const handlePresetShort = (m) => setForm((prev) => ({ ...prev, shortBreakMinutes: m }));
  const handlePresetLong = (m) => setForm((prev) => ({ ...prev, longBreakMinutes: m }));

  const handleResetDefaults = () => {
    setForm(DEFAULT_POMO_SETTINGS);
  };

  const handleSave = (e) => {
    e.preventDefault();
    const cleanFocus = Math.max(1, Math.min(180, parseInt(form.focusMinutes, 10) || 25));
    const cleanShort = Math.max(1, Math.min(60, parseInt(form.shortBreakMinutes, 10) || 5));
    const cleanLong = Math.max(1, Math.min(90, parseInt(form.longBreakMinutes, 10) || 15));
    const cleanInterval = Math.max(1, Math.min(12, parseInt(form.longBreakInterval, 10) || 4));

    onSaveSettings({
      ...form,
      focusMinutes: cleanFocus,
      shortBreakMinutes: cleanShort,
      longBreakMinutes: cleanLong,
      longBreakInterval: cleanInterval,
    });
    handleClose();
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-card pomo-settings-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title-group">
            <div className="modal-icon-badge" style={{ background: "#fee2e2" }}>
              <span style={{ fontSize: 18 }}>🍅</span>
            </div>
            <div>
              <h2 className="modal-title">Pomodoro Settings</h2>
            </div>
          </div>
          <button type="button" className="btn-close" onClick={handleClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSave} className="modal-form">
          {/* 1. FOCUS DURATION */}
          <div className="form-group">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <label className="form-label" style={{ margin: 0 }}>
                🎯 Focus Duration
              </label>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#ef4444" }}>
                {form.focusMinutes} mins
              </span>
            </div>
            <div className="quick-chips-row" style={{ marginBottom: 8 }}>
              {FOCUS_PRESETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`chip ${form.focusMinutes === m ? "active" : ""}`}
                  onClick={() => handlePresetFocus(m)}
                >
                  {m}m
                </button>
              ))}
            </div>
            <input
              type="number"
              min="1"
              max="180"
              className="input"
              value={form.focusMinutes}
              onChange={(e) => setForm({ ...form, focusMinutes: e.target.value })}
              placeholder="Custom minutes"
            />
          </div>

          {/* 2. SHORT BREAK */}
          <div className="form-group">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <label className="form-label" style={{ margin: 0 }}>
                ☕ Short Break
              </label>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#06b6d4" }}>
                {form.shortBreakMinutes} mins
              </span>
            </div>
            <div className="quick-chips-row" style={{ marginBottom: 8 }}>
              {SHORT_BREAK_PRESETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`chip ${form.shortBreakMinutes === m ? "active" : ""}`}
                  onClick={() => handlePresetShort(m)}
                >
                  {m}m
                </button>
              ))}
            </div>
            <input
              type="number"
              min="1"
              max="60"
              className="input"
              value={form.shortBreakMinutes}
              onChange={(e) => setForm({ ...form, shortBreakMinutes: e.target.value })}
              placeholder="Custom minutes"
            />
          </div>

          {/* 3. LONG BREAK */}
          <div className="form-group">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <label className="form-label" style={{ margin: 0 }}>
                🌴 Long Break
              </label>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#10b981" }}>
                {form.longBreakMinutes} mins
              </span>
            </div>
            <div className="quick-chips-row" style={{ marginBottom: 8 }}>
              {LONG_BREAK_PRESETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`chip ${form.longBreakMinutes === m ? "active" : ""}`}
                  onClick={() => handlePresetLong(m)}
                >
                  {m}m
                </button>
              ))}
            </div>
            <input
              type="number"
              min="1"
              max="90"
              className="input"
              value={form.longBreakMinutes}
              onChange={(e) => setForm({ ...form, longBreakMinutes: e.target.value })}
              placeholder="Custom minutes"
            />
          </div>

          {/* 4. LONG BREAK INTERVAL */}
          <div className="form-group">
            <label className="form-label">
              🔄 Long Break Interval (every X Pomodoros)
            </label>
            <div className="quick-chips-row">
              {[2, 3, 4, 5, 6].map((num) => (
                <button
                  key={num}
                  type="button"
                  className={`chip ${form.longBreakInterval === num ? "active" : ""}`}
                  onClick={() => setForm({ ...form, longBreakInterval: num })}
                >
                  Every {num}
                </button>
              ))}
            </div>
          </div>

          {/* 5. TOGGLES: SOUND & AUTO-START */}
          <div className="pomo-toggle-group">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "var(--surface)", borderRadius: 10, border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {form.soundEnabled ? <Volume2 size={18} color="#6366f1" /> : <VolumeX size={18} color="#94a3b8" />}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                    Continuous Alarm Sound
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    Plays a pleasant chime until you click Stop
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {form.soundEnabled && (
                  <button
                    type="button"
                    className={`btn btn-sm ${isPlayingTest ? "btn-danger" : "btn-secondary"}`}
                    onClick={toggleTestAlarm}
                    style={{ fontSize: 11, padding: "4px 9px", display: "inline-flex", alignItems: "center", gap: 5 }}
                    title={isPlayingTest ? "Click to stop alarm preview" : "Click to test pleasant alarm chime"}
                  >
                    {isPlayingTest ? (
                      <>
                        <Square size={12} /> Stop Test
                      </>
                    ) : (
                      <>
                        <Play size={12} /> Test Sound
                      </>
                    )}
                  </button>
                )}
                <input
                  type="checkbox"
                  className="pomo-switch"
                  checked={form.soundEnabled}
                  onChange={(e) => {
                    const nextVal = e.target.checked;
                    if (!nextVal && isPlayingTest) {
                      stopContinuousAlarm();
                      setIsPlayingTest(false);
                    }
                    setForm({ ...form, soundEnabled: nextVal });
                  }}
                />
              </div>
            </div>

            <label className="pomo-toggle-row">
              <span className="pomo-toggle-label">
                <span>Auto-start Breaks</span>
              </span>
              <input
                type="checkbox"
                className="pomo-switch"
                checked={form.autoStartBreaks}
                onChange={(e) => setForm({ ...form, autoStartBreaks: e.target.checked })}
              />
            </label>

            <label className="pomo-toggle-row">
              <span className="pomo-toggle-label">
                <span>Auto-start Pomodoros</span>
              </span>
              <input
                type="checkbox"
                className="pomo-switch"
                checked={form.autoStartPomodoros}
                onChange={(e) => setForm({ ...form, autoStartPomodoros: e.target.checked })}
              />
            </label>
          </div>

          {/* ACTIONS */}
          <div className="modal-actions" style={{ justifyContent: "space-between" }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleResetDefaults}
              title="Reset to classic 25/5/15 Pomodoro"
            >
              <RotateCcw size={14} /> Reset Defaults
            </button>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn btn-ghost" onClick={handleClose}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                Save Settings
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
