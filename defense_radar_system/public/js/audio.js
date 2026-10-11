/**
 * Defence-Sentinel Audio Synthesizer Engine
 * Uses Web Audio API to create authentic tactical radar pings and alert notifications
 */

class TacticalAudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.sirenOscillator = null;
    this.sirenGain = null;
    this.sirenInterval = null;
    this.isSirenPlaying = false;
  }

  init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.muted && this.isSirenPlaying) {
      this.stopSiren();
    }
    return this.muted;
  }

  // Play a tactical radar sweep ping when sweeping over target
  playRadarPing(isAnomalous = false) {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      const now = this.ctx.currentTime;
      if (isAnomalous) {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(1400, now + 0.12);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      } else {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.08);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      }

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + (isAnomalous ? 0.22 : 0.16));
    } catch (e) {
      console.warn('Audio play error', e);
    }
  }

  // Autonomous Tactical Alert Siren
  startSiren() {
    if (this.muted || this.isSirenPlaying) return;
    this.init();
    if (!this.ctx) return;

    try {
      this.isSirenPlaying = true;
      this.sirenOscillator = this.ctx.createOscillator();
      this.sirenGain = this.ctx.createGain();

      this.sirenOscillator.type = 'sawtooth';
      this.sirenGain.gain.setValueAtTime(0.35, this.ctx.currentTime);

      this.sirenOscillator.connect(this.sirenGain);
      this.sirenGain.connect(this.ctx.destination);

      this.sirenOscillator.start();

      let high = false;
      this.sirenInterval = setInterval(() => {
        if (!this.ctx || !this.sirenOscillator) return;
        const now = this.ctx.currentTime;
        high = !high;
        const targetFreq = high ? 1150 : 650;
        this.sirenOscillator.frequency.linearRampToValueAtTime(targetFreq, now + 0.25);
      }, 300);
    } catch (e) {
      console.warn('Siren start error', e);
    }
  }

  stopSiren() {
    if (!this.isSirenPlaying) return;
    this.isSirenPlaying = false;

    if (this.sirenInterval) {
      clearInterval(this.sirenInterval);
      this.sirenInterval = null;
    }

    if (this.sirenOscillator) {
      try {
        this.sirenGain.gain.linearRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);
        setTimeout(() => {
          if (this.sirenOscillator) {
            this.sirenOscillator.stop();
            this.sirenOscillator.disconnect();
            this.sirenOscillator = null;
          }
        }, 150);
      } catch (e) {
        this.sirenOscillator = null;
      }
    }
  }

  // Button click / action feedback beep
  playUiBeep() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const now = this.ctx.currentTime;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1760, now);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.06);
    } catch (e) {}
  }
}

window.tacticalAudio = new TacticalAudioEngine();
