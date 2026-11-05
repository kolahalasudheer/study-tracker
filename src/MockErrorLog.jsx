import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import { Field } from './MockForms';
import { fmtDate, formatDateKey } from './dateUtils';
import { CAUSES, errorsCsv, formatNumber, numberOrNull } from './mockUtils';

export async function saveError(form, { user, tests, profileId, mutate }) {
  return mutate(async () => {
    const test = tests.find(t => t.id === form.test_id);
    const revised = form.revision_status !== 'pending';
    const payload = {
      user_id: user.id, test_id: form.test_id || null, exam_profile_id: test ? test.exam_profile_id : profileId || null,
      subject: form.subject.trim(), topic: form.topic.trim(), question_number: numberOrNull(form.question_number),
      error_type: form.error_type, marks_lost: numberOrNull(form.marks_lost), incorrect_approach: form.incorrect_approach.trim(),
      correct_approach: form.correct_approach.trim(), reason: form.reason.trim(), revision_status: revised ? 'revised' : 'pending',
      revised_at: revised ? form.revised_at || new Date().toISOString() : null,
    };
    const query = form.id ? supabase.from('mock_test_errors').update(payload).eq('id', form.id).eq('user_id', user.id) : supabase.from('mock_test_errors').insert(payload);
    const { error } = await query.select('id').single();
    if (error) throw error;
  }, 'Error saved.');
}

export default function MockErrorLog({ errors, tests, user, saving, mutate, onAdd, onEdit, onDelete }) {
  const [filters, setFilters] = useState({ query: '', cause: '', status: '', test: '' });
  const [limit, setLimit] = useState(15);
  useEffect(() => { setLimit(15); }, [filters]);
  const change = (key, value) => setFilters(f => ({ ...f, [key]: value }));
  const filtered = useMemo(() => errors.filter(e => {
    const test = tests.find(t => t.id === e.test_id);
    const text = [e.topic, e.subject, e.incorrect_approach, e.correct_approach, e.reason, test?.name].join(' ').toLowerCase();
    return (!filters.query || text.includes(filters.query.trim().toLowerCase())) && (!filters.cause || e.error_type === filters.cause) && (!filters.status || (filters.status === 'pending' ? e.revision_status === 'pending' : e.revision_status !== 'pending')) && (!filters.test || e.test_id === filters.test);
  }).sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)), [errors, tests, filters]);
  function exportCsv(rows) {
    const url = URL.createObjectURL(new Blob([errorsCsv(rows, tests)], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'mock-tracker-errors.csv'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function toggle(entry) {
    mutate(async () => {
      const revised = entry.revision_status === 'pending';
      const { error } = await supabase.from('mock_test_errors').update({ revision_status: revised ? 'revised' : 'pending', revised_at: revised ? new Date().toISOString() : null }).eq('id', entry.id).eq('user_id', user.id).select('id').single();
      if (error) throw error;
    }, 'Revision status updated.');
  }
  const date = value => formatDateKey(value, { day: 'numeric', month: 'short', year: 'numeric' });
  return <div className="mocktests-panels mocktests-error-log"><section className="mocktests-card mocktests-panel"><div className="mocktests-section-title"><h3>Error Log</h3><button className="mocktests-button mocktests-button-primary" disabled={saving} onClick={onAdd}>+ Add error</button></div>
    <Field id="error-search" label="Search topic, subject, mock or explanation"><input type="search" value={filters.query} onChange={e => change('query', e.target.value)} placeholder="Search your mistakes" /></Field>
    <div className="mocktests-grid"><Field id="error-cause" label="Cause"><select value={filters.cause} onChange={e => change('cause', e.target.value)}><option value="">All causes</option>{CAUSES.map(c => <option key={c.name}>{c.name}</option>)}</select></Field><Field id="error-status" label="Revision"><select value={filters.status} onChange={e => change('status', e.target.value)}><option value="">All statuses</option><option value="pending">Not revised</option><option value="revised">Revised</option></select></Field></div>
    <Field id="error-test" label="Linked mock"><select value={filters.test} onChange={e => change('test', e.target.value)}><option value="">All mocks</option>{tests.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
    <p className="mocktests-muted" role="status">{filtered.length} errors · {formatNumber(filtered.reduce((sum, e) => sum + Number(e.marks_lost || 0), 0))} marks lost · {filtered.filter(e => e.revision_status === 'pending').length} not revised</p>
    <div className="mocktests-actions"><button className="mocktests-button mocktests-button-secondary" disabled={!filtered.length} onClick={() => exportCsv(filtered)}>Export filtered CSV</button><button className="mocktests-button mocktests-button-quiet" disabled={!errors.length} onClick={() => exportCsv(errors)}>Export all CSV</button></div>
  </section>
  {!filtered.length && <div className="mocktests-card mocktests-empty"><h3>{errors.length ? 'No matching errors' : 'Make every mistake useful'}</h3><p>{errors.length ? 'Try changing your search or filters.' : 'Log a topic and cause, then return to revise it.'}</p></div>}
  {filtered.slice(0, limit).map(entry => {
    const test = tests.find(t => t.id === entry.test_id);
    const color = CAUSES.find(c => c.name === entry.error_type)?.color;
    return <article className="mocktests-card mocktests-error-entry" key={entry.id}>
      <div className="mocktests-error-copy"><h3>{entry.topic}</h3><p className="mocktests-muted">{entry.subject || 'No subject'} · {test ? `${test.name} · ${date(test.test_date)}` : `Unlinked · ${date(fmtDate(entry.created_at))}`}{entry.question_number ? ` · Q${entry.question_number}` : ''}</p><div className="mocktests-error-meta"><span className="mocktests-cause" style={{ '--cause': color }}>{entry.error_type}</span><span>{formatNumber(entry.marks_lost)} marks</span></div></div>
      <button className={`mocktests-button mocktests-revise-button ${entry.revision_status !== 'pending' ? 'is-revised' : ''}`} disabled={saving} onClick={() => toggle(entry)}>{entry.revision_status === 'pending' ? 'Mark revised' : 'Undo revision'}</button>
      <details className="mocktests-error-details"><summary>Details &amp; actions</summary>{[['What went wrong', entry.incorrect_approach], ['Correct approach', entry.correct_approach], ['Why it happened', entry.reason]].filter(([, text]) => text).map(([label, text]) => <div key={label} className="mocktests-notes"><strong>{label}</strong><p>{text}</p></div>)}<p className="mocktests-muted">{entry.revision_status === 'pending' ? 'Not revised' : `Revised${entry.revised_at ? ` · ${date(fmtDate(entry.revised_at))}` : ''}`}</p><div className="mocktests-actions"><button className="mocktests-button mocktests-button-quiet" disabled={saving} onClick={() => onEdit(entry)}>Edit</button><button className="mocktests-button mocktests-button-quiet" disabled={saving} onClick={() => onDelete(entry)}>Delete</button></div></details>
    </article>;
  })}
  {filtered.length > limit && <button className="mocktests-button mocktests-button-quiet" onClick={() => setLimit(n => n + 15)}>Show more errors ({filtered.length - limit} remaining)</button>}
  </div>;
}
