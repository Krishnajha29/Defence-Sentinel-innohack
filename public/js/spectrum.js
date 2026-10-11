/**
 * Defence-Sentinel: RF / ESM Intelligence Spectrum Analyzer & Waterfall Spectrogram
 * Single Source of Truth: Synthesizes spectral peaks from master transmitting entities
 * and live backend receiver telemetry (simState.rxTelemetry).
 */

class CompactSpectrumAnalyzer {
  constructor(canvasId = 'rfDedicatedSpectrumCanvas') {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');

    this.minFreq = 9.00;
    this.maxFreq = 10.00;
    this.minPower = -100.0;
    this.maxPower = -40.0;

    this.entities = [];
    this.simState = null;
    this.width = 600;
    this.height = 340;

    // Waterfall history buffer (75 rows x 180 frequency bins)
    this.waterfallRows = 75;
    this.waterfallBins = 180;
    this.waterfallHistory = [];
    this.lastWaterfallPush = 0;

    // Initialize waterfall with baseline noise and default scan raster
    for (let r = 0; r < this.waterfallRows; r++) {
      const powers = new Float32Array(this.waterfallBins);
      for (let b = 0; b < this.waterfallBins; b++) {
        powers[b] = -94.0 + (Math.sin(b * 0.3) * 0.8);
      }
      this.waterfallHistory.push({
        powers,
        dwellGhz: 9.420,
        isHit: r % 2 === 0
      });
    }

    this.setupEvents();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    if (!this.canvas) return;
    const parent = this.canvas.parentElement;
    if (!parent || parent.clientWidth <= 0 || parent.clientHeight <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    this.width = parent.clientWidth;
    this.height = parent.clientHeight;

    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.ctx.scale(dpr, dpr);
  }

  setupEvents() {
    if (!this.canvas) return;
    this.canvas.addEventListener('click', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const padL = 46;
      const padR = 20;
      const plotW = this.width - padL - padR;

      if (clickX >= padL && clickX <= this.width - padR) {
        const norm = (clickX - padL) / plotW;
        const clickedGhz = this.minFreq + norm * (this.maxFreq - this.minFreq);

        let closest = null;
        let minDist = 0.15;
        this.entities.forEach(ent => {
          if (ent.rf && ent.rf.hasEmitter && ent.rf.freqGhz) {
            const d = Math.abs(ent.rf.freqGhz - clickedGhz);
            if (d < minDist) {
              minDist = d;
              closest = ent;
            }
          }
        });

        if (closest && window.app) {
          window.app.selectEntity(closest.id);
        } else if (window.app) {
          window.app.stepSimulationScan();
        }
      }
    });
  }

  updateData(data) {
    if (data.entities) this.entities = data.entities;
    if (data.simState) this.simState = data.simState;
  }

  pushWaterfallSlice(currentSlice, curGhz, isHit) {
    this.waterfallHistory.unshift({
      powers: currentSlice,
      dwellGhz: curGhz,
      isHit: Boolean(isHit)
    });
    if (this.waterfallHistory.length > this.waterfallRows) {
      this.waterfallHistory.pop();
    }
  }

  render() {
    if (!this.canvas) return;
    const parent = this.canvas.parentElement;
    if (parent && parent.clientWidth > 0 && parent.clientHeight > 0) {
      if (Math.abs(parent.clientWidth - this.width) > 2 || Math.abs(parent.clientHeight - this.height) > 2) {
        this.resize();
      }
    }

    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    ctx.clearRect(0, 0, w, h);

    const padL = 46;
    const padR = 20;
    const padT = 26;
    const splitRatio = 0.56; // Upper 56% spectrum analyzer, lower 44% waterfall
    const specH = Math.round((h - padT - 30) * splitRatio);
    const wfTop = padT + specH + 20;
    const wfH = Math.max(40, h - wfTop - 16);
    const plotW = w - padL - padR;

    if (plotW <= 10 || specH <= 10) return;

    const freqToX = f => padL + ((f - this.minFreq) / (this.maxFreq - this.minFreq)) * plotW;
    const powerToY = p => padT + (1 - (p - this.minPower) / (this.maxPower - this.minPower)) * specH;

    const curGhz = this.simState?.rfCurrentScanGhz || this.simState?.rxTelemetry?.tunedFreqGhz || 9.420;
    const isHit = (this.simState?.receiverState === 'HIT') || (this.simState?.rxTelemetry?.state === 'HIT');
    const rxTel = this.simState?.rxTelemetry;

    // -------------------------------------------------------------------------
    // 1. SPECTRUM ANALYZER BACKGROUND GRID & dBm CALIBRATION
    // -------------------------------------------------------------------------
    ctx.strokeStyle = '#14202c';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#5c6f80';
    ctx.font = '9px "JetBrains Mono", monospace';

    [-90, -80, -70, -60, -50].forEach(p => {
      const y = powerToY(p);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();

      ctx.textAlign = 'right';
      ctx.fillText(`${p} dBm`, padL - 6, y + 3);
    });

    for (let f = 9.0; f <= 10.001; f += 0.1) {
      const x = freqToX(f);
      const isMajor = Math.abs(Math.round(f * 10) % 2) === 0;
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + specH);
      ctx.strokeStyle = isMajor ? '#1a2938' : '#101b24';
      ctx.stroke();

      if (isMajor) {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#5c6f80';
        ctx.fillText(`${f.toFixed(1)}G`, x, padT + specH + 12);
      }
    }

    // -------------------------------------------------------------------------
    // 2. RECEIVER 50 MHz INSTANTANEOUS BANDWIDTH (IBW) WINDOW & SCAN TARGETS
    // -------------------------------------------------------------------------
    const minW = freqToX(curGhz - 0.025);
    const maxW = freqToX(curGhz + 0.025);
    const winW = maxW - minW;

    // Window fill: Green/Cyan for HIT, Amber/Slate for SCAN/MISS
    ctx.fillStyle = isHit ? 'rgba(66, 196, 122, 0.18)' : 'rgba(215, 168, 75, 0.09)';
    ctx.fillRect(minW, padT, winW, specH);

    ctx.strokeStyle = isHit ? 'rgba(66, 196, 122, 0.85)' : 'rgba(215, 168, 75, 0.65)';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(minW, padT, winW, specH);

    // Center tuned frequency marker line
    const cx = freqToX(curGhz);
    ctx.beginPath();
    ctx.moveTo(cx, padT);
    ctx.lineTo(cx, padT + specH);
    ctx.strokeStyle = isHit ? '#42c47a' : '#d7a84b';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Receiver Badge Header
    const badgeW = 84;
    const badgeText = isHit ? `RCVR ${curGhz.toFixed(3)}G [HIT]` : `RCVR ${curGhz.toFixed(3)}G [SCAN]`;
    ctx.fillStyle = isHit ? '#42c47a' : '#d7a84b';
    ctx.fillRect(cx - badgeW / 2, padT - 18, badgeW, 14);
    ctx.fillStyle = '#070b10';
    ctx.font = '700 8.5px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(badgeText, cx, padT - 8);

    // Next anticipated scan band (from UCB scheduler decision)
    if (this.simState?.rfNextScanGhz) {
      const nextGhz = this.simState.rfNextScanGhz;
      const nx = freqToX(nextGhz);
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(nx, padT);
      ctx.lineTo(nx, padT + specH);
      ctx.strokeStyle = '#4ba9c7';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.fillStyle = '#18b8d6';
      ctx.fillRect(nx - 36, padT - 18, 72, 14);
      ctx.fillStyle = '#070b10';
      ctx.font = '700 8px "JetBrains Mono", monospace';
      ctx.fillText(`NEXT ${nextGhz.toFixed(3)}G`, nx, padT - 8);
      ctx.restore();
    }

    // -------------------------------------------------------------------------
    // 3. SYNTHESIZE CURRENT SPECTRAL SLICE (Single Source of Truth)
    // -------------------------------------------------------------------------
    const points = [];
    const numPts = this.waterfallBins; // 180 points across 9.00 - 10.00 GHz
    const now = performance.now();
    const currentSlice = new Float32Array(numPts);

    for (let i = 0; i <= numPts; i++) {
      const f = this.minFreq + (i / numPts) * (this.maxFreq - this.minFreq);
      // Realistic RF front-end thermal noise floor
      const noise = -94.0 + (Math.sin(i * 0.35 + now * 0.004) * 0.7) + ((Math.random() - 0.5) * 1.0);
      let power = noise;

      // Energy contribution from transmitting master entities
      for (const ent of this.entities) {
        if (ent.rf && ent.rf.hasEmitter && ent.rf.freqGhz) {
          const isTx = ent.rf.isTransmitting;
          const isTunedHit = isHit && Math.abs(curGhz - ent.rf.freqGhz) < 0.025;

          if (isTx || isTunedHit) {
            const delta = f - ent.rf.freqGhz;
            if (Math.abs(delta) < 0.045) {
              const peakPwr = isTunedHit && rxTel?.powerDbm !== undefined ? rxTel.powerDbm : (ent.rf.powerDbm || -61.2);
              const g = Math.exp(-(delta * delta) / (2 * 0.009 * 0.009));
              power = Math.max(power, -95 + (peakPwr - (-95)) * g);
            }
          }
        }
      }

      // If receiver confirms HIT at tuned frequency, ensure received energy is visibly peaked in receiver window
      if (isHit && Math.abs(f - curGhz) < 0.035) {
        const delta = f - curGhz;
        const hitPwr = rxTel?.powerDbm !== undefined ? rxTel.powerDbm : -61.2;
        const g = Math.exp(-(delta * delta) / (2 * 0.008 * 0.008));
        power = Math.max(power, -95 + (hitPwr - (-95)) * g);
      }

      if (i < numPts) currentSlice[i] = power;
      points.push({ x: freqToX(f), y: powerToY(power) });
    }

    // Steady paced waterfall slice rollout (~10-12 Hz)
    if (now - this.lastWaterfallPush > 90) {
      this.pushWaterfallSlice(currentSlice, curGhz, isHit);
      this.lastWaterfallPush = now;
    }

    // Fill under spectrum curve
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(points[0].x, padT + specH);
    for (const p of points) ctx.lineTo(p.x, p.y);
    ctx.lineTo(points[points.length - 1].x, padT + specH);
    ctx.closePath();

    const specGrad = ctx.createLinearGradient(0, padT, 0, padT + specH);
    specGrad.addColorStop(0, isHit ? 'rgba(66, 196, 122, 0.35)' : 'rgba(75, 169, 199, 0.30)');
    specGrad.addColorStop(0.6, 'rgba(75, 169, 199, 0.08)');
    specGrad.addColorStop(1, 'rgba(7, 11, 16, 0.0)');
    ctx.fillStyle = specGrad;
    ctx.fill();

    // Spectrum stroke line
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      if (i === 0) ctx.moveTo(points[i].x, points[i].y);
      else ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.strokeStyle = isHit ? '#3ed685' : '#4ba9c7';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Emitter Peak Markers
    this.entities.forEach(ent => {
      if (ent.rf && ent.rf.hasEmitter && ent.rf.freqGhz) {
        const isTx = ent.rf.isTransmitting;
        const isTunedHit = isHit && Math.abs(curGhz - ent.rf.freqGhz) < 0.025;
        const activeSignal = isTx || isTunedHit;
        const pwr = isTunedHit && rxTel?.powerDbm !== undefined ? rxTel.powerDbm : (ent.rf.powerDbm || -61.2);

        const ex = freqToX(ent.rf.freqGhz);
        const ey = powerToY(activeSignal ? pwr : -92.5);
        const isSelected = ent.id === (this.simState?.selectedEntityId || 'TRK-021');

        ctx.save();
        ctx.fillStyle = activeSignal ? (isSelected ? '#18b8d6' : '#42c47a') : '#5c6f80';
        ctx.beginPath();
        ctx.arc(ex, ey, activeSignal ? 4.5 : 3, 0, Math.PI * 2);
        ctx.fill();

        if (activeSignal) {
          ctx.strokeStyle = isSelected ? '#18b8d6' : '#42c47a';
          ctx.lineWidth = 1.2;
          ctx.stroke();

          ctx.font = '700 8.5px "JetBrains Mono", monospace';
          ctx.fillStyle = isSelected ? '#18b8d6' : '#e6edf3';
          ctx.textAlign = 'center';
          ctx.fillText(`${ent.rf.emitterId} (${ent.id})`, ex, ey - 9);

          ctx.font = '7.5px "JetBrains Mono", monospace';
          ctx.fillStyle = isTunedHit ? '#42c47a' : '#9aa7b5';
          ctx.fillText(`${ent.rf.freqGhz.toFixed(3)}G [${pwr.toFixed(1)}dBm]`, ex, ey + 13);
        } else {
          // Idle channel marker
          ctx.font = '7px "JetBrains Mono", monospace';
          ctx.fillStyle = '#5c6f80';
          ctx.textAlign = 'center';
          ctx.fillText(`${ent.rf.emitterId}`, ex, ey - 6);
        }
        ctx.restore();
      }
    });
    ctx.restore();

    // -------------------------------------------------------------------------
    // 4. SPECTROGRAM WATERFALL UNDERNEATH SPECTRUM (Continuous Time History)
    // -------------------------------------------------------------------------
    ctx.save();

    // Dark tactical waterfall background
    ctx.fillStyle = '#080d14';
    ctx.fillRect(padL, wfTop, plotW, wfH);

    // Box border
    ctx.strokeStyle = '#182736';
    ctx.strokeRect(padL, wfTop, plotW, wfH);

    // Label with live receiver indicator
    ctx.font = '700 8.5px "JetBrains Mono", monospace';
    ctx.fillStyle = '#617180';
    ctx.textAlign = 'left';
    ctx.fillText('SPECTROGRAM WATERFALL // TIME DECAY', padL + 4, wfTop - 5);

    ctx.textAlign = 'right';
    ctx.fillStyle = isHit ? '#42c47a' : '#8a9ab5';
    ctx.fillText(isHit ? '● INTERCEPT TRACKING ACTIVE' : '○ CHANNEL SCANNING', w - padR - 4, wfTop - 5);

    const historyLen = this.waterfallHistory.length;
    const rowH = wfH / historyLen;
    const colW = plotW / this.waterfallBins;

    // Render waterfall rows (row 0 = newest at top, older rows decay downwards)
    for (let r = 0; r < historyLen; r++) {
      const item = this.waterfallHistory[r];
      const powers = item.powers;
      const y = wfTop + r * rowH;

      // 4a. Receiver dwell scan raster track
      if (item.dwellGhz) {
        const dwellMinX = freqToX(item.dwellGhz - 0.025);
        const dwellMaxX = freqToX(item.dwellGhz + 0.025);
        const dwellW = dwellMaxX - dwellMinX;

        ctx.fillStyle = item.isHit ? 'rgba(66, 196, 122, 0.16)' : 'rgba(75, 169, 199, 0.10)';
        ctx.fillRect(dwellMinX, y, dwellW, rowH + 0.5);
      }

      // 4b. Frequency intensity bins
      for (let c = 0; c < powers.length; c++) {
        const p = powers[c];
        const x = padL + c * colW;

        // Baseline noise floor texture
        if (p < -90) {
          if ((c + r) % 3 === 0) {
            ctx.fillStyle = 'rgba(16, 28, 42, 0.35)';
            ctx.fillRect(x, y, colW + 0.5, rowH + 0.5);
          }
        } else {
          // Heat map color ramp for RF energy:
          // -90 to -78 dBm: Deep Cyan
          // -78 to -68 dBm: Bright Cyan to Emerald
          // -68 to -58 dBm: Emerald to Golden Amber
          // > -58 dBm: White-hot
          const norm = Math.max(0, Math.min(1, (p - (-90)) / 45));
          if (norm < 0.28) {
            ctx.fillStyle = `rgba(24, 184, 214, ${0.4 + norm * 1.5})`;
          } else if (norm < 0.65) {
            ctx.fillStyle = `rgba(66, 196, 122, ${0.6 + norm * 0.5})`;
          } else if (norm < 0.88) {
            ctx.fillStyle = `rgba(229, 169, 60, ${0.75 + norm * 0.25})`;
          } else {
            ctx.fillStyle = `rgba(255, 255, 255, ${norm})`;
          }
          ctx.fillRect(x, y, colW + 0.8, rowH + 0.8);
        }
      }

      // Subtle horizontal time decay dividers every 15 rows
      if (r > 0 && r % 15 === 0) {
        ctx.strokeStyle = 'rgba(24, 39, 54, 0.5)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(w - padR, y);
        ctx.stroke();
      }
    }

    // Vertical frequency grid alignment matching spectrum above
    for (let f = 9.0; f <= 10.001; f += 0.2) {
      const x = freqToX(f);
      ctx.strokeStyle = '#121e29';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, wfTop);
      ctx.lineTo(x, wfTop + wfH);
      ctx.stroke();
    }

    // Time decay scale on left margin
    ctx.font = '7.5px "JetBrains Mono", monospace';
    ctx.fillStyle = '#4a5b6c';
    ctx.textAlign = 'right';
    ctx.fillText('0s', padL - 4, wfTop + 8);
    ctx.fillText('-3s', padL - 4, wfTop + wfH * 0.35);
    ctx.fillText('-6s', padL - 4, wfTop + wfH * 0.70);
    ctx.fillText('-9s', padL - 4, wfTop + wfH - 2);

    ctx.restore();
  }
}

window.CompactSpectrumAnalyzer = CompactSpectrumAnalyzer;
