/* JiraCharts – runtime theme applicator
   Loaded as a plain <script> before the React bundle.
   Reads window.__JIRA_CONFIG__.theme and applies fonts + CSS vars. */

(function () {
  // ── Color utilities ──────────────────────────────────────────────

  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h, s, l = (max + min) / 2;
    if (max === min) {
      h = s = 0;
    } else {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    return [h * 360, s * 100, l * 100];
  }

  function hslToRgb(h, s, l) {
    s /= 100; l /= 100; h /= 360;
    if (s === 0) { var v = Math.round(l * 255); return [v, v, v]; }
    function hue(p, q, t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return [hue(p, q, h + 1/3) * 255, hue(p, q, h) * 255, hue(p, q, h - 1/3) * 255];
  }

  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(function (v) {
      return Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
    }).join('');
  }

  function mix(a, b, w) { // w = weight of a (0–1)
    return [a[0] * w + b[0] * (1 - w), a[1] * w + b[1] * (1 - w), a[2] * w + b[2] * (1 - w)];
  }

  function scaleHsl(hsl, lFactor, sFactor) { // factors: negative = scale towards 0, positive = towards 100
    var h = hsl[0], s = hsl[1], l = hsl[2];
    l = lFactor < 0 ? l * (1 + lFactor) : l + (100 - l) * lFactor;
    s = sFactor < 0 ? s * (1 + sFactor) : s + (100 - s) * sFactor;
    return [h, Math.max(0, Math.min(100, s)), Math.max(0, Math.min(100, l))];
  }

  function rgba(rgb, a) {
    return 'rgba(' + Math.round(rgb[0]) + ',' + Math.round(rgb[1]) + ',' + Math.round(rgb[2]) + ',' + a + ')';
  }

  // ── Palette derivation ───────────────────────────────────────────
  // Mirrors burndown-colors.scss exactly using the four base variables.

  function colorPalette(colors) {
    var brandRgb = hexToRgb(colors.brand);
    var paperRgb = hexToRgb(colors.paper);
    var inkRgb   = hexToRgb(colors.ink);
    var earthRgb = hexToRgb(colors.earth);
    var earthHsl = rgbToHsl(earthRgb[0], earthRgb[1], earthRgb[2]);

    var success = [52, 144, 40];
    var danger  = [134, 34, 34];

    var surfaceRaisedRgb = mix(paperRgb, earthRgb, 0.90);
    var chromeRgb        = mix(brandRgb, earthRgb, 0.52);
    var accentStrongRgb  = hslToRgb.apply(null, scaleHsl(earthHsl, 0.12, 0.03));
    var mutedRgb         = hslToRgb.apply(null, scaleHsl(earthHsl, 0.08, -0.45));
    var todoHsl          = scaleHsl(earthHsl, 0.14, -0.55);
    var todoRgb          = hslToRgb.apply(null, todoHsl);
    var todoChartHsl     = scaleHsl(todoHsl, 0.08, 0.04);
    var todoChartRgb     = hslToRgb.apply(null, todoChartHsl);
    var warnRgb          = hslToRgb.apply(null, scaleHsl(earthHsl, 0.08, -0.10));

    var accentRgb        = colors.accent ? hexToRgb(colors.accent) : earthRgb;
    var accent2Rgb       = colors.accent2 ? hexToRgb(colors.accent2) : accentStrongRgb;
    var chartActualRgb   = colors.chartActual ? hexToRgb(colors.chartActual) : brandRgb;
    var chartIdealRgb    = colors.chartIdeal ? hexToRgb(colors.chartIdeal) : todoChartRgb;
    var chartScopeRgb    = colors.chartScopeSize ? hexToRgb(colors.chartScopeSize) : mix(success, earthRgb, 0.58);
    var workflowTodoRgb  = colors.todo ? hexToRgb(colors.todo) : todoRgb;
    var progressRgb      = colors.progress ? hexToRgb(colors.progress) : brandRgb;
    var doneRgb          = colors.done ? hexToRgb(colors.done) : accentRgb;
    var buttonTextRgb    = mix(paperRgb, accentRgb, 0.82);

    var h = rgbToHex;
    return {
      '--bg':                         h.apply(null, mix(paperRgb, earthRgb, 0.94)),
      '--surface':                    colors.paper,
      '--surface2':                   h.apply(null, surfaceRaisedRgb),
      '--surface3':                   h.apply(null, mix(surfaceRaisedRgb, brandRgb, 0.82)),
      '--border':                     rgba(earthRgb, 0.14),
      '--border2':                    rgba(earthRgb, 0.22),
      '--text':                       colors.ink,
      '--muted':                      h.apply(null, mutedRgb),
      '--accent':                     h.apply(null, accentRgb),
      '--accent2':                    h.apply(null, accent2Rgb),
      '--brand':                      colors.brand,
      '--brand-soft':                 rgba(brandRgb, 0.22),
      '--danger':                     '#862222',
      '--success':                    '#349028',
      '--warn':                       h.apply(null, warnRgb),
      '--todo':                       h.apply(null, workflowTodoRgb),
      '--progress':                   h.apply(null, progressRgb),
      '--done':                       h.apply(null, doneRgb),
      '--button-text':                h.apply(null, buttonTextRgb),
      '--status-info-bg':             rgba(progressRgb, 0.18),
      '--status-info-border':         rgba(earthRgb, 0.24),
      '--status-error-bg':            rgba(danger, 0.10),
      '--status-error-border':        rgba(danger, 0.20),
      '--state-active-bg':            rgba(doneRgb, 0.18),
      '--state-closed-bg':            rgba(workflowTodoRgb, 0.15),
      '--state-future-bg':            rgba(success, 0.12),
      '--state-backlog-bg':           rgba(warnRgb, 0.13),
      '--hover-overlay':              rgba(accentRgb, 0.16),
      '--chart-grid':                 rgba(chromeRgb, 0.10),
      '--chart-tooltip-bg':           colors.paper,
      '--chart-tooltip-border':       rgba(chromeRgb, 0.22),
      '--chart-tooltip-title':        h.apply(null, mix(inkRgb, workflowTodoRgb, 0.25)),
      '--chart-tooltip-body':         colors.ink,
      '--chart-ideal':                h.apply(null, chartIdealRgb),
      '--chart-actual':               h.apply(null, chartActualRgb),
      '--chart-actual-fill':          rgba(chartActualRgb, 0.18),
      '--chart-scope-size':           h.apply(null, chartScopeRgb),
      '--chart-boundary':             rgba(chromeRgb, 0.24),
      '--chart-boundary-label':       rgba(inkRgb, 0.58),
      '--metric-topline':             rgba(mix(paperRgb, accentRgb, 0.82), 0.72),
      '--metric-shadow':              rgba(chromeRgb, 0.10),
      '--metric-chip-bg':             rgba(accentRgb, 0.18),
      '--metric-chip-border':         rgba(chromeRgb, 0.18),
      '--metric-chip-text':           h.apply(null, mix(chromeRgb, inkRgb, 0.78)),
      '--metric-neutral-orb':         rgba(workflowTodoRgb, 0.13),
      '--metric-info-orb':            rgba(progressRgb, 0.18),
      '--metric-accent-orb':          rgba(accentRgb, 0.28),
      '--metric-success-orb':         rgba(success, 0.14),
      '--burndown-progress-glow':     rgba(accentRgb, 0.22),
      '--burndown-forecast-good-border': rgba(success, 0.30),
      '--burndown-forecast-risk-border': rgba(danger, 0.28),
    };
  }

  // ── Font pairings ────────────────────────────────────────────────

  var FONT_PAIRINGS = {
    'manrope': {
      sans: "'Manrope', sans-serif",
      mono: "'JetBrains Mono', monospace",
      googleUrl: 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;700;800&family=JetBrains+Mono:wght@300;400;500&display=swap',
    },
    'space-grotesk': {
      sans: "'Space Grotesk', sans-serif",
      mono: "'Space Mono', monospace",
      googleUrl: 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=Space+Mono:wght@400;700&display=swap',
    },
    'fraunces': {
      sans: "'Fraunces', serif",
      mono: "'IBM Plex Mono', monospace",
      googleUrl: 'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;1,9..144,400&family=IBM+Plex+Mono:wght@400;500;700&display=swap',
    },
    'bricolage': {
      sans: "'Bricolage Grotesque', sans-serif",
      mono: "'Azeret Mono', monospace",
      googleUrl: 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,700;12..96,800&family=Azeret+Mono:wght@300;400;500&display=swap',
    },
  };

  // ── Apply theme ──────────────────────────────────────────────────

  function applyJiraTheme(theme) {
    if (!theme) return;

    var pairing = FONT_PAIRINGS[theme.font];
    if (pairing) {
      // Inject Google Fonts link if not already present
      var linkId = 'jira-theme-font';
      var existing = document.getElementById(linkId);
      if (!existing || existing.href !== pairing.googleUrl) {
        if (existing) existing.remove();
        var link = document.createElement('link');
        link.id = linkId;
        link.rel = 'stylesheet';
        link.href = pairing.googleUrl;
        document.head.appendChild(link);
      }
      document.documentElement.style.setProperty('--sans', pairing.sans);
      document.documentElement.style.setProperty('--mono', pairing.mono);
    }

    var colors = {
      brand:          theme.brand || '#8095EF',
      paper:          theme.paper || '#fffdf2',
      ink:            theme.ink   || '#100e0e',
      earth:          theme.earth || '#6171b6',
      accent:         theme.accent,
      accent2:        theme.accent2,
      chartActual:    theme.chartActual,
      chartIdeal:     theme.chartIdeal,
      chartScopeSize: theme.chartScopeSize,
      todo:           theme.todo,
      progress:       theme.progress,
      done:           theme.done,
    };
    var vars = colorPalette(colors);
    for (var k in vars) {
      document.documentElement.style.setProperty(k, vars[k]);
    }
  }

  // Auto-apply on load
  var cfg = window.__JIRA_CONFIG__;
  if (cfg && cfg.theme) applyJiraTheme(cfg.theme);

  // Expose globally for dynamic use
  window.applyJiraTheme = applyJiraTheme;
  window.__JIRA_COLOR_PALETTE__ = colorPalette;
  window.__JIRA_FONT_PAIRINGS__ = FONT_PAIRINGS;
})();
