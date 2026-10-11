/**
 * Defence-Sentinel: Tactical Command & Situational Platform
 * Single Source of Truth: Synchronizes all 7 workspaces to master simulation entities
 */

class TacticalC2App {
  constructor() {
    this.ws = null;
    this.activeView = 'radar';

    this.radar = null;
    this.spectrum = null;
    this.camera = null;
    this.analytics = null;

    this.simState = null;
    this.entities = [];
    this.cameras = {};
    this.personnelDb = [];
    this.eventTimeline = [];
    this.rfEventTimeline = [];
    this.opticalEventTimeline = [];
    this.sosLogs = [];

    this.init();
  }

  init() {
    // Instantiate visualization sub-engines
    this.radar = new TacticalRadarScope('tacticalRadarCanvas');
    this.spectrum = new CompactSpectrumAnalyzer('rfDedicatedSpectrumCanvas');
    this.camera = new OpticalSurveillanceMonitor('cameraPageCanvas');
    this.analytics = new SystemAnalyticsRenderer('analyticsChartCanvas');

    this.setupPageRouting();
    this.setupListeners();
    this.connectWebSocket();
    this.startGlobalClock();

    // 60 FPS Render loop
    const render = () => {
      if (this.activeView === 'radar' && this.radar) {
        this.radar.render();
      } else if (this.activeView === 'rf' && this.spectrum) {
        this.spectrum.render();
      } else if (this.activeView === 'camera' && this.camera) {
        this.camera.render();
      } else if (this.activeView === 'analytics' && this.analytics) {
        this.analytics.render();
      }
      requestAnimationFrame(render);
    };
    requestAnimationFrame(render);
  }

  /* --------------------------------------------------------------------------
     1. GLOBAL PAGE ROUTING (7 DEDICATED WORKSPACES)
     -------------------------------------------------------------------------- */
  setupPageRouting() {
    const handleHash = () => {
      const hash = window.location.hash.replace('#', '').toLowerCase();
      const validPages = ['radar', 'rf', 'camera', 'fusion', 'scheduler', 'analytics', 'simulation'];
      if (validPages.includes(hash)) {
        this.switchPage(hash);
      }
    };

    window.addEventListener('hashchange', handleHash);

    document.querySelectorAll('.nav-tab-btn').forEach(btn => {
      btn.onclick = () => {
        const pageId = btn.getAttribute('data-view');
        window.location.hash = pageId;
        this.switchPage(pageId);
      };
    });

    if (window.location.hash) {
      handleHash();
    }
  }

  switchPage(pageId) {
    this.activeView = pageId;

    // 1. Update Navigation Tabs
    document.querySelectorAll('.nav-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-view') === pageId);
    });

    // 2. Switch Active Viewport
    document.querySelectorAll('.view-page').forEach(page => {
      page.classList.toggle('active', page.id === `view-${pageId}`);
    });

    // 3. Trigger immediate resize on target engine
    setTimeout(() => {
      if (pageId === 'radar' && this.radar) this.radar.resize();
      if (pageId === 'rf' && this.spectrum) this.spectrum.resize();
      if (pageId === 'camera' && this.camera) this.camera.resize();
      if (pageId === 'analytics' && this.analytics) {
        this.analytics.resize();
        if (this.analyticsData) this.analytics.updateData({ analytics: this.analyticsData });
        this.analytics.render();
      }
      if (pageId === 'fusion' && this.entities) this.renderSensorFusionPage(this.entities);
      if (pageId === 'scheduler' && this.simState) this.updateSchedulerPage(this.simState);
      if (pageId === 'simulation' && this.simState) this.updateSimulationPage(this.simState);
    }, 20);
  }

  startGlobalClock() {
    const clockEl = document.getElementById('globalUtcTime');
    const update = () => {
      const now = new Date();
      if (clockEl) clockEl.textContent = now.toTimeString().split(' ')[0] + ' UTC';
    };
    update();
    setInterval(update, 1000);
  }

  /* --------------------------------------------------------------------------
     2. WEBSOCKET TELEMETRY SYNCHRONIZATION (SINGLE SOURCE OF TRUTH)
     -------------------------------------------------------------------------- */
  connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/c2`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      const st = document.getElementById('globalSysStatus');
      if (st) {
        st.textContent = 'ONLINE';
        st.style.color = 'var(--state-verified)';
      }
    };

    this.ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'INCIDENT_FALSE_ALARM_TEST_RESULT') {
          this.handleIncidentTestResult(data.result);
        } else {
          this.handleTelemetry(data);
        }
      } catch (err) {
        console.error('Telemetry error:', err);
      }
    };

    this.ws.onclose = () => {
      const st = document.getElementById('globalSysStatus');
      if (st) {
        st.textContent = 'OFFLINE';
        st.style.color = 'var(--state-critical)';
      }
      setTimeout(() => this.connectWebSocket(), 2000);
    };
  }

  handleTelemetry(data) {
    if (data.simState) {
      this.simState = data.simState;
      try { this.updateGlobalHeader(data.simState); } catch (err) { console.error('Error in updateGlobalHeader:', err); }
      try { this.updateSchedulerPage(data.simState); } catch (err) { console.error('Error in updateSchedulerPage:', err); }
      try { this.updateSimulationPage(data.simState); } catch (err) { console.error('Error in updateSimulationPage:', err); }
    }
    if (data.entities) {
      this.entities = data.entities;
      try { this.renderRadarPageTrackCards(data.entities); } catch (err) { console.error('Error rendering track cards:', err); }
      try { this.renderRfEmitterTable(data.entities); } catch (err) { console.error('Error rendering RF table:', err); }
      try { this.renderCameraDetections(data.entities); } catch (err) { console.error('Error rendering camera detections:', err); }
      try { this.renderSensorFusionPage(data.entities); } catch (err) { console.error('Error rendering sensor fusion:', err); }
    }
    if (data.personnelDb) {
      this.personnelDb = data.personnelDb;
      try { this.renderPersonnelList(data.personnelDb); } catch (err) { console.error('Error rendering personnel list:', err); }
    }
    if (data.sosLogs || data.incidents) {
      this.sosLogs = data.sosLogs || [];
      this.incidents = data.incidents || [];
      try { this.renderSosLogs(this.sosLogs, this.incidents); } catch (err) { console.error('Error rendering SOS logs:', err); }
    }
    if (data.eventTimeline) {
      this.eventTimeline = data.eventTimeline;
      try { this.renderEventFeeds(data.eventTimeline); } catch (err) { console.error('Error rendering event feeds:', err); }
    }
    if (data.rfEventTimeline) {
      this.rfEventTimeline = data.rfEventTimeline;
      try { this.renderRfBurstTimeline(); } catch (err) { console.error('Error rendering RF burst timeline:', err); }
    }
    if (data.opticalEventTimeline) {
      this.opticalEventTimeline = data.opticalEventTimeline;
      try { this.renderOpticalEventLog(); } catch (err) { console.error('Error rendering optical event log:', err); }
    }

    try { if (this.radar) this.radar.updateData(data); } catch (err) { console.error('Error in radar.updateData:', err); }
    try { if (this.spectrum) this.spectrum.updateData(data); } catch (err) { console.error('Error in spectrum.updateData:', err); }
    try { if (this.camera) this.camera.updateData(data); } catch (err) { console.error('Error in camera.updateData:', err); }
    if (data.analytics) this.analyticsData = data.analytics;
    try { if (this.analytics) this.analytics.updateData(data); } catch (err) { console.error('Error in analytics.updateData:', err); }
  }

  updateGlobalHeader(sim) {
    const modeEl = document.getElementById('globalOpMode');
    if (modeEl) modeEl.textContent = sim.operatingMode;

    const badge = document.getElementById('simCurScenarioBadge');
    if (badge) badge.textContent = sim.scenario;

    // Highlight active scenario buttons
    document.querySelectorAll('.btn-scenario').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-scenario') === sim.scenario);
    });

    // Highlight speed buttons
    document.querySelectorAll('.btn-speed').forEach(btn => {
      btn.classList.toggle('active', Number(btn.getAttribute('data-speed')) === (sim.speedMultiplier || 1));
    });

    const pauseRadar = document.getElementById('btnRadarPauseResume');
    if (pauseRadar) pauseRadar.textContent = sim.isRunning ? 'PAUSE' : 'RESUME';

    const pauseSim = document.getElementById('btnSimPauseResume');
    if (pauseSim) pauseSim.textContent = sim.isRunning ? 'PAUSE' : 'RESUME';
  }

  /* --------------------------------------------------------------------------
     3. PAGE 1: TACTICAL RADAR RENDERING
     -------------------------------------------------------------------------- */
  renderRadarPageTrackCards(entities) {
    const container = document.getElementById('radarTrackListContainer');
    if (!container) return;

    const selId = this.simState?.selectedEntityId || 'TRK-021';
    container.innerHTML = '';

    // Build a fast name-lookup from personnelDb
    const personnelMap = {};
    (this.personnelDb || []).forEach(p => { personnelMap[p.tagId] = p; });

    entities.forEach(ent => {
      const card = document.createElement('div');
      const isSelected = ent.id === selId;
      const cls = ent.fusion.classification;

      // Classification styling
      let classSuffix = 'verified';
      let clsColor = 'var(--state-verified)';    // green
      let icon = '●';
      if      (cls === 'ANOMALOUS')    { classSuffix = 'anomalous'; clsColor = 'var(--state-critical)'; icon = '◆'; }
      else if (cls === 'WILDLIFE')     { classSuffix = 'warning';   clsColor = '#d7a84b';               icon = '▲'; }
      else if (cls === 'UNIDENTIFIED') { classSuffix = 'unknown';   clsColor = '#8a9ab5';               icon = '□'; }

      card.className = `track-card ${classSuffix} ${isSelected ? 'selected' : ''}`;
      card.onclick = () => this.selectEntity(ent.id);

      // Authorized person details from personnelDb
      const pRecord = ent.personnel?.matched && ent.personnel?.tagId ? personnelMap[ent.personnel.tagId] : null;
      const personName   = pRecord?.name   || (cls === 'ANOMALOUS' ? 'UNAUTHORIZED — IDENTITY UNKNOWN' : cls === 'WILDLIFE' ? 'WILDLIFE / FAUNA' : 'UNIDENTIFIED CONTACT');
      const personTag    = pRecord?.tagId  || ent.personnel?.tagId || '—';
      const personZone   = pRecord?.zone   || ent.personnel?.zone  || '—';
      const personStatus = pRecord?.status || (cls === 'ANOMALOUS' ? 'THREAT' : cls === 'WILDLIFE' ? 'FAUNA' : 'UNKNOWN');

      // Extra detail block based on classification
      const authorizedRows = pRecord ? `
        <div style="border-top:1px solid rgba(66,196,122,0.2); margin-top:5px; padding-top:5px;">
          <div style="color:${clsColor}; font-size:7.5px; font-weight:700; letter-spacing:0.07em; margin-bottom:3px;">✓ AUTHORIZED PERSONNEL</div>
          <div style="color:#e8f4ff; font-size:9.5px; font-weight:700; margin-bottom:4px;">${personName}</div>
          <div style="display:grid; grid-template-columns:auto 1fr; gap:2px 8px;">
            <span style="color:var(--text-tertiary);font-size:7.5px;">TAG ID</span>
            <span style="color:var(--radar-cyan);font-size:7.5px;font-weight:700;">${personTag}</span>
            <span style="color:var(--text-tertiary);font-size:7.5px;">RANK</span>
            <span style="color:#e0f0ff;font-size:7.5px;">${pRecord.rank || '—'}</span>
            <span style="color:var(--text-tertiary);font-size:7.5px;">ROLE</span>
            <span style="color:#e0f0ff;font-size:7.5px;">${pRecord.role || '—'}</span>
            <span style="color:var(--text-tertiary);font-size:7.5px;">UNIT</span>
            <span style="color:#e0f0ff;font-size:7.5px;">${pRecord.unit || '—'}</span>
            <span style="color:var(--text-tertiary);font-size:7.5px;">ZONE</span>
            <span style="color:#e0f0ff;font-size:7.5px;">${personZone}</span>
            <span style="color:var(--text-tertiary);font-size:7.5px;">CLEARANCE</span>
            <span style="color:${clsColor};font-size:7.5px;font-weight:700;">${pRecord.clearance || personStatus}</span>
            <span style="color:var(--text-tertiary);font-size:7.5px;">SHIFT</span>
            <span style="color:#b0c8e0;font-size:7.5px;">${pRecord.shift || '—'}</span>
          </div>
        </div>` : cls === 'ANOMALOUS' ? `
        <div style="border-top:1px solid rgba(212,88,88,0.25); margin-top:5px; padding-top:5px;">
          <div style="color:${clsColor};font-size:7.5px;font-weight:700;">⚠ UNAUTHORIZED — NO TAG MATCH</div>
          <div style="display:grid;grid-template-columns:auto 1fr;gap:2px 8px;margin-top:3px;">
            <span style="color:var(--text-tertiary);font-size:7.5px;">RISK</span>
            <span style="color:#ff6666;font-size:7.5px;font-weight:700;">${ent.fusion.anomalyScore}/100</span>
            <span style="color:var(--text-tertiary);font-size:7.5px;">CONFIDENCE</span>
            <span style="color:#ffaaaa;font-size:7.5px;">${ent.fusion.confidence}%</span>
            <span style="color:var(--text-tertiary);font-size:7.5px;">STATUS</span>
            <span style="color:${clsColor};font-size:7.5px;font-weight:700;">RESTRICTED ZONE BREACH</span>
            <span style="color:var(--text-tertiary);font-size:7.5px;">ACTION</span>
            <span style="color:#ffaaaa;font-size:7.5px;">${ent.fusion.recommendation}</span>
          </div>
        </div>` : cls === 'WILDLIFE' ? `
        <div style="border-top:1px solid rgba(215,168,75,0.2); margin-top:5px; padding-top:5px;">
          <div style="color:${clsColor};font-size:7.5px;font-weight:700;">▲ WILDLIFE / FAUNA CONTACT</div>
          <div style="display:grid;grid-template-columns:auto 1fr;gap:2px 8px;margin-top:3px;">
            <span style="color:var(--text-tertiary);font-size:7.5px;">ANOMALY</span>
            <span style="color:#d7a84b;font-size:7.5px;">${ent.fusion.anomalyScore}/100</span>
            <span style="color:var(--text-tertiary);font-size:7.5px;">FILTER</span>
            <span style="color:#b09050;font-size:7.5px;">FAUNA FILTERED — NO ALERT</span>
          </div>
        </div>` : `
        <div style="border-top:1px solid rgba(138,154,181,0.15); margin-top:5px; padding-top:5px;">
          <div style="color:${clsColor};font-size:7.5px;">□ UNIDENTIFIED — OUTSIDE PERIMETER</div>
          <div style="display:grid;grid-template-columns:auto 1fr;gap:2px 8px;margin-top:3px;">
            <span style="color:var(--text-tertiary);font-size:7.5px;">CONFIDENCE</span>
            <span style="color:#8a9ab5;font-size:7.5px;">${ent.fusion.confidence}%</span>
            <span style="color:var(--text-tertiary);font-size:7.5px;">ACTION</span>
            <span style="color:#8a9ab5;font-size:7.5px;">MONITOR</span>
          </div>
        </div>`;


      card.innerHTML = `
        <div class="track-card-header">
          <span class="track-card-id" style="color:${isSelected ? 'var(--radar-cyan)' : clsColor};">${icon} ${ent.id} <span style="font-size:7.5px; color:var(--text-secondary); font-weight:600; margin-left:2px;">[${ent.type}]</span></span>
          <span class="track-pill ${classSuffix}">${cls}</span>
        </div>
        <div class="track-card-metrics" style="margin-top:3px;">
          <span>Range: <b>${ent.radar.range}m</b></span>
          <span>Brg: <b>${ent.radar.azimuth}°</b></span>
          <span>Speed: <b>${ent.radar.speedKmh} km/h</b></span>
          <span>Hdg: <b>${ent.radar.heading}°</b></span>
        </div>
        ${authorizedRows}
      `;
      container.appendChild(card);
    });

    const countEl = document.getElementById('radarActiveCount');
    if (countEl) countEl.textContent = `${String(entities.length).padStart(2, '0')} ACTIVE`;
  }



  renderPersonnelList(db) {
    const container = document.getElementById('radarPersonnelListContainer');
    const modalContainer = document.getElementById('modalPersonnelListContainer');

    const renderRow = p => `
      <div class="person-row">
        <div>
          <span style="color:var(--radar-cyan); font-weight:700;">${p.tagId}</span>
          <span style="color:#fff; margin-left:4px; font-weight:600;">${p.name}</span>
          <span style="color:var(--text-tertiary); margin-left:4px;">(${p.role})</span>
        </div>
        <span class="track-pill verified">${p.status}</span>
      </div>
    `;

    if (container) {
      container.innerHTML = db.slice(0, 5).map(renderRow).join('');
    }
    if (modalContainer) {
      modalContainer.innerHTML = db.map(renderRow).join('');
    }
  }


  renderSosLogs(logs, incidents) {
    const container = document.getElementById('radarSosLogsContainer');
    if (!container) return;

    // Use rich incident data if available, otherwise fall back to legacy sosLogs
    const source = incidents && incidents.length > 0 ? incidents : logs;
    const isIncidents = incidents && incidents.length > 0;

    const activeAlerts = isIncidents ? incidents.filter(i => i.status === 'ACTIVE') : logs.filter(l => l.level === 'ELEVATED' || l.level === 'CRITICAL SIMULATION EVENT' || l.level === 'HIGH-RISK SIMULATED EVENT');
    const countEl = document.getElementById('sosAlertCount');
    if (countEl) {
      const count = activeAlerts.length;
      countEl.textContent = count > 0 ? `${count} ACTIVE` : '0 ACTIVE';
      countEl.style.color = count > 0 ? 'var(--state-critical)' : 'var(--state-verified)';
    }

    if (isIncidents) {
      container.innerHTML = incidents.map(inc => {
        const isActive = inc.status === 'ACTIVE';
        const isCritical = inc.alertLevel === 'CRITICAL SIMULATION EVENT';
        const isHighRisk = inc.alertLevel === 'HIGH-RISK SIMULATED EVENT';
        const hasAlert = isCritical || isHighRisk;

        const levelColor = isCritical ? 'var(--state-critical)' : isHighRisk ? '#f0a500' : 'var(--text-tertiary)';
        const bgColor = isActive && hasAlert ? 'rgba(220,38,38,0.08)' : 'transparent';

        const evidenceStr = inc.sensorEvidence ? [
          inc.sensorEvidence.radar ? 'RADAR' : null,
          inc.sensorEvidence.camera ? 'CAM' : null,
          inc.sensorEvidence.rfCorrelation ? 'RF' : null,
          inc.sensorEvidence.restrictedZone ? 'RZONE' : null,
          inc.sensorEvidence.unauthorized ? 'UNAUTH' : null
        ].filter(Boolean).join(' | ') : '';

        return `
          <div class="sos-log-entry" style="background:${bgColor}; border-left:2px solid ${levelColor}; padding-left:6px; margin-bottom:4px;">
            <div style="display:flex; justify-content:space-between; font-weight:700; align-items:center;">
              <span style="color:${levelColor}; font-size:9px;">${inc.incidentId || inc.id}</span>
              <span style="color:var(--text-tertiary); font-size:8px;">${inc.timeStr || inc.time}</span>
            </div>
            <div style="color:#fff; margin-top:1px; font-size:9px; font-weight:600;">${inc.entityId || inc.targetId} — ${inc.alertLevel || inc.level || 'NONE'}</div>
            <div style="color:var(--text-secondary); font-size:8px; margin-top:1px;">${inc.range ? `Range ${inc.range}m | Az ${inc.azimuth}° | ${inc.speed?.toFixed(1)} km/h` : (inc.location || '')}</div>
            ${evidenceStr ? `<div style="color:var(--radar-cyan); font-size:7.5px; margin-top:1px; font-family:var(--font-mono);">${evidenceStr}</div>` : ''}
            ${inc.riskScore !== undefined ? `<div style="color:${levelColor}; font-size:7.5px; font-family:var(--font-mono);">RISK: ${inc.riskScore}/100</div>` : ''}
            <div style="display:flex; align-items:center; gap:4px; margin-top:3px;">
              <span style="font-size:7.5px; color:${isActive ? 'var(--state-critical)' : 'var(--state-verified)'}; font-weight:700;">${inc.status}</span>
              ${isActive && hasAlert ? `<button class="btn-ops" style="font-size:7px; padding:1px 6px; height:16px; line-height:1;" onclick="window.app.acknowledgeIncident('${inc.incidentId}')">ACKNOWLEDGE</button>` : ''}
            </div>
          </div>
        `;
      }).join('');
    } else {
      container.innerHTML = logs.map(l => `
        <div class="sos-log-entry">
          <div style="display:flex; justify-content:space-between; font-weight:700;">
            <span style="color:var(--state-critical);">${l.id} // ${l.targetId}</span>
            <span style="color:var(--text-tertiary);">${l.time}</span>
          </div>
          <div style="color:#fff; margin-top:2px;">${l.location} — ${l.status}</div>
        </div>
      `).join('');
    }
  }


  /* --------------------------------------------------------------------------
     4. PAGE 2: RF / ESM INTELLIGENCE RENDERING
     -------------------------------------------------------------------------- */
  renderRfEmitterTable(entities) {
    const tbody = document.getElementById('rfEmitterTableBody');
    if (!tbody) return;

    const emitters = entities.filter(e => e.rf.hasEmitter);
    const selId = this.simState?.selectedEntityId || 'TRK-021';

    tbody.innerHTML = emitters.map(ent => {
      const isSelected = ent.id === selId;
      const isTx = ent.rf.isTransmitting;
      return `
        <tr style="background:${isSelected ? 'rgba(24, 184, 214, 0.12)' : 'transparent'};" onclick="window.app.selectEntity('${ent.id}')">
          <td style="color:var(--radar-cyan); font-weight:700;">${ent.rf.emitterId}</td>
          <td><b>${ent.rf.freqGhz ? ent.rf.freqGhz.toFixed(3) : '--'} GHz</b></td>
          <td>${ent.rf.powerDbm} dBm</td>
          <td><span class="track-pill ${isTx ? 'verified' : 'unknown'}">${isTx ? 'TRANSMITTING' : 'IDLE'}</span></td>
          <td>${ent.fusion.confidence}%</td>
          <td style="color:var(--radar-cyan); font-weight:600;">${ent.id}</td>
          <td style="color:var(--text-tertiary);">${new Date().toTimeString().split(' ')[0]}</td>
        </tr>
      `;
    }).join('');

    const countEl = document.getElementById('rfTotalEmittersCount');
    if (countEl) countEl.textContent = `${emitters.length} TRACKED`;

    // Update receiver telemetry values from live simulation state
    if (this.simState) {
      const rxTel = this.simState.rxTelemetry;
      const isHit = this.simState.receiverState === 'HIT';

      const rxStateBadge = document.getElementById('rfRxStateBadge');
      if (rxStateBadge) {
        rxStateBadge.textContent = this.simState.receiverState || 'SEARCHING';
        rxStateBadge.style.color = isHit ? 'var(--state-verified)' : 'var(--state-warning)';
      }

      const ibwLabel = document.getElementById('rfCurrentIbwLabel');
      if (ibwLabel) {
        const curGhz = this.simState.rfCurrentScanGhz || 9.420;
        const ibw = rxTel?.ibwMhz || this.simState.rfIbwMhz || 50;
        ibwLabel.textContent = `${ibw} MHz IBW // ${curGhz.toFixed(3)} GHz`;
      }

      const rxFreq = document.getElementById('rfRxTunedFreq');
      if (rxFreq) rxFreq.textContent = `${Number(this.simState.rfCurrentScanGhz || 9.420).toFixed(3)} GHz`;

      const rxIbw = document.getElementById('rfCurrentIbw');
      if (rxIbw) rxIbw.textContent = `${rxTel?.ibwMhz || this.simState.rfIbwMhz || 50} MHz`;

      const rxDwell = document.getElementById('rfRxDwellMs');
      if (rxDwell) rxDwell.textContent = `${rxTel?.dwellMs || this.simState.rfCurrentDwellMs || 180} ms`;

      const rxSnr = document.getElementById('rfRxSnr');
      if (rxSnr) {
        const snr = rxTel?.snrDb !== undefined ? rxTel.snrDb : (isHit ? 33.8 : 1.8);
        rxSnr.textContent = `${snr >= 0 ? '+' : ''}${snr.toFixed(1)} dB`;
        rxSnr.style.color = isHit ? 'var(--state-verified)' : 'var(--text-secondary)';
      }

      const rxPower = document.getElementById('rfRxPower');
      if (rxPower) {
        const pwr = rxTel?.powerDbm !== undefined ? rxTel.powerDbm : (isHit ? -61.2 : -94.5);
        rxPower.textContent = `${pwr.toFixed(1)} dBm`;
      }

      const assocEl = document.getElementById('rfRxAssocEmitter');
      if (assocEl) {
        if (rxTel?.assocEmitter) {
          assocEl.textContent = rxTel.assocEmitter;
        } else {
          const sel = entities.find(e => e.id === selId);
          assocEl.textContent = sel && sel.rf?.hasEmitter ? `${sel.rf.emitterId} (${sel.id})` : (isHit ? 'EMITTER-03 (TRK-021)' : 'NO ENERGY DETECTED');
        }
      }

      const rxFeedback = document.getElementById('rfRxHitFeedback');
      if (rxFeedback) {
        rxFeedback.textContent = rxTel?.feedback || (isHit ? 'INTERCEPT CONFIRMED' : 'DWELL SCAN - NO SIGNAL DETECTED');
        rxFeedback.style.color = isHit ? 'var(--state-verified)' : 'var(--state-warning)';
      }

      const nextBand = document.getElementById('rfNextBandGhz');
      if (nextBand) nextBand.textContent = `${Number(this.simState.rfNextScanGhz || 9.675).toFixed(3)} GHz`;

      const nextProb = document.getElementById('rfNextProb');
      if (nextProb) {
        const prob = rxTel?.nextProbPercent !== undefined ? rxTel.nextProbPercent : 87;
        nextProb.textContent = `${prob}%`;
      }

      // Render RF signal burst timeline
      this.renderRfBurstTimeline();
    }
  }

  renderRfBurstTimeline() {
    const container = document.getElementById('rfBurstTimelineContainer');
    if (!container) return;

    const rfEvents = (this.rfEventTimeline && this.rfEventTimeline.length > 0)
      ? this.rfEventTimeline
      : (this.eventTimeline || []).filter(e => e.source === 'RECEIVER' || e.source === 'RF');

    if (rfEvents.length === 0) {
      container.innerHTML = `<div style="padding:10px; color:var(--text-tertiary); font-size:10px;">AWAITING RF EMITTER BURST DETECTIONS...</div>`;
      return;
    }

    container.innerHTML = rfEvents.slice(0, 15).map(e => {
      const isHit = e.state === 'HIT' || (e.event && e.event.includes('HIT'));
      const borderColor = isHit ? 'var(--state-verified)' : '#d7a84b';
      const tagClass = isHit ? 'tag-verified' : 'tag-warning';
      const tagText = isHit ? 'HIT' : 'MISS';
      const freqStr = e.freqGhz ? `${e.freqGhz.toFixed(3)} GHz` : (e.event?.match(/\d+\.\d+\s*GHz/)?.[0] || '9.420 GHz');
      const emitterStr = e.emitter && e.emitter !== 'NONE' ? e.emitter : (isHit ? 'EMITTER-03 (TRK-021)' : 'NOISE FLOOR');
      const pwrStr = e.powerDbm !== undefined ? `${e.powerDbm.toFixed(1)} dBm` : (isHit ? '-61.2 dBm' : '-94.5 dBm');
      const snrStr = e.snrDb !== undefined ? `+${e.snrDb.toFixed(1)} dB` : (isHit ? '+33.8 dB' : '+1.8 dB');
      const dwellStr = e.dwellMs || 180;

      return `
        <div class="sos-log-item" style="border-left:3px solid ${borderColor}; margin-bottom:4px; padding:6px 8px; background:rgba(12,20,30,0.6);">
          <div class="sos-time-col" style="display:flex; flex-direction:column; gap:2px; min-width:62px;">
            <span class="sos-time" style="font-size:8.5px; color:var(--text-tertiary);">${e.time}</span>
            <span class="sos-tag ${tagClass}" style="font-size:7.5px; padding:1px 4px; border-radius:2px; font-weight:700; width:fit-content;">${tagText}</span>
          </div>
          <div class="sos-desc-col" style="flex:1; margin-left:8px;">
            <div class="sos-title" style="color:${isHit ? 'var(--state-verified)' : '#d7a84b'}; font-size:9.5px; font-weight:700;">
              ${freqStr} // ${isHit ? `INTERCEPT: ${emitterStr}` : 'DWELL SCAN — NO SIGNAL'}
            </div>
            <div class="sos-meta" style="font-size:8px; color:var(--text-secondary); margin-top:2px;">
              ${isHit ? `SNR ${snrStr} | PWR ${pwrStr} | DWELL ${dwellStr}ms` : `NOISE FLOOR (${pwrStr}) | DWELL ${dwellStr}ms | POSTERIOR UPDATED`}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  /* --------------------------------------------------------------------------
     5. PAGE 3: OPTICAL SURVEILLANCE / CAMERA RENDERING
     -------------------------------------------------------------------------- */
  renderCameraDetections(entities) {
    const curCam = this.simState?.activeCameraId || 'CAM-01';

    // Highlight active camera tab
    document.querySelectorAll('.cam-big-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-cam') === curCam);
    });

    const visible = entities.filter(e => e.camera.visibleCamId === curCam && e.camera.isVisuallyConfirmed);
    const container = document.getElementById('camDetectionListContainer');
    if (container) {
      if (visible.length === 0) {
        container.innerHTML = `<div style="color:var(--text-tertiary); padding:10px; font-family:var(--font-mono); font-size:9.5px;">NO OPTICAL DETECTIONS IN ${curCam} SECTOR FOV</div>`;
      } else {
        container.innerHTML = visible.map(ent => `
          <div class="cam-det-card" onclick="window.app.selectEntity('${ent.id}')">
            <div style="display:flex; justify-content:space-between; font-weight:700;">
              <span style="color:var(--cam-blue);">${ent.camera.detectionId} [${ent.camera.typeLabel}]</span>
              <span style="color:#fff;">${ent.camera.confidence}% CONF</span>
            </div>
            <div style="color:var(--text-secondary); margin-top:2px;">CORRELATED TO RADAR: <b style="color:var(--radar-cyan);">${ent.id}</b></div>
          </div>
        `).join('');
      }
    }

    const countEl = document.getElementById('camDetectionsCount');
    if (countEl) countEl.textContent = `${String(visible.length).padStart(2, '0')} IN FOV`;

    // Correlation card
    const selId = this.simState?.selectedEntityId || 'TRK-021';
    const sel = entities.find(e => e.id === selId);

    const corrRadar = document.getElementById('camCorrRadarId');
    if (corrRadar) corrRadar.textContent = selId;

    const corrDet = document.getElementById('camCorrDetId');
    const corrStatus = document.getElementById('camCorrStatus');
    const corrConf = document.getElementById('camCorrConf');
    const corrSector = document.getElementById('camCorrSector');

    if (sel && sel.camera.isVisuallyConfirmed && sel.camera.visibleCamId === curCam) {
      if (corrDet) corrDet.textContent = `${sel.camera.detectionId} (${sel.camera.typeLabel})`;
      if (corrStatus) { corrStatus.textContent = 'CORRELATED'; corrStatus.style.color = 'var(--state-verified)'; }
      if (corrConf) corrConf.textContent = `${sel.camera.confidence}%`;
      if (corrSector) corrSector.textContent = `${curCam} (ACTIVE)`;
    } else {
      if (corrDet) corrDet.textContent = sel && sel.camera.isVisuallyConfirmed ? `IN SECTOR ${sel.camera.visibleCamId}` : 'OUT OF FOV';
      if (corrStatus) { corrStatus.textContent = sel && sel.camera.isVisuallyConfirmed ? 'IN OTHER SECTOR' : 'NO VISUAL CONFIRMATION'; corrStatus.style.color = 'var(--text-tertiary)'; }
      if (corrConf) corrConf.textContent = '--';
      if (corrSector) corrSector.textContent = curCam;
    }
  }

  renderOpticalEventLog() {
    const container = document.getElementById('camOpticalEventLog');
    if (!container) return;

    const optEvents = (this.opticalEventTimeline && this.opticalEventTimeline.length > 0)
      ? this.opticalEventTimeline
      : (this.eventTimeline || []).filter(e => e.source === 'CAMERA');

    if (optEvents.length === 0) {
      container.innerHTML = `<div style="padding:10px; color:var(--text-tertiary); font-size:10px;">AWAITING OPTICAL ACQUISITIONS...</div>`;
      return;
    }

    container.innerHTML = optEvents.slice(0, 15).map(e => {
      const camId = e.camera || 'CAM-01';
      const isDet = !!e.detectionId;
      const borderColor = isDet ? 'var(--cam-blue, #22d3ee)' : 'var(--radar-cyan, #00f3ff)';
      const tagText = camId;
      const title = e.detectionId
        ? `CV DETECTION: ${e.detectionId} [${e.type || 'TARGET'}] ↔ ${e.trackId || 'RADAR'}`
        : (e.event || `OPTICAL FEED: ${camId}`);
      const meta = e.detectionId
        ? `SECTOR: ${e.sector || camId} | CONFIDENCE: ${e.confidence || 90}% | SPATIAL CORRELATION CONFIRMED`
        : (e.sector ? `SECTOR: ${e.sector} | STATUS: STREAMING` : 'OPTICAL SURVEILLANCE ACTIVE');

      return `
        <div class="sos-log-item" style="border-left:3px solid ${borderColor}; margin-bottom:4px; padding:6px 8px; background:rgba(12,20,30,0.6);">
          <div class="sos-time-col" style="display:flex; flex-direction:column; gap:2px; min-width:55px;">
            <span class="sos-time" style="font-size:8.5px; color:var(--text-tertiary);">${e.time}</span>
            <span class="sos-tag" style="font-size:7.5px; padding:1px 4px; border-radius:2px; font-weight:700; width:fit-content; background:rgba(34,211,238,0.2); color:#22d3ee; border:1px solid rgba(34,211,238,0.4);">${tagText}</span>
          </div>
          <div class="sos-desc-col" style="flex:1; margin-left:8px;">
            <div class="sos-title" style="color:#22d3ee; font-size:9.5px; font-weight:700;">
              ${title}
            </div>
            <div class="sos-meta" style="font-size:8px; color:var(--text-secondary); margin-top:2px;">
              ${meta}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  /* --------------------------------------------------------------------------
     6. PAGE 4: SENSOR FUSION WORKSPACE RENDERING
     -------------------------------------------------------------------------- */
  renderSensorFusionPage(entities) {
    const selId = this.simState?.selectedEntityId || 'TRK-021';
    const sel = entities.find(e => e.id === selId);
    if (!sel) return;

    const setEl = (id, txt) => {
      const el = document.getElementById(id);
      if (el) el.textContent = txt;
    };

    setEl('fusionSelectedEntityBadge', `ENTITY-${sel.id.replace('TRK-', '')}`);
    setEl('fusionEntityName', `${sel.id} (${sel.displayName || 'Unidentified Contact'})`);
    const _fusionSummaryMap = {
      'VERIFIED': 'Authorized Personnel — Credentials Verified',
      'ANOMALOUS': 'Anomalous Perimeter Breach // Unauthorized Contact',
      'WILDLIFE': 'Wildlife / Fauna Contact — Filtered',
      'UNVERIFIED': 'Unidentified Contact — Outside Perimeter'
    };
    setEl('fusionSummaryText', sel.fusion?.statusSummary || _fusionSummaryMap[sel.fusion?.classification] || 'Contact Status Nominal');

    const classBadge = document.getElementById('fusionClassificationBadge');
    if (classBadge) {
      classBadge.textContent = sel.fusion?.classification || 'UNKNOWN';
      classBadge.className = `track-pill ${(sel.fusion?.classification || 'unknown').toLowerCase()}`;
    }

    setEl('fusionRadarEvidence', `Detected ✓ (${sel.radar?.range || 0}m / ${sel.radar?.azimuth || 0}° / ${sel.radar?.speedKmh || 0} km/h)`);

    if (sel.camera && sel.camera.isVisuallyConfirmed) {
      setEl('fusionCameraEvidence', `Visual Match ${sel.camera.confidence}% (${sel.camera.detectionId} on ${sel.camera.visibleCamId})`);
    } else {
      setEl('fusionCameraEvidence', 'No Visual Confirmation (Outside Optical FOV)');
    }

    if (sel.rf && sel.rf.hasEmitter && sel.rf.freqGhz) {
      setEl('fusionRfEvidence', `Active Associated Signal (${sel.rf.freqGhz.toFixed(3)} GHz, ${sel.rf.powerDbm} dBm)`);
    } else {
      setEl('fusionRfEvidence', 'No RF Emission (Passive Skin Return Only)');
    }

    if (sel.personnel && sel.personnel.matched) {
      const pName = sel.personnel.details?.name || (this.personnelDb?.find(p => p.tagId === sel.personnel.tagId)?.name) || sel.personnel.tagId || 'Authorized Personnel';
      setEl('fusionPersonnelEvidence', `Credentials Verified (${sel.personnel.tagId} - ${pName})`);
    } else {
      setEl('fusionPersonnelEvidence', 'No Authorization Credentials Match');
    }

    setEl('fusionConfidenceScore', `${sel.fusion?.confidence || 0}%`);
    const confFill = document.getElementById('fusionConfidenceFill');
    if (confFill) confFill.style.width = `${sel.fusion?.confidence || 0}%`;

    setEl('fusionAnomalyScore', `${sel.fusion?.anomalyScore || 0} / 100`);
    setEl('fusionRecommendationText', sel.fusion?.recommendation || 'MONITOR');

    // Dynamic Visual Node/Connector Flow Nodes
    setEl('nodeRadarStatus', 'ACQUIRED (98%)');
    setEl('nodeRadarBelief', `${sel.type === 'PERSON' ? 'Humanoid Movement' : (sel.type === 'VEHICLE' ? 'Motor Vehicle Return' : (sel.type === 'WILDLIFE' ? 'Quadruped Movement' : 'Unidentified Contact'))} // ${sel.radar?.speedKmh || 0} km/h`);
    setEl('nodeRadarMeta', `${sel.radar?.range || 0}m / ${sel.radar?.azimuth || 0}° Azimuth / SNR 28dB`);

    const camStatusEl = document.getElementById('nodeCameraStatus');
    if (sel.camera && sel.camera.isVisuallyConfirmed) {
      if (camStatusEl) {
        camStatusEl.textContent = `VISUAL ${sel.camera.confidence}%`;
        camStatusEl.className = 'snc-status verified';
      }
      setEl('nodeCameraBelief', `${sel.type} (${sel.camera.detectionId})`);
      setEl('nodeCameraMeta', `${sel.camera.visibleCamId} Sector // In Optical FOV`);
    } else {
      if (camStatusEl) {
        camStatusEl.textContent = 'OUT OF FOV';
        camStatusEl.className = 'snc-status neutral';
      }
      setEl('nodeCameraBelief', 'No Visual In FOV');
      setEl('nodeCameraMeta', 'Perimeter Cameras Cam-01..04 Active');
    }

    const rfStatusEl = document.getElementById('nodeRfStatus');
    if (sel.rf && sel.rf.hasEmitter && sel.rf.freqGhz) {
      if (rfStatusEl) {
        rfStatusEl.textContent = `ACTIVE (${sel.rf.powerDbm} dBm)`;
        rfStatusEl.className = 'snc-status warning';
      }
      setEl('nodeRfBelief', sel.rf.freqGhz >= 9.4 ? 'Frequency-Agile Intermittent' : 'Tactical Radio Emitter');
      setEl('nodeRfMeta', `${sel.rf.freqGhz.toFixed(3)} GHz // ${sel.rf.emitterId || 'EMITTER'}`);
    } else {
      if (rfStatusEl) {
        rfStatusEl.textContent = 'NO RF';
        rfStatusEl.className = 'snc-status neutral';
      }
      setEl('nodeRfBelief', 'Passive Skin Return');
      setEl('nodeRfMeta', 'Zero Emitter Transmissions');
    }

    const dbStatusEl = document.getElementById('nodeDbStatus');
    if (sel.personnel && sel.personnel.matched) {
      if (dbStatusEl) {
        dbStatusEl.textContent = `VERIFIED (${sel.personnel.tagId})`;
        dbStatusEl.className = 'snc-status verified';
      }
      const pName = sel.personnel.details?.name || (this.personnelDb?.find(p => p.tagId === sel.personnel.tagId)?.name) || 'Authorized Personnel';
      const pZone = sel.personnel.details?.zone || sel.personnel.zone || (this.personnelDb?.find(p => p.tagId === sel.personnel.tagId)?.zone) || 'Base Perimeter';
      setEl('nodeDbBelief', `${pName} (Clearance OK)`);
      setEl('nodeDbMeta', `Zone: ${pZone}`);
    } else {
      if (dbStatusEl) {
        dbStatusEl.textContent = 'UNAUTHORIZED';
        dbStatusEl.className = 'snc-status critical';
      }
      setEl('nodeDbBelief', sel.type === 'WILDLIFE' ? 'Non-Human Entity' : 'No Authorization Match');
      setEl('nodeDbMeta', 'Zero RFID Transponder Response');
    }

    setEl('nodeHubCorr', 'SPATIO-TEMPORAL ✓');
    setEl('nodeHubConf', `${sel.fusion?.confidence || 0}%`);
    setEl('nodeHubAnomaly', `${sel.fusion?.anomalyScore || 0} / 100`);

    const outPill = document.getElementById('nodeOutputPill');
    if (outPill) {
      outPill.textContent = sel.fusion.classification;
      outPill.className = `track-pill ${sel.fusion.classification.toLowerCase()}`;
    }
    setEl('nodeOutputTitle', `${sel.id}: ${sel.displayName || sel.type}`);
    setEl('nodeOutputAction', sel.fusion.recommendation);
    const outSos = document.getElementById('nodeOutputSos');
    if (outSos) {
      if (sel.fusion.classification === 'ANOMALOUS') {
        outSos.style.display = 'flex';
      } else {
        outSos.style.display = 'none';
      }
    }

    // Multi-entity evidence matrix table (Populated dynamically from backend master entities)
    const matrixBody = document.getElementById('fusionMatrixBody');
    if (matrixBody) {
      matrixBody.innerHTML = entities.map(e => {
        const isSelected = e.id === selId;
        const clsLower = (e.fusion?.classification || 'unidentified').toLowerCase();
        
        // Radar cell
        const radarText = e.radar?.detected 
          ? `<span style="color:var(--state-verified); font-weight:600;">✓ ${e.radar.range}m (${e.radar.azimuth}°)</span>` 
          : `<span style="color:var(--text-tertiary);">✕ NOT DETECTED</span>`;
        
        // Camera cell
        const cameraText = (e.camera && e.camera.isVisuallyConfirmed)
          ? `<span style="color:var(--state-verified); font-weight:600;">✓ ${e.camera.confidence}% (${e.camera.visibleCamId})</span>`
          : `<span style="color:var(--text-tertiary);">— OUT OF FOV</span>`;
        
        // RF cell
        let rfText;
        if (e.rf && e.rf.hasEmitter) {
          const freqStr = e.rf.freqGhz ? `${e.rf.freqGhz.toFixed(3)} GHz` : 'EMITTER';
          const isTx = e.rf.isTransmitting;
          rfText = isTx 
            ? `<span style="color:var(--state-warning); font-weight:600;">✓ ${freqStr} (TX)</span>`
            : `<span style="color:var(--text-secondary);">✓ ${freqStr} (QUIET)</span>`;
        } else {
          rfText = `<span style="color:var(--text-tertiary);">— PASSIVE</span>`;
        }

        // Personnel cell
        let personnelText;
        if (e.personnel && e.personnel.matched) {
          personnelText = `<span style="color:var(--state-verified); font-weight:600;">✓ ${e.personnel.tagId}</span>`;
        } else if (e.type === 'WILDLIFE') {
          personnelText = `<span style="color:var(--text-tertiary);">— FAUNA</span>`;
        } else {
          personnelText = `<span style="color:var(--state-critical); font-weight:600;">✕ NO MATCH</span>`;
        }

        // Classification pill
        const classBadge = `<span class="track-pill ${clsLower}">${e.fusion?.classification || 'UNKNOWN'}</span>`;

        // Confidence & Anomaly
        const confText = `<span style="font-weight:700; color:var(--radar-cyan);">${e.fusion?.confidence || 0}%</span> <span style="font-size:8px; color:var(--text-tertiary);">(Risk: ${e.fusion?.anomalyScore || 0})</span>`;

        return `
          <tr style="background:${isSelected ? 'rgba(24, 184, 214, 0.16)' : 'transparent'}; border-left:${isSelected ? '3px solid var(--radar-cyan)' : '3px solid transparent'}; cursor:pointer;" onclick="window.app.selectEntity('${e.id}')">
            <td style="color:var(--radar-cyan); font-weight:700; font-family:var(--font-mono); white-space:nowrap;">
              ${isSelected ? '▶ ' : ''}${e.id}
            </td>
            <td style="font-family:var(--font-mono); font-size:9.5px;">${radarText}</td>
            <td style="font-family:var(--font-mono); font-size:9.5px;">${cameraText}</td>
            <td style="font-family:var(--font-mono); font-size:9.5px;">${rfText}</td>
            <td style="font-family:var(--font-mono); font-size:9.5px;">${personnelText}</td>
            <td>${classBadge}</td>
            <td style="font-family:var(--font-mono); font-size:9.5px;">${confText}</td>
          </tr>
        `;
      }).join('');
    }

    // Render explainable multi-sensor fusion reasoning trace for selected entity
    try {
      this.renderFusionReasoningTrace(sel);
    } catch (err) {
      console.error('Error in renderFusionReasoningTrace:', err);
    }
  }

  renderFusionReasoningTrace(sel) {
    const container = document.getElementById('fusionReasoningTimeline');
    if (!container || !sel) return;

    const timeStr = new Date().toTimeString().split(' ')[0];
    const steps = [];

    // Step 1: Radar Acquisition
    const radarDet = sel.radar?.detected;
    steps.push({
      stepNum: '01',
      tag: 'RADAR',
      tagColor: radarDet ? 'var(--state-verified)' : 'var(--state-warning)',
      title: radarDet ? `PRIMARY RADAR ACQUISITION: ${sel.id} (SKIN RETURN)` : 'NO RADAR SKIN RETURN',
      status: radarDet ? 'CONFIRMED' : 'NEGATIVE',
      meta: radarDet 
        ? `Range: ${sel.radar.range}m | Azimuth: ${sel.radar.azimuth}° | Velocity: ${sel.radar.speedKmh} km/h | Heading: ${sel.radar.heading}°`
        : 'Target undetectable by primary radar skin reflection'
    });

    // Step 2: Optical Correlation
    const camConfirmed = sel.camera && sel.camera.isVisuallyConfirmed;
    steps.push({
      stepNum: '02',
      tag: 'OPTICAL',
      tagColor: camConfirmed ? 'var(--cam-blue, #22d3ee)' : 'var(--text-tertiary)',
      title: camConfirmed 
        ? `OPTICAL CV MATCH: ${sel.camera.detectionId} [${sel.camera.typeLabel || sel.type}]` 
        : 'OPTICAL SURVEILLANCE: OUTSIDE ACTIVE FOV',
      status: camConfirmed ? `${sel.camera.confidence}% CONF` : 'OUT OF FOV',
      meta: camConfirmed 
        ? `Sector: ${sel.camera.visibleCamId} | Classification: ${sel.camera.typeLabel || sel.type} | Spatial Lock Confirmed`
        : `Target at (${sel.radar.range}m, ${sel.radar.azimuth}°) is outside active camera FOVs (CAM-01..04)`
    });

    // Step 3: RF Emission Intercept
    const hasRf = sel.rf && sel.rf.hasEmitter;
    const isTx = hasRf && sel.rf.isTransmitting;
    steps.push({
      stepNum: '03',
      tag: 'RF/ESM',
      tagColor: hasRf ? (isTx ? 'var(--state-warning)' : 'var(--state-verified)') : 'var(--text-tertiary)',
      title: hasRf 
        ? (isTx ? `ACTIVE RF EMISSION: ${sel.rf.emitterId || 'EMITTER'} (${sel.rf.freqGhz ? sel.rf.freqGhz.toFixed(3) : '--'} GHz)` : `INTERMITTENT EMITTER (PULSE QUIET PHASE)`)
        : 'PASSIVE CONTACT: ZERO RF EMISSIONS DETECTED',
      status: hasRf ? (isTx ? `${sel.rf.powerDbm} dBm` : 'PULSE OFF') : 'NO RF',
      meta: hasRf 
        ? `Frequency: ${sel.rf.freqGhz ? sel.rf.freqGhz.toFixed(3) : '--'} GHz | Power: ${sel.rf.powerDbm} dBm | SNR: +${sel.rf.snrDb} dB | Dwell Active`
        : 'Target operating in radio silence or non-emitting body'
    });

    // Step 4: Personnel DB Interrogation
    const pMatched = sel.personnel && sel.personnel.matched;
    const isWildlife = sel.type === 'WILDLIFE';
    const pName = sel.personnel?.details?.name || (this.personnelDb?.find(p => p.tagId === sel.personnel?.tagId)?.name) || sel.personnel?.tagId || 'Authorized Personnel';
    steps.push({
      stepNum: '04',
      tag: 'IFF/DB',
      tagColor: pMatched ? 'var(--state-verified)' : (isWildlife ? 'var(--text-tertiary)' : 'var(--state-critical)'),
      title: pMatched 
        ? `PERSONNEL CREDENTIALS VERIFIED (${sel.personnel.tagId})`
        : (isWildlife ? 'NON-HUMAN FAUNA: CREDENTIAL QUERY BYPASS' : 'SECURITY ALERT: NO MATCH IN PERSONNEL DATABASE'),
      status: pMatched ? 'AUTHORIZED' : (isWildlife ? 'FAUNA' : 'UNAUTHORIZED'),
      meta: pMatched 
        ? `Subject: ${pName} | Tag: ${sel.personnel.tagId} | Zone: ${sel.personnel.zone || 'Base'} | Clearance: OK`
        : (isWildlife ? 'Automated animal classifier bypassed sentry credential requirements' : 'Zero transponder response; subject has no valid authorization credentials')
    });

    // Step 5: Perimeter Boundary Rule
    const inPerimeter = sel.radar?.range <= 450;
    steps.push({
      stepNum: '05',
      tag: 'PERIMETER',
      tagColor: inPerimeter ? (pMatched ? 'var(--state-verified)' : 'var(--state-critical)') : 'var(--radar-cyan)',
      title: inPerimeter 
        ? `INNER PERIMETER ENVELOPE: ${sel.radar.range}m <= 450m RESTRICTED BOUNDARY`
        : `BUFFER ZONE MONITORING: ${sel.radar.range}m > 450m RESTRICTED BOUNDARY`,
      status: inPerimeter ? 'INSIDE 450m' : 'OUTSIDE 450m',
      meta: inPerimeter 
        ? 'Target has crossed 450m base security boundary; proximity rule requires immediate classification'
        : 'Target currently in outer surveillance envelope; tracking kinematics and approach vector'
    });

    // Step 6: Multi-Sensor Bayesian Fusion Classification
    const cls = sel.fusion?.classification || 'UNIDENTIFIED';
    const clsColor = cls === 'VERIFIED' ? 'var(--state-verified)' : (cls === 'ANOMALOUS' ? 'var(--state-critical)' : (cls === 'WILDLIFE' ? '#d7a84b' : 'var(--radar-cyan)'));
    steps.push({
      stepNum: '06',
      tag: 'FUSION',
      tagColor: clsColor,
      title: `BAYESIAN STATE ESTIMATION → CLASSIFICATION: ${cls}`,
      status: `CONF: ${sel.fusion?.confidence || 0}%`,
      meta: `Multi-Sensor Confidence: ${sel.fusion?.confidence || 0}% | Anomaly Risk Score: ${sel.fusion?.anomalyScore || 0}/100 | ${sel.fusion?.statusSummary || 'Status nominal'}`
    });

    // Step 7: Tactical Recommendation & Operational Posture
    const rec = sel.fusion?.recommendation || 'MONITOR';
    steps.push({
      stepNum: '07',
      tag: 'DECISION',
      tagColor: clsColor,
      title: `OPERATIONAL POSTURE → ${rec}`,
      status: 'ACTIVE',
      meta: cls === 'ANOMALOUS'
        ? 'High-risk security breach flagged. Simulated incident dispatch generated; Quick Reaction Team dispatched.'
        : (cls === 'VERIFIED' ? 'Authorized personnel in assigned sector. Access permitted; routine surveillance logging.' : (cls === 'WILDLIFE' ? 'Fauna contact filtered from high-priority alert queues. Non-tactical return.' : 'Maintain continuous multi-sensor track monitoring.'))
    });

    container.innerHTML = steps.map(s => `
      <div class="sos-log-item" style="border-left:3px solid ${s.tagColor}; margin-bottom:4px; padding:6px 8px; background:rgba(12,20,30,0.6);">
        <div class="sos-time-col" style="display:flex; flex-direction:column; gap:2px; min-width:62px;">
          <span class="sos-time" style="font-size:8px; color:var(--text-tertiary); font-family:var(--font-mono);">${timeStr}</span>
          <span class="sos-tag" style="font-size:7.5px; padding:1px 4px; border-radius:2px; font-weight:700; width:fit-content; background:rgba(255,255,255,0.06); color:${s.tagColor}; border:1px solid ${s.tagColor};">${s.tag}</span>
        </div>
        <div class="sos-desc-col" style="flex:1; margin-left:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div class="sos-title" style="color:${s.tagColor}; font-size:9.5px; font-weight:700;">
              ${s.title}
            </div>
            <span style="font-family:var(--font-mono); font-size:8px; color:#fff; font-weight:700; background:rgba(0,0,0,0.4); padding:1px 4px; border-radius:2px;">${s.status}</span>
          </div>
          <div class="sos-meta" style="font-size:8px; color:var(--text-secondary); margin-top:2px;">
            ${s.meta}
          </div>
        </div>
      </div>
    `).join('');
  }

  /* --------------------------------------------------------------------------
     7. PAGE 5: ADAPTIVE EW SCAN SCHEDULER RENDERING (SIH CORE)
     -------------------------------------------------------------------------- */
  updateSchedulerPage(sim) {
    const curFreq = Number(sim.rfCurrentScanGhz || 9.420);
    const nextFreq = Number(sim.rfNextScanGhz || 9.675);
    const cur = document.getElementById('schedCurTarget');
    if (cur) cur.textContent = `${curFreq.toFixed(3)} GHz (${sim.rfCurrentDwellMs || 180} ms Dwell)`;

    const next = document.getElementById('schedNextTarget');
    const nextBandState = (sim.perBandState || []).find(b => Math.abs(b.freqGhz - nextFreq) < 0.005);
    const nextProbPct = nextBandState ? Math.round(nextBandState.activityProbability * 100) : (sim.rxTelemetry?.nextProbPercent || 50);
    if (next) next.textContent = `${nextFreq.toFixed(3)} GHz (Pred Activity ${nextProbPct}%)`;

    const reward = document.getElementById('schedTotalReward');
    const comp = document.getElementById('schedCompositeScore');
    const attr = sim.schedulerAttribution || {};

    if (reward) reward.textContent = String(attr.totalScore !== undefined ? attr.totalScore : 68);
    if (comp) comp.textContent = String(attr.totalScore !== undefined ? attr.totalScore : 68);

    const setEl = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setEl('attrRecentHit', `+${attr.recentHit !== undefined ? attr.recentHit : 22}`);
    setEl('attrActivity', `+${attr.activity !== undefined ? attr.activity : 18}`);
    setEl('attrUncertainty', `+${attr.uncertainty !== undefined ? attr.uncertainty : 14}`);
    setEl('attrRecency', `+${attr.recency !== undefined ? attr.recency : 9}`);
    setEl('attrExploration', `+${attr.exploration !== undefined ? attr.exploration : 5}`);
    setEl('attrMissPenalty', attr.missPenalty !== undefined ? (attr.missPenalty <= 0 ? String(attr.missPenalty) : `-${attr.missPenalty}`) : '-0');

    const actionLabel = document.getElementById('schedActionLabel');
    if (actionLabel) {
      actionLabel.textContent = sim.receiverState === 'HIT' ? 'CONFIRMED INTERCEPT' : 'ALLOCATE RECEIVER';
      actionLabel.style.color = sim.receiverState === 'HIT' ? 'var(--state-verified)' : 'var(--radar-cyan)';
    }

    // Policy Inspector Rendering
    const pi = sim.policyInspector || {};
    setEl('piCurrentPolicy', sim.schedulerPolicy || pi.currentPolicy || 'Recency-Augmented UCB1');
    setEl('schedPolicyDisp', sim.schedulerPolicy || pi.currentPolicy || 'Recency-Augmented UCB1');
    setEl('piExplorationC', pi.explorationConstant !== undefined ? pi.explorationConstant.toFixed(3) : '1.414');
    setEl('piLearningRate', pi.learningRate || 'Conjugate Beta(α,β) (+1 per dwell)');
    setEl('piBestBand', `${(pi.currentBestBand || 9.420).toFixed(3)} GHz`);
    setEl('piUncertainty', pi.systemUncertainty !== undefined ? pi.systemUncertainty.toFixed(3) : '0.421');

    // Update active ablation toggle
    const currentAblation = sim.schedulerAblationMode || 'FULL_ADAPTIVE';
    const ablationGroup = document.getElementById('ablationBtnGroup');
    if (ablationGroup) {
      ablationGroup.querySelectorAll('.btn-ablation').forEach(btn => {
        if (btn.dataset.mode === currentAblation) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    }

    // Decision pipeline steps
    const stepSel = document.getElementById('schedStepSelected');
    if (stepSel) stepSel.textContent = `Target: ${curFreq.toFixed(3)} GHz (Max Q)`;

    const stepDwell = document.getElementById('schedStepDwell');
    if (stepDwell) stepDwell.textContent = `${sim.rfCurrentDwellMs || 180} ms Synthesizer lock`;

    const stepUpdate = document.getElementById('schedStepUpdate');
    if (stepUpdate) stepUpdate.textContent = `${sim.receiverState === 'HIT' ? 'HIT observed ➔ update p(θ|x)' : 'Dwell audit ➔ decay prior'}`;

    // 10-Attribute Per-Band Allocation State Table Rendering
    this.renderPerBandStateTable(sim);

    // Deterministic Learning Demonstrator Callout Rendering
    this.renderLearningDemonstrator(sim);

    // Live Decision Trace Feed Rendering
    this.renderDecisionTraceFeed(sim);

    // Render HIT/MISS history blocks
    this.renderHitMissGrid(sim);

    // Bayesian Prior vs Posterior Distribution Rendering
    this.renderBayesianDistribution(sim);

    // Band Priority & Occupancy Comparison Rendering
    this.renderBandPriorityComparison(sim);

    // Scheduler Decision Timeline Rendering
    this.renderSchedulerTimeline(sim);
  }

  renderPerBandStateTable(sim) {
    const tbody = document.getElementById('schedPerBandTableBody');
    if (!tbody) return;

    const bandsData = sim.perBandState || [];
    if (bandsData.length === 0) return;

    const currentScan = Number(Number(sim.rfCurrentScanGhz || 9.420).toFixed(3));
    const bestBand = sim.policyInspector?.currentBestBand || 9.420;

    tbody.innerHTML = bandsData.map(b => {
      const isActive = Math.abs(b.freqGhz - currentScan) < 0.005;
      const isBest = Math.abs(b.freqGhz - bestBand) < 0.005;
      const lastSeenStr = typeof b.lastObserved === 'number'
        ? `${b.lastObserved.toFixed(1)}s ago`
        : (b.lastObserved ? String(b.lastObserved) : 'None');

      return `
        <tr class="${isActive ? 'active-band-row' : ''} ${isBest ? 'best-band-row' : ''}">
          <td>
            <span class="band-indicator-dot ${isActive ? 'active' : ''}"></span>
            <b style="color:${isActive ? 'var(--radar-cyan)' : '#fff'};">${b.freqGhz.toFixed(3)} GHz</b>
          </td>
          <td>${b.visits}</td>
          <td style="color:var(--state-verified); font-weight:700;">${b.hits}</td>
          <td style="color:var(--text-tertiary);">${b.misses}</td>
          <td><span class="table-num-pill reward">${b.estimatedReward.toFixed(3)}</span></td>
          <td>${(b.activityProbability * 100).toFixed(1)}%</td>
          <td><span class="table-num-pill uncertainty">${b.uncertainty.toFixed(3)}</span></td>
          <td style="color:var(--text-tertiary);">${lastSeenStr}</td>
          <td style="color:var(--radar-cyan);">+${b.aging.toFixed(3)}</td>
          <td><span class="table-num-pill score">${b.currentScore.toFixed(3)}</span></td>
        </tr>
      `;
    }).join('');
  }

  renderLearningDemonstrator(sim) {
    const demo = sim.learningDemo;
    const callout = document.getElementById('learningDemoCallout');
    if (!callout) return;

    const stepGroup = document.getElementById('demoStepBtnGroup');
    if (stepGroup) {
      const activeStep = demo && demo.active ? demo.currentStep : 1;
      stepGroup.querySelectorAll('.btn-demo-step').forEach(btn => {
        if (Number(btn.dataset.step) === activeStep) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    }

    if (demo && demo.active && demo.stepData) {
      const s = demo.stepData;
      const badge = document.getElementById('demoStepBadge');
      if (badge) badge.textContent = `STEP ${demo.currentStep} / 5: ${s.label}`;

      const title = document.getElementById('demoStepTitle');
      if (title) title.textContent = s.observation || s.reasoning || s.label;

      const desc = document.getElementById('demoStepDesc');
      if (desc) desc.textContent = s.reasoning || s.learning || 'Decision logic step executed.';

      const metrics = document.getElementById('demoStepMetrics');
      if (metrics) {
        let chips = '';
        if (s.selectedBand) chips += `<span class="lc-chip">Selected: <b>${s.selectedBand.toFixed(3)} GHz</b></span>`;
        if (s.scoreA !== undefined) chips += `<span class="lc-chip">Score A (9.420G): <b>${s.scoreA.toFixed(3)}</b></span>`;
        if (s.scoreB !== undefined) chips += `<span class="lc-chip">Score B (9.675G): <b>${s.scoreB.toFixed(3)}</b></span>`;
        if (s.armA_misses !== undefined) chips += `<span class="lc-chip">Arm A Misses: <b>${s.armA_misses}</b></span>`;
        if (s.armB_reward !== undefined) chips += `<span class="lc-chip">Arm B μ: <b>${s.armB_reward.toFixed(3)}</b></span>`;
        chips += `<span class="lc-chip">Status: <b style="color:var(--state-verified);">OBSERVABLE CLOSED LOOP</b></span>`;
        metrics.innerHTML = chips;
      }
    }
  }

  renderDecisionTraceFeed(sim) {
    const container = document.getElementById('schedDecisionTraceFeed');
    if (!container) return;

    const traces = sim.recentDecisionTrace || [];
    if (traces.length === 0) {
      container.innerHTML = `
        <div style="font-family:var(--font-mono); font-size:9px; color:var(--text-tertiary); padding:10px; text-align:center;">
          Awaiting receiver decision cycles...
        </div>
      `;
      return;
    }

    const countBadge = document.getElementById('decisionTraceCount');
    if (countBadge) countBadge.textContent = `${traces.length} DECISIONS LOGGED`;

    container.innerHTML = traces.slice(0, 10).map((dec, idx) => {
      const isLatest = idx === 0;
      const prevClass = dec.previousOutcome === 'HIT' ? 'hit' : (dec.previousOutcome === 'MISS' ? 'miss' : '');
      const maxScore = Math.max(...(dec.candidateScores || []).map(c => c.score), 0.01);

      const microbars = (dec.candidateScores || []).map(c => {
        const isSel = Math.abs(c.band - dec.selectedBand) < 0.005;
        const pct = Math.min(100, Math.max(5, Math.round((c.score / maxScore) * 100)));
        return `
          <div class="dc-bar-row">
            <span class="dc-bar-label">${c.band.toFixed(3)}G</span>
            <div class="dc-bar-track">
              <div class="dc-bar-fill ${isSel ? 'selected' : ''}" style="width:${pct}%;"></div>
            </div>
            <span class="dc-bar-val" style="color:${isSel ? 'var(--radar-cyan)' : 'var(--text-tertiary)'}; font-weight:${isSel ? '700' : '400'};">
              ${c.score.toFixed(3)}
            </span>
          </div>
        `;
      }).join('');

      const factors = (dec.topFactors || []).map(f => `<span class="dc-factor-pill">${f}</span>`).join('');

      return `
        <div class="decision-card ${isLatest ? 'latest' : ''}">
          <div class="dc-header">
            <span class="dc-id">${dec.decisionId || ('DEC-#' + (1000 + idx))}</span>
            <span class="dc-time">${dec.timestamp || '00:00:00'}</span>
            <span class="dc-prev-outcome ${prevClass}">PREV: ${dec.previousOutcome}</span>
          </div>
          <div class="dc-target-row">
            <span class="dc-band">TUNED: ${dec.selectedBand.toFixed(3)} GHz (${dec.dwell || 180} ms)</span>
            <span class="dc-score">Q = ${dec.selectedScore.toFixed(3)}</span>
          </div>
          <div class="dc-reasoning">"${dec.reasoning || 'Selected via Upper Confidence Bound policy.'}"</div>
          <div class="dc-microbars">
            ${microbars}
          </div>
          <div class="dc-factors">
            ${factors}
          </div>
        </div>
      `;
    }).join('');
  }

  renderHitMissGrid(sim) {
    if (!this.dwellHistory) {
      this.dwellHistory = [];
      const traces = (sim.recentDecisionTrace || []).slice(0, 24).reverse();
      traces.forEach(dec => {
        let type = 'miss';
        if (dec.previousOutcome === 'HIT') {
          type = 'hit';
        } else if (dec.previousOutcome === 'INITIAL_SURVEY' || (dec.topFactors && dec.topFactors.some(f => f.toLowerCase().includes('explor') || f.toLowerCase().includes('unvisited')))) {
          type = 'explore';
        }
        this.dwellHistory.push({
          type,
          freq: `${dec.selectedBand.toFixed(2)}G`,
          id: dec.decisionId
        });
      });
      while (this.dwellHistory.length < 24) {
        this.dwellHistory.unshift({ type: 'explore', freq: '9.42G', id: 'INIT' });
      }
    }

    const curScanNum = Number(sim.rfCurrentScanGhz || 9.420);
    const latestDec = sim.recentDecisionTrace && sim.recentDecisionTrace[0];
    const decisionKey = latestDec ? latestDec.decisionId : `${curScanNum.toFixed(3)}_${sim.simulationTimeSec || 0}`;

    if (this._lastProcessedDecision !== decisionKey) {
      this._lastProcessedDecision = decisionKey;

      let outcomeType = 'miss';
      if (sim.receiverState === 'HIT' || (latestDec && latestDec.previousOutcome === 'HIT')) {
        outcomeType = 'hit';
      } else {
        const isExplore = (latestDec && latestDec.previousOutcome === 'INITIAL_SURVEY') ||
          (latestDec && latestDec.topFactors && latestDec.topFactors.some(f => f.toLowerCase().includes('explor') || f.toLowerCase().includes('unvisited'))) ||
          (sim.schedulerAttribution && sim.schedulerAttribution.uncertainty > 12);
        outcomeType = isExplore ? 'explore' : 'miss';
      }

      const freqLabel = `${curScanNum.toFixed(2)}G`;
      this.dwellHistory.shift();
      this.dwellHistory.push({ type: outcomeType, freq: freqLabel, id: decisionKey });
    }

    const grid = document.getElementById('schedHitMissGrid');
    if (grid) {
      grid.innerHTML = this.dwellHistory.map(b => `
        <div class="hm-block ${b.type}">
          <div class="hm-block-status">${b.type.toUpperCase()}</div>
          <div class="hm-block-freq">${b.freq}</div>
        </div>
      `).join('');
    }

    const hits = this.dwellHistory.filter(b => b.type === 'hit').length;
    const total = this.dwellHistory.length;
    const rate = total > 0 ? ((hits / total) * 100).toFixed(1) : '0.0';
    const summary = document.getElementById('schedHitMissSummary');
    if (summary) {
      summary.textContent = `${hits} HITS / ${total} DWELLS (${rate}%)`;
    }
  }

  renderBayesianDistribution(sim) {
    const container = document.getElementById('schedBayesDistContainer');
    if (!container) return;

    const bands = sim.perBandState || [];
    if (bands.length === 0) return;

    const currentScan = Number(Number(sim.rfCurrentScanGhz || 9.420).toFixed(3));
    const nextScan = Number(Number(sim.rfNextScanGhz || 9.675).toFixed(3));

    container.innerHTML = bands.map(b => {
      const isTarget = Math.abs(b.freqGhz - currentScan) < 0.005;
      const isNext = Math.abs(b.freqGhz - nextScan) < 0.005;
      const roleLabel = isTarget ? '[TARGET BAND]' : (isNext ? '[SECONDARY AGILITY]' : (b.visits === 0 ? '[UNEXPLORED]' : '[AUXILIARY]'));

      const alpha = b.alpha !== undefined ? b.alpha : (b.hits || 1);
      const beta = b.beta !== undefined ? b.beta : (b.misses || 1);
      const postProb = b.activityProbability !== undefined ? b.activityProbability : (alpha / (alpha + beta));

      let priorAlpha = alpha;
      let priorBeta = beta;
      if (isTarget) {
        if (sim.receiverState === 'HIT') {
          priorAlpha = Math.max(1, alpha - 1);
        } else {
          priorBeta = Math.max(1, beta - 1);
        }
      } else if (b.lastOutcome === 'HIT') {
        priorAlpha = Math.max(1, alpha - 1);
      } else if (b.lastOutcome === 'MISS') {
        priorBeta = Math.max(1, beta - 1);
      }

      const priorProb = priorAlpha / (priorAlpha + priorBeta);
      const priorPercent = Math.round(priorProb * 100);
      const postPercent = Math.round(postProb * 100);
      const delta = postPercent - priorPercent;
      const deltaStr = delta >= 0 ? `+${delta}%` : `${delta}%`;

      const barColor = isTarget ? 'var(--radar-cyan)' : (isNext ? 'var(--state-warning)' : (b.visits === 0 ? 'var(--text-tertiary)' : 'var(--openloop-teal)'));
      const barClass = isTarget || isNext ? 'bar-fill-adaptive' : 'bar-fill-openloop';

      return `
        <div>
          <div style="display:flex; justify-content:space-between; font-family:var(--font-mono); font-size:9px; margin-bottom:2px;">
            <span style="color:${isTarget ? 'var(--radar-cyan)' : '#fff'}; font-weight:${isTarget ? '700' : '400'};">${b.freqGhz.toFixed(3)} GHz ${roleLabel}</span>
            <span style="color:${barColor};">Prior: Beta(${priorAlpha.toFixed(0)},${priorBeta.toFixed(0)}) [${priorPercent}%] ➔ Post: Beta(${alpha.toFixed(0)},${beta.toFixed(0)}) [${postPercent}%] (${deltaStr})</span>
          </div>
          <div class="bar-track">
            <div class="${barClass}" style="width:${Math.max(4, Math.min(100, postPercent))}%; background:${barColor};"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  renderBandPriorityComparison(sim) {
    const container = document.getElementById('schedBandPriorityContainer');
    if (!container) return;

    const bands = sim.perBandState || [];
    if (bands.length === 0) return;

    const currentScan = Number(Number(sim.rfCurrentScanGhz || 9.420).toFixed(3));
    const nextScan = Number(Number(sim.rfNextScanGhz || 9.675).toFixed(3));
    const maxScore = Math.max(...bands.map(b => b.currentScore), 1.0);

    container.innerHTML = bands.map(b => {
      const isTarget = Math.abs(b.freqGhz - currentScan) < 0.005;
      const isNext = Math.abs(b.freqGhz - nextScan) < 0.005;
      const role = isTarget ? '(Primary Target)' : (isNext ? '(Secondary Agility)' : (b.visits === 0 ? '(Exploration Band)' : '(Auxiliary Sensor)'));
      const widthPct = Math.max(8, Math.min(100, Math.round((b.currentScore / maxScore) * 100)));
      const color = isTarget ? 'var(--radar-cyan)' : (isNext ? 'var(--state-warning)' : 'var(--text-secondary)');
      const fillClass = isTarget || isNext ? 'bar-fill-adaptive' : 'bar-fill-openloop';

      return `
        <div>
          <div style="display:flex; justify-content:space-between; font-family:var(--font-mono); font-size:9.5px; margin-bottom:2px;">
            <span style="color:${isTarget ? 'var(--radar-cyan)' : '#fff'}; font-weight:${isTarget ? '700' : '400'};">${b.freqGhz.toFixed(3)} GHz ${role}</span>
            <span style="color:${color}; font-weight:700;">Score Q: ${b.currentScore.toFixed(3)}</span>
          </div>
          <div class="bar-track">
            <div class="${fillClass}" style="width:${widthPct}%; background:${color};"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  renderSchedulerTimeline(sim) {
    const container = document.getElementById('schedulerTimelineContainer');
    if (!container) return;

    const decisions = sim.recentDecisionTrace || [];
    if (decisions.length === 0) {
      container.innerHTML = `<div style="padding:10px; color:var(--text-tertiary); font-size:10px; font-family:var(--font-mono);">AWAITING SCHEDULER DECISION CYCLES...</div>`;
      return;
    }

    container.innerHTML = decisions.slice(0, 10).map((d, idx) => {
      const isLatest = idx === 0;
      const prevColor = d.previousOutcome === 'HIT' ? 'var(--state-verified)' : (d.previousOutcome === 'MISS' ? 'var(--state-critical)' : 'var(--text-secondary)');
      const borderColor = isLatest ? 'var(--radar-cyan)' : (d.previousOutcome === 'HIT' ? 'rgba(66,196,122,0.4)' : 'rgba(255,255,255,0.1)');
      const factors = (d.topFactors || []).map(f => `<span style="font-size:7.5px; padding:1px 4px; border-radius:2px; background:rgba(24,184,214,0.1); color:var(--radar-cyan); border:1px solid rgba(24,184,214,0.25);">${f}</span>`).join(' ');

      return `
        <div class="sos-log-item" style="border-left:3px solid ${borderColor}; margin-bottom:4px; padding:6px 8px; background:rgba(12,20,30,0.6);">
          <div class="sos-time-col" style="display:flex; flex-direction:column; gap:2px; min-width:65px;">
            <span class="sos-time" style="font-size:8px; color:var(--text-tertiary); font-family:var(--font-mono);">${d.timestamp || '00:00:00'}</span>
            <span class="sos-tag tag-normal" style="font-size:7.5px; padding:1px 4px; font-weight:700; width:fit-content; background:rgba(24,184,214,0.12); color:var(--radar-cyan); border:1px solid rgba(24,184,214,0.3);">${d.decisionId || ('DEC-#' + (1000 + idx))}</span>
          </div>
          <div class="sos-desc-col" style="flex:1; margin-left:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div class="sos-title" style="color:#fff; font-size:9.5px; font-weight:700;">
                ALLOCATE RECEIVER: <span style="color:var(--radar-cyan);">${d.selectedBand.toFixed(3)} GHz</span>
                <span style="font-size:8.5px; color:var(--text-secondary); margin-left:4px;">(Q = ${d.selectedScore.toFixed(3)})</span>
              </div>
              <span style="font-family:var(--font-mono); font-size:8px; color:${prevColor}; font-weight:700; background:rgba(0,0,0,0.4); padding:1px 5px; border-radius:2px; border:1px solid ${prevColor};">
                PREV: ${d.previousOutcome || 'INITIAL_SURVEY'}
              </span>
            </div>
            <div class="sos-meta" style="font-size:8.5px; color:var(--text-secondary); margin-top:2px;">
              [<span style="color:var(--radar-cyan);">${d.policy || 'Recency-Augmented UCB1'}</span>] ${d.reasoning || ''}
            </div>
            ${factors ? `<div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:3px;">${factors}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  /* --------------------------------------------------------------------------
     8. PAGE 7: SIMULATION CONTROL CENTER RENDERING
     -------------------------------------------------------------------------- */
  updateSimulationPage(sim) {
    // 1. Subsystem Engine Health Indicators
    const subsysRadar = document.getElementById('subsysRadarEngine');
    if (subsysRadar) {
      subsysRadar.textContent = sim.isRunning ? `ONLINE (${sim.sweepRpm || 24} RPM)` : 'PAUSED (STANDBY)';
      subsysRadar.style.color = sim.isRunning ? 'var(--state-verified)' : 'var(--state-warning)';
    }

    const subsysOptical = document.getElementById('subsysOpticalNet');
    if (subsysOptical) {
      subsysOptical.textContent = sim.cameraNetwork || '4 / 4 ONLINE';
      subsysOptical.style.color = 'var(--cam-blue)';
    }

    const subsysRf = document.getElementById('subsysRfReceiver');
    if (subsysRf) {
      subsysRf.textContent = `${sim.receiverStatus || 'ACTIVE'} (${sim.rfIbwMhz || 50} MHz IBW // ${sim.receiverState || 'IDLE'})`;
      subsysRf.style.color = sim.receiverState === 'HIT' ? 'var(--state-verified)' : 'var(--radar-cyan)';
    }

    const subsysFusion = document.getElementById('subsysFusion');
    if (subsysFusion) {
      subsysFusion.textContent = sim.isRunning ? 'SYNCHRONIZED (25 Hz)' : 'PAUSED';
      subsysFusion.style.color = sim.isRunning ? 'var(--radar-cyan)' : 'var(--state-warning)';
    }

    const subsysSched = document.getElementById('subsysScheduler');
    if (subsysSched) {
      subsysSched.textContent = `${sim.schedulerEngineStatus || 'HEALTHY'} (${sim.schedulerAblationMode || 'FULL_ADAPTIVE'})`;
      subsysSched.style.color = 'var(--radar-cyan)';
    }

    // 2. Scenario Badge & Scenario Button 1-to-1 Active Selection
    const scBadge = document.getElementById('simCurScenarioBadge');
    if (scBadge) scBadge.textContent = sim.scenario || 'STANDARD MONITORING';

    const normalizeSc = s => (s || '').toUpperCase().replace(/[^A-Z]/g, '');
    const curScNorm = normalizeSc(sim.scenario);
    let matchedBtn = null;
    document.querySelectorAll('.btn-scenario').forEach(btn => {
      const btnSc = normalizeSc(btn.getAttribute('data-scenario'));
      const isMatch = btnSc === curScNorm || curScNorm.startsWith(btnSc) || btnSc.startsWith(curScNorm);
      if (isMatch && !matchedBtn) {
        matchedBtn = btn;
      }
    });
    document.querySelectorAll('.btn-scenario').forEach(btn => {
      btn.classList.toggle('active', btn === matchedBtn);
    });

    // 2b. Execution & Speed Controls Sync
    const pauseSimBtn = document.getElementById('btnSimPauseResume');
    if (pauseSimBtn) {
      pauseSimBtn.textContent = sim.isRunning ? 'PAUSE' : 'RESUME';
      pauseSimBtn.style.color = sim.isRunning ? '#fff' : 'var(--state-warning)';
      pauseSimBtn.style.borderColor = sim.isRunning ? 'var(--border-default)' : 'var(--state-warning)';
    }
    const pauseRadarBtn = document.getElementById('btnRadarPauseResume');
    if (pauseRadarBtn) {
      pauseRadarBtn.textContent = sim.isRunning ? 'PAUSE' : 'RESUME';
    }
    document.querySelectorAll('.btn-speed').forEach(btn => {
      const sp = Number(btn.getAttribute('data-speed')) || 1;
      btn.classList.toggle('active', sp === (sim.speedMultiplier || 1));
    });

    // 3. Automated 12-Step Demo Step Progress & UI State
    const demoStepBadge = document.getElementById('simDemoStepBadge');
    const demoStepText = document.getElementById('demoStepIndicatorText');
    const demoStepCount = document.getElementById('demoStepCountBadge');
    const demoTriggerBtn = document.getElementById('btnSimTriggerDemo');

    if (sim.isDemoActive && sim.demoStep) {
      if (demoStepBadge) {
        demoStepBadge.textContent = `RUNNING: STEP ${sim.demoStep.current} / 12`;
        demoStepBadge.style.color = 'var(--state-warning)';
      }
      if (demoStepText) demoStepText.textContent = sim.demoStep.label || `Executing Step ${sim.demoStep.current}...`;
      if (demoStepCount) demoStepCount.textContent = `${sim.demoStep.current} / 12`;
      if (demoTriggerBtn) {
        demoTriggerBtn.textContent = `⏳ RUNNING STEP ${sim.demoStep.current} / 12...`;
        demoTriggerBtn.style.opacity = '0.75';
      }
    } else if (sim.demoStep && sim.demoStep.current === 12 && !sim.isDemoActive) {
      if (demoStepBadge) {
        demoStepBadge.textContent = 'COMPLETED (12/12)';
        demoStepBadge.style.color = 'var(--state-verified)';
      }
      if (demoStepText) demoStepText.textContent = 'COMPLETED: Operational state updated to REQUIRES VERIFICATION';
      if (demoStepCount) demoStepCount.textContent = '12 / 12';
      if (demoTriggerBtn) {
        demoTriggerBtn.textContent = '▶ RUN EXACT 12-STEP DEMO: NIGHT PERIMETER MONITORING';
        demoTriggerBtn.style.opacity = '1.0';
      }
    } else {
      if (demoStepBadge) {
        demoStepBadge.textContent = 'READY';
        demoStepBadge.style.color = 'var(--radar-amber)';
      }
      if (demoStepText) demoStepText.textContent = 'DEMO STATUS: READY TO EXECUTE';
      if (demoStepCount) demoStepCount.textContent = '0 / 12';
      if (demoTriggerBtn) {
        demoTriggerBtn.textContent = '▶ RUN EXACT 12-STEP DEMO: NIGHT PERIMETER MONITORING';
        demoTriggerBtn.style.opacity = '1.0';
      }
    }

    // 4. Comprehensive Live JSON State & Telemetry Inspector
    const inspector = document.getElementById('simLiveJsonInspector');
    if (inspector) {
      const activeEnt = (this.entities || []).find(e => e.id === sim.selectedEntityId) || null;
      const displayData = {
        simulation: {
          id: sim.simulationId || 'SIM-EW-2026-0941',
          operatingMode: sim.operatingMode,
          scenario: sim.scenario,
          isRunning: sim.isRunning,
          speedMultiplier: sim.speedMultiplier || 1,
          radarSweepAngleDeg: Math.round(sim.radarSweepAngle || 0),
          isDemoActive: Boolean(sim.isDemoActive),
          demoStep: sim.demoStep || null
        },
        selectedEntity: activeEnt ? {
          id: activeEnt.id,
          type: activeEnt.type,
          rangeMeters: activeEnt.radar?.range,
          azimuthDeg: activeEnt.radar?.azimuth,
          speedKmh: activeEnt.radar?.speedKmh,
          classification: activeEnt.fusion?.classification,
          confidence: activeEnt.fusion?.confidence,
          anomalyScore: activeEnt.fusion?.anomalyScore,
          activeCamera: activeEnt.camera?.visibleCamId || 'NONE',
          rfAssociated: activeEnt.fusion?.rfAssociated
        } : sim.selectedEntityId,
        rfReceiver: {
          tunedFreqGhz: sim.rfCurrentScanGhz,
          nextScanGhz: sim.rfNextScanGhz,
          state: sim.receiverState,
          ibwMhz: sim.rxTelemetry?.ibwMhz || 50,
          measuredSnrDb: sim.rxTelemetry?.snrDb,
          signalPowerDbm: sim.rxTelemetry?.powerDbm,
          associatedEmitter: sim.rxTelemetry?.assocEmitter,
          statusFeedback: sim.rxTelemetry?.feedback,
          predictedProbability: sim.rxTelemetry?.nextProbPercent
        },
        adaptiveScheduler: {
          policy: sim.schedulerPolicy || 'Recency-Augmented UCB1',
          ablationMode: sim.schedulerAblationMode || 'FULL_ADAPTIVE',
          status: sim.schedulerEngineStatus || 'HEALTHY',
          attribution: sim.schedulerAttribution
        },
        subsystems: {
          radarEngine: sim.isRunning ? `ONLINE (${sim.sweepRpm || 24} RPM)` : 'PAUSED',
          opticalNetwork: sim.cameraNetwork || '4 / 4 ONLINE',
          activeCameraId: sim.activeCameraId,
          rfEsmReceiver: `${sim.receiverStatus || 'ACTIVE'} (${sim.rfIbwMhz || 50} MHz IBW)`,
          sensorFusion: sim.isRunning ? 'SYNCHRONIZED (25 Hz)' : 'STANDBY',
          entitiesOnline: (this.entities || []).length,
          activeIncidents: (this.incidents || []).length
        },
        timestamp: new Date().toISOString()
      };
      inspector.textContent = JSON.stringify(displayData, null, 2);
    }
  }

  renderEventFeeds(timeline) {
    const renderItems = list => list.slice(0, 8).map(ev => `
      <div style="display:flex; align-items:center; gap:6px; padding:2px 0; font-family:var(--font-mono); font-size:9px;">
        <span style="color:var(--text-tertiary); font-size:8.5px;">${ev.time}</span>
        <span class="track-pill unknown">${ev.source}</span>
        <span style="color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${ev.event}</span>
      </div>
    `).join('');

    const rfTimeline = document.getElementById('rfBurstTimelineContainer');
    if (rfTimeline) rfTimeline.innerHTML = renderItems(timeline);

    try { this.renderOpticalEventLog(); } catch (err) { console.error('Error rendering optical event log in renderEventFeeds:', err); }

    if (this.simState) {
      try { this.renderSchedulerTimeline(this.simState); } catch (err) { console.error('Error in renderSchedulerTimeline from renderEventFeeds:', err); }
    } else {
      const schedTimeline = document.getElementById('schedulerTimelineContainer');
      if (schedTimeline) schedTimeline.innerHTML = renderItems(timeline.filter(e => e.source === 'SCHEDULER' || e.source === 'RECEIVER'));
    }
  }

  /* --------------------------------------------------------------------------
     9. USER INTERACTION & CONTROLS
     -------------------------------------------------------------------------- */
  selectEntity(entityId) {
    if (this.simState) {
      this.simState.selectedEntityId = entityId;
    }
    if (this.radar) {
      this.radar.selectedEntityId = entityId;
    }
    if (this.camera) {
      this.camera.selectedEntityId = entityId;
    }
    if (this.entities) {
      this.renderRadarPageTrackCards(this.entities);
      this.renderCameraDetections(this.entities);
      this.renderSensorFusionPage(this.entities);
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: 'SELECT_ENTITY', entityId }));
    }
  }

  selectCamera(camId) {
    if (this.simState) {
      this.simState.activeCameraId = camId;
    }
    if (this.camera) {
      this.camera.activeCamId = camId;
    }
    document.querySelectorAll('.cam-big-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-cam') === camId);
    });
    if (this.entities) {
      this.renderCameraDetections(this.entities);
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: 'SELECT_CAMERA', camId }));
    }
  }

  stepSimulationScan() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: 'STEP_SCAN' }));
    }
  }

  setupListeners() {
    // Camera tabs
    document.querySelectorAll('.cam-big-tab-btn').forEach(btn => {
      btn.onclick = () => {
        const camId = btn.getAttribute('data-cam');
        this.selectCamera(camId);
      };
    });

    // Scenario buttons (Page 1 and Page 7)
    document.querySelectorAll('.btn-scenario').forEach(btn => {
      btn.onclick = () => {
        const scenario = btn.getAttribute('data-scenario');
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ action: 'SELECT_SCENARIO', scenario }));
        }
      };
    });

    // Speed multiplier buttons
    document.querySelectorAll('.btn-speed').forEach(btn => {
      btn.onclick = () => {
        const speed = btn.getAttribute('data-speed');
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ action: 'SET_SPEED', speed }));
        }
      };
    });

    // Radar page controls
    const radarPause = document.getElementById('btnRadarPauseResume');
    if (radarPause) {
      radarPause.onclick = () => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ action: 'PAUSE_RESUME' }));
        }
      };
    }

    const radarReset = document.getElementById('btnRadarReset');
    if (radarReset) {
      radarReset.onclick = () => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ action: 'RESET' }));
        }
      };
    }

    const radarDemo = document.getElementById('btnRadarTriggerDemo');
    if (radarDemo) {
      radarDemo.onclick = () => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ action: 'TRIGGER_DEMO' }));
        }
      };
    }

    // Simulation page controls
    const simPause = document.getElementById('btnSimPauseResume');
    if (simPause) {
      simPause.onclick = () => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ action: 'PAUSE_RESUME' }));
        }
      };
    }

    const simStep = document.getElementById('btnSimStep');
    if (simStep) {
      simStep.onclick = () => {
        this.stepSimulationScan();
      };
    }

    const simReset = document.getElementById('btnSimReset');
    if (simReset) {
      simReset.onclick = () => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ action: 'RESET' }));
        }
      };
    }

    const simDemo = document.getElementById('btnSimTriggerDemo');
    if (simDemo) {
      simDemo.onclick = () => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ action: 'TRIGGER_DEMO' }));
        }
      };
    }

    // Policy Ablation Toggles (Adaptive Scheduler)
    const ablationGroup = document.getElementById('ablationBtnGroup');
    if (ablationGroup) {
      ablationGroup.querySelectorAll('.btn-ablation').forEach(btn => {
        btn.onclick = () => {
          const mode = btn.dataset.mode;
          if (mode && this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ action: 'SET_SCHEDULER_ABLATION', mode }));
          }
        };
      });
    }

    // Deterministic Learning Demonstrator Controls
    const demoStepGroup = document.getElementById('demoStepBtnGroup');
    if (demoStepGroup) {
      demoStepGroup.querySelectorAll('.btn-demo-step').forEach(btn => {
        btn.onclick = () => {
          const step = Number(btn.dataset.step);
          if (step && this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ action: 'STEP_LEARNING_DEMO', step }));
          }
        };
      });
    }

    const runDemoBtn = document.getElementById('btnRunLearningDemo');
    if (runDemoBtn) {
      runDemoBtn.onclick = () => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ action: 'RUN_LEARNING_DEMO' }));
        }
      };
    }

    const resetDemoBtn = document.getElementById('btnResetLearningDemo');
    if (resetDemoBtn) {
      resetDemoBtn.onclick = () => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ action: 'RESET_LEARNING_DEMO' }));
        }
      };
    }

    // Analytics Benchmark Run & Reset
    const runBenchBtn = document.getElementById('btnRunBenchmark');
    if (runBenchBtn) {
      runBenchBtn.onclick = () => {
        const seedInput = document.getElementById('inputBenchmarkSeed');
        const scenarioSelect = document.getElementById('selectBenchmarkScenario');
        const runsSelect = document.getElementById('selectBenchmarkRuns');

        const seed = seedInput ? Number(seedInput.value) || 42 : 42;
        const scenario = scenarioSelect ? scenarioSelect.value : 'FREQUENCY_AGILE';
        const runs = runsSelect ? Number(runsSelect.value) || 1000 : 1000;

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({
            action: 'RUN_BENCHMARK',
            seed,
            scenario,
            runs
          }));
        }
      };
    }

    const runSuiteBtn = document.getElementById('btnRunSuite');
    if (runSuiteBtn) {
      runSuiteBtn.onclick = () => {
        const seedInput = document.getElementById('inputBenchmarkSeed');
        const runsSelect = document.getElementById('selectBenchmarkRuns');
        const seed = seedInput ? Number(seedInput.value) || 42 : 42;
        const runs = runsSelect ? Number(runsSelect.value) || 1000 : 1000;
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({
            action: 'RUN_BENCHMARK_SUITE',
            seed,
            runs
          }));
        }
      };
    }

    const replayBtn = document.getElementById('btnReplayBenchmark');
    if (replayBtn) {
      replayBtn.onclick = () => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({
            action: 'REPLAY_EXPERIMENT'
          }));
        }
      };
    }

    const downloadBenchmark = (url, fallbackName) => {
      const a = document.createElement('a');
      a.href = url;
      a.download = fallbackName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    };

    const exportJsonBtn = document.getElementById('btnExportBenchmarkJson');
    if (exportJsonBtn) {
      exportJsonBtn.onclick = () => {
        const expId = this.analyticsData?.provenance?.experimentId || '';
        const url = expId ? `/api/benchmark/export/json?experimentId=${encodeURIComponent(expId)}` : '/api/benchmark/export/json';
        downloadBenchmark(url, `BENCHMARK-${expId || 'LATEST'}.json`);
      };
    }

    const exportCsvBtn = document.getElementById('btnExportBenchmarkCsv');
    if (exportCsvBtn) {
      exportCsvBtn.onclick = () => {
        const expId = this.analyticsData?.provenance?.experimentId || '';
        const url = expId ? `/api/benchmark/export/csv?experimentId=${encodeURIComponent(expId)}` : '/api/benchmark/export/csv';
        downloadBenchmark(url, `BENCHMARK-${expId || 'LATEST'}.csv`);
      };
    }

    const exportReportBtn = document.getElementById('btnExportBenchmarkReport');
    if (exportReportBtn) {
      exportReportBtn.onclick = () => {
        const expId = this.analyticsData?.provenance?.experimentId || '';
        const url = expId ? `/api/benchmark/export/report?experimentId=${encodeURIComponent(expId)}` : '/api/benchmark/export/report';
        downloadBenchmark(url, `BENCHMARK-AUDIT-${expId || 'LATEST'}.txt`);
      };
    }

    const resetAnalyticsBtn = document.getElementById('btnResetAnalytics');
    if (resetAnalyticsBtn) {
      resetAnalyticsBtn.onclick = () => {
        if (this.analytics) {
          this.analytics.reset();
        }
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ action: 'RESET_ANALYTICS' }));
        }
      };
    }

    // Export SITREP
    const sitrepBtn = document.getElementById('btnExportSitrepGlobal');
    if (sitrepBtn) {
      sitrepBtn.onclick = () => {
        window.location.href = '/api/sitrep';
      };
    }

    // Modals
    const modalAdd = document.getElementById('modalAddPersonnel');
    const modalDetails = document.getElementById('modalPersonnelDetails');

    const openAdd = document.getElementById('btnOpenAddPersonnel');
    if (openAdd) openAdd.onclick = () => modalAdd.classList.add('open');

    const cancelAdd = document.getElementById('btnCancelAddPerson');
    if (cancelAdd) cancelAdd.onclick = () => modalAdd.classList.remove('open');

    const confirmAdd = document.getElementById('btnConfirmAddPerson');
    if (confirmAdd) {
      confirmAdd.onclick = () => {
        const name = document.getElementById('inputNewPersonName').value.trim();
        const tagId = document.getElementById('inputNewPersonTag').value.trim();
        const role = document.getElementById('inputNewPersonRole').value.trim();
        if (name && tagId) {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
              action: 'ADD_PERSONNEL',
              person: { tagId, name, role: role || 'Base Camp Security', status: 'VERIFIED' }
            }));
          }
          modalAdd.classList.remove('open');
        }
      };
    }

    const openDetails = document.getElementById('btnViewPersonnelDetails');
    if (openDetails) openDetails.onclick = () => modalDetails.classList.add('open');

    const closeDetails = document.getElementById('btnClosePersonnelDetails');
    if (closeDetails) closeDetails.onclick = () => modalDetails.classList.remove('open');

    // False Alarm Test button
    const falseAlarmBtn = document.getElementById('btnRunFalseAlarmTest');
    if (falseAlarmBtn) {
      falseAlarmBtn.onclick = () => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ action: 'RUN_INCIDENT_FALSE_ALARM_TEST' }));
        }
      };
    }

    // Page 7: Simulation & Scenario Control Center Event Listeners
    document.querySelectorAll('.btn-scenario').forEach(btn => {
      btn.onclick = () => {
        const scenario = btn.getAttribute('data-scenario');
        if (scenario && this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ action: 'SELECT_SCENARIO', scenario }));
        }
      };
    });

    const pauseSimBtn = document.getElementById('btnSimPauseResume');
    if (pauseSimBtn) {
      pauseSimBtn.onclick = () => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ action: 'PAUSE_RESUME' }));
        }
      };
    }

    const pauseRadarBtn = document.getElementById('btnRadarPauseResume');
    if (pauseRadarBtn) {
      pauseRadarBtn.onclick = () => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ action: 'PAUSE_RESUME' }));
        }
      };
    }

    const stepSimBtn = document.getElementById('btnSimStep');
    if (stepSimBtn) {
      stepSimBtn.onclick = () => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ action: 'STEP_SIM' }));
        }
      };
    }

    const resetSimBtn = document.getElementById('btnSimReset');
    if (resetSimBtn) {
      resetSimBtn.onclick = () => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ action: 'RESET' }));
        }
      };
    }

    document.querySelectorAll('.btn-speed').forEach(btn => {
      btn.onclick = () => {
        const speed = Number(btn.getAttribute('data-speed')) || 1;
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ action: 'SET_SPEED', speed }));
        }
      };
    });

    const triggerDemoBtn = document.getElementById('btnSimTriggerDemo');
    if (triggerDemoBtn) {
      triggerDemoBtn.onclick = () => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ action: 'TRIGGER_DEMO' }));
        }
      };
    }
  }

  /* --------------------------------------------------------------------------
     INCIDENT ENGINE: Acknowledge & WS Handler
     -------------------------------------------------------------------------- */
  acknowledgeIncident(incidentId) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        action: 'ACKNOWLEDGE_INCIDENT',
        incidentId,
        operatorName: 'TACTICAL OPERATOR'
      }));
    }
  }

  handleIncidentTestResult(result) {
    const lines = result.testResults.map(t =>
      `${t.pass ? '✓' : '✗'} ${t.scenario}: ${t.evaluated} (Risk ${t.riskScore}/100) — ${t.pass ? 'PASS' : 'FAIL'}`
    ).join('\n');
    const summary = result.success ? '✓ ALL FALSE ALARM TESTS PASSED' : '✗ SOME FALSE ALARM TESTS FAILED';
    // Show a quick status overlay in the timeline
    console.log('[FALSE ALARM TEST]\n' + summary + '\n' + lines);
    // Flash a visible notification by briefly updating alert count color
    const el = document.getElementById('sosAlertCount');
    if (el) {
      const orig = el.style.color;
      el.textContent = result.success ? '✓ TEST PASSED' : '✗ TEST FAILED';
      el.style.color = result.success ? 'var(--state-verified)' : 'var(--state-critical)';
      setTimeout(() => {
        if (this.incidents) this.renderSosLogs(this.sosLogs || [], this.incidents);
      }, 3000);
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.app = new TacticalC2App();
});
