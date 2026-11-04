import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import "./MockTests.css";

const CATEGORIES = [
  { value: "subject", label: "Subject-wise" },
  { value: "mixed", label: "Mixed-subject" },
  { value: "full", label: "Full-length mock" },
  { value: "pyq", label: "PYQ practice" },
];

const ERROR_TYPES = [
  "Conceptual mistake",
  "Calculation error",
  "Formula error",
  "Silly mistake",
  "Time management",
  "Guessing",
];

const EMPTY_TEST = {
  name: "",
  category: "subject",
  subjects: "",
  total_marks: "100",
  marks_obtained: "",
  correct_count: "0",
  wrong_count: "0",
  unattempted_count: "0",
  time_minutes: "0",
  test_date: new Date().toISOString().slice(0, 10),
};

const EMPTY_MISTAKE = {
  test_id: "",
  question_number: "",
  subject: "",
  topic: "",
  error_type: ERROR_TYPES[0],
  incorrect_approach: "",
  correct_approach: "",
  reason: "",
};

const scorePercent = (row) =>
  Number(row.total_marks) > 0
    ? (100 * Number(row.marks_obtained)) / Number(row.total_marks)
    : 0;

const formatPercent = (value) =>
  value === null || !Number.isFinite(value) ? "—" : `${value.toFixed(1)}%`;

export default function MockTests({ user }) {
  const [profiles, setProfiles] = useState([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [tests, setTests] = useState([]);
  const [errors, setErrors] = useState([]);
  const [profileName, setProfileName] = useState("");
  const [testForm, setTestForm] = useState(EMPTY_TEST);
  const [mistakeForm, setMistakeForm] = useState(EMPTY_MISTAKE);
  const [showTestForm, setShowTestForm] = useState(false);
  const [showMistakeForm, setShowMistakeForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const loadProfiles = useCallback(async () => {
    if (!supabase || !user?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("exam_profiles")
      .select("id, name, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (error) {
      setErrorMessage(error.message);
      setProfiles([]);
      setSelectedProfileId("");
    } else {
      const rows = data || [];
      setProfiles(rows);
      setSelectedProfileId((current) =>
        rows.some((profile) => profile.id === current)
          ? current
          : rows[0]?.id || ""
      );
    }
    setLoading(false);
  }, [user?.id]);

  const loadProfileData = useCallback(async () => {
    if (!supabase || !user?.id || !selectedProfileId) {
      setTests([]);
      setErrors([]);
      return;
    }

    setErrorMessage("");
    const { data: testRows, error: testError } = await supabase
      .from("mock_tests")
      .select("*")
      .eq("user_id", user.id)
      .eq("exam_profile_id", selectedProfileId)
      .order("test_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (testError) {
      setErrorMessage(testError.message);
      setTests([]);
      setErrors([]);
      return;
    }

    const rows = testRows || [];
    setTests(rows);

    if (rows.length === 0) {
      setErrors([]);
      setMistakeForm((current) => ({ ...current, test_id: "" }));
      return;
    }

    const ids = rows.map((row) => row.id);
    const { data: errorRows, error: errorsError } = await supabase
      .from("mock_test_errors")
      .select("*")
      .eq("user_id", user.id)
      .in("test_id", ids)
      .order("created_at", { ascending: false });

    if (errorsError) {
      setErrorMessage(errorsError.message);
      setErrors([]);
    } else {
      setErrors(errorRows || []);
    }

    setMistakeForm((current) => ({
      ...current,
      test_id: rows.some((row) => row.id === current.test_id)
        ? current.test_id
        : rows[0].id,
    }));
  }, [user?.id, selectedProfileId]);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  useEffect(() => {
    loadProfileData();
  }, [loadProfileData]);

  const analytics = useMemo(() => {
    const count = tests.length;
    const average =
      count > 0
        ? tests.reduce((sum, row) => sum + scorePercent(row), 0) / count
        : null;
    const highest =
      count > 0 ? Math.max(...tests.map(scorePercent)) : null;
    const lowest =
      count > 0 ? Math.min(...tests.map(scorePercent)) : null;

    const correct = tests.reduce(
      (sum, row) => sum + Number(row.correct_count || 0),
      0
    );
    const wrong = tests.reduce(
      (sum, row) => sum + Number(row.wrong_count || 0),
      0
    );
    const attempted = correct + wrong;
    const questionsSolved = tests.reduce(
      (sum, row) =>
        sum +
        Number(row.correct_count || 0) +
        Number(row.wrong_count || 0) +
        Number(row.unattempted_count || 0),
      0
    );

    const categoryStats = CATEGORIES.map((category) => {
      const categoryTests = tests.filter(
        (row) => row.category === category.value
      );
      return {
        ...category,
        count: categoryTests.length,
        average:
          categoryTests.length > 0
            ? categoryTests.reduce((sum, row) => sum + scorePercent(row), 0) /
              categoryTests.length
            : null,
      };
    });

    const conceptMap = new Map();
    for (const entry of errors) {
      const normalized = (entry.topic || "Unspecified").trim().toLowerCase();
      const current = conceptMap.get(normalized) || {
        topic: entry.topic || "Unspecified",
        count: 0,
        errorTypes: {},
        pending: 0,
      };
      current.count += 1;
      current.errorTypes[entry.error_type] =
        (current.errorTypes[entry.error_type] || 0) + 1;
      if ((entry.revision_status || "pending") === "pending") {
        current.pending += 1;
      }
      conceptMap.set(normalized, current);
    }

    const concepts = [...conceptMap.values()].sort(
      (a, b) => b.count - a.count
    );

    const errorTypeStats = Object.entries(
      errors.reduce((map, entry) => {
        map[entry.error_type] = (map[entry.error_type] || 0) + 1;
        return map;
      }, {})
    ).sort((a, b) => b[1] - a[1]);

    return {
      count,
      average,
      highest,
      lowest,
      correct,
      wrong,
      attempted,
      questionsSolved,
      accuracy: attempted > 0 ? (100 * correct) / attempted : null,
      categoryStats,
      concepts,
      errorTypeStats,
    };
  }, [tests, errors]);

  const updateTestField = (field, value) => {
    setTestForm((current) => ({ ...current, [field]: value }));
  };

  const updateMistakeField = (field, value) => {
    setMistakeForm((current) => ({ ...current, [field]: value }));
  };

  const createProfile = async (event) => {
    event.preventDefault();
    if (!profileName.trim() || !supabase) return;

    setSaving(true);
    setErrorMessage("");
    setMessage("");

    const { data, error } = await supabase
      .from("exam_profiles")
      .insert({ user_id: user.id, name: profileName.trim() })
      .select("id, name, created_at")
      .single();

    setSaving(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setProfiles((current) => [...current, data]);
    setSelectedProfileId(data.id);
    setProfileName("");
    setMessage("Exam profile created successfully.");
  };

  const saveTest = async (event) => {
    event.preventDefault();
    if (!supabase || !selectedProfileId) return;

    const total = Number(testForm.total_marks);
    const score = Number(testForm.marks_obtained);
    const correct = Number(testForm.correct_count || 0);
    const wrong = Number(testForm.wrong_count || 0);
    const unattempted = Number(testForm.unattempted_count || 0);
    const minutes = Number(testForm.time_minutes || 0);

    if (
      !testForm.name.trim() ||
      !Number.isFinite(total) ||
      total <= 0 ||
      !Number.isFinite(score) ||
      score < 0 ||
      score > total
    ) {
      setErrorMessage("Enter a test name and a valid score within the total marks.");
      return;
    }

    if (
      [correct, wrong, unattempted, minutes].some(
        (value) => !Number.isInteger(value) || value < 0
      )
    ) {
      setErrorMessage("Question counts and time must be non-negative whole numbers.");
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setMessage("");

    const payload = {
      user_id: user.id,
      exam_profile_id: selectedProfileId,
      name: testForm.name.trim(),
      category: testForm.category,
      subjects: testForm.subjects
        .split(",")
        .map((subject) => subject.trim())
        .filter(Boolean),
      total_marks: total,
      marks_obtained: score,
      correct_count: correct,
      wrong_count: wrong,
      unattempted_count: unattempted,
      time_minutes: minutes,
      test_date: testForm.test_date,
    };

    const { data, error } = await supabase
      .from("mock_tests")
      .insert(payload)
      .select("*")
      .single();

    setSaving(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setTests((current) => [data, ...current]);
    setTestForm(EMPTY_TEST);
    setShowTestForm(false);
    setMistakeForm((current) => ({ ...current, test_id: data.id }));
    setMessage("Test saved successfully.");
  };

  const saveMistake = async (event) => {
    event.preventDefault();
    if (!supabase || !mistakeForm.test_id || !mistakeForm.topic.trim()) {
      setErrorMessage("Select a test and enter the topic or concept.");
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setMessage("");

    const payload = {
      user_id: user.id,
      test_id: mistakeForm.test_id,
      question_number: mistakeForm.question_number
        ? Number(mistakeForm.question_number)
        : null,
      subject: mistakeForm.subject.trim(),
      topic: mistakeForm.topic.trim(),
      error_type: mistakeForm.error_type,
      incorrect_approach: mistakeForm.incorrect_approach.trim(),
      correct_approach: mistakeForm.correct_approach.trim(),
      reason: mistakeForm.reason.trim(),
    };

    const { data, error } = await supabase
      .from("mock_test_errors")
      .insert(payload)
      .select("*")
      .single();

    setSaving(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setErrors((current) => [data, ...current]);
    setMistakeForm((current) => ({
      ...current,
      question_number: "",
      subject: "",
      topic: "",
      incorrect_approach: "",
      correct_approach: "",
      reason: "",
    }));
    setShowMistakeForm(false);
    setMessage("Mistake added to the weak-concept tracker.");
  };

  const updateRevisionStatus = async (errorId, status) => {
    if (!supabase) return;
    setErrorMessage("");
    const { error } = await supabase
      .from("mock_test_errors")
      .update({ revision_status: status })
      .eq("id", errorId)
      .eq("user_id", user.id);

    if (error) {
      setErrorMessage(error.message);
      return;
    }
    setErrors((current) =>
      current.map((entry) =>
        entry.id === errorId ? { ...entry, revision_status: status } : entry
      )
    );
  };

  if (!user?.id) {
    return <div className="mocktests-card">Please sign in to use Mock Tests.</div>;
  }

  if (!supabase) {
    return (
      <div className="mocktests-card">
        <h2>Mock Tests database unavailable</h2>
        <p>Configure the Supabase URL and anon key before using this module.</p>
      </div>
    );
  }

  return (
    <main className="mocktests-page">
      <header className="mocktests-heading">
        <div>
          <p className="mocktests-eyebrow">PERFORMANCE WORKSPACE</p>
          <h2>Mock Tests</h2>
          <p>Track tests, compare categories and learn from every mistake.</p>
        </div>
        <button
          className="mocktests-refresh"
          type="button"
          onClick={() => {
            loadProfiles();
            loadProfileData();
          }}
          disabled={loading}
        >
          Refresh
        </button>
      </header>

      {errorMessage && (
        <div className="mocktests-alert" role="alert">
          {errorMessage}
        </div>
      )}
      {message && <div className="mocktests-success">{message}</div>}

      <section className="mocktests-profilebar mocktests-card">
        <label className="mocktests-field">
          <span>Exam profile</span>
          <select
            value={selectedProfileId}
            onChange={(event) => setSelectedProfileId(event.target.value)}
          >
            {profiles.length === 0 && <option value="">No profiles yet</option>}
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
        </label>
        <form className="mocktests-newprofile" onSubmit={createProfile}>
          <label className="mocktests-field">
            <span>Create another profile</span>
            <input
              value={profileName}
              onChange={(event) => setProfileName(event.target.value)}
              placeholder="e.g. GATE CS 2027"
              maxLength={80}
            />
          </label>
          <button className="mocktests-button mocktests-button-primary" disabled={saving || !profileName.trim()}>
            Create
          </button>
        </form>
      </section>

      {loading ? (
        <div className="mocktests-card mocktests-empty">Loading your exam data…</div>
      ) : !selectedProfileId ? (
        <section className="mocktests-card mocktests-empty">
          <h3>Create your first exam profile</h3>
          <p>
            Profiles keep different exams and years separate. For example:
            GATE CS 2027 or JEE Main 2027.
          </p>
        </section>
      ) : (
        <>
          <div className="mocktests-actions">
            <button
              className="mocktests-button mocktests-button-primary"
              type="button"
              onClick={() => setShowTestForm((value) => !value)}
            >
              + Add test
            </button>
            <button
              className="mocktests-button mocktests-button-secondary"
              type="button"
              onClick={() => setShowMistakeForm((value) => !value)}
              disabled={tests.length === 0}
            >
              + Log mistake
            </button>
          </div>

          {showTestForm && (
            <form className="mocktests-card mocktests-form" onSubmit={saveTest}>
              <h3>Record a test</h3>
              <label className="mocktests-field">
                <span>Test name</span>
                <input
                  required
                  value={testForm.name}
                  onChange={(event) => updateTestField("name", event.target.value)}
                  placeholder="e.g. Operating Systems Test 01"
                  maxLength={120}
                />
              </label>
              <div className="mocktests-grid">
                <label className="mocktests-field">
                  <span>Category</span>
                  <select value={testForm.category} onChange={(event) => updateTestField("category", event.target.value)}>
                    {CATEGORIES.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
                  </select>
                </label>
                <label className="mocktests-field">
                  <span>Date</span>
                  <input type="date" value={testForm.test_date} onChange={(event) => updateTestField("test_date", event.target.value)} required />
                </label>
                <label className="mocktests-field">
                  <span>Total marks</span>
                  <input type="number" min="0.01" step="any" value={testForm.total_marks} onChange={(event) => updateTestField("total_marks", event.target.value)} required />
                </label>
                <label className="mocktests-field">
                  <span>Marks obtained</span>
                  <input type="number" min="0" step="any" value={testForm.marks_obtained} onChange={(event) => updateTestField("marks_obtained", event.target.value)} required />
                </label>
                <label className="mocktests-field">
                  <span>Correct questions</span>
                  <input type="number" min="0" step="1" value={testForm.correct_count} onChange={(event) => updateTestField("correct_count", event.target.value)} />
                </label>
                <label className="mocktests-field">
                  <span>Wrong questions</span>
                  <input type="number" min="0" step="1" value={testForm.wrong_count} onChange={(event) => updateTestField("wrong_count", event.target.value)} />
                </label>
                <label className="mocktests-field">
                  <span>Unattempted questions</span>
                  <input type="number" min="0" step="1" value={testForm.unattempted_count} onChange={(event) => updateTestField("unattempted_count", event.target.value)} />
                </label>
                <label className="mocktests-field">
                  <span>Time taken (minutes)</span>
                  <input type="number" min="0" step="1" value={testForm.time_minutes} onChange={(event) => updateTestField("time_minutes", event.target.value)} />
                </label>
              </div>
              <label className="mocktests-field">
                <span>Subjects (comma-separated)</span>
                <input value={testForm.subjects} onChange={(event) => updateTestField("subjects", event.target.value)} placeholder="Operating Systems, DBMS" />
              </label>
              <div className="mocktests-actions">
                <button className="mocktests-button mocktests-button-primary" disabled={saving}>{saving ? "Saving…" : "Save test"}</button>
                <button className="mocktests-button mocktests-button-quiet" type="button" onClick={() => setShowTestForm(false)}>Cancel</button>
              </div>
            </form>
          )}

          {showMistakeForm && (
            <form className="mocktests-card mocktests-form" onSubmit={saveMistake}>
              <h3>Log a mistake</h3>
              <label className="mocktests-field">
                <span>Related test</span>
                <select value={mistakeForm.test_id} onChange={(event) => updateMistakeField("test_id", event.target.value)} required>
                  {tests.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
                </select>
              </label>
              <div className="mocktests-grid">
                <label className="mocktests-field">
                  <span>Question number</span>
                  <input type="number" min="1" step="1" value={mistakeForm.question_number} onChange={(event) => updateMistakeField("question_number", event.target.value)} />
                </label>
                <label className="mocktests-field">
                  <span>Subject</span>
                  <input value={mistakeForm.subject} onChange={(event) => updateMistakeField("subject", event.target.value)} />
                </label>
                <label className="mocktests-field">
                  <span>Topic / concept</span>
                  <input required value={mistakeForm.topic} onChange={(event) => updateMistakeField("topic", event.target.value)} placeholder="e.g. Cache Mapping" />
                </label>
                <label className="mocktests-field">
                  <span>Error type</span>
                  <select value={mistakeForm.error_type} onChange={(event) => updateMistakeField("error_type", event.target.value)}>
                    {ERROR_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                </label>
              </div>
              <label className="mocktests-field">
                <span>Incorrect approach</span>
                <textarea rows="2" value={mistakeForm.incorrect_approach} onChange={(event) => updateMistakeField("incorrect_approach", event.target.value)} />
              </label>
              <label className="mocktests-field">
                <span>Correct approach</span>
                <textarea rows="2" value={mistakeForm.correct_approach} onChange={(event) => updateMistakeField("correct_approach", event.target.value)} />
              </label>
              <label className="mocktests-field">
                <span>Why did this happen?</span>
                <textarea rows="2" value={mistakeForm.reason} onChange={(event) => updateMistakeField("reason", event.target.value)} />
              </label>
              <div className="mocktests-actions">
                <button className="mocktests-button mocktests-button-primary" disabled={saving || tests.length === 0}>{saving ? "Saving…" : "Save mistake"}</button>
                <button className="mocktests-button mocktests-button-quiet" type="button" onClick={() => setShowMistakeForm(false)}>Cancel</button>
              </div>
            </form>
          )}

          <section className="mocktests-section">
            <div className="mocktests-section-title">
              <div>
                <h3>Combined performance</h3>
                <p>Each test contributes equally by its percentage score.</p>
              </div>
              <span className="mocktests-count">{analytics.count} tests</span>
            </div>
            <div className="mocktests-statgrid">
              <article className="mocktests-stat">
                <span>Average score</span>
                <strong>{formatPercent(analytics.average)}</strong>
                <small>Mean of test percentages</small>
              </article>
              <article className="mocktests-stat">
                <span>Highest score</span>
                <strong>{formatPercent(analytics.highest)}</strong>
                <small>{analytics.count ? "Best test" : "No tests yet"}</small>
              </article>
              <article className="mocktests-stat">
                <span>Question accuracy</span>
                <strong>{formatPercent(analytics.accuracy)}</strong>
                <small>{analytics.correct} correct / {analytics.attempted} attempted</small>
              </article>
              <article className="mocktests-stat">
                <span>Questions recorded</span>
                <strong>{analytics.questionsSolved}</strong>
                <small>{analytics.wrong} wrong · {analytics.correct} correct</small>
              </article>
            </div>
          </section>

          <section className="mocktests-card mocktests-panel">
            <h3>Category comparison</h3>
            <p className="mocktests-muted">Averages are calculated separately for each category.</p>
            {analytics.categoryStats.map((category) => (
              <div className="mocktests-category" key={category.value}>
                <div className="mocktests-category-top">
                  <strong>{category.label}</strong>
                  <span>{formatPercent(category.average)} · {category.count} tests</span>
                </div>
                <div className="mocktests-progress"><span style={{ width: `${Math.max(0, Math.min(100, category.average || 0))}%` }} /></div>
              </div>
            ))}
          </section>

          <section className="mocktests-card mocktests-panel">
            <h3>Weak concept tracker</h3>
            <p className="mocktests-muted">Repeated topics from mistake logs across all test categories.</p>
            {analytics.concepts.length === 0 ? (
              <p className="mocktests-muted">No mistakes logged yet. Add a mistake after recording a test.</p>
            ) : (
              analytics.concepts.map((concept) => (
                <div className="mocktests-concept" key={concept.topic.toLowerCase()}>
                  <div className="mocktests-concept-main">
                    <strong>{concept.topic}</strong>
                    <small>{concept.count} logged · {concept.pending} pending revision</small>
                  </div>
                  <span className={`mocktests-risk ${concept.count >= 3 ? "high" : concept.count === 2 ? "medium" : "low"}`}>
                    {concept.count >= 3 ? "Frequent" : concept.count === 2 ? "Repeated" : "New"}
                  </span>
                </div>
              ))
            )}
          </section>

          <section className="mocktests-card mocktests-panel">
            <h3>Error type breakdown</h3>
            {analytics.errorTypeStats.length === 0 ? (
              <p className="mocktests-muted">No error data yet.</p>
            ) : (
              analytics.errorTypeStats.map(([type, count]) => (
                <div className="mocktests-error-type" key={type}>
                  <span>{type}</span><strong>{count}</strong>
                </div>
              ))
            )}
          </section>

          <section className="mocktests-card mocktests-panel">
            <h3>Test history</h3>
            {tests.length === 0 ? (
              <p className="mocktests-muted">No tests recorded for this profile yet.</p>
            ) : (
              <div className="mocktests-history">
                {tests.map((row) => (
                  <article className="mocktests-history-row" key={row.id}>
                    <div className="mocktests-history-info">
                      <strong>{row.name}</strong>
                      <small>
                        {CATEGORIES.find((category) => category.value === row.category)?.label || row.category}
                        {" · "}{row.test_date}
                      </small>
                      <small>{(row.subjects || []).join(", ") || "No subjects tagged"}</small>
                    </div>
                    <strong className="mocktests-history-score">{formatPercent(scorePercent(row))}</strong>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="mocktests-card mocktests-panel">
            <h3>Revision log</h3>
            {errors.length === 0 ? (
              <p className="mocktests-muted">Your logged mistakes and revision status will appear here.</p>
            ) : (
              errors.map((entry) => (
                <article className="mocktests-revision-row" key={entry.id}>
                  <div>
                    <strong>{entry.topic}</strong>
                    <small>{entry.subject || "Subject not tagged"} · {entry.error_type}</small>
                    <small>{tests.find((row) => row.id === entry.test_id)?.name || "Test"}</small>
                  </div>
                  <select
                    aria-label={`Revision status for ${entry.topic}`}
                    value={entry.revision_status || "pending"}
                    onChange={(event) => updateRevisionStatus(entry.id, event.target.value)}
                  >
                    <option value="pending">Pending</option>
                    <option value="revised">Revised</option>
                    <option value="mastered">Mastered</option>
                  </select>
                </article>
              ))
            )}
          </section>
        </>
      )}
    </main>
  );
}
