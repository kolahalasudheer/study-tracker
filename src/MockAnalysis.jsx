import React, { useId } from 'react';
import { formatDateKey } from './dateUtils';
import { accuracy, CAUSES, formatNumber, formatPercent, scorePercent, timeUsed } from './mockUtils';

function Card({ title, description, children }) {
  return <section className="mocktests-card mocktests-panel"><h3>{title}</h3><p className="mocktests-muted">{description}</p>{children}</section>;
}
const Empty = ({ children = 'Add the relevant metrics to a mock to see this chart.' }) => <p className="mocktests-chart-empty">{children}</p>;
const shortDate = date => formatDateKey(date, { day: 'numeric', month: 'short' });

function Line({ rows, metric, label }) {
  const id = useId();
  const points = rows.map(row => ({ row, value: metric(row) })).filter(p => p.value != null);
  if (!points.length) return <Empty />;
  const minimum = Math.min(0, ...points.map(p => p.value));
  const maximum = Math.max(100, ...points.map(p => p.value));
  const x = i => 38 + i * 290 / Math.max(1, points.length - 1);
  const y = value => 142 - (value - minimum) / (maximum - minimum) * 114;
  const last = points.at(-1);
  return <>
    <svg className="mocktests-line" viewBox="0 0 360 172" role="img" aria-labelledby={id}>
      <title id={id}>{label}; values listed below</title>
      {[minimum, (minimum + maximum) / 2, maximum].map(tick => <g key={tick}><line x1="38" x2="334" y1={y(tick)} y2={y(tick)} stroke="currentColor" opacity=".1" /><text x="30" y={y(tick) + 4} textAnchor="end">{formatNumber(tick)}%</text></g>)}
      <polyline points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')} fill="none" stroke="var(--primary)" strokeWidth="2" />
      {points.map((p, i) => <circle key={p.row.id} cx={x(i)} cy={y(p.value)} r="3" fill="var(--primary)"><title>{p.row.name}: {formatPercent(p.value)} ({p.row.test_date})</title></circle>)}
      <text className="mocktests-point-label" x={x(points.length - 1)} y={y(last.value) - 10} textAnchor={points.length > 1 ? 'end' : 'start'}>{formatPercent(last.value)}</text>
      <text x="38" y="164">{shortDate(points[0].row.test_date)}</text><text x="334" y="164" textAnchor="end">{points.length > 1 ? shortDate(last.row.test_date) : ''}</text>
    </svg>
    <details className="mocktests-chart-data"><summary>View chart values ({points.length})</summary>{points.map(p => <div className="mocktests-bar-label" key={p.row.id}><span>{p.row.test_date} · {p.row.name}</span><strong>{formatPercent(p.value)}</strong></div>)}</details>
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
  const lossRows = analytics.perMock.map(({ test, values }) => ({ key: test.id, label: test.name, date: test.test_date, values }));
  const hasLoss = lossRows.some(row => row.values.some(c => c.value > 0));
  const causes = analytics.causes.filter(c => c.value > 0).sort((a, b) => b.value - a.value);
  const trend = metric => {
    const values = rows.map(metric).filter(value => value != null);
    return values.length > 1 ? `From ${formatPercent(values[0])} to ${formatPercent(values.at(-1))} across these mocks.` : values.length ? 'Your first recorded result. Add more mocks to see a trend.' : 'Your results over time, oldest first.';
  };
  return <div className="mocktests-panels mocktests-analysis">
    <Card title="Score trend" description={`${trend(scorePercent)} Average test percentage: ${formatPercent(analytics.average)}.`}><Line rows={rows} metric={scorePercent} label="Score percentage by mock, oldest first" /></Card>
    <Card title="Costliest topics" description={analytics.topics.length ? `Most marks lost: ${analytics.topics[0].label} (${formatNumber(analytics.topics[0].value)}).` : 'Which concepts cost you the most marks?'}><Bars rows={analytics.topics} empty="Log marks lost on an error to identify costly topics." /></Card>
    <Card title="Where marks are lost" description={causes.length ? `${causes[0].name} accounts for ${formatNumber(causes[0].share)}% of logged marks lost.` : 'Error causes as a share of your logged marks lost.'}><Bars rows={causes} shares empty="No positive marks lost recorded yet." /></Card>
    <Card title="Marks lost by cause per mock" description="Compare logged error patterns across mocks. Oldest first.">
      {hasLoss ? <Columns rows={lossRows} stacked label="Marks lost by cause per mock" /> : <Empty>Link errors with logged marks lost to mocks to see the breakdown.</Empty>}
    </Card>
    <Card title="Accuracy" description={`${trend(accuracy)} Excludes unattempted questions.`}><Line rows={rows} metric={accuracy} label="Question accuracy by mock" /></Card>
    <Card title="Negative marks" description="Are you reducing negative marking? Entered values only."><Columns rows={rows.filter(t => t.negative_marks != null).map(t => ({ key: t.id, date: t.test_date, label: t.name, value: Number(t.negative_marks) }))} label="Negative marks by mock" /></Card>
    <Card title="Time used" description="Time taken as a share of time allowed. Above 100% is overtime."><Columns rows={rows.filter(t => timeUsed(t) != null).map(t => ({ key: t.id, date: t.test_date, label: t.name, value: timeUsed(t) }))} unit="%" percentAxis label="Time used by mock" /></Card>
    <Card title="Subject performance" description="Recorded subject marks only, weakest first. Tags do not imply scores."><Bars rows={analytics.subjects} unit="%" empty="Add subject score breakdowns to your mocks. Tags alone do not provide subject scores." /></Card>
  </div>;
}
