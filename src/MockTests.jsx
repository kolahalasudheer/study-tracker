import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabase';
import MockForm, { Field } from './MockForms';
import MockAnalysis from './MockAnalysis';
import MockList from './MockList';
import MockErrorLog, { saveError } from './MockErrorLog';
import { analyseMocks, blankError, blankMock, CATEGORIES, formatNumber, formatPercent, mockPayload, scorePercent } from './mockUtils';
import './MockTests.css';

const TABS = ['Mocks', 'Error Log', 'Analysis'];
async function readAll(table, userId, order) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from(table).select('*').eq('user_id', userId).order(order).order('id').range(offset, offset + 499);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}
export default function MockTests({ user }) {
  if (!user?.id) return <div className="mocktests-card">Please sign in to use Mock Tracker.</div>;
  if (!supabase) return <div className="mocktests-card">Configure Supabase to use Mock Tracker.</div>;
  return <Workspace key={user.id} user={user} />;
}

function Workspace({ user }) {
  const [data, setData] = useState({ tests: [], errors: [], subjects: [], profiles: [] });
  const [profileId, setProfileId] = useState('');
  const [tab, setTab] = useState('Mocks');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editor, setEditor] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [category, setCategory] = useState('');
  const [mockLimit, setMockLimit] = useState(15);
  const active = useRef(true), request = useRef(0), mutation = useRef(false);
  const formRegion = useRef(null), addButton = useRef(null), deleteRegion = useRef(null);
  async function reload() {
    const version = ++request.current;
    setLoading(true); setError('');
    try {
      const [tests, errors, subjects, profiles] = await Promise.all([
        readAll('mock_tests', user.id, 'test_date'), readAll('mock_test_errors', user.id, 'created_at'),
        readAll('mock_test_subjects', user.id, 'created_at'), readAll('exam_profiles', user.id, 'created_at'),
      ]);
      if (active.current && version === request.current) setData({ tests, errors, subjects, profiles });
    } catch (e) {
      if (active.current && version === request.current) { setData({ tests: [], errors: [], subjects: [], profiles: [] }); setError(`Could not load Mock Tracker: ${e.message}`); }
    } finally { if (active.current && version === request.current) setLoading(false); }
  }
  useEffect(() => { active.current = true; reload(); return () => { active.current = false; request.current++; }; }, [user.id]);
  useEffect(() => { setMockLimit(15); }, [category, profileId]);
  useEffect(() => { if (editor) formRegion.current?.scrollIntoView({ behavior: 'instant', block: 'start' }); }, [editor]);
  useEffect(() => { if (deleting) deleteRegion.current?.focus(); }, [deleting]);
  const tests = useMemo(() => data.tests.filter(t => !profileId || t.exam_profile_id === profileId), [data.tests, profileId]);
  const testIds = useMemo(() => new Set(tests.map(t => t.id)), [tests]);
  const errors = useMemo(() => data.errors.filter(e => !profileId || (e.test_id ? testIds.has(e.test_id) : e.exam_profile_id === profileId)), [data.errors, profileId, testIds]);
  const subjects = useMemo(() => data.subjects.filter(s => testIds.has(s.test_id)), [data.subjects, testIds]);
  const analytics = useMemo(() => analyseMocks(tests, errors, subjects), [tests, errors, subjects]);
  const mocks = analytics.ordered.filter(t => !category || t.category === category);
  function openEditor(kind, row) {
    setError(''); setMessage(''); setDeleting(null);
    setEditor({ kind, initial: row || (kind === 'mock' ? blankMock() : blankError()) });
  }
  function closeEditor() { setEditor(null); requestAnimationFrame(() => addButton.current?.focus()); }
  async function mutate(operation, success) {
    if (mutation.current) return;
    mutation.current = true; setSaving(true); setError(''); setMessage('');
    try {
      await operation();
      if (!active.current) return;
      setEditor(null); setDeleting(null); setMessage(success);
      await reload();
      addButton.current?.focus();
    } catch (e) { if (active.current) setError(e.message); }
    finally { mutation.current = false; if (active.current) setSaving(false); }
  }
  function saveMock(form) {
    const existing = data.tests.find(t => t.id === form.id);
    return mutate(async () => {
      const { error: saveError } = await supabase.rpc('save_mock_with_subjects', {
        p_id: form.id || null, p_mock: mockPayload(form, existing ? existing.exam_profile_id : profileId),
        p_subjects: form.subject_scores.map(row => ({ subject_name: row.subject_name.trim(), marks_obtained: Number(row.marks_obtained), total_marks: Number(row.total_marks) })),
      });
      if (saveError) throw saveError;
    }, 'Mock saved. Your analysis is up to date.');
  }
  function confirmDelete() {
    return mutate(async () => {
      const { error: deleteError } = await supabase.from(deleting.kind === 'mock' ? 'mock_tests' : 'mock_test_errors').delete().eq('id', deleting.row.id).eq('user_id', user.id).select('id').single();
      if (deleteError) throw deleteError;
    }, `${deleting.kind === 'mock' ? 'Mock and its linked records' : 'Error'} deleted.`);
  }
  const stat = (label, value, note) => <article className="mocktests-stat"><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;
  const tabIndex = TABS.indexOf(tab);
  return <main className="mocktests-page">
    <header className="mocktests-heading"><p className="mocktests-eyebrow">MOCK TESTS</p><button ref={addButton} type="button" className="mocktests-button mocktests-button-primary" disabled={loading || saving} onClick={() => openEditor('mock')}>+ Add mock</button></header>
    <div className="mocktests-tabs" role="tablist" aria-label="Mock Tracker">{TABS.map((name, i) => <button key={name} id={`mock-tab-${i}`} role="tab" aria-selected={tab === name} aria-controls={`mock-panel-${i}`} tabIndex={tab === name ? 0 : -1} onClick={() => { setTab(name); setEditor(null); setDeleting(null); }} onKeyDown={event => {
      const index = event.key === 'ArrowRight' ? (i + 1) % 3 : event.key === 'ArrowLeft' ? (i + 2) % 3 : event.key === 'Home' ? 0 : event.key === 'End' ? 2 : null;
      if (index != null) { event.preventDefault(); setTab(TABS[index]); setEditor(null); setDeleting(null); document.getElementById(`mock-tab-${index}`)?.focus(); }
    }} disabled={saving}>{name}</button>)}</div>
    {error && <div className="mocktests-alert" role="alert">{error}<button type="button" className="mocktests-button mocktests-button-quiet" onClick={reload} disabled={saving || loading}>Retry loading</button></div>}
    {message && <div className="mocktests-success" role="status">{message}</div>}
    <div className="mocktests-toolbar">{data.profiles.length > 0 && <Field id="mock-profile" label="Exam profile"><select value={profileId} disabled={saving} onChange={e => { setProfileId(e.target.value); setEditor(null); setDeleting(null); }}><option value="">All mocks</option>{data.profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>}<button type="button" className="mocktests-button mocktests-button-quiet" onClick={reload} disabled={loading || saving}>Refresh</button></div>
    {loading ? <p className="mocktests-card" role="status">Loading your mocks…</p> : <>
      {editor && <div ref={formRegion} className="mocktests-form-region"><MockForm key={`${editor.kind}-${editor.initial.id || 'new'}`} kind={editor.kind} initial={editor.initial} tests={analytics.ordered} saving={saving} onCancel={closeEditor} onSave={editor.kind === 'mock' ? saveMock : form => saveError(form, { user, tests, profileId, mutate })} /></div>}
      {deleting && <section className="mocktests-card mocktests-confirm" ref={deleteRegion} tabIndex="-1" role="alertdialog" aria-labelledby="delete-title" aria-describedby="delete-description"><h3 id="delete-title">Delete {deleting.kind === 'mock' ? deleting.row.name : deleting.row.topic}?</h3><p id="delete-description">{deleting.kind === 'mock' ? 'This also deletes its linked errors and subject scores.' : 'This removes the mistake from your notebook and analysis.'} This cannot be undone.</p><div className="mocktests-actions"><button className="mocktests-button mocktests-button-danger" disabled={saving} onClick={confirmDelete}>Delete permanently</button><button className="mocktests-button mocktests-button-quiet" disabled={saving} onClick={() => { setDeleting(null); addButton.current?.focus(); }}>Cancel</button></div></section>}
      <section role="tabpanel" id={`mock-panel-${tabIndex}`} aria-labelledby={`mock-tab-${tabIndex}`}>
        {tab === 'Mocks' && <div className="mocktests-panels"><div className="mocktests-statgrid">
          {stat('Mocks taken', tests.length, profileId ? 'In this profile' : 'Across your mocks')}
          {stat('Latest score', formatPercent(analytics.latest ? scorePercent(analytics.latest) : null), analytics.latest ? `${formatNumber(analytics.latest.marks_obtained)} / ${formatNumber(analytics.latest.total_marks)}` : 'No mocks yet')}
          {stat(`Average of last ${analytics.recentCount || 3}`, formatPercent(analytics.recentAverage), analytics.recentCount < 3 ? `Based on ${analytics.recentCount} available mocks` : 'Mean of test percentages')}
          {stat('Highest marks of all mocks', analytics.highestMarks ? `${formatNumber(analytics.highestMarks.marks_obtained)} / ${formatNumber(analytics.highestMarks.total_marks)}` : '—', analytics.highestMarks?.name || 'No mocks yet')}
        </div><section className="mocktests-card mocktests-panel"><div className="mocktests-section-title"><h3>All mocks</h3><span>{mocks.length} mocks</span></div>
          <Field id="mock-category-filter" label="Filter category"><select value={category} onChange={e => setCategory(e.target.value)}><option value="">All categories</option>{CATEGORIES.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></Field>
          {!mocks.length && <div className="mocktests-empty"><h3>{tests.length ? 'No mocks in this category' : 'Your next mock starts here'}</h3><p>Record a mock, capture what went wrong, and watch your progress over time.</p></div>}
          {mocks.length > 0 && <MockList mocks={mocks.slice(0, mockLimit)} errors={errors} saving={saving}
            onAddError={test => { setTab('Error Log'); openEditor('error', blankError(test.id)); }}
            onEdit={test => openEditor('mock', { ...test, subjects: (test.subjects || []).join(', '), notes: test.notes || '', subject_scores: subjects.filter(s => s.test_id === test.id) })}
            onDelete={test => { setEditor(null); setDeleting({ kind: 'mock', row: test }); }} />}
          {mocks.length > mockLimit && <button className="mocktests-button mocktests-button-quiet" onClick={() => setMockLimit(n => n + 15)}>Show more mocks ({mocks.length - mockLimit} remaining)</button>}
        </section></div>}
        {tab === 'Error Log' && <MockErrorLog key={profileId} errors={errors} tests={analytics.ordered} user={user} saving={saving} mutate={mutate} onAdd={() => openEditor('error')} onEdit={row => openEditor('error', row)} onDelete={row => { setEditor(null); setDeleting({ kind: 'error', row }); }} />}
        {tab === 'Analysis' && <MockAnalysis analytics={analytics} />}
      </section>
    </>}
  </main>;
}
