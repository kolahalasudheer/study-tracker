import test from 'node:test';
import assert from 'node:assert/strict';
import { accuracy, analyseMocks, blankMock, errorsCsv, mockPayload, numberOrNull, scorePercent, timeUsed, validateError, validateMock } from '../src/mockUtils.js';
import { fmtDate } from '../src/dateUtils.js';

const mock = (id, date, score, max = 100) => ({ id, test_date: date, created_at: `${date}T12:00:00Z`, marks_obtained: score, total_marks: max });
test('minimal mock saves with nullable optional data and accepts negative final scores', () => {
  const form = { ...blankMock(), name: 'Test', marks_obtained: '-2.5' };
  assert.deepEqual(validateMock(form), {});
  const payload = mockPayload(form, '');
  assert.equal(payload.exam_profile_id, null);
  for (const key of ['negative_marks', 'correct_count', 'wrong_count', 'unattempted_count', 'time_minutes', 'time_allowed_minutes']) assert.equal(payload[key], null);
  assert.equal(numberOrNull('0'), 0);
  assert.equal(accuracy(payload), null);
  assert.equal(timeUsed(payload), null);
});
test('scores, dates, duplicate subject names and counts are validated', () => {
  const form = { ...blankMock(), name: 'Mock', marks_obtained: '101', wrong_count: '1.5', test_date: '2026-02-30', time_allowed_minutes: '0', subject_scores: [{ subject_name: 'OS', marks_obtained: '3', total_marks: '2' }] };
  const errors = validateMock(form);
  for (const key of ['marks_obtained', 'wrong_count', 'test_date', 'time_allowed_minutes', 'subject_0']) assert.ok(errors[key]);
  const duplicate = validateMock({ ...blankMock(), name: 'M', marks_obtained: '5', subject_scores: [{ subject_name: 'OS', marks_obtained: '1', total_marks: '2' }, { subject_name: ' os ', marks_obtained: '1', total_marks: '2' }] });
  assert.ok(duplicate.subject_1);
});
test('accuracy excludes unattempted, time can exceed 100%, missing metrics stay missing', () => {
  assert.equal(accuracy({ correct_count: 8, wrong_count: 2, unattempted_count: 90 }), 80);
  assert.equal(accuracy({ correct_count: 8 }), null);
  assert.equal(accuracy({ correct_count: 0, wrong_count: 0 }), null);
  assert.equal(timeUsed({ time_minutes: 150, time_allowed_minutes: 120 }), 125);
  assert.equal(timeUsed({ time_minutes: 30 }), null);
  assert.equal(scorePercent({ marks_obtained: 10, total_marks: 20 }), 50);
});
test('averages weight individual percentages equally and order dates and ties consistently', () => {
  const tests = [mock('a', '2026-11-01', 5, 10), mock('b', '2026-11-04', 80), mock('c', '2026-11-04', 90), mock('d', '2026-10-31', 20)];
  const result = analyseMocks(tests, [], []);
  assert.deepEqual(result.ordered.map(t => t.id), ['c', 'b', 'a', 'd']);
  assert.deepEqual(result.chronological.map(t => t.id), ['d', 'a', 'b', 'c']);
  assert.equal(result.average, 60);
  assert.equal(result.recentAverage, 220 / 3);
  const two = analyseMocks(tests.slice(0, 2), [], []);
  assert.equal(two.recentCount, 2);
  assert.equal(two.recentAverage, 65);
});
test('topics include subject in grouping and only explicit loss; subject tags never imply scores', () => {
  const errors = [
    { topic: 'Cache', subject: 'COA', error_type: 'Concept gap', marks_lost: 2 },
    { topic: 'cache ', subject: ' coa ', error_type: 'Silly mistake', marks_lost: 1.5 },
    { topic: 'Cache', subject: 'OS', error_type: 'Concept gap', marks_lost: 3 },
    { topic: 'Unknown', subject: 'OS', error_type: 'Time pressure', marks_lost: null },
  ];
  const result = analyseMocks([{ ...mock('m', '2026-11-01', 80), subjects: ['DBMS'] }], errors, [
    { subject_name: 'OS', marks_obtained: 5, total_marks: 10 }, { subject_name: ' os ', marks_obtained: 20, total_marks: 40 },
  ]);
  assert.equal(result.loggedLoss, 6.5);
  assert.equal(result.topics.length, 2);
  assert.equal(result.topics[0].value, 3.5);
  assert.equal(result.subjects.length, 1);
  assert.equal(result.subjects[0].value, 50);
  assert.equal(result.causes.find(c => c.name === 'Concept gap').value, 5);
});
test('empty analytics show no fabricated results', () => {
  const result = analyseMocks([], [], []);
  assert.equal(result.average, null); assert.equal(result.recentAverage, null);
  assert.equal(result.latest, undefined); assert.equal(result.loggedLoss, 0);
  assert.deepEqual(result.subjects, []); assert.deepEqual(result.topics, []);
  assert.equal(result.highestMarks, null);
});
test('highest marks uses raw obtained marks, with newest breaking ties', () => {
  const result = analyseMocks([mock('a', '2026-11-01', 45, 50), mock('b', '2026-11-02', 80, 120), mock('c', '2026-11-03', 80, 100)], [], []);
  assert.equal(result.highestMarks.id, 'c');
  assert.equal(result.highestMarks.marks_obtained, 80);
  assert.equal(analyseMocks([mock('a', '2026-11-01', -5), mock('b', '2026-11-02', -2)], [], []).highestMarks.id, 'b');
});
test('error validation and CSV handle decimals, multiline quotes, optional links and spreadsheet formulas', () => {
  assert.deepEqual(validateError({ topic: 'Cache', error_type: 'Concept gap', marks_lost: '1.5', question_number: '' }), {});
  assert.ok(validateError({ topic: ' ', error_type: 'Other', marks_lost: '-1', question_number: '1.2' }).question_number);
  const csv = errorsCsv([{ topic: '=SUM(1,2)', subject: 'OS', incorrect_approach: 'A "quote"\nand newline', correct_approach: ' @cmd', revision_status: 'pending' }], []);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"\'=SUM(1,2)"'));
  assert.ok(csv.includes('"A ""quote""\nand newline"'));
  assert.ok(csv.includes('"\' @cmd"'));
});
test('IST dates stay consistent near UTC day boundaries', () => {
  assert.equal(fmtDate('2026-11-04T19:00:00Z'), '2026-11-05');
  assert.equal(fmtDate('2026-11-04T18:00:00Z'), '2026-11-04');
});
