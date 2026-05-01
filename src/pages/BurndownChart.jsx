import { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const chartAriaByScope = {
  selection: 'Sprint-Burndown: ideale und tatsächliche verbleibende Story Points pro Tag.',
  board: 'Board-Burndown: ideale und tatsächliche verbleibende Story Points pro Tag über alle Sprints.',
};

export function BurndownChart({ state, onResizeReady, scope = 'selection' }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!state || !canvasRef.current) return undefined;

    const palette = {
      ideal: cssVar('--chart-ideal'),
      actual: cssVar('--chart-actual'),
      actualFill: cssVar('--chart-actual-fill'),
      grid: cssVar('--chart-grid'),
      tooltipBg: cssVar('--chart-tooltip-bg'),
      tooltipBorder: cssVar('--chart-tooltip-border'),
      tooltipTitle: cssVar('--chart-tooltip-title'),
      tooltipBody: cssVar('--chart-tooltip-body'),
      boundary: cssVar('--chart-boundary'),
      boundaryLabel: cssVar('--chart-boundary-label'),
      axis: cssVar('--muted'),
    };

    const boundaryPlugin = {
      id: 'sprintBoundaries',
      afterDraw(chart) {
        if (!state.boundaries.length) return;
        const { ctx, chartArea: ca, scales } = chart;
        state.boundaries.forEach(({ idx, name }) => {
          const x = scales.x.getPixelForValue(idx);
          if (!x || x < ca.left || x > ca.right) return;
          ctx.save();
          ctx.setLineDash([4, 3]);
          ctx.strokeStyle = palette.boundary;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, ca.top);
          ctx.lineTo(x, ca.bottom);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = palette.boundaryLabel;
          ctx.font = '9px DM Mono, monospace';
          ctx.textAlign = 'center';
          ctx.fillText(name.length > 14 ? `${name.slice(0, 13)}...` : name, x, ca.top + 10);
          ctx.restore();
        });
      },
    };

    chartRef.current?.destroy();
    chartRef.current = new Chart(canvasRef.current.getContext('2d'), {
      type: 'line',
      plugins: [boundaryPlugin],
      data: {
        labels: state.labels,
        datasets: [
          {
            label: 'Ideal',
            data: state.ideal,
            borderColor: palette.ideal,
            borderDash: [6, 4],
            borderWidth: 1.5,
            pointRadius: 0,
            tension: 0,
            fill: false,
          },
          {
            label: 'Ist',
            data: state.actual,
            borderColor: palette.actual,
            backgroundColor: palette.actualFill,
            borderWidth: 2,
            pointRadius: 3,
            pointBackgroundColor: palette.actual,
            fill: true,
            tension: 0.1,
          },
        ],
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            mode: 'index',
            intersect: false,
            backgroundColor: palette.tooltipBg,
            borderColor: palette.tooltipBorder,
            borderWidth: 1,
            titleColor: palette.tooltipTitle,
            bodyColor: palette.tooltipBody,
            titleFont: { family: 'DM Mono', size: 11 },
            bodyFont: { family: 'DM Mono', size: 12 },
          },
        },
        scales: {
          x: {
            grid: { color: palette.grid },
            ticks: {
              color: palette.axis,
              font: { family: 'DM Mono', size: 10 },
              maxRotation: 45,
              autoSkip: true,
              maxTicksLimit: 20,
            },
          },
          y: {
            beginAtZero: true,
            grid: { color: palette.grid },
            ticks: { color: palette.axis, font: { family: 'DM Mono', size: 10 } },
            title: {
              display: true,
              text: 'Verbleibende Story Points',
              color: palette.axis,
              font: { family: 'DM Mono', size: 10 },
            },
          },
        },
      },
    });

    chartRef.current.resize();
    chartRef.current.update('none');
    onResizeReady?.(() => chartRef.current?.resize());

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [state, onResizeReady]);

  const ariaLabel = chartAriaByScope[scope === 'board' ? 'board' : 'selection'];

  return <canvas ref={canvasRef} role="img" aria-label={ariaLabel} />;
}
