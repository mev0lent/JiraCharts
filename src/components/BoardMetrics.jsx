import { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import { appFonts, cssVar } from '../lib/theme.js';

export function BoardMetrics({ model, captureRef }) {
  if (!model) return null;

  const donutCanvasRef = useRef(null);
  const lineCanvasRef = useRef(null);
  const donutChartRef = useRef(null);
  const lineChartRef = useRef(null);

  useEffect(() => {
    if (!donutCanvasRef.current) return undefined;

    const palette = {
      done: cssVar('--accent'),
      inProgress: cssVar('--brand'),
      todo: cssVar('--todo'),
      text: cssVar('--text'),
      muted: cssVar('--muted'),
      tooltipBg: cssVar('--chart-tooltip-bg'),
      tooltipBorder: cssVar('--chart-tooltip-border'),
      tooltipBody: cssVar('--chart-tooltip-body'),
    };
    const fonts = appFonts();

    const centerTextPlugin = {
      id: 'centerText',
      afterDraw(chart) {
        const { ctx, chartArea: { top, bottom, left, right } } = chart;
        const cx = (left + right) / 2;
        const cy = (top + bottom) / 2;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `bold 26px ${fonts.sans}`;
        ctx.fillStyle = palette.text;
        ctx.fillText(`${model.percent}%`, cx, cy);
        ctx.restore();
      },
    };

    donutChartRef.current?.destroy();
    donutChartRef.current = new Chart(donutCanvasRef.current.getContext('2d'), {
      type: 'doughnut',
      plugins: [centerTextPlugin],
      data: {
        labels: ['Erledigt', 'In Arbeit', 'Offen'],
        datasets: [{
          data: [model.completedIssues, model.inProgressIssues, model.todoIssues],
          backgroundColor: [palette.done, palette.inProgress, palette.todo],
          borderWidth: 0,
          hoverOffset: 4,
        }],
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: true,
        cutout: '72%',
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: palette.tooltipBg,
            borderColor: palette.tooltipBorder,
            borderWidth: 1,
            bodyColor: palette.tooltipBody,
            bodyFont: { family: fonts.mono, size: 12 },
            callbacks: {
              label: ctx => ` ${ctx.parsed} Tasks`,
            },
          },
        },
      },
    });

    donutChartRef.current.resize();
    donutChartRef.current.update('none');

    return () => {
      donutChartRef.current?.destroy();
      donutChartRef.current = null;
    };
  }, [model.completedIssues, model.inProgressIssues, model.todoIssues, model.percent]);

  useEffect(() => {
    if (!lineCanvasRef.current || !model.sprintCumulative?.length) return undefined;

    const palette = {
      actual: cssVar('--chart-actual'),
      actualFill: cssVar('--chart-actual-fill'),
      target: cssVar('--chart-ideal'),
      scopeSize: cssVar('--chart-scope-size'),
      grid: cssVar('--chart-grid'),
      axis: cssVar('--muted'),
      tooltipBg: cssVar('--chart-tooltip-bg'),
      tooltipBorder: cssVar('--chart-tooltip-border'),
      tooltipBody: cssVar('--chart-tooltip-body'),
    };
    const fonts = appFonts();

    const labels = model.sprintCumulative.map(s =>
      s.name.length > 14 ? `${s.name.slice(0, 13)}…` : s.name
    );
    const cumData = model.sprintCumulative.map(s => s.cumCompleted);
    const totalLine = model.sprintCumulative.map(() => model.totalIssues);
    const scopeSizeLine = model.sprintCumulative.map(s => s.scopeSize);
    const datasets = [
      {
        label: 'Gesamt',
        data: totalLine,
        borderColor: palette.target,
        borderDash: [6, 4],
        borderWidth: 1.5,
        pointRadius: 0,
        fill: false,
        tension: 0,
      },
      ...(model.showScopeSizeLine ? [{
        label: 'Umfang',
        data: scopeSizeLine,
        borderColor: palette.scopeSize,
        borderWidth: 2,
        pointRadius: 2,
        pointBackgroundColor: palette.scopeSize,
        fill: false,
        tension: 0.1,
      }] : []),
      {
        label: 'Erledigt',
        data: cumData,
        borderColor: palette.actual,
        backgroundColor: palette.actualFill,
        borderWidth: 2,
        pointRadius: 3,
        pointBackgroundColor: palette.actual,
        fill: true,
        tension: 0.1,
      },
    ];

    lineChartRef.current?.destroy();
    lineChartRef.current = new Chart(lineCanvasRef.current.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets,
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: palette.tooltipBg,
            borderColor: palette.tooltipBorder,
            borderWidth: 1,
            bodyColor: palette.tooltipBody,
            bodyFont: { family: fonts.mono, size: 12 },
            callbacks: {
              label: ctx => {
                const suffix = {
                  Erledigt: 'erledigt',
                  Umfang: 'im Umfang',
                  Gesamt: 'gesamt',
                }[ctx.dataset.label] || '';
                return ` ${ctx.parsed.y} Tasks ${suffix}`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { color: palette.grid },
            ticks: {
              color: palette.axis,
              font: { family: fonts.mono, size: 10 },
              maxRotation: 35,
            },
          },
          y: {
            beginAtZero: true,
            grid: { color: palette.grid },
            ticks: {
              color: palette.axis,
              font: { family: fonts.mono, size: 10 },
              precision: 0,
            },
            title: {
              display: true,
              text: 'Tasks',
              color: palette.axis,
              font: { family: fonts.mono, size: 10 },
            },
          },
        },
      },
    });

    lineChartRef.current.resize();
    lineChartRef.current.update('none');

    return () => {
      lineChartRef.current?.destroy();
      lineChartRef.current = null;
    };
  }, [model.sprintCumulative, model.totalIssues, model.showScopeSizeLine]);

  return (
    <section ref={captureRef} className="board-metrics" aria-label="Board-Fortschrittskennzahlen">
      <div className="board-metrics-main">
        <div className="board-donut-panel">
          <div className="board-panel-label">Fortschritt</div>
          <div className="board-donut-chart">
            <canvas
              ref={donutCanvasRef}
              role="img"
              aria-label={`${model.percent}% der Tasks erledigt`}
            />
          </div>
          <div className="board-donut-legend">
            <span>
              <span className="board-legend-dot" style={{ background: 'var(--accent)' }} />
              Erledigt <strong>{model.completedIssues}</strong>
            </span>
            <span>
              <span className="board-legend-dot" style={{ background: 'var(--brand)' }} />
              In Arbeit <strong>{model.inProgressIssues}</strong>
            </span>
            <span>
              <span className="board-legend-dot" style={{ background: 'var(--todo)' }} />
              Offen <strong>{model.todoIssues}</strong>
            </span>
          </div>
        </div>

        <div className="board-cumulative-panel">
          <div className="board-cumulative-header">
            <div className="board-panel-label">Kumulativer Fortschritt</div>
            <div className="board-cumulative-legend">
              <span>
                <span
                  className="board-legend-line board-legend-line--dashed"
                  style={{ background: 'var(--chart-ideal)' }}
                />
                Gesamt
              </span>
              {model.showScopeSizeLine ? (
                <span>
                  <span className="board-legend-line" style={{ background: 'var(--chart-scope-size)' }} />
                  Umfang
                </span>
              ) : null}
              <span>
                <span className="board-legend-line" style={{ background: 'var(--chart-actual)' }} />
                Erledigt
              </span>
            </div>
          </div>
          {model.sprintCumulative?.length ? (
            <div className="board-cumulative-chart">
              <canvas
                ref={lineCanvasRef}
                role="img"
                aria-label={
                  model.showScopeSizeLine
                    ? 'Kumulativer Fortschritt und Umfang über alle Sprints'
                    : 'Kumulativer Fortschritt über alle Sprints'
                }
              />
            </div>
          ) : (
            <div className="board-cumulative-empty">Keine Sprint-Termine vorhanden</div>
          )}
        </div>
      </div>
    </section>
  );
}
