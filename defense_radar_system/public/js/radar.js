/**
 * Defence-Sentinel: Hero Tactical 360° PPI Radar (Single Source of Truth)
 * Entity types: VERIFIED (green ●), ANOMALOUS (red ◆), WILDLIFE (amber ▲), UNIDENTIFIED (grey □)
 */

class TacticalRadarScope {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;

    this.width = 0;
    this.height = 0;
    this.centerX = 0;
    this.centerY = 0;
    this.radius = 0;

    this.maxRangeMeters = 850;
    this.sweepAngle = 0;
    this.lastFrameTime = performance.now();
    this.entities = [];
    this.baseCamp = {
      commandHq: { x: 0, y: 0, width: 46, height: 46, label: 'COMMAND HQ' },
      armory: { x: 75, y: -45, width: 34, height: 28, label: 'ARMORY' },
      barracks: { x: -75, y: 40, width: 42, height: 32, label: 'BARRACKS' },
      vehicleBay: { x: -45, y: -65, width: 38, height: 26, label: 'VEHICLE BAY' },
      northGate: { x: 0, y: 220, width: 26, height: 12, label: 'NORTH GATE' },
      eastGate: { x: 260, y: 0, width: 14, height: 26, label: 'EAST GATE' },
      southGate: { x: 0, y: -300, width: 28, height: 14, label: 'SOUTH GATE' },
      westGate: { x: -260, y: 0, width: 14, height: 26, label: 'WEST GATE' },
      perimeterRadiusMeters: 450
    };
    this.selectedEntityId = 'TRK-021';
    this.hoveredEntity = null;
    this.isLiveBackend = false;

    this.setupEvents();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    if (window.ResizeObserver && this.canvas && this.canvas.parentElement) {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.canvas.parentElement);
    }
  }

  resize() {
    if (!this.canvas) return;
    const parent = this.canvas.parentElement;
    if (!parent || parent.clientWidth <= 0 || parent.clientHeight <= 0) return;
    const size = Math.max(Math.min(parent.clientWidth, parent.clientHeight) - 12, 260);
    const dpr = window.devicePixelRatio || 1;

    this.width = size;
    this.height = size;
    this.canvas.width = size * dpr;
    this.canvas.height = size * dpr;
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;

    // Reset transform BEFORE scaling — prevents cumulative DPR multiplication
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);
    this.centerX = size / 2;
    this.centerY = size / 2;
    this.radius = (size / 2) - 20;
  }

  setupEvents() {
    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const meterPos = this.pixelsToMeters(mouseX, mouseY);

      let found = null;
      for (const ent of this.entities) {
        const dx = ent.radar.x - meterPos.x;
        const dy = ent.radar.y - meterPos.y;
        if (Math.hypot(dx, dy) < 32 * (this.maxRangeMeters / this.radius)) {
          found = ent;
          break;
        }
      }
      this.hoveredEntity = found;
      this.canvas.style.cursor = found ? 'pointer' : 'crosshair';
    });

    this.canvas.addEventListener('click', () => {
      if (this.hoveredEntity && window.app) {
        window.app.selectEntity(this.hoveredEntity.id);
      }
    });
  }

  metersToPixels(x, y) {
    const scale = this.radius / this.maxRangeMeters;
    return {
      px: this.centerX + x * scale,
      py: this.centerY - y * scale
    };
  }

  pixelsToMeters(px, py) {
    const scale = this.radius / this.maxRangeMeters;
    return {
      x: (px - this.centerX) / scale,
      y: (this.centerY - py) / scale
    };
  }

  updateData(data) {
    if (data.simState) {
      if (typeof data.simState.radarSweepAngle === 'number') {
        this.sweepAngle = data.simState.radarSweepAngle;
      }
      if (data.simState.selectedEntityId) {
        this.selectedEntityId = data.simState.selectedEntityId;
      }
    }
    if (data.entities && Array.isArray(data.entities)) {
      this.entities = data.entities;
    }
    if (data.baseCamp) {
      this.baseCamp = data.baseCamp;
    }
    this.isLiveBackend = true;
  }

  render() {
    if (!this.canvas || !this.ctx) return;
    const parent = this.canvas.parentElement;
    if (parent && parent.clientWidth > 0 && parent.clientHeight > 0) {
      const size = Math.max(Math.min(parent.clientWidth, parent.clientHeight) - 12, 260);
      if (Math.abs(size - this.width) > 2 || this.radius === 0) {
        this.resize();
      }
    }
    if (this.radius === 0) return;

    // Smooth autonomous sweep progression (24 RPM = 144 deg/sec) if standalone or between frames
    const now = performance.now();
    const dt = Math.min((now - this.lastFrameTime) / 1000, 0.1);
    this.lastFrameTime = now;
    if (!this.isLiveBackend) {
      this.sweepAngle = (this.sweepAngle + dt * 144) % 360;
    }

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    this.drawBezel();
    this.drawRangeRings();
    this.drawBaseInstallation();
    this.drawSweepBeam();
    this.drawTracks();
    this.drawLegend();
    this.drawCenterReticle();
  }

  drawBezel() {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(this.centerX, this.centerY);

    ctx.strokeStyle = '#14222f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius + 10, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = '#213242';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let deg = 0; deg < 360; deg += 5) {
      const rad = (deg - 90) * Math.PI / 180;
      const isMajor = deg % 30 === 0;
      const isCardinal = deg % 90 === 0;
      const tickLen = isCardinal ? 7 : (isMajor ? 4.5 : 2);
      const rIn = this.radius - tickLen;

      ctx.strokeStyle = isCardinal ? '#18b8d6' : (isMajor ? '#3a596e' : '#192b38');
      ctx.lineWidth = isCardinal ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(Math.cos(rad) * rIn, Math.sin(rad) * rIn);
      ctx.lineTo(Math.cos(rad) * this.radius, Math.sin(rad) * this.radius);
      ctx.stroke();

      if (isMajor) {
        const textR = this.radius + 6;
        ctx.fillStyle = isCardinal ? '#18b8d6' : '#687784';
        let label = `${deg}°`;
        if (deg === 0) label = 'N (000°)';
        else if (deg === 90) label = 'E (090°)';
        else if (deg === 180) label = 'S (180°)';
        else if (deg === 270) label = 'W (270°)';
        ctx.fillText(label, Math.cos(rad) * textR, Math.sin(rad) * textR);
      }
    }
    ctx.restore();
  }

  drawRangeRings() {
    const ctx = this.ctx;
    const rings = [100, 200, 300, 450, 600, 800];

    rings.forEach(rMeters => {
      const scale = this.radius / this.maxRangeMeters;
      const rPx = rMeters * scale;
      const isPerimeter = rMeters === 450;

      ctx.save();
      ctx.beginPath();
      ctx.arc(this.centerX, this.centerY, rPx, 0, Math.PI * 2);
      if (isPerimeter) {
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = 'rgba(215,168,75,0.55)';
        ctx.lineWidth = 1.5;
      } else {
        ctx.strokeStyle = 'rgba(26,48,61,0.6)';
        ctx.lineWidth = 1;
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = isPerimeter ? '#d7a84b' : '#496270';
      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`${rMeters}m${isPerimeter ? ' PERIMETER' : ''}`, this.centerX + 6, this.centerY - rPx + 10);
      ctx.restore();
    });

    ctx.save();
    ctx.strokeStyle = '#13212c';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.centerX - this.radius, this.centerY);
    ctx.lineTo(this.centerX + this.radius, this.centerY);
    ctx.moveTo(this.centerX, this.centerY - this.radius);
    ctx.lineTo(this.centerX, this.centerY + this.radius);
    ctx.stroke();
    ctx.restore();
  }

  drawBaseInstallation() {
    const ctx = this.ctx;
    if (!this.baseCamp) return;
    ctx.save();
    ctx.font = '700 8.5px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';

    const drawBox = (asset, strokeColor, fillColor, label) => {
      const pos = this.metersToPixels(asset.x, asset.y);
      const scale = this.radius / this.maxRangeMeters;
      const w = Math.max(14, asset.width * scale);
      const h = Math.max(12, asset.height * scale);
      ctx.fillStyle = fillColor;
      ctx.fillRect(pos.px - w/2, pos.py - h/2, w, h);
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1.4;
      ctx.strokeRect(pos.px - w/2, pos.py - h/2, w, h);
      ctx.fillStyle = 'rgba(6,10,15,0.85)';
      const textW = ctx.measureText(label || asset.label).width + 6;
      ctx.fillRect(pos.px - textW/2, pos.py + h/2 + 2, textW, 11);
      ctx.fillStyle = strokeColor;
      ctx.fillText(label || asset.label, pos.px, pos.py + h/2 + 10);
    };

    drawBox(this.baseCamp.commandHq, '#18b8d6', 'rgba(24,184,214,0.18)', 'HQ');
    drawBox(this.baseCamp.armory, '#d7a84b', 'rgba(215,168,75,0.15)', 'ARMORY');
    drawBox(this.baseCamp.barracks, '#42c47a', 'rgba(66,196,122,0.15)', 'BARRACKS');
    drawBox(this.baseCamp.vehicleBay, '#5d9fea', 'rgba(93,159,234,0.15)', 'VEHICLE BAY');
    drawBox(this.baseCamp.northGate, '#9ca9b5', 'rgba(156,169,181,0.12)', 'NORTH GATE');
    drawBox(this.baseCamp.eastGate, '#9ca9b5', 'rgba(156,169,181,0.12)', 'EAST GATE');
    drawBox(this.baseCamp.southGate, '#9ca9b5', 'rgba(156,169,181,0.12)', 'MAIN ENTRY');
    drawBox(this.baseCamp.westGate, '#9ca9b5', 'rgba(156,169,181,0.12)', 'WEST GATE');
    ctx.restore();
  }

  drawSweepBeam() {
    const ctx = this.ctx;
    const beamRad = (this.sweepAngle - 90) * Math.PI / 180;
    const trailSpanRad = 48 * Math.PI / 180;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(this.centerX, this.centerY);
    ctx.arc(this.centerX, this.centerY, this.radius, beamRad - trailSpanRad, beamRad, false);
    ctx.closePath();
    const grad = ctx.createRadialGradient(this.centerX, this.centerY, 10, this.centerX, this.centerY, this.radius);
    grad.addColorStop(0, 'rgba(24,184,214,0.22)');
    grad.addColorStop(0.7, 'rgba(24,184,214,0.04)');
    grad.addColorStop(1, 'rgba(24,184,214,0)');
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(this.centerX, this.centerY);
    ctx.lineTo(this.centerX + Math.cos(beamRad) * this.radius, this.centerY + Math.sin(beamRad) * this.radius);
    ctx.strokeStyle = '#18b8d6';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
  }

  // ── COLOUR HELPER ──────────────────────────────────────────────────────────
  // VERIFIED     = green  ● authorized person / vehicle
  // ANOMALOUS    = red    ◆ unauthorized person in restricted zone
  // WILDLIFE     = amber  ▲ animal / fauna
  // UNIDENTIFIED = grey   □ unknown outside perimeter
  getEntityColor(cls) {
    if (cls === 'VERIFIED')     return '#42c47a';
    if (cls === 'ANOMALOUS')    return '#d45858';
    if (cls === 'WILDLIFE')     return '#d7a84b';
    return '#8a9ab5'; // UNIDENTIFIED
  }

  drawTracks() {
    const ctx = this.ctx;
    const now = Date.now();

    if (!this.entities || this.entities.length === 0) {
      ctx.save();
      ctx.font = '600 8.5px "JetBrains Mono", monospace';
      ctx.fillStyle = 'rgba(154, 167, 181, 0.45)';
      ctx.textAlign = 'center';
      ctx.fillText('NO TARGETS ACQUIRED // SCANNING AIRSPACE', this.centerX, this.centerY + 45);
      ctx.restore();
      return;
    }

    this.entities.forEach(ent => {
      if (!ent || !ent.radar) return;
      const pos = this.metersToPixels(ent.radar.x || 0, ent.radar.y || 0);
      const isSelected = ent.id === this.selectedEntityId;
      const cls = ent.fusion?.classification || 'UNIDENTIFIED';
      const color = this.getEntityColor(cls);

      // ── 1. HISTORY TRAIL ────────────────────────────────────────────────
      if (ent.radar.trail && ent.radar.trail.length > 1) {
        ctx.save();
        ctx.beginPath();
        for (let i = 0; i < ent.radar.trail.length; i++) {
          const pt = this.metersToPixels(ent.radar.trail[i].x, ent.radar.trail[i].y);
          if (i === 0) ctx.moveTo(pt.px, pt.py);
          else ctx.lineTo(pt.px, pt.py);
        }
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.22;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }

      // ── 2. VELOCITY VECTOR ──────────────────────────────────────────────
      if (ent.radar.speedKmh > 0.5) {
        ctx.save();
        const headRad = (ent.radar.heading - 90) * Math.PI / 180;
        const vecLen = Math.min(28, ent.radar.speedKmh * 1.4);
        ctx.beginPath();
        ctx.moveTo(pos.px, pos.py);
        ctx.lineTo(pos.px + Math.cos(headRad) * vecLen, pos.py + Math.sin(headRad) * vecLen);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.restore();
      }

      // ── 3. PULSING THREAT RING (unauthorized only) ──────────────────────
      if (cls === 'ANOMALOUS') {
        ctx.save();
        const pulseR = 13 + Math.sin(now * 0.008) * 3.5;
        ctx.strokeStyle = `rgba(212,88,88,${0.4 + Math.sin(now * 0.008) * 0.2})`;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.arc(pos.px, pos.py, pulseR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      // ── 4. TRACK SYMBOL ─────────────────────────────────────────────────
      ctx.save();
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;

      if (cls === 'VERIFIED') {
        // ● Green double-circle — AUTHORIZED PERSON
        ctx.beginPath();
        ctx.arc(pos.px, pos.py, 5.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(pos.px, pos.py, 2.2, 0, Math.PI * 2);
        ctx.fill();

      } else if (cls === 'ANOMALOUS') {
        // ◆ Red filled diamond — UNAUTHORIZED / THREAT
        const sz = 6.5;
        ctx.beginPath();
        ctx.moveTo(pos.px,      pos.py - sz);
        ctx.lineTo(pos.px + sz, pos.py);
        ctx.lineTo(pos.px,      pos.py + sz);
        ctx.lineTo(pos.px - sz, pos.py);
        ctx.closePath();
        ctx.fill();
        // bright outline
        ctx.strokeStyle = '#ff7070';
        ctx.lineWidth = 1;
        ctx.stroke();

      } else if (cls === 'WILDLIFE') {
        // ▲ Amber triangle — ANIMAL / FAUNA
        const sz = 6;
        ctx.beginPath();
        ctx.moveTo(pos.px,            pos.py - sz);
        ctx.lineTo(pos.px + sz * 0.87, pos.py + sz * 0.5);
        ctx.lineTo(pos.px - sz * 0.87, pos.py + sz * 0.5);
        ctx.closePath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = color + '50';
        ctx.fill();

      } else {
        // □ Grey square — UNIDENTIFIED / outside perimeter
        const sz = 4.5;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.4;
        ctx.strokeRect(pos.px - sz, pos.py - sz, sz * 2, sz * 2);
        ctx.fillStyle = color + '33';
        ctx.fillRect(pos.px - sz, pos.py - sz, sz * 2, sz * 2);
      }
      ctx.restore();

      // ── 5. SELECTED — acquisition brackets + lock ring ──────────────────
      if (isSelected) {
        ctx.save();
        const pulseR = 18 + Math.sin(now * 0.005) * 2.5;
        ctx.strokeStyle = cls === 'ANOMALOUS' ? 'rgba(212,88,88,0.85)' : 'rgba(24,184,214,0.75)';
        ctx.lineWidth = 1.3;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(pos.px, pos.py, pulseR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        const bc = cls === 'ANOMALOUS' ? '#ff5555' : '#18b8d6';
        ctx.strokeStyle = bc;
        ctx.lineWidth = 1.9;
        const bSz = 15;
        ctx.beginPath();
        ctx.moveTo(pos.px - bSz, pos.py - bSz + 5); ctx.lineTo(pos.px - bSz, pos.py - bSz); ctx.lineTo(pos.px - bSz + 5, pos.py - bSz);
        ctx.moveTo(pos.px + bSz - 5, pos.py - bSz); ctx.lineTo(pos.px + bSz, pos.py - bSz); ctx.lineTo(pos.px + bSz, pos.py - bSz + 5);
        ctx.moveTo(pos.px + bSz, pos.py + bSz - 5); ctx.lineTo(pos.px + bSz, pos.py + bSz); ctx.lineTo(pos.px - bSz + 5, pos.py + bSz);
        ctx.moveTo(pos.px - bSz + 5, pos.py + bSz); ctx.lineTo(pos.px - bSz, pos.py + bSz); ctx.lineTo(pos.px - bSz, pos.py + bSz - 5);
        ctx.stroke();

        const tag = cls === 'ANOMALOUS' ? '⚠ THREAT' : cls === 'WILDLIFE' ? '▲ FAUNA' : '● LOCK';
        ctx.font = '700 7px "JetBrains Mono", monospace';
        ctx.fillStyle = bc;
        ctx.fillText(tag, pos.px - bSz, pos.py - bSz - 3);
        ctx.restore();
      }

      // ── 6. TRACK LABEL ──────────────────────────────────────────────────
      if (isSelected) {
        ctx.save();
        const classLabel =
          cls === 'ANOMALOUS' ? '⚠ UNAUTHORIZED' :
          cls === 'WILDLIFE'  ? '▲ WILDLIFE / ANIMAL' :
          cls === 'VERIFIED'  ? '✓ AUTHORIZED' : '? UNIDENTIFIED';

        const idText  = ent.id;
        const kinText = `${ent.radar.range}m  ${ent.radar.speedKmh}kph  ${ent.radar.azimuth}°`;
        ctx.font = '700 10px "JetBrains Mono", monospace';
        const boxW = Math.max(
          ctx.measureText(idText).width,
          ctx.measureText(classLabel).width,
          ctx.measureText(kinText).width
        ) + 14;

        ctx.fillStyle = 'rgba(4,8,14,0.92)';
        ctx.strokeStyle = color + 'bb';
        ctx.lineWidth = 1.2;
        ctx.fillRect(pos.px + 12, pos.py - 18, boxW, 40);
        ctx.strokeRect(pos.px + 12, pos.py - 18, boxW, 40);

        ctx.font = '700 10px "JetBrains Mono", monospace';
        ctx.fillStyle = color;
        ctx.textAlign = 'left';
        ctx.fillText(idText, pos.px + 16, pos.py - 5);

        ctx.font = '8px "JetBrains Mono", monospace';
        ctx.fillStyle = color + 'dd';
        ctx.fillText(classLabel, pos.px + 16, pos.py + 7);

        ctx.font = '7.5px "JetBrains Mono", monospace';
        ctx.fillStyle = '#9cb1c5';
        ctx.fillText(kinText, pos.px + 16, pos.py + 18);
        ctx.restore();
      } else {
        ctx.save();
        ctx.font = '600 9px "JetBrains Mono", monospace';
        ctx.fillStyle = color;
        ctx.textAlign = 'left';
        ctx.fillText(ent.id, pos.px + 8, pos.py - 3);
        ctx.font = '7.5px "JetBrains Mono", monospace';
        ctx.fillStyle = '#7a8b9e';
        ctx.fillText(`${ent.radar.range}m ${ent.radar.speedKmh}kph`, pos.px + 8, pos.py + 7);
        ctx.restore();
      }
    });
  }

  drawLegend() {
    const ctx = this.ctx;
    const x = this.centerX - this.radius + 4;
    const y = this.centerY + this.radius - 8;
    ctx.save();
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';

    const items = [
      { color: '#42c47a', label: '● AUTHORIZED' },
      { color: '#d45858', label: '◆ UNAUTHORIZED' },
      { color: '#d7a84b', label: '▲ WILDLIFE' },
      { color: '#8a9ab5', label: '□ UNIDENTIFIED' },
    ];

    items.forEach((item, i) => {
      ctx.fillStyle = 'rgba(4,8,14,0.7)';
      ctx.fillRect(x + i * 78, y - 10, 76, 13);
      ctx.fillStyle = item.color;
      ctx.fillText(item.label, x + i * 78 + 3, y);
    });
    ctx.restore();
  }

  drawCenterReticle() {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = '#18b8d6';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(this.centerX, this.centerY, 3.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(this.centerX - 7, this.centerY); ctx.lineTo(this.centerX + 7, this.centerY);
    ctx.moveTo(this.centerX, this.centerY - 7); ctx.lineTo(this.centerX, this.centerY + 7);
    ctx.stroke();
    ctx.restore();
  }
}

window.TacticalRadarScope = TacticalRadarScope;
