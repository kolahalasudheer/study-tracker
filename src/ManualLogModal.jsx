import React, { useState, useMemo, useEffect } from "react";
import { X, Clock, Calendar, BookOpen, Tag, Check, Sparkles, Plus, Zap } from "lucide-react";
import {
  todayKey,
  fmtDate,
  parseDateKey,
  makeISTTimestamp,
  currentISTTimeStr,
  addMinutesToTime,
  subtractMinutesFromTime,
  formatTimeRangeIST,
  getISTParts,
} from "./dateUtils";
import { fmtMinutesLong } from "./statsUtils";

const TAG_PRESETS = [
  { id: "college", label: "🏛️ College Lecture", note: "College Lecture" },
  { id: "library", label: "📚 Library Study", note: "Library Study" },
  { id: "lab", label: "🔬 Lab / Practical", note: "Lab / Practical" },
  { id: "self", label: "✍️ Offline Self Study", note: "Offline Self Study" },
  { id: "exam", label: "📝 Exam / Test", note: "Exam / Test" },
];

const DURATION_PRESETS = [
  { label: "30m", minutes: 30 },
  { label: "1h", minutes: 60 },
  { label: "1h 30m", minutes: 90 },
  { label: "2h", minutes: 120 },
  { label: "2h 30m", minutes: 150 },
  { label: "3h", minutes: 180 },
  { label: "4h", minutes: 240 },
  { label: "5h", minutes: 300 },
  { label: "6h", minutes: 360 },
];

export default function ManualLogModal({
  isOpen,
  onClose,
  onSave,
  existingSubjects = [],
  editSession = null,
}) {
  const isEditing = !!editSession;
  const [date, setDate] = useState(() => todayKey());
  const [subject, setSubject] = useState(() => existingSubjects[0] || "");
  const [newSubjectInput, setNewSubjectInput] = useState("");
  const [isAddingSubject, setIsAddingSubject] = useState(false);

  const [mode, setMode] = useState("duration"); // "duration" | "timerange"
  const [hours, setHours] = useState(2);
  const [minutes, setMinutes] = useState(0);

  // Duration mode timing controls
  const [timingOption, setTimingOption] = useState("ending_now"); // "ending_now" | "start_time" | "duration_only"
  const [durationStartTime, setDurationStartTime] = useState("10:00");

  const [startTime, setStartTime] = useState("09:30");
  const [endTime, setEndTime] = useState("12:30");

  const [selectedTag, setSelectedTag] = useState("College Lecture");
  const [customNote, setCustomNote] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Pre-fill fields when editing an existing session
  useEffect(() => {
    if (!isOpen) return;
    if (editSession) {
      setDate(editSession.date || todayKey());
      setSubject(editSession.subject || existingSubjects[0] || "");
      setError("");
      setCustomNote(editSession.note || "");

      // Check if it matches a known tag preset
      const matchedTag = TAG_PRESETS.find((t) => t.note === editSession.note);
      if (matchedTag) {
        setSelectedTag(matchedTag.note);
        setCustomNote("");
      } else {
        setSelectedTag("");
        setCustomNote(editSession.note || "");
      }

      // Check if it's pure duration
      if (editSession.isDurationOnly || (!editSession.startedAt && !editSession.endedAt)) {
        setMode("duration");
        setTimingOption("duration_only");
        setHours(Math.floor((editSession.minutes || 0) / 60));
        setMinutes((editSession.minutes || 0) % 60);
      } else if (editSession.startedAt && editSession.endedAt) {
        setMode("timerange");
        const toTimeStr = (ts) => {
          const { hour, minute } = getISTParts(ts);
          return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
        };
        const sTime = toTimeStr(editSession.startedAt);
        const eTime = toTimeStr(editSession.endedAt);
        setStartTime(sTime);
        setEndTime(eTime);
        setDurationStartTime(sTime);
        setTimingOption("start_time");
        setHours(Math.floor((editSession.minutes || 0) / 60));
        setMinutes((editSession.minutes || 0) % 60);
      } else {
        setMode("duration");
        setTimingOption(editSession.date === todayKey() ? "ending_now" : "start_time");
        setHours(Math.floor((editSession.minutes || 0) / 60));
        setMinutes((editSession.minutes || 0) % 60);
        setStartTime("09:30");
        setEndTime("12:30");
      }
    } else {
      // Reset to defaults for new log
      setDate(todayKey());
      setSubject(existingSubjects[0] || "");
      setMode("duration");
      setTimingOption("ending_now");
      setDurationStartTime("10:00");
      setHours(2);
      setMinutes(0);
      setStartTime("09:30");
      setEndTime("12:30");
      setSelectedTag("College Lecture");
      setCustomNote("");
      setError("");
    }
  }, [isOpen, editSession]);

  // Calculate total minutes based on mode
  const calculatedMinutes = useMemo(() => {
    if (mode === "duration") {
      return Math.max(0, (parseInt(hours, 10) || 0) * 60 + (parseInt(minutes, 10) || 0));
    }
    // Time range mode
    if (!startTime || !endTime) return 0;
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    let startMin = sh * 60 + sm;
    let endMin = eh * 60 + em;
    if (endMin < startMin) {
      endMin += 24 * 60; // Crosses midnight
    }
    return Math.max(0, endMin - startMin);
  }, [mode, hours, minutes, startTime, endTime]);

  if (!isOpen) return null;

  const handleApplyPreset = (minVal) => {
    setHours(Math.floor(minVal / 60));
    setMinutes(minVal % 60);
    setError("");
  };

  const handleAddCustomSubject = () => {
    const trimmed = newSubjectInput.trim();
    if (!trimmed) return;
    setSubject(trimmed);
    setIsAddingSubject(false);
    setNewSubjectInput("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const targetSubject = subject.trim();
    if (!targetSubject) {
      setError("Please select or enter a subject.");
      return;
    }

    if (calculatedMinutes <= 0) {
      setError("Please enter a valid study duration greater than 0.");
      return;
    }

    setIsSaving(true);
    try {
      // Calculate timestamps in IST on the selected date
      let startTs = null;
      let endTs = null;
      let isDurationOnly = false;

      if (mode === "timerange") {
        if (!startTime || !endTime) {
          setError("Please select both start and end time.");
          setIsSaving(false);
          return;
        }
        startTs = makeISTTimestamp(date, startTime);
        let endMs = makeISTTimestamp(date, endTime);
        if (endMs < startTs) {
          endMs += 24 * 60 * 60 * 1000; // crosses midnight
        }
        endTs = endMs;
      } else {
        // Duration mode
        if (timingOption === "duration_only") {
          isDurationOnly = true;
          startTs = null;
          endTs = makeISTTimestamp(date, "12:00");
        } else if (timingOption === "ending_now" && date === todayKey()) {
          const nowStr = currentISTTimeStr();
          const sStr = subtractMinutesFromTime(nowStr, calculatedMinutes);
          startTs = makeISTTimestamp(date, sStr);
          endTs = makeISTTimestamp(date, nowStr);
        } else {
          // custom start time or past date
          const actualStart = durationStartTime || "10:00";
          startTs = makeISTTimestamp(date, actualStart);
          endTs = startTs + calculatedMinutes * 60 * 1000;
        }
      }

      const noteText = customNote.trim() || selectedTag || "College Study";

      await onSave({
        date,
        subject: targetSubject,
        minutes: calculatedMinutes,
        startedAt: startTs,
        endedAt: endTs,
        ts: endTs || Date.now(),
        note: noteText,
        source: "offline",
        isDurationOnly,
        ...(editSession?.id ? { id: editSession.id } : {}),
      });

      onClose();
    } catch (err) {
      setError(err?.message || "Failed to save offline study log.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card manual-log-card" onClick={(e) => e.stopPropagation()}>
        {/* HEADER */}
        <div className="modal-header">
          <div className="modal-title-group">
            <div className="modal-icon-badge">
              <BookOpen size={18} color={isEditing ? "#f59e0b" : "#6366f1"} />
            </div>
            <div>
              <h2 className="modal-title">{isEditing ? "Edit Study Session" : "Log Offline / College Study"}</h2>
            </div>
          </div>
          <button type="button" className="btn-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          {/* 1. DATE PICKER */}
          <div className="form-group">
            <label className="form-label">
              <Calendar size={14} />
              <span>Date of Study</span>
            </label>
            <input
              type="date"
              className="input date-input"
              value={date}
              max={todayKey()}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>

          {/* 2. SUBJECT PICKER */}
          <div className="form-group">
            <div className="form-label-row">
              <label className="form-label">
                <BookOpen size={14} />
                <span>Subject</span>
              </label>
              {!isAddingSubject && (
                <button
                  type="button"
                  className="btn-text-action"
                  onClick={() => setIsAddingSubject(true)}
                >
                  <Plus size={12} /> Add New
                </button>
              )}
            </div>

            {isAddingSubject ? (
              <div className="input-with-action">
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Theory of Computation, Physics"
                  value={newSubjectInput}
                  onChange={(e) => setNewSubjectInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddCustomSubject())}
                  autoFocus
                />
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleAddCustomSubject}
                >
                  <Check size={14} />
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setIsAddingSubject(false)}
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <select
                className="select"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
              >
                {!subject && <option value="">Select subject</option>}
                {existingSubjects.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* 3. INPUT MODE TOGGLE */}
          <div className="form-group">
            <div className="mode-toggle-strip">
              <button
                type="button"
                className={`mode-toggle-btn ${mode === "duration" ? "active" : ""}`}
                onClick={() => setMode("duration")}
              >
                <Clock size={14} />
                <span>By Duration</span>
              </button>
              <button
                type="button"
                className={`mode-toggle-btn ${mode === "timerange" ? "active" : ""}`}
                onClick={() => setMode("timerange")}
              >
                <Calendar size={14} />
                <span>By Time Range</span>
              </button>
            </div>
          </div>

          {/* 4A. DURATION INPUT */}
          {mode === "duration" ? (
            <div className="form-group">
              <div className="duration-inputs-row">
                <div className="duration-field">
                  <input
                    type="number"
                    min="0"
                    max="24"
                    className="input duration-num"
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                  />
                  <span className="unit-label">Hours</span>
                </div>
                <div className="duration-field">
                  <input
                    type="number"
                    min="0"
                    max="59"
                    step="5"
                    className="input duration-num"
                    value={minutes}
                    onChange={(e) => setMinutes(e.target.value)}
                  />
                  <span className="unit-label">Minutes</span>
                </div>
              </div>

              {/* QUICK DURATION CHIPS */}
              <div className="quick-chips-row">
                {DURATION_PRESETS.map((p) => (
                  <button
                    key={p.minutes}
                    type="button"
                    className={`chip ${calculatedMinutes === p.minutes ? "active" : ""}`}
                    onClick={() => handleApplyPreset(p.minutes)}
                  >
                    +{p.label}
                  </button>
                ))}
              </div>

              {/* TIMING SELECTION IN DURATION MODE */}
              <div className="duration-timing-card">
                <div className="field-label" style={{ marginBottom: 6, fontSize: 12 }}>Time of Day:</div>
                <div className="timing-options-row">
                  {date === todayKey() && (
                    <button
                      type="button"
                      className={`timing-opt-btn ${timingOption === "ending_now" ? "active" : ""}`}
                      onClick={() => setTimingOption("ending_now")}
                    >
                      ⚡ Ended Just Now
                    </button>
                  )}
                  <button
                    type="button"
                    className={`timing-opt-btn ${timingOption === "start_time" ? "active" : ""}`}
                    onClick={() => setTimingOption("start_time")}
                  >
                    ⏰ Set Start Time
                  </button>
                  <button
                    type="button"
                    className={`timing-opt-btn ${timingOption === "duration_only" ? "active" : ""}`}
                    onClick={() => setTimingOption("duration_only")}
                  >
                    📋 Duration Only
                  </button>
                </div>

                {timingOption === "start_time" && (
                  <div className="timing-custom-start-row" style={{ marginTop: 10 }}>
                    <span className="sub-label">Study Started At (IST):</span>
                    <input
                      type="time"
                      className="input"
                      value={durationStartTime}
                      onChange={(e) => setDurationStartTime(e.target.value)}
                    />
                  </div>
                )}
              </div>

              {/* LIVE PREVIEW BOX */}
              <div className="block-preview-box">
                <div className="block-preview-icon">
                  <Clock size={15} color="#4f46e5" />
                </div>
                <div className="block-preview-content">
                  <span className="block-preview-label">Calculated Study Block</span>
                  <span className="block-preview-val">
                    {timingOption === "duration_only"
                      ? `${fmtMinutesLong(calculatedMinutes)} (Duration only — no clock time)`
                      : timingOption === "ending_now" && date === todayKey()
                        ? `${formatTimeRangeIST(
                            makeISTTimestamp(date, subtractMinutesFromTime(currentISTTimeStr(), calculatedMinutes)),
                            makeISTTimestamp(date, currentISTTimeStr())
                          )} · ${fmtMinutesLong(calculatedMinutes)} (Ending now)`
                        : `${formatTimeRangeIST(
                            makeISTTimestamp(date, durationStartTime || "10:00"),
                            makeISTTimestamp(date, durationStartTime || "10:00") + calculatedMinutes * 60 * 1000
                          )} · ${fmtMinutesLong(calculatedMinutes)}`}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            /* 4B. TIME RANGE INPUT */
            <div className="form-group">
              <div className="timerange-inputs-row">
                <div className="timerange-field">
                  <span className="sub-label">From</span>
                  <input
                    type="time"
                    className="input"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    required
                  />
                </div>
                <span className="timerange-arrow">→</span>
                <div className="timerange-field">
                  <span className="sub-label">To</span>
                  <input
                    type="time"
                    className="input"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* LIVE PREVIEW BOX FOR TIMERANGE */}
              <div className="block-preview-box">
                <div className="block-preview-icon">
                  <Clock size={15} color="#4f46e5" />
                </div>
                <div className="block-preview-content">
                  <span className="block-preview-label">Calculated Study Block</span>
                  <span className="block-preview-val">
                    {startTime && endTime
                      ? `${formatTimeRangeIST(
                          makeISTTimestamp(date, startTime),
                          makeISTTimestamp(date, endTime)
                        )} · ${fmtMinutesLong(calculatedMinutes)}`
                      : `${fmtMinutesLong(calculatedMinutes)}`}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* 5. ACTIVITY / LOCATION TAG */}
          <div className="form-group">
            <label className="form-label">
              <Tag size={14} />
              <span>Location / Tag (Optional)</span>
            </label>
            <div className="tag-chips-wrap">
              {TAG_PRESETS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`tag-chip ${selectedTag === t.note ? "selected" : ""}`}
                  onClick={() => {
                    setSelectedTag(t.note);
                    setCustomNote("");
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <input
              type="text"
              className="input note-input"
              placeholder="Or type custom note (e.g. Room 402, CS Lab)"
              value={customNote}
              onChange={(e) => {
                setCustomNote(e.target.value);
                if (e.target.value) setSelectedTag("");
              }}
            />
          </div>

          {/* ERROR ALERT */}
          {error && <div className="form-error-alert">{error}</div>}

          {/* MODAL ACTIONS */}
          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-save-log"
              disabled={isSaving || calculatedMinutes <= 0}
            >
              {isSaving
                ? "Saving..."
                : isEditing
                  ? `Update to ${Math.floor(calculatedMinutes / 60)}h ${calculatedMinutes % 60}m`
                  : `Log ${Math.floor(calculatedMinutes / 60)}h ${calculatedMinutes % 60}m Study`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
