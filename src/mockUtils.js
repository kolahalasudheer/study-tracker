import { todayKey } from './dateUtils.js';

export const CATEGORIES = [
  ['full', 'Full mock'], ['subject', 'Subject-wise'], ['mixed', 'Mixed-subject'], ['pyq', 'PYQ'],
];
export const CAUSES = [
  { name: 'Concept gap', color: '#3b82f6' },
  { name: 'Silly mistake', color: '#f97316' },
  { name: 'Misread question', color: '#14b8a6' },
  { name: 'Time pressure', color: '#eab308' },
  { name: 'Wrong guess', color: '#ec4899' },
  { name: 'Forgot formula/fact', color: '#22c55e' },
];
export const numberOrNull = value => value === '' || value == null ? null : Number(value);
export const percent = (value, maximum) => value == null || maximum == null || Number(maximum) <= 0 ? null : Number(value) / Number(maximum) * 100;
export const scorePercent = row => percent(row.marks_obtained, row.total_marks);
export const accuracy = row => row.correct_count == null || row.wrong_count == null ? null : percent(row.correct_count, Number(row.correct_count) + Number(row.wrong_count));
export const timeUsed = row => percent(row.time_minutes, row.time_allowed_minutes);
export const formatNumber = value => value == null || !Number.isFinite(Number(value)) ? '—' : Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 });
export const formatPercent = value => value == null ? '—' : `${formatNumber(value)}%`;
export const newestFirst = (a, b) => b.test_date.localeCompare(a.test_date) || (b.created_at || '').localeCompare(a.created_at || '') || b.id.localeCompare(a.id);
export const blankMock = () => ({ name: '', test_date: todayKey(), category: 'full', subjects: '', marks_obtained: '', total_marks: '100', negative_marks: '', correct_count: '', wrong_count: '', unattempted_count: '', time_minutes: '', time_allowed_minutes: '', notes: '', subject_scores: [] });
export const blankError = (test_id = '') => ({ test_id, subject: '', topic: '', question_number: '', error_type: CAUSES[0].name, marks_lost: '', incorrect_approach: '', correct_approach: '', reason: '', revision_status: 'pending' });

export function validateMock(form) {
  const errors = {};
  if (!form.name.trim() || form.name.trim().length > 120) errors.name = 'Enter a name of 1–120 characters.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.test_date) || Number.isNaN(Date.parse(`${form.test_date}T12:00:00Z`)) || new Date(`${form.test_date}T12:00:00Z`).toISOString().slice(0, 10) !== form.test_date) errors.test_date = 'Enter a valid test date.';
  const max = numberOrNull(form.total_marks), score = numberOrNull(form.marks_obtained);
  if (max == null || !Number.isFinite(max) || max <= 0) errors.total_marks = 'Maximum marks must be greater than zero.';
  if (score == null || !Number.isFinite(score) || score > max) errors.marks_obtained = 'Enter a score no greater than maximum marks.';
  for (const key of ['negative_marks', 'correct_count', 'wrong_count', 'unattempted_count', 'time_minutes', 'time_allowed_minutes']) {
    const n = numberOrNull(form[key]);
    if (n != null && (!Number.isFinite(n) || n < 0 || (key.endsWith('_count') && !Number.isInteger(n)) || (key === 'time_allowed_minutes' && n === 0))) errors[key] = key.endsWith('_count') ? 'Enter a non-negative whole number or leave blank.' : 'Enter a valid duration/marks value or leave blank.';
  }
  if (!CATEGORIES.some(([id]) => id === form.category)) errors.category = 'Select a category.';
  const seen = new Set();
  (form.subject_scores || []).forEach((row, i) => {
    const subject = row.subject_name.trim().toLowerCase();
    if (!subject || subject.length > 120 || seen.has(subject)) errors[`subject_${i}`] = 'Use a unique subject name of 1–120 characters.';
    seen.add(subject);
    const total = numberOrNull(row.total_marks), marks = numberOrNull(row.marks_obtained);
    if (total == null || !Number.isFinite(total) || total <= 0 || marks == null || !Number.isFinite(marks) || marks > total) errors[`subject_${i}`] = 'Enter subject marks and a positive maximum; score cannot exceed maximum.';
  });
  return errors;
}

export function validateError(form) {
  const errors = {};
  if (!form.topic.trim() || form.topic.trim().length > 120) errors.topic = 'Enter a topic of 1–120 characters.';
  if (!CAUSES.some(c => c.name === form.error_type)) errors.error_type = 'Select an error cause.';
  const marks = numberOrNull(form.marks_lost), question = numberOrNull(form.question_number);
  if (marks != null && (!Number.isFinite(marks) || marks < 0)) errors.marks_lost = 'Marks lost must be non-negative.';
  if (question != null && (!Number.isInteger(question) || question < 1)) errors.question_number = 'Enter a positive whole question number.';
  return errors;
}

export function mockPayload(form, profileId) {
  const payload = { name: form.name.trim(), test_date: form.test_date, category: form.category, exam_profile_id: profileId || null, notes: form.notes.trim(), subjects: [...new Set(form.subjects.split(',').map(s => s.trim()).filter(Boolean))] };
  for (const key of ['marks_obtained', 'total_marks', 'negative_marks', 'correct_count', 'wrong_count', 'unattempted_count', 'time_minutes', 'time_allowed_minutes']) payload[key] = numberOrNull(form[key]);
  return payload;
}

export function analyseMocks(tests, errors, subjects) {
  const ordered = [...tests].sort(newestFirst);
  const chronological = [...ordered].reverse();
  const highestMarks = ordered.reduce((best, row) => !best || Number(row.marks_obtained) > Number(best.marks_obtained) ? row : best, null);
  const mean = rows => rows.length ? rows.reduce((sum, row) => sum + scorePercent(row), 0) / rows.length : null;
  const loggedLoss = errors.reduce((sum, row) => sum + (numberOrNull(row.marks_lost) || 0), 0);
  const topics = new Map();
  const causes = CAUSES.map(c => ({ ...c, value: 0 }));
  for (const error of errors) {
    if (error.marks_lost == null) continue;
    const key = JSON.stringify([(error.subject || '').trim().toLowerCase(), error.topic.trim().toLowerCase()]);
    const group = topics.get(key) || { key, label: [error.subject, error.topic].filter(Boolean).join(' / '), value: 0 };
    group.value += Number(error.marks_lost);
    topics.set(key, group);
    const cause = causes.find(c => c.name === error.error_type);
    if (cause) cause.value += Number(error.marks_lost);
  }
  const subjectMap = new Map();
  for (const row of subjects) {
    const key = row.subject_name.trim().toLowerCase();
    const group = subjectMap.get(key) || { key, label: row.subject_name, marks: 0, maximum: 0, count: 0 };
    group.marks += Number(row.marks_obtained); group.maximum += Number(row.total_marks); group.count++;
    subjectMap.set(key, group);
  }
  return {
    ordered, chronological, latest: ordered[0], highestMarks, recentCount: Math.min(3, ordered.length), recentAverage: mean(ordered.slice(0, 3)), average: mean(ordered), loggedLoss,
    topics: [...topics.values()].sort((a, b) => b.value - a.value),
    causes: causes.map(c => ({ ...c, label: c.name, share: percent(c.value, loggedLoss) })),
    subjects: [...subjectMap.values()].map(g => ({ ...g, value: percent(g.marks, g.maximum) })).sort((a, b) => a.value - b.value),
    perMock: chronological.map(test => ({ test, values: CAUSES.map(c => ({ ...c, value: errors.filter(e => e.test_id === test.id && e.error_type === c.name).reduce((sum, e) => sum + (numberOrNull(e.marks_lost) || 0), 0) })) })),
  };
}

export function errorsCsv(errors, tests) {
  const header = ['Topic', 'Subject', 'Mock', 'Test date', 'Question', 'Cause', 'Marks lost', 'What went wrong', 'Correct approach', 'Reason', 'Revision status', 'Created at', 'Revised at'];
  const escape = value => {
    let text = String(value ?? '');
    // Neutralize formula injection in spreadsheet applications, including leading whitespace.
    if (/^\s*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const rows = errors.map(e => {
    const test = tests.find(t => t.id === e.test_id);
    return [e.topic, e.subject, test?.name, test?.test_date, e.question_number, e.error_type, e.marks_lost, e.incorrect_approach, e.correct_approach, e.reason, e.revision_status, e.created_at, e.revised_at];
  });
  return '\uFEFF' + [header, ...rows].map(row => row.map(escape).join(',')).join('\r\n');
}
