import React from 'react';
import { formatDateKey } from './dateUtils';
import { accuracy, CATEGORIES, formatNumber, formatPercent, scorePercent, timeUsed } from './mockUtils';

export default function MockList({ mocks, errors, saving, onAddError, onEdit, onDelete }) {
  return <>
    <p className="mocktests-muted mocktests-scroll-hint">Scroll the table to see accuracy, time and weak topics.</p>
    <div className="mocktests-table-scroll" role="region" aria-label="Mock history" tabIndex="0">
      <table className="mocktests-table mocktests-metrics">
        <thead><tr>{['Test', 'Score', '%', 'Negative', 'Accuracy', 'Time', 'Weak topics', 'Actions'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{mocks.map(test => {
          const linked = errors.filter(e => e.test_id === test.id);
          const topics = [...new Set(linked.map(e => [e.subject, e.topic].filter(Boolean).join(' / ')))];
          return <tr key={test.id} className="mocktests-mock-row">
            <td className="mocktests-test-name"><h4>{test.name}</h4><small>{formatDateKey(test.test_date, { day: 'numeric', month: 'short', year: 'numeric' })}</small><small>{CATEGORIES.find(([id]) => id === test.category)?.[1]}</small>{test.notes && <details><summary>Notes</summary><p className="mocktests-notes">{test.notes}</p></details>}</td>
            <td>{formatNumber(test.marks_obtained)} / {formatNumber(test.total_marks)}</td>
            <td><span className="mocktests-score">{formatPercent(scorePercent(test))}</span></td>
            <td><span>{formatNumber(test.negative_marks)}</span></td>
            <td><span>{formatPercent(accuracy(test))}</span></td>
            <td>{formatNumber(test.time_minutes)} / {formatNumber(test.time_allowed_minutes)} min<small>{timeUsed(test) != null && formatPercent(timeUsed(test))}</small></td>
            <td><div className="mocktests-tags">{topics.map(topic => <span key={topic}>{topic}</span>)}</div><small>{topics.length ? `${formatNumber(linked.reduce((sum, e) => sum + Number(e.marks_lost || 0), 0))} marks lost in logged errors` : 'No logged weak topics'}{test.subjects?.length > 0 && ` · ${test.subjects.join(', ')}`}</small></td>
            <td><div className="mocktests-actions"><button className="mocktests-button mocktests-button-secondary" disabled={saving} onClick={() => onAddError(test)}>+ Add error</button><button className="mocktests-button mocktests-button-quiet" disabled={saving} onClick={() => onEdit(test)}>Edit</button><button className="mocktests-button mocktests-button-quiet" disabled={saving} onClick={() => onDelete(test)}>Delete</button></div></td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  </>;
}
