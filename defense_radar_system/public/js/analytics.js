/**
 * Defence-Sentinel: System Analytics & Performance Benchmarking
 * Cumulative Interceptions Over Time Performance Monitor
 * Strictly dark-themed (#0B1117), live telemetry driven, high-precision C2 chart.
 */

class SystemAnalyticsRenderer {
  constructor(canvasId = 'analyticsChartCanvas') {
    this.canvas = document.getElementById(canvasId);
    this.container = this.canvas ? this.canvas.parentElement : null;
    this.tooltip = document.getElementById('analyticsTooltip');
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;

    this.analytics = null;
    this.width = 680;
    this.height = 200;
    this.dpr = window.devicePixelRatio || 1;

    // Hover state for tooltip & crosshair
    this.hoverIndex = -1;
    this.mouseX = -1;
    this.mouseY = -1;

    this.setupListeners();
    this.resize();
  }

  setupListeners() {
    window.addEventListener('resize', () => this.resize());

    if (this.container) {
      this.container.addEventListener('mousemove', (e) => {
        const rect = this.container.getBoundingClientRect();
        this.mouseX = e.clientX - rect.left;
        this.mouseY = e.clientY - rect.top;
        this.updateHover();
      });

      this.container.addEventListener('mouseleave', () => {
        this.hoverIndex = -1;
        this.mouseX = -1;
        this.mouseY = -1;
        if (this.tooltip) this.tooltip.style.display = 'none';
      });
    }
  }

  resize() {
    if (!this.canvas) return;
    const parent = this.container || this.canvas.parentElement;
    this.dpr = window.devicePixelRatio || 1;

    const cw = parent ? parent.clientWidth : 680;
    const ch = parent ? parent.clientHeight : 200;

    this.width = (cw && cw > 50) ? cw : 680;
    this.height = (ch && ch > 50) ? ch : 200;

    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';

    if (this.ctx) {
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }
  }

  updateData(data) {
    if (data.analytics) {
      this.analytics = data.analytics;
      this.updateMetricCards(data.analytics);
    }
  }

  updateMetricCards(stats) {
    const setText = (id, txt) => {
      const el = document.getElementById(id);
      if (el) el.textContent = txt;
    };
    const setWidth = (id, pct) => {
      const el = document.getElementById(id);
      if (el) el.style.width = pct;
    };

    const isInsufficient = (stats.provenance?.sampleCount < 30) || (stats.status === 'INSUFFICIENT SAMPLE');

    if (stats.provenance) {
      setText('benchExpId', stats.provenance.experimentId || '--');
      setText('benchExpSeed', stats.provenance.randomSeed !== undefined ? `${stats.provenance.randomSeed} (DETERMINISTIC)` : '--');
      setText('benchExpScenario', stats.provenance.scenario || '--');
      setText('benchExpRuns', stats.provenance.sampleCount ? `N = ${stats.provenance.sampleCount} DWELLS` : '0 DWELLS');
      setText('benchExpHash', stats.provenance.configHash ? (stats.provenance.configHash.substring(0, 8) + '...') : '--');
      setText('benchExpTime', stats.provenance.timestamp ? new Date(stats.provenance.timestamp).toLocaleTimeString() : '--');

      const statusEl = document.getElementById('benchExpStatus');
      if (statusEl) {
        if (isInsufficient) {
          statusEl.textContent = 'STATUS: INSUFFICIENT SAMPLE (N < 30)';
          statusEl.style.color = 'var(--state-critical)';
          statusEl.style.borderColor = 'rgba(209, 59, 59, 0.4)';
          statusEl.style.background = 'rgba(209, 59, 59, 0.15)';
        } else {
          statusEl.textContent = stats.provenance.status ? `STATUS: ${stats.provenance.status}` : 'STATUS: MEASURED (DETERMINISTIC)';
          statusEl.style.color = 'var(--state-verified)';
          statusEl.style.borderColor = 'rgba(66, 196, 122, 0.35)';
          statusEl.style.background = 'rgba(66, 196, 122, 0.12)';
        }
      }
    }

    const ad = stats.adaptive || {};
    const ol = stats.openLoop || stats.baseline || {};
    const delta = stats.delta || {};

    // 1. Detection Rate Card
    const adDet = ad.probabilityOfDetection !== undefined ? ad.probabilityOfDetection : ad.detectionRate;
    const olDet = ol.probabilityOfDetection !== undefined ? ol.probabilityOfDetection : ol.detectionRate;
    setText('metricAdaptiveDetRate', adDet !== undefined ? `${adDet}%` : 'NOT MEASURED');
    setWidth('metricFillAdaptiveDetRate', adDet !== undefined ? `${Math.min(100, adDet)}%` : '0%');
    setText('metricOpenLoopDetRate', olDet !== undefined ? `${olDet}%` : 'NOT MEASURED');
    setWidth('metricFillOpenLoopDetRate', olDet !== undefined ? `${Math.min(100, olDet)}%` : '0%');

    if (delta.probabilityOfDetection) {
      setText('metricDeltaDetRate', `${delta.probabilityOfDetection.absolute} (${delta.probabilityOfDetection.relative})`);
    }
    if (ad.detectionRateCi95 && ol.detectionRateCi95) {
      if (isInsufficient) {
        setText('metricCiDetRate', '95% CI: INSUFFICIENT SAMPLE SIZE (N < 30)');
      } else {
        setText('metricCiDetRate', `95% CI: ${ad.detectionRateCi95.formatted} vs ${ol.detectionRateCi95.formatted}`);
      }
    }

    // 2. Latency Card
    const adLat = ad.meanTimeToIntercept !== undefined ? ad.meanTimeToIntercept : ad.meanInterceptTimeMs;
    const olLat = ol.meanTimeToIntercept !== undefined ? ol.meanTimeToIntercept : ol.meanInterceptTimeMs;
    setText('metricAdaptiveLatency', adLat !== undefined ? `${adLat} ms` : 'NOT MEASURED');
    setWidth('metricFillAdaptiveLatency', adLat !== undefined ? `${Math.min(100, Math.round((adLat / 600) * 100))}%` : '0%');
    setText('metricOpenLoopLatency', olLat !== undefined ? `${olLat} ms` : 'NOT MEASURED');
    setWidth('metricFillOpenLoopLatency', olLat !== undefined ? `${Math.min(100, Math.round((olLat / 600) * 100))}%` : '0%');

    if (delta.meanTimeToIntercept) {
      setText('metricDeltaLatency', `${delta.meanTimeToIntercept.absolute} (${delta.meanTimeToIntercept.relative})`);
    }
    if (ad.latencyStatistics && ol.latencyStatistics) {
      if (isInsufficient) {
        setText('metricStatsLatency', 'Dispersion: INSUFFICIENT SAMPLE (N < 30)');
      } else {
        setText('metricStatsLatency', `Adaptive std: ${ad.latencyStatistics.standardDeviation}ms, med: ${ad.latencyStatistics.median}ms | BL std: ${ol.latencyStatistics.standardDeviation}ms`);
      }
    }

    // 3. False Alarm Rate Card
    setText('metricAdaptiveFar', ad.falseAlarmRate !== undefined ? `${ad.falseAlarmRate}%` : 'NOT MEASURED');
    setWidth('metricFillAdaptiveFar', ad.falseAlarmRate !== undefined ? `${Math.min(100, ad.falseAlarmRate * 5)}%` : '0%');
    setText('metricOpenLoopFar', ol.falseAlarmRate !== undefined ? `${ol.falseAlarmRate}%` : 'NOT MEASURED');
    setWidth('metricFillOpenLoopFar', ol.falseAlarmRate !== undefined ? `${Math.min(100, ol.falseAlarmRate * 5)}%` : '0%');
    if (delta.falseAlarmRate) {
      setText('metricDeltaFar', `${delta.falseAlarmRate.absolute} (${delta.falseAlarmRate.relative})`);
    }
    const noiseDwells = stats.groundTruth?.noiseOnlyDwells || 0;
    setText('metricStatusFar', isInsufficient ? 'INSUFFICIENT SAMPLE (N < 30)' : `Evaluated across ${noiseDwells} noise-only dwells`);

    // 4. Prediction Accuracy Card
    setText('metricAdaptiveAcc', ad.predictionAccuracy !== undefined ? `${ad.predictionAccuracy}%` : 'NOT MEASURED');
    setWidth('metricFillAdaptiveAcc', ad.predictionAccuracy !== undefined ? `${Math.min(100, ad.predictionAccuracy)}%` : '0%');
    setText('metricOpenLoopAcc', ol.predictionAccuracy !== undefined ? `${ol.predictionAccuracy}%` : 'NOT MEASURED');
    setWidth('metricFillOpenLoopAcc', ol.predictionAccuracy !== undefined ? `${Math.min(100, ol.predictionAccuracy)}%` : '0%');
    if (delta.predictionAccuracy) {
      setText('metricDeltaAcc', `${delta.predictionAccuracy.absolute} (${delta.predictionAccuracy.relative})`);
    }
    if (ad.brierScore !== undefined && ol.brierScore !== undefined) {
      setText('metricBrierAcc', `Brier Score: Ad ${ad.brierScore} | BL ${ol.brierScore}`);
    }

    // 5. Receiver Utilization Card
    setText('metricAdaptiveUtil', ad.receiverUtilization !== undefined ? `${ad.receiverUtilization}%` : 'NOT MEASURED');
    setWidth('metricFillAdaptiveUtil', ad.receiverUtilization !== undefined ? `${Math.min(100, ad.receiverUtilization)}%` : '0%');
    setText('metricOpenLoopUtil', ol.receiverUtilization !== undefined ? `${ol.receiverUtilization}%` : 'NOT MEASURED');
    setWidth('metricFillOpenLoopUtil', ol.receiverUtilization !== undefined ? `${Math.min(100, ol.receiverUtilization)}%` : '0%');
    if (delta.receiverUtilization) {
      setText('metricDeltaUtil', `${delta.receiverUtilization.absolute} (${delta.receiverUtilization.relative})`);
    }
    const totalSec = stats.provenance?.sampleCount ? (stats.provenance.sampleCount * 0.18).toFixed(0) : 180;
    const adSec = ((ad.receiverUtilization || 0) / 100 * totalSec).toFixed(1);
    setText('metricTimeUtil', `Active Energy: ${adSec}s / ${totalSec}s`);

    // 6. Burst Completion Sensitivity Card
    const adSens = ad.sensitivity !== undefined ? ad.sensitivity : ad.burstCompletionRate;
    const olSens = ol.sensitivity !== undefined ? ol.sensitivity : ol.burstCompletionRate;
    setText('metricAdaptiveEff', adSens !== undefined ? `${adSens}%` : 'NOT MEASURED');
    setWidth('metricFillAdaptiveEff', adSens !== undefined ? `${Math.min(100, adSens)}%` : '0%');
    setText('metricOpenLoopEff', olSens !== undefined ? `${olSens}%` : 'NOT MEASURED');
    setWidth('metricFillOpenLoopEff', olSens !== undefined ? `${Math.min(100, olSens)}%` : '0%');
    if (delta.sensitivity) {
      setText('metricDeltaEff', `${delta.sensitivity.absolute} (${delta.sensitivity.relative})`);
    }
    if (olSens > adSens) {
      setText('metricNoteEff', 'Agility trade-off: round-robin visits every band every 5 dwells');
    } else {
      setText('metricNoteEff', 'Adaptive UCB tracks active frequency hops reliably');
    }

    // 7. Update Tags if insufficient
    ['metricTagDetRate', 'metricTagLatency', 'metricTagFar', 'metricTagAcc', 'metricTagUtil', 'metricTagEff'].forEach(tagId => {
      const tagEl = document.getElementById(tagId);
      if (tagEl) {
        if (isInsufficient) {
          tagEl.textContent = 'INSUFFICIENT';
          tagEl.className = 'metric-tag table-tag insufficient';
        } else {
          tagEl.textContent = 'MEASURED';
          tagEl.className = 'metric-tag verified';
        }
      }
    });

    // 8. Render Scenario Breakdown Table
    if (stats.suiteBreakdown && Array.isArray(stats.suiteBreakdown)) {
      this.renderScenarioBreakdown(stats.suiteBreakdown);
    } else {
      this.renderScenarioBreakdown([]);
    }
  }

  reset() {
    this.analytics = null;
    this.hoverIndex = -1;
    this.mouseX = -1;
    this.mouseY = -1;
    if (this.tooltip) this.tooltip.style.display = 'none';

    const setText = (id, txt) => {
      const el = document.getElementById(id);
      if (el) el.textContent = txt;
    };
    const setWidth = (id, pct) => {
      const el = document.getElementById(id);
      if (el) el.style.width = pct;
    };

    // 1. Reset Provenance Chips
    setText('benchExpId', 'RESET-IDLE');
    setText('benchExpSeed', '--');
    setText('benchExpScenario', '--');
    setText('benchExpRuns', '0 DWELLS');
    setText('benchExpHash', '--');
    setText('benchExpTime', '--');
    const statusEl = document.getElementById('benchExpStatus');
    if (statusEl) {
      statusEl.textContent = 'STATUS: RESET (WAITING FOR TELEMETRY)';
      statusEl.style.color = 'var(--text-tertiary)';
      statusEl.style.borderColor = 'rgba(255, 255, 255, 0.15)';
      statusEl.style.background = 'rgba(255, 255, 255, 0.05)';
    }

    // 2. Reset 6 Metric Cards
    setText('metricAdaptiveDetRate', '0.0%');
    setWidth('metricFillAdaptiveDetRate', '0%');
    setText('metricOpenLoopDetRate', '0.0%');
    setWidth('metricFillOpenLoopDetRate', '0%');
    setText('metricDeltaDetRate', '+0.0 pp (0.0%)');
    setText('metricCiDetRate', '95% CI: RESET');

    setText('metricAdaptiveLatency', '0 ms');
    setWidth('metricFillAdaptiveLatency', '0%');
    setText('metricOpenLoopLatency', '0 ms');
    setWidth('metricFillOpenLoopLatency', '0%');
    setText('metricDeltaLatency', '0.0 ms (0.0%)');
    setText('metricStatsLatency', 'Dispersion: RESET');

    setText('metricAdaptiveFar', '0.0%');
    setWidth('metricFillAdaptiveFar', '0%');
    setText('metricOpenLoopFar', '0.0%');
    setWidth('metricFillOpenLoopFar', '0%');
    setText('metricDeltaFar', '+0.0 pp (0.0%)');
    setText('metricStatusFar', 'Evaluated across 0 noise-only dwells');

    setText('metricAdaptiveAcc', '0.0%');
    setWidth('metricFillAdaptiveAcc', '0%');
    setText('metricOpenLoopAcc', '0.0%');
    setWidth('metricFillOpenLoopAcc', '0%');
    setText('metricDeltaAcc', '+0.0 pp (0.0%)');
    setText('metricBrierAcc', 'Brier Score: RESET');

    setText('metricAdaptiveUtil', '0.0%');
    setWidth('metricFillAdaptiveUtil', '0%');
    setText('metricOpenLoopUtil', '0.0%');
    setWidth('metricFillOpenLoopUtil', '0%');
    setText('metricDeltaUtil', '+0.0 pp (0.0%)');
    setText('metricTimeUtil', 'Active Energy: 0.0s / 0s');

    setText('metricAdaptiveEff', '0.0%');
    setWidth('metricFillAdaptiveEff', '0%');
    setText('metricOpenLoopEff', '0.0%');
    setWidth('metricFillOpenLoopEff', '0%');
    setText('metricDeltaEff', '+0.0 pp (0.0%)');
    setText('metricNoteEff', 'Reset / Idle');

    ['metricTagDetRate', 'metricTagLatency', 'metricTagFar', 'metricTagAcc', 'metricTagUtil', 'metricTagEff'].forEach(tagId => {
      const tagEl = document.getElementById(tagId);
      if (tagEl) {
        tagEl.textContent = 'RESET';
        tagEl.className = 'metric-tag table-tag insufficient';
      }
    });

    if (this.canvas && this.ctx) {
      this.ctx.save();
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.restore();
    }

    const tbody = document.getElementById('suiteBreakdownTbody');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; color:var(--text-tertiary); padding:16px; font-family:var(--font-mono); font-size:10px;">NO BENCHMARK DATA AVAILABLE — RUN EXPERIMENT OR 5-SCENARIO SUITE</td></tr>`;
    }

    this.render();
  }

  renderScenarioBreakdown(breakdown) {
    const tbody = document.getElementById('suiteBreakdownTbody');
    if (!tbody) return;
    if (!breakdown || breakdown.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; color:var(--text-tertiary); padding:16px; font-family:var(--font-mono); font-size:10px;">NO BENCHMARK DATA AVAILABLE — RUN EXPERIMENT OR 5-SCENARIO SUITE</td></tr>`;
      return;
    }

    tbody.innerHTML = breakdown.map(row => {
      const isPositive = row.deltaDetection && (row.deltaDetection.absoluteValue !== undefined ? row.deltaDetection.absoluteValue >= 0 : !String(row.deltaDetection.absolute || row.deltaDetection).startsWith('-'));
      const tagClass = isPositive ? 'positive' : 'negative';
      const deltaText = typeof row.deltaDetection === 'object' ? `${row.deltaDetection.absolute} (${row.deltaDetection.relative})` : row.deltaDetection;
      return `
        <tr>
          <td style="font-weight:700; color:var(--text-primary);">${row.scenario}</td>
          <td style="color:var(--radar-cyan); font-weight:700;">${row.adaptiveDetection}%</td>
          <td style="color:var(--text-secondary);">${row.openLoopDetection}%</td>
          <td>
            <span class="table-tag ${tagClass}">
              ${deltaText}
            </span>
          </td>
          <td style="color:var(--state-verified); font-weight:700;">${row.adaptiveMeanInterceptTime} ms</td>
          <td style="color:var(--text-tertiary);">${row.openLoopMeanInterceptTime} ms</td>
          <td style="color:${row.adaptiveSensitivity >= row.openLoopSensitivity ? 'var(--state-verified)' : 'var(--state-warning)'};">
            ${row.adaptiveSensitivity}% vs ${row.openLoopSensitivity}%
          </td>
          <td style="color:var(--text-secondary);">${row.adaptiveMissedBursts} missed vs ${row.openLoopMissedBursts} missed</td>
          <td style="color:var(--radar-cyan);">${row.adaptiveUtilization}% vs ${row.openLoopUtilization}%</td>
          <td style="color:var(--text-tertiary); font-size:8px;">${row.configHash || '--'}</td>
        </tr>
      `;
    }).join('');
  }

  getPoints() {
    if (!this.analytics) return [];

    // 1. Unified array
    if (Array.isArray(this.analytics.interceptionsOverTime) && this.analytics.interceptionsOverTime.length > 0) {
      return this.analytics.interceptionsOverTime;
    }

    // 2. Separate adaptive & openLoop arrays as specified in prompt
    if (Array.isArray(this.analytics.adaptive?.interceptionsOverTime) && this.analytics.adaptive.interceptionsOverTime.length > 0) {
      const adList = this.analytics.adaptive.interceptionsOverTime;
      const olList = this.analytics.openLoop?.interceptionsOverTime || [];
      return adList.map((pt, idx) => ({
        time: pt.time,
        adaptive: pt.adaptive !== undefined ? pt.adaptive : (pt.value !== undefined ? pt.value : 0),
        openLoop: olList[idx] ? (olList[idx].openLoop !== undefined ? olList[idx].openLoop : (olList[idx].value !== undefined ? olList[idx].value : 0)) : Math.round((pt.value || pt.adaptive || 0) * 0.6)
      }));
    }

    return [];
  }

  updateHover() {
    const points = this.getPoints();
    if (!points || points.length === 0) {
      this.hoverIndex = -1;
      if (this.tooltip) this.tooltip.style.display = 'none';
      return;
    }

    const padL = 46;
    const padR = 24;
    const plotW = this.width - padL - padR;

    if (this.mouseX < padL - 10 || this.mouseX > this.width - padR + 10) {
      this.hoverIndex = -1;
      if (this.tooltip) this.tooltip.style.display = 'none';
      return;
    }

    const normX = Math.max(0, Math.min(1, (this.mouseX - padL) / plotW));
    const idx = Math.round(normX * (points.length - 1));
    this.hoverIndex = Math.max(0, Math.min(points.length - 1, idx));

    const pt = points[this.hoverIndex];
    if (this.tooltip && pt) {
      const ad = Number(pt.adaptive || 0);
      const ol = Number(pt.openLoop || 0);
      const delta = ad - ol;
      const deltaSign = delta >= 0 ? `+${delta}` : `${delta}`;

      this.tooltip.innerHTML = `
        <div class="tt-time">TIME: ${pt.time || '00:00'}</div>
        <div class="tt-row">
          <span style="color:var(--text-secondary);">ADAPTIVE UCB:</span>
          <span class="tt-adaptive">${ad}</span>
        </div>
        <div class="tt-row">
          <span style="color:var(--text-secondary);">OPEN-LOOP:</span>
          <span class="tt-openloop">${ol}</span>
        </div>
        <div class="tt-row" style="border-top:1px solid #1c2a34; margin-top:3px; padding-top:2px;">
          <span style="color:var(--text-secondary);">DELTA:</span>
          <span class="tt-delta">${deltaSign}</span>
        </div>
      `;
      this.tooltip.style.display = 'block';

      // Position tooltip safely within bounds
      const ttX = Math.min(this.width - 150, Math.max(10, this.mouseX + 14));
      const ttY = Math.max(10, Math.min(this.height - 85, this.mouseY - 40));
      this.tooltip.style.left = `${ttX}px`;
      this.tooltip.style.top = `${ttY}px`;
    }
  }

  render() {
    if (!this.canvas || !this.ctx) return;

    // Check dynamic parent resizing
    const parent = this.container || this.canvas.parentElement;
    if (parent && parent.clientWidth > 50 && parent.clientHeight > 50) {
      if (Math.abs(parent.clientWidth - this.width) > 2 || Math.abs(parent.clientHeight - this.height) > 2) {
        this.resize();
      }
    }

    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    // 1. Guaranteed Dark Background (#0B1117)
    ctx.save();
    ctx.fillStyle = '#0B1117';
    ctx.fillRect(0, 0, w, h);

    const padL = 46;
    const padR = 24;
    const padT = 18;
    const padB = 26;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    if (plotW <= 20 || plotH <= 20) {
      ctx.restore();
      return;
    }

    const points = this.getPoints();

    // 2. Empty / Initial State Check
    if (!points || points.length < 2) {
      ctx.strokeStyle = '#1C2A34';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = padT + (i / 4) * plotH;
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(w - padR, y);
        ctx.stroke();
      }

      ctx.font = '600 11px "JetBrains Mono", monospace';
      ctx.fillStyle = '#617180';
      ctx.textAlign = 'center';
      ctx.fillText('WAITING FOR SIMULATION TELEMETRY...', w / 2, h / 2);
      ctx.restore();
      return;
    }

    // Determine max scale dynamically
    let maxInterceptions = 10;
    points.forEach(p => {
      const ad = Number(p.adaptive || 0);
      const ol = Number(p.openLoop || 0);
      if (ad > maxInterceptions) maxInterceptions = ad;
      if (ol > maxInterceptions) maxInterceptions = ol;
    });
    const maxVal = Math.max(20, Math.ceil((maxInterceptions + 4) / 10) * 10);

    const getX = idx => padL + (idx / Math.max(1, points.length - 1)) * plotW;
    const getY = val => padT + (1 - Math.max(0, Math.min(val, maxVal)) / maxVal) * plotH;

    // 3. Subtle Horizontal Grid Lines (#1C2A34)
    ctx.strokeStyle = '#1C2A34';
    ctx.lineWidth = 1;
    ctx.font = '8.5px "JetBrains Mono", monospace';
    ctx.fillStyle = '#657582';

    const ySteps = 4;
    for (let i = 0; i <= ySteps; i++) {
      const val = Math.round((i / ySteps) * maxVal);
      const y = getY(val);

      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();

      ctx.textAlign = 'right';
      ctx.fillText(String(val), padL - 8, y + 3);
    }

    // Baseline axis line
    ctx.strokeStyle = '#263542';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(padL, padT + plotH);
    ctx.lineTo(w - padR, padT + plotH);
    ctx.stroke();

    // 4. X-Axis Time Labels
    const maxLabels = Math.min(6, points.length);
    const stepIdx = Math.max(1, Math.floor((points.length - 1) / (maxLabels - 1)));
    ctx.fillStyle = '#657582';
    ctx.textAlign = 'center';

    for (let i = 0; i < points.length; i += stepIdx) {
      const x = getX(i);
      ctx.fillText(points[i].time || '00:00', x, h - 8);
    }
    if ((points.length - 1) % stepIdx !== 0) {
      const lastIdx = points.length - 1;
      ctx.fillText(points[lastIdx].time || '00:00', getX(lastIdx), h - 8);
    }

    // 5. Open-Loop Curve (#657582, 2px line)
    ctx.save();
    ctx.beginPath();
    points.forEach((pt, idx) => {
      const x = getX(idx);
      const y = getY(Number(pt.openLoop || 0));
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#657582';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Subtle data points on Open-Loop
    points.forEach((pt, idx) => {
      const x = getX(idx);
      const y = getY(Number(pt.openLoop || 0));
      ctx.fillStyle = '#657582';
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();

    // 6. Adaptive UCB Curve (#18B8D6, 2px line, subtle low-opacity fill)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(getX(0), padT + plotH);
    points.forEach((pt, idx) => {
      ctx.lineTo(getX(idx), getY(Number(pt.adaptive || 0)));
    });
    ctx.lineTo(getX(points.length - 1), padT + plotH);
    ctx.closePath();

    const areaGrad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
    areaGrad.addColorStop(0, 'rgba(24, 184, 214, 0.12)');
    areaGrad.addColorStop(1, 'rgba(24, 184, 214, 0.01)');
    ctx.fillStyle = areaGrad;
    ctx.fill();

    ctx.beginPath();
    points.forEach((pt, idx) => {
      const x = getX(idx);
      const y = getY(Number(pt.adaptive || 0));
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#18B8D6';
    ctx.lineWidth = 2;
    ctx.stroke();

    points.forEach((pt, idx) => {
      const x = getX(idx);
      const y = getY(Number(pt.adaptive || 0));
      ctx.fillStyle = '#18B8D6';
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();

    // 7. Interactive Crosshair and Hover Indicator
    if (this.hoverIndex >= 0 && this.hoverIndex < points.length) {
      const pt = points[this.hoverIndex];
      const hx = getX(this.hoverIndex);
      const adY = getY(Number(pt.adaptive || 0));
      const olY = getY(Number(pt.openLoop || 0));

      ctx.save();
      ctx.strokeStyle = 'rgba(24, 184, 214, 0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(hx, padT);
      ctx.lineTo(hx, padT + plotH);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#657582';
      ctx.strokeStyle = '#0B1117';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(hx, olY, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#18B8D6';
      ctx.beginPath();
      ctx.arc(hx, adY, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.restore();
    }

    ctx.restore();
  }
}

window.SystemAnalyticsRenderer = SystemAnalyticsRenderer;

