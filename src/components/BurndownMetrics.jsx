function formatPercent(value) {
  return `${Math.max(0, Math.min(100, value || 0))}%`;
}

function rateWidth(value, max) {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return '0%';
  return formatPercent((value / max) * 100);
}

export function BurndownMetrics({ model, captureRef, progressCaptureRef, view = 'sprintende' }) {
  if (!model) return null;

  const progressWidth = formatPercent(model.percent);
  const maxRate = Math.max(model.throughput.rate || 0, model.throughput.targetRate || 0, 1);
  const scope = model.scope === 'board' ? 'board' : 'selection';
  const kicker = scope === 'board' ? 'Board-Fortschritt' : 'Sprint-Fortschritt';
  const metricsAria =
    scope === 'board'
      ? 'Burndown-Fortschrittskennzahlen für das gesamte Board'
      : 'Burndown-Fortschrittskennzahlen für die gewählten Sprints';

  return (
    <section ref={captureRef} className="burndown-metrics" aria-label={metricsAria}>
      <div ref={progressCaptureRef} className="burndown-progress-panel">
        <div className="burndown-command-top">
          <div>
            <div className="burndown-kicker">{kicker}</div>
            <div className="burndown-command-title">{model.percent}% abgeschlossen</div>
          </div>
          <strong>{model.completedSP} SP</strong>
        </div>

        <div className="burndown-command-track" aria-label={`${model.percent}% der Story Points abgeschlossen`}>
          <span style={{ width: progressWidth }} />
        </div>

        <div className="burndown-command-scale">
          <span>0</span>
          <span>{model.totalSP / 2} SP</span>
          <span>{model.totalSP} SP</span>
        </div>

        <div className="burndown-progress-anchors">
          <div>
            <span>Gesamtumfang</span>
            <strong>{model.totalSP} SP</strong>
            <small>{model.totalIssues} {model.totalIssues === 1 ? 'Vorgang' : 'Vorgänge'}</small>
          </div>
          <div>
            <span>Restarbeit</span>
            <strong>{model.remainingSP} SP</strong>
            <small>{model.remainingIssues} {model.remainingIssues === 1 ? 'Vorgang offen' : 'Vorgänge offen'}</small>
          </div>
        </div>
      </div>

      {view === 'sprintende' && (
        <>
          <MetricPanel label="Durchsatz" className="burndown-throughput-panel">
            <div className="burndown-panel-value">{model.throughput.rateLabel}</div>
            <div className="burndown-panel-unit">{model.throughput.unit}</div>
            <div className="burndown-rate-stack" aria-label="Durchsatz gegen erforderliches Tempo">
              <RateBar
                label="Ist"
                value={model.throughput.rateLabel}
                width={rateWidth(model.throughput.rate, maxRate)}
              />
              <RateBar
                label="Soll"
                value={model.throughput.targetLabel}
                width={rateWidth(model.throughput.targetRate, maxRate)}
                muted
              />
            </div>
            <div className="burndown-panel-note">{model.throughput.deltaLabel || model.throughput.detail}</div>
          </MetricPanel>

          <MetricPanel label="Tempo" className={`burndown-forecast-panel burndown-forecast-${model.forecast.tone}`}>
            <div className="burndown-panel-value burndown-forecast-buffer" data-kind={model.forecast.bufferLabel.length > 12 ? 'text' : 'number'}>
              {model.forecast.bufferLabel}
            </div>
            <div className="burndown-command-status burndown-forecast-status">
              <strong>{model.forecast.stateLabel}</strong>
              {model.forecast.secondaryLabel ? <span>{model.forecast.secondaryLabel}</span> : null}
            </div>
            <div className="burndown-panel-note">{model.forecast.detail}</div>
          </MetricPanel>
        </>
      )}
    </section>
  );
}

function MetricPanel({ label, className, children }) {
  return (
    <div className={`burndown-panel ${className}`}>
      <div className="burndown-tile-label">{label}</div>
      {children}
    </div>
  );
}

function RateBar({ label, value, width, muted = false }) {
  return (
    <div className="burndown-rate-bar">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div className="burndown-rate-track">
        <span className={muted ? 'muted' : ''} style={{ width }} />
      </div>
    </div>
  );
}
