import React, { useRef, useState } from 'react';
import { CAUSES, CATEGORIES, validateMock, validateError } from './mockUtils';

export function Field({ label, id, error, children }) {
  return <div className="mocktests-field"><label htmlFor={id}>{label}</label>{React.cloneElement(children, { id, 'aria-invalid': Boolean(error), 'aria-describedby': error ? `${id}-error` : undefined })}{error && <small id={`${id}-error`} className="mocktests-field-error">{error}</small>}</div>;
}

export default function MockForm({ kind, initial, tests, saving, onSave, onCancel }) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const summary = useRef(null);
  const isMock = kind === 'mock';
  const prefix = isMock ? 'mock' : 'mistake';
  const update = (key, value) => setForm(f => ({ ...f, [key]: value }));
  const field = (key, label, props = {}) => <Field key={key} id={`${prefix}-${key}`} label={label} error={errors[key]}><input value={form[key] ?? ''} onChange={e => update(key, e.target.value)} {...props} /></Field>;
  const textarea = (key, label) => <Field id={`${prefix}-${key}`} label={label} error={errors[key]}><textarea rows="3" value={form[key] || ''} onChange={e => update(key, e.target.value)} /></Field>;
  const submit = event => {
    event.preventDefault();
    const next = isMock ? validateMock(form) : validateError(form);
    setErrors(next);
    if (Object.keys(next).length) { requestAnimationFrame(() => summary.current?.focus()); return; }
    onSave(form);
  };
  const subjectUpdate = (i, key, value) => update('subject_scores', form.subject_scores.map((row, index) => index === i ? { ...row, [key]: value } : row));
  return <form className="mocktests-card mocktests-form" onSubmit={submit} noValidate aria-label={isMock ? 'Mock form' : 'Error form'}>
    <h3>{initial.id ? 'Edit' : 'Add'} {isMock ? 'mock' : 'error'}</h3>
    <p className="mocktests-muted">{isMock ? 'Name, date and score are all you need. Add details when you have them.' : 'Capture the concept and cause. Explanations and a linked mock are optional.'}</p>
    {Object.keys(errors).length > 0 && <div className="mocktests-alert" role="alert" tabIndex="-1" ref={summary}><strong>Please check these fields</strong><ul>{Object.entries(errors).map(([key, message]) => <li key={key}><a href={`#${prefix}-${key}`}>{message}</a></li>)}</ul></div>}
    <fieldset disabled={saving} className="mocktests-fieldset">
      {isMock ? <>
        {field('name', 'Test name *', { maxLength: 120, autoFocus: true })}
        <div className="mocktests-grid">
          {field('test_date', 'Test date *', { type: 'date' })}
          <Field id="mock-category" label="Category" error={errors.category}><select value={form.category} onChange={e => update('category', e.target.value)}>{CATEGORIES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></Field>
          {field('marks_obtained', 'Marks obtained *', { type: 'number', step: 'any' })}
          {field('total_marks', 'Maximum marks *', { type: 'number', min: '0.01', step: 'any' })}
        </div>
        {field('subjects', 'Subjects (comma-separated)', { placeholder: 'Operating Systems, DBMS' })}
        <details open={Boolean(initial.id)}><summary>Optional metrics and notes</summary><div className="mocktests-grid mocktests-detail-content">
          {field('negative_marks', 'Negative marks', { type: 'number', min: 0, step: 'any' })}
          {field('correct_count', 'Correct questions', { type: 'number', min: 0, step: 1 })}
          {field('wrong_count', 'Wrong questions', { type: 'number', min: 0, step: 1 })}
          {field('unattempted_count', 'Unattempted questions', { type: 'number', min: 0, step: 1 })}
          {field('time_minutes', 'Time taken (minutes)', { type: 'number', min: 0, step: 'any' })}
          {field('time_allowed_minutes', 'Time allowed (minutes)', { type: 'number', min: '0.01', step: 'any' })}
        </div>{textarea('notes', 'Notes')}</details>
        <details open={form.subject_scores.length > 0}><summary>Subject score breakdown</summary>
          <p className="mocktests-muted mocktests-detail-content">Only recorded subject scores contribute to subject analysis. No scores are inferred from tags.</p>
          {form.subject_scores.map((row, i) => <div className="mocktests-subject-row" key={i}>
            <Field id={`mock-subject_${i}`} label={`Subject ${i + 1}`} error={errors[`subject_${i}`]}><input value={row.subject_name} maxLength={120} onChange={e => subjectUpdate(i, 'subject_name', e.target.value)} /></Field>
            <div className="mocktests-grid">
              <Field id={`subject-score-${i}`} label="Marks obtained"><input type="number" step="any" value={row.marks_obtained} onChange={e => subjectUpdate(i, 'marks_obtained', e.target.value)} /></Field>
              <Field id={`subject-max-${i}`} label="Maximum marks"><input type="number" step="any" min="0.01" value={row.total_marks} onChange={e => subjectUpdate(i, 'total_marks', e.target.value)} /></Field>
            </div>
            <button type="button" className="mocktests-button mocktests-button-quiet" aria-label={`Remove subject ${i + 1}`} onClick={() => update('subject_scores', form.subject_scores.filter((_, index) => index !== i))}>Remove subject</button>
          </div>)}
          <button type="button" className="mocktests-button mocktests-button-secondary" onClick={() => update('subject_scores', [...form.subject_scores, { subject_name: '', marks_obtained: '', total_marks: '' }])}>+ Add subject score</button>
        </details>
      </> : <>
        <Field id="mistake-test_id" label="Linked mock (optional)"><select value={form.test_id || ''} onChange={e => update('test_id', e.target.value)}><option value="">No linked mock</option>{tests.map(test => <option key={test.id} value={test.id}>{test.name} · {test.test_date}</option>)}</select></Field>
        {field('topic', 'Topic / concept *', { maxLength: 120, autoFocus: true })}
        <div className="mocktests-grid">
          {field('subject', 'Subject', { maxLength: 120 })}
          <Field id="mistake-error_type" label="Error cause *" error={errors.error_type}><select value={form.error_type} onChange={e => update('error_type', e.target.value)}>{CAUSES.map(c => <option key={c.name}>{c.name}</option>)}</select></Field>
          {field('question_number', 'Question number', { type: 'number', min: 1, step: 1 })}
          {field('marks_lost', 'Marks lost', { type: 'number', min: 0, step: 'any' })}
        </div>
        {textarea('incorrect_approach', 'What went wrong?')}
        {textarea('correct_approach', 'Correct approach')}
        {textarea('reason', 'Why did this happen?')}
        <Field id="mistake-revision_status" label="Revision status"><select value={form.revision_status === 'pending' ? 'pending' : 'revised'} onChange={e => update('revision_status', e.target.value)}><option value="pending">Not revised</option><option value="revised">Revised</option></select></Field>
      </>}
    </fieldset>
    <div className="mocktests-actions"><button className="mocktests-button mocktests-button-primary" disabled={saving}>{saving ? 'Saving…' : `Save ${isMock ? 'mock' : 'error'}`}</button><button type="button" className="mocktests-button mocktests-button-quiet" onClick={onCancel} disabled={saving}>Cancel</button></div>
  </form>;
}
