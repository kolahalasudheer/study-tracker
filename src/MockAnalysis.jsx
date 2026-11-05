import React, { useId, useState } from 'react';
import { formatDateKey } from './dateUtils';
import { accuracy, CAUSES, CATEGORIES, formatNumber, formatPercent, numberOrNull, scorePercent, timeUsed } from './mockUtils';

function Card({ title, description, children }) {
  return <section className="mocktests-card mocktests-panel"><h3>{title}</h3><p className="mocktests-muted">{description}</p>{children}</section>;
}
const Empty = ({ children = 'Add the relevant metrics to a mock to see this chart.' }) => <p className="mocktests-chart-empty">{children}</p>;
const shortDate = date => formatDateKey(date, { day: 'numeric', month: 'short' });

const CATEGORY_COLORS = { full: '#7c3aed', subject: '#2563eb', mixed: '#0f766e', pyq: '#c2410c' };

function CategoryTrend({ rows, metric, label, unit = '%' }) {
  const [selected, setSelected] = useState(() => CATEGORIES.map(([value]) => value));
  return <>
    <fieldset className="mocktests-category-toggles"><legend>Mock categories</legend>{CATEGORIES.map(([value, name]) => <label key={value} style={{ '--category-color': CATEGORY_COLORS[value] }}><input type="checkbox" checked={selected.includes(value)} onChange={e => setSelected(current => e.target.checked ? [...current, value] : current.filter(item => item !== value))} /><span className="mocktests-category-swatch" aria-hidden="true" /><span>{name} ({rows.filter(row => row.category === value).length})</span></label>)}</fieldset>
    {selected.length ? <Line rows={rows} metric={metric} label={label} categories={selected} unit={unit} /> : <Empty>Select at least one mock category to display its trend.</Empty>}
  </>;
}

function Line({ rows, metric, label, categories, unit = '%' }) {
  const id = useId();
  const available = rows.map((row, index) => ({ row, index, value: metric(row) })).filter(p => p.value != null);
  const series = categories ? CATEGORIES.filter(([value]) => categories.includes(value)).map(([value, name]) => ({ key: value, name, color: CATEGORY_COLORS[value], points: available.filter(p => p.row.category === value) })) : [{ key: 'all', name: label, color: 'var(--primary)', points: available }];
  const points = series.flatMap(group => group.points).sort((a, b) => a.index - b.index);
  if (!points.length) return <Empty />;
  const minimum = Math.min(0, ...points.map(p => p.value));
  const maximum = Math.max(unit === '%' ? 100 : 1, ...points.map(p => p.value));
  const x = i => 46 + i * 282 / Math.max(1, rows.length - 1);
  const y = value => 142 - (value - minimum) / (maximum - minimum) * 114;
  const last = points.at(-1);
  return <>
    <svg className="mocktests-line" viewBox="0 0 360 172" role="img" aria-labelledby={id}>
      <title id={id}>{label}; values listed below</title>
      {[minimum, (minimum + maximum) / 2, maximum].map(tick => <g key={tick}><line x1="46" x2="334" y1={y(tick)} y2={y(tick)} stroke="currentColor" opacity=".1" /><text x="38" y={y(tick) + 4} textAnchor="end">{formatNumber(tick)}{unit}</text></g>)}
      {series.filter(group => group.points.length).map(group => <g key={group.key} data-category={group.key}>
        <polyline points={group.points.map(p => `${x(p.index)},${y(p.value)}`).join(' ')} fill="none" stroke={group.color} strokeWidth="2" />
        {group.points.map(p => <circle key={p.row.id} cx={x(p.index)} cy={y(p.value)} r="3" fill={group.color}><title>{group.name} · {p.row.name}: {formatNumber(p.value)}{unit} ({p.row.test_date})</title></circle>)}
      </g>)}
      {!categories && <text className="mocktests-point-label" x={x(last.index)} y={y(last.value) - 10} textAnchor={points.length > 1 ? 'end' : 'start'}>{formatNumber(last.value)}{unit}</text>}
      <text x="46" y="164">{shortDate(rows[0].test_date)}</text><text x="334" y="164" textAnchor="end">{rows.length > 1 ? shortDate(rows.at(-1).test_date) : ''}</text>
    </svg>
    <details className="mocktests-chart-data"><summary>View chart values ({points.length})</summary>{points.map(p => <div className="mocktests-bar-label" key={p.row.id}><span>{p.row.test_date} · {p.row.name}{categories && ` · ${CATEGORIES.find(([value]) => value === p.row.category)?.[1]}`}</span><strong>{formatNumber(p.value)}{unit}</strong></div>)}</details>
  </>;
}

function Bars({ rows, unit = '', empty, shares = false }) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  const minimum = Math.min(0, ...rows.map(row => row.value));
  const maximum = Math.max(unit === '%' ? 100 : 1, ...rows.map(row => row.value));
  const scale = value => (value - minimum) / (maximum - minimum) * 100;
  return <div className="mocktests-bars">{rows.map((row, i) => <div key={row.key || row.label || i} className="mocktests-bar-row">
    <span className="mocktests-horizontal-label">{row.label}</span>
    <div className="mocktests-bar-value"><div className="mocktests-bar-track" aria-hidden="true"><span style={{ left: `${scale(Math.min(0, row.value))}%`, width: `${Math.abs(row.value) / (maximum - minimum) * 100}%`, background: row.color || 'var(--primary)' }} />{minimum < 0 && <i style={{ left: `${scale(0)}%` }} />}</div><strong>{formatNumber(row.value)}{unit}{shares && row.share != null ? ` (${formatNumber(row.share)}%)` : ''}</strong></div>
  </div>)}</div>;
}

function Columns({ rows, unit = '', label, stacked = false, percentAxis = false }) {
  const id = useId();
  if (!rows.length) return <Empty />;
  const width = Math.max(360, rows.length * 46 + 50);
  const left = unit === '%' ? 60 : 34;
  const maximum = Math.max(percentAxis ? 100 : 1, ...rows.map(row => row.values ? row.values.reduce((sum, c) => sum + c.value, 0) : row.value));
  const step = (width - left - 26) / rows.length;
  const barWidth = Math.min(32, step * .64);
  const y = value => 158 - value / maximum * 128;
  return <>
    <div className="mocktests-chart-scroll" role="region" aria-label={label} tabIndex="0"><svg className="mocktests-column-chart" viewBox={`0 0 ${width} 188`} style={{ minWidth: width > 400 ? width : undefined }} role="img" aria-labelledby={id}>
      <title id={id}>{label}; chronological values listed below</title>
      {[0, maximum / 2, maximum].map(tick => <g key={tick}><line x1={left} x2={width - 12} y1={y(tick)} y2={y(tick)} stroke="currentColor" opacity=".1" /><text x={left - 7} y={y(tick) + 4} textAnchor="end">{formatNumber(tick)}{unit}</text></g>)}
      {rows.map((row, i) => {
        const x = left + 8 + i * step + (step - barWidth) / 2;
        const values = row.values || [{ name: label, value: row.value, color: 'var(--primary)' }];
        const total = values.reduce((sum, c) => sum + c.value, 0);
        let bottom = 158;
        return <g key={row.key || i}>{values.map(c => {
          const height = c.value / maximum * 128; bottom -= height;
          return <rect key={c.name} x={x} y={bottom} width={barWidth} height={height} fill={c.color}><title>{row.label} · {c.name}: {formatNumber(c.value)}{unit}</title></rect>;
        })}<text x={x + barWidth / 2} y={y(total) - 7} textAnchor="middle">{formatNumber(total)}{unit}</text><text x={x + barWidth / 2} y="179" textAnchor="middle">{shortDate(row.date)}</text></g>;
      })}
    </svg></div>
    {stacked && <div className="mocktests-legend">{CAUSES.map(c => <span key={c.name}><i style={{ background: c.color }} />{c.name}</span>)}</div>}
    <details className="mocktests-chart-data"><summary>View {stacked ? 'cause' : 'chart'} values ({rows.length} mocks)</summary>{rows.map(row => <div key={row.key}><div className="mocktests-bar-label"><span>{row.date} · {row.label}</span><strong>{formatNumber(row.values ? row.values.reduce((sum, c) => sum + c.value, 0) : row.value)}{unit}</strong></div>{row.values?.filter(c => c.value > 0).map(c => <div className="mocktests-bar-label" key={c.name}><span>{c.name}</span><strong>{formatNumber(c.value)}</strong></div>)}</div>)}</details>
  </>;
}

export default function MockAnalysis({ analytics }) {
  const rows = analytics.chronological;
  const causes = analytics.causes.filter(c => c.value > 0).sort((a, b) => b.value - a.value);
  const trend = metric => {
    const values = rows.map(metric).filter(value => value != null);
    return values.length > 1 ? `From ${formatPercent(values[0])} to ${formatPercent(values.at(-1))} across these mocks.` : values.length ? 'Your first recorded result. Add more mocks to see a trend.' : 'Your results over time, oldest first.';
  };
  return <div className="mocktests-panels mocktests-analysis">
    <Card title="Score trend" description={`Compare percentage scores by category. Average test percentage across all categories: ${formatPercent(analytics.average)}.`}><CategoryTrend rows={rows} metric={scorePercent} label="Score percentage by mock category, oldest first" /></Card>
    <Card title="Where marks are lost" description={causes.length ? `${causes[0].name} accounts for ${formatNumber(causes[0].share)}% of logged marks lost.` : 'Error causes as a share of your logged marks lost.'}><Bars rows={causes} shares empty="No positive marks lost recorded yet." /></Card>
    <Card title="Accuracy" description={`${trend(accuracy)} Excludes unattempted questions.`}><Line rows={rows} metric={accuracy} label="Question accuracy by mock" /></Card>
    <Card title="Negative marks" description="Compare negative marks by category. Only entered values are included."><CategoryTrend rows={rows} metric={row => numberOrNull(row.negative_marks)} label="Negative marks by mock category, oldest first" unit="" /></Card>
    <Card title="Time used" description="Time taken as a share of time allowed. Above 100% is overtime."><Columns rows={rows.filter(t => timeUsed(t) != null).map(t => ({ key: t.id, date: t.test_date, label: t.name, value: timeUsed(t) }))} unit="%" percentAxis label="Time used by mock" /></Card>
    <Card title="Subject performance" description="Recorded subject marks only, weakest first. Tags do not imply scores."><Bars rows={analytics.subjects} unit="%" empty="Add subject score breakdowns to your mocks. Tags alone do not provide subject scores." /></Card>
  </div>;
}
