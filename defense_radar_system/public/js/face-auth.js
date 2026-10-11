/**
 * Defence-Sentinel: Multi-Person Face Authentication & Biometric Sentry Subsystem
 * 
 * Core Features:
 * - Independent multi-face detection, descriptor generation, and identity matching
 * - Multi-person enrolled roster persistent across application reloads
 * - '+ ADD AUTHORIZED PERSON' enrollment modal with 1-face validation
 * - Clean rectangular HUD bounding boxes (Green: AUTHORIZED · [NAME], Red: UNAUTHORIZED · UNKNOWN PERSON)
 * - Decoupled from synthetic radar tracks; operates exclusively on client-side face-api (TensorFlow.js)
 * - Strict local privacy: reference images & templates kept local, zero cloud dependencies
 */

class FaceAuthenticationEngine {
  constructor() {
    this.api = window.faceapi || (typeof faceapi !== 'undefined' ? faceapi : null);
    this.modelsLoaded = false;
    this.isLoadingModels = false;
    this.roster = []; // Array of { id, name, enrolledAt, filename, descriptor: Float32Array }
    this.matchThreshold = 0.48; // Euclidean distance threshold (lower = stricter)
    
    this.isDetecting = false;
    this.detectionInterval = null;
    this.videoEl = null;

    // Temporary enrollment modal state
    this.pendingEnrollDescriptor = null;
    this.pendingEnrollDataUrl = null;

    // DOM Elements - Main Panel
    this.overlayCanvas = null;
    this.overlayCtx = null;
    this.statusBadgeEl = null;
    this.statusDetailEl = null;
    this.headerStatusEl = null;
    this.rosterCountEl = null;
    this.subjectCountEl = null;
    this.distanceEl = null;
    this.thresholdSliderEl = null;
    this.thresholdValEl = null;
    this.resyncBtnEl = null;
    this.liveSubjectsListEl = null;
    this.rosterListEl = null;
    this.openAddPersonBtnEl = null;

    // DOM Elements - Modal
    this.modalEl = null;
    this.closeModalXBtnEl = null;
    this.cancelModalBtnEl = null;
    this.submitModalBtnEl = null;
    this.modalNameInputEl = null;
    this.modalFileInputEl = null;
    this.modalSelectedFilenameEl = null;
    this.modalImagePreviewEl = null;
    this.modalPreviewPlaceholderEl = null;
    this.modalValidationMsgEl = null;

    this.init();
  }

  async init() {
    this.bindDOMElements();
    this.setupListeners();
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    await this.loadModels();
    await this.syncRoster();
    this.startInferenceLoop();
  }

  bindDOMElements() {
    this.overlayCanvas = document.getElementById('faceAuthOverlayCanvas');
    if (this.overlayCanvas) {
      this.overlayCtx = this.overlayCanvas.getContext('2d');
    }

    // Panel Elements
    this.statusBadgeEl = document.getElementById('faceAuthStatusBadge');
    this.statusDetailEl = document.getElementById('faceAuthStatusDetail');
    this.headerStatusEl = document.getElementById('faceAuthHeaderStatus');
    this.rosterCountEl = document.getElementById('faceAuthRosterCount');
    this.subjectCountEl = document.getElementById('faceAuthSubjectCount');
    this.distanceEl = document.getElementById('faceAuthDistance');
    this.thresholdSliderEl = document.getElementById('faceAuthThresholdSlider');
    this.thresholdValEl = document.getElementById('faceAuthThresholdVal');
    this.resyncBtnEl = document.getElementById('btnFaceAuthResync');
    this.liveSubjectsListEl = document.getElementById('faceAuthLiveSubjectsList');
    this.rosterListEl = document.getElementById('faceAuthRosterList');
    this.openAddPersonBtnEl = document.getElementById('btnOpenAddPersonModal');

    // Modal Elements
    this.modalEl = document.getElementById('modalAddAuthorizedPerson');
    this.closeModalXBtnEl = document.getElementById('btnCloseEnrollModalX');
    this.cancelModalBtnEl = document.getElementById('btnCancelEnrollModal');
    this.submitModalBtnEl = document.getElementById('btnSubmitEnrollModal');
    this.modalNameInputEl = document.getElementById('inputEnrollPersonName');
    this.modalFileInputEl = document.getElementById('inputEnrollPersonFile');
    this.modalSelectedFilenameEl = document.getElementById('enrollSelectedFilename');
    this.modalImagePreviewEl = document.getElementById('enrollImagePreview');
    this.modalPreviewPlaceholderEl = document.getElementById('enrollPreviewPlaceholder');
    this.modalValidationMsgEl = document.getElementById('enrollValidationMsg');
  }

  setupListeners() {
    // Threshold slider
    if (this.thresholdSliderEl) {
      this.thresholdSliderEl.addEventListener('input', (e) => {
        this.matchThreshold = parseFloat(e.target.value);
        if (this.thresholdValEl) {
          this.thresholdValEl.textContent = this.matchThreshold.toFixed(2);
        }
      });
    }

    // Manual Re-sync button
    if (this.resyncBtnEl) {
      this.resyncBtnEl.addEventListener('click', () => {
        this.syncRoster();
      });
    }

    // Open Modal
    if (this.openAddPersonBtnEl) {
      this.openAddPersonBtnEl.addEventListener('click', () => {
        this.openEnrollModal();
      });
    }

    // Close Modal buttons
    if (this.closeModalXBtnEl) {
      this.closeModalXBtnEl.addEventListener('click', () => this.closeEnrollModal());
    }
    if (this.cancelModalBtnEl) {
      this.cancelModalBtnEl.addEventListener('click', () => this.closeEnrollModal());
    }

    // Modal File selection
    if (this.modalFileInputEl) {
      this.modalFileInputEl.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) {
          this.handleImageFileSelection(file);
        }
      });
    }

    // Modal Submit
    if (this.submitModalBtnEl) {
      this.submitModalBtnEl.addEventListener('click', () => {
        this.submitEnrollment();
      });
    }
  }

  resizeCanvas() {
    if (!this.overlayCanvas) return;
    const parent = this.overlayCanvas.parentElement;
    if (!parent || parent.clientWidth <= 0 || parent.clientHeight <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    this.overlayCanvas.width = parent.clientWidth * dpr;
    this.overlayCanvas.height = parent.clientHeight * dpr;
    if (this.overlayCtx) {
      this.overlayCtx.setTransform(1, 0, 0, 1, 0, 0);
      this.overlayCtx.scale(dpr, dpr);
    }
  }

  euclideanDistance(d1, d2) {
    if (!d1 || !d2 || d1.length !== d2.length) return 1.0;
    let sum = 0;
    for (let i = 0; i < d1.length; i++) {
      const diff = d1[i] - d2[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }

  async loadModels() {
    if (!this.api) {
      console.warn('[FaceAuth] faceapi library not found in window scope');
      this.updateStatusBadge('VERIFICATION UNAVAILABLE', 'critical', 'face-api.js library not loaded');
      return;
    }
    if (this.modelsLoaded || this.isLoadingModels) return;

    this.isLoadingModels = true;
    this.updateStatusBadge('LOADING MODELS', 'neutral', 'Loading local neural models from /models...');

    try {
      await Promise.all([
        this.api.nets.tinyFaceDetector.loadFromUri('/models'),
        this.api.nets.faceLandmark68TinyNet.loadFromUri('/models'),
        this.api.nets.faceRecognitionNet.loadFromUri('/models')
      ]);
      this.modelsLoaded = true;
      this.isLoadingModels = false;
      console.log('[FaceAuth] Neural models loaded successfully from /models');
    } catch (err) {
      this.isLoadingModels = false;
      this.modelsLoaded = false;
      console.error('[FaceAuth] Failed to load neural face models:', err);
      this.updateStatusBadge('VERIFICATION UNAVAILABLE', 'critical', 'Model loading error: ' + err.message);
    }
  }

  async syncRoster() {
    try {
      this.updateStatusBadge('LOADING REFERENCES', 'neutral', 'Retrieving enrolled authorized identities...');
      const res = await fetch('/api/face-auth/roster', { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load roster endpoint: ' + res.status);
      const data = await res.json();

      let people = Array.isArray(data.people) ? data.people : [];

      // Convert stored descriptor arrays to Float32Array instances
      this.roster = people.map(p => ({
        id: p.id,
        name: p.name || 'Authorized Operator',
        enrolledAt: p.enrolledAt,
        filename: p.filename,
        descriptor: p.descriptor ? new Float32Array(p.descriptor) : null
      }));

      // If any person is missing descriptor, load and extract descriptor on the fly
      for (const p of this.roster) {
        if (!p.descriptor && p.filename) {
          try {
            const img = await this.api.fetchImage(`/api/face-auth/photo/${p.id}`);
            const options = new this.api.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 });
            const det = await this.api.detectSingleFace(img, options)
              .withFaceLandmarks(true)
              .withFaceDescriptor();
            if (det && det.descriptor) {
              p.descriptor = det.descriptor;
            }
          } catch (e) {
            console.warn(`[FaceAuth] Could not extract descriptor for ${p.name}:`, e);
          }
        }
      }

      // Filter to only those with valid 128-d descriptors
      this.roster = this.roster.filter(p => p.descriptor && p.descriptor.length === 128);

      this.renderRosterUI();

      if (this.roster.length === 0) {
        this.updateStatusBadge('NO AUTHORIZED PEOPLE ENROLLED', 'warning', "Click '+ ADD AUTHORIZED PERSON' to enroll authorized personnel.");
        if (this.headerStatusEl) {
          this.headerStatusEl.textContent = 'NO ROSTER';
          this.headerStatusEl.className = 'snc-status warning';
        }
      } else {
        this.updateStatusBadge('NO FACE DETECTED', 'neutral', `${this.roster.length} authorized identities active · Awaiting subjects in FOV`);
        if (this.headerStatusEl) {
          this.headerStatusEl.textContent = 'READY';
          this.headerStatusEl.className = 'snc-status verified';
        }
      }
    } catch (err) {
      console.error('[FaceAuth] Error syncing roster:', err);
      this.updateStatusBadge('VERIFICATION UNAVAILABLE', 'critical', 'Roster sync failed: ' + err.message);
    }
  }

  renderRosterUI() {
    if (this.rosterCountEl) {
      this.rosterCountEl.textContent = `${this.roster.length} IDENTIT${this.roster.length === 1 ? 'Y' : 'IES'}`;
    }

    if (!this.rosterListEl) return;
    this.rosterListEl.innerHTML = '';

    if (this.roster.length === 0) {
      this.rosterListEl.innerHTML = `
        <div style="font-size:9px; color:var(--state-warning); font-family:var(--font-mono); padding:6px 4px; text-align:center;">
          NO AUTHORIZED PEOPLE ENROLLED
        </div>
      `;
      return;
    }

    this.roster.forEach(person => {
      const card = document.createElement('div');
      card.className = 'roster-person-card';
      const dateStr = person.enrolledAt ? new Date(person.enrolledAt).toLocaleDateString() : 'Active';

      card.innerHTML = `
        <div style="display:flex; flex-direction:column; overflow:hidden; max-width:180px;">
          <span style="font-weight:700; color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${person.name}</span>
          <span style="font-size:7.5px; color:var(--text-tertiary);">Enrolled: ${dateStr}</span>
        </div>
        <button class="btn-remove-person" data-id="${person.id}">REMOVE</button>
      `;

      const removeBtn = card.querySelector('.btn-remove-person');
      if (removeBtn) {
        removeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.confirmAndRemovePerson(person.id, person.name);
        });
      }

      this.rosterListEl.appendChild(card);
    });
  }

  async confirmAndRemovePerson(personId, personName) {
    const ok = window.confirm(`Remove ${personName} from the authorized biometric roster?\nThis identity will immediately lose authorization.`);
    if (!ok) return;

    try {
      const res = await fetch(`/api/face-auth/person/${personId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Server returned HTTP ' + res.status);
      
      // Update memory roster immediately
      this.roster = this.roster.filter(p => p.id !== personId);
      this.renderRosterUI();

      if (this.roster.length === 0) {
        this.updateStatusBadge('NO AUTHORIZED PEOPLE ENROLLED', 'warning', "Click '+ ADD AUTHORIZED PERSON' to enroll authorized personnel.");
      }
    } catch (err) {
      alert('Failed to remove identity: ' + err.message);
    }
  }

  openEnrollModal() {
    if (!this.modalEl) return;
    this.pendingEnrollDescriptor = null;
    this.pendingEnrollDataUrl = null;

    if (this.modalNameInputEl) this.modalNameInputEl.value = '';
    if (this.modalFileInputEl) this.modalFileInputEl.value = '';
    if (this.modalSelectedFilenameEl) this.modalSelectedFilenameEl.textContent = 'No file selected';
    if (this.modalImagePreviewEl) {
      this.modalImagePreviewEl.src = '';
      this.modalImagePreviewEl.style.display = 'none';
    }
    if (this.modalPreviewPlaceholderEl) this.modalPreviewPlaceholderEl.style.display = 'block';
    if (this.modalValidationMsgEl) {
      this.modalValidationMsgEl.textContent = 'Awaiting photo selection. Image must contain exactly one clear human face.';
      this.modalValidationMsgEl.style.color = 'var(--state-warning)';
      this.modalValidationMsgEl.style.background = 'rgba(215, 168, 75, 0.08)';
      this.modalValidationMsgEl.style.borderColor = 'rgba(215, 168, 75, 0.25)';
    }
    if (this.submitModalBtnEl) {
      this.submitModalBtnEl.disabled = true;
      this.submitModalBtnEl.style.opacity = '0.5';
      this.submitModalBtnEl.style.cursor = 'not-allowed';
    }

    this.modalEl.classList.add('open');
  }

  closeEnrollModal() {
    if (this.modalEl) this.modalEl.classList.remove('open');
    this.pendingEnrollDescriptor = null;
    this.pendingEnrollDataUrl = null;
  }

  async handleImageFileSelection(file) {
    if (!file) return;
    if (this.modalSelectedFilenameEl) {
      this.modalSelectedFilenameEl.textContent = `${file.name} (${Math.round(file.size / 1024)} KB)`;
    }

    if (this.modalValidationMsgEl) {
      this.modalValidationMsgEl.textContent = '⏳ Decoding photo and running neural biometric detector...';
      this.modalValidationMsgEl.style.color = 'var(--radar-cyan)';
      this.modalValidationMsgEl.style.background = 'rgba(24, 184, 214, 0.08)';
      this.modalValidationMsgEl.style.borderColor = 'rgba(24, 184, 214, 0.25)';
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target.result;
      this.pendingEnrollDataUrl = dataUrl;

      if (this.modalImagePreviewEl) {
        this.modalImagePreviewEl.src = dataUrl;
        this.modalImagePreviewEl.style.display = 'block';
      }
      if (this.modalPreviewPlaceholderEl) {
        this.modalPreviewPlaceholderEl.style.display = 'none';
      }

      const img = new Image();
      img.onload = async () => {
        try {
          if (!this.modelsLoaded) {
            await this.loadModels();
          }

          const options = new this.api.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.35 });
          const detections = await this.api.detectAllFaces(img, options)
            .withFaceLandmarks(true)
            .withFaceDescriptors();

          if (!detections || detections.length === 0) {
            this.pendingEnrollDescriptor = null;
            if (this.modalValidationMsgEl) {
              this.modalValidationMsgEl.textContent = '❌ VALIDATION FAILED: No human face detected in selected image. Please choose a clear frontal portrait.';
              this.modalValidationMsgEl.style.color = 'var(--state-critical)';
              this.modalValidationMsgEl.style.background = 'rgba(212, 88, 88, 0.12)';
              this.modalValidationMsgEl.style.borderColor = 'rgba(212, 88, 88, 0.3)';
            }
            if (this.submitModalBtnEl) {
              this.submitModalBtnEl.disabled = true;
              this.submitModalBtnEl.style.opacity = '0.5';
              this.submitModalBtnEl.style.cursor = 'not-allowed';
            }
            return;
          }

          if (detections.length > 1) {
            this.pendingEnrollDescriptor = null;
            if (this.modalValidationMsgEl) {
              this.modalValidationMsgEl.textContent = `❌ VALIDATION FAILED: Multiple faces detected (${detections.length}). The reference photograph must contain exactly one person.`;
              this.modalValidationMsgEl.style.color = 'var(--state-critical)';
              this.modalValidationMsgEl.style.background = 'rgba(212, 88, 88, 0.12)';
              this.modalValidationMsgEl.style.borderColor = 'rgba(212, 88, 88, 0.3)';
            }
            if (this.submitModalBtnEl) {
              this.submitModalBtnEl.disabled = true;
              this.submitModalBtnEl.style.opacity = '0.5';
              this.submitModalBtnEl.style.cursor = 'not-allowed';
            }
            return;
          }

          // Exactly 1 clear face detected!
          this.pendingEnrollDescriptor = detections[0].descriptor;
          const conf = (detections[0].detection.score * 100).toFixed(1);

          if (this.modalValidationMsgEl) {
            this.modalValidationMsgEl.textContent = `✓ VALID FACE DETECTED (Detection Confidence: ${conf}%). Ready to enroll.`;
            this.modalValidationMsgEl.style.color = 'var(--state-verified)';
            this.modalValidationMsgEl.style.background = 'rgba(66, 196, 122, 0.1)';
            this.modalValidationMsgEl.style.borderColor = 'rgba(66, 196, 122, 0.3)';
          }

          if (this.submitModalBtnEl) {
            this.submitModalBtnEl.disabled = false;
            this.submitModalBtnEl.style.opacity = '1.0';
            this.submitModalBtnEl.style.cursor = 'pointer';
          }
        } catch (err) {
          console.error('[FaceAuth] Face validation error:', err);
          if (this.modalValidationMsgEl) {
            this.modalValidationMsgEl.textContent = '❌ Error validating face: ' + err.message;
            this.modalValidationMsgEl.style.color = 'var(--state-critical)';
          }
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  async submitEnrollment() {
    const nameVal = this.modalNameInputEl?.value?.trim();
    if (!nameVal) {
      alert("Please enter the person's name.");
      this.modalNameInputEl?.focus();
      return;
    }

    if (!this.pendingEnrollDescriptor || !this.pendingEnrollDataUrl) {
      alert('Please choose a valid photograph with exactly one human face.');
      return;
    }

    if (this.submitModalBtnEl) {
      this.submitModalBtnEl.disabled = true;
      this.submitModalBtnEl.textContent = 'ENROLLING...';
    }

    try {
      const payload = {
        name: nameVal,
        imageData: this.pendingEnrollDataUrl,
        descriptor: Array.from(this.pendingEnrollDescriptor)
      };

      const res = await fetch('/api/face-auth/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Server error ' + res.status);
      }

      const resData = await res.json();
      const newPerson = {
        id: resData.person.id,
        name: resData.person.name,
        enrolledAt: resData.person.enrolledAt,
        filename: resData.person.filename,
        descriptor: this.pendingEnrollDescriptor
      };

      this.roster.push(newPerson);
      this.renderRosterUI();
      this.closeEnrollModal();

      this.updateStatusBadge('NO FACE DETECTED', 'neutral', `${this.roster.length} authorized identities active · Awaiting subjects in FOV`);
      if (this.headerStatusEl) {
        this.headerStatusEl.textContent = 'READY';
        this.headerStatusEl.className = 'snc-status verified';
      }
    } catch (err) {
      console.error('[FaceAuth] Enrollment error:', err);
      alert('Enrollment failed: ' + err.message);
    } finally {
      if (this.submitModalBtnEl) {
        this.submitModalBtnEl.textContent = 'ENROLL PERSON';
        this.submitModalBtnEl.disabled = false;
      }
    }
  }

  getVideoElement() {
    if (this.videoEl && this.videoEl.readyState >= 2) {
      return this.videoEl;
    }
    if (window.app?.camera?.webcamVideo) {
      this.videoEl = window.app.camera.webcamVideo;
      return this.videoEl;
    }
    return null;
  }

  startInferenceLoop() {
    if (this.detectionInterval) clearInterval(this.detectionInterval);
    this.detectionInterval = setInterval(() => {
      this.processFrame();
    }, 160);
  }

  async processFrame() {
    if (!this.modelsLoaded || this.isDetecting || document.hidden) return;

    // Only process if user is in camera view
    if (window.app && window.app.activeView !== 'camera') {
      this.clearOverlay();
      return;
    }

    const video = this.getVideoElement();
    if (!video || video.readyState < 2 || video.paused || video.ended) {
      this.clearOverlay();
      if (this.subjectCountEl) this.subjectCountEl.textContent = '0 IN FOV';
      return;
    }

    this.isDetecting = true;
    try {
      const options = new this.api.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });
      const detections = await this.api.detectAllFaces(video, options)
        .withFaceLandmarks(true)
        .withFaceDescriptors();

      this.evaluateDetections(detections, video);
    } catch (err) {
      console.warn('[FaceAuth] Inference error during frame detection:', err);
    } finally {
      this.isDetecting = false;
    }
  }

  evaluateDetections(detections, video) {
    // 1. Check if roster is empty
    if (this.roster.length === 0) {
      if (!detections || detections.length === 0) {
        this.clearOverlay();
        if (this.subjectCountEl) this.subjectCountEl.textContent = '0 IN FOV';
        if (this.distanceEl) this.distanceEl.textContent = '--';
        this.updateStatusBadge('NO AUTHORIZED PEOPLE ENROLLED', 'warning', "Click '+ ADD AUTHORIZED PERSON' to register authorized personnel.");
        if (this.headerStatusEl) {
          this.headerStatusEl.textContent = 'NO ROSTER';
          this.headerStatusEl.className = 'snc-status warning';
        }
        if (this.liveSubjectsListEl) {
          this.liveSubjectsListEl.innerHTML = `<div style="color:var(--text-tertiary); font-style:italic;">● Standby: No faces detected in optical feed</div>`;
        }
        return;
      }

      // Faces present, but NO authorized identities enrolled -> ALL faces marked UNAUTHORIZED
      if (this.subjectCountEl) {
        this.subjectCountEl.textContent = `${detections.length} IN FOV`;
      }
      if (this.distanceEl) this.distanceEl.textContent = '--';
      this.updateStatusBadge('UNAUTHORIZED', 'critical', `${detections.length} unknown face(s) in sector · No authorized identities enrolled`);
      if (this.headerStatusEl) {
        this.headerStatusEl.textContent = 'UNAUTHORIZED';
        this.headerStatusEl.className = 'snc-status critical';
      }

      const results = detections.map(det => ({
        detection: det,
        isMatch: false,
        matchedPerson: null,
        distance: 999.0,
        status: 'UNAUTHORIZED',
        label: 'UNAUTHORIZED · UNKNOWN PERSON',
        color: '#ff4141'
      }));

      this.updateLiveSubjectsListUI(results);
      this.renderOverlay(results, video);
      return;
    }

    // 2. Roster is non-empty, but no faces detected in camera
    if (!detections || detections.length === 0) {
      this.clearOverlay();
      if (this.subjectCountEl) this.subjectCountEl.textContent = '0 IN FOV';
      if (this.distanceEl) this.distanceEl.textContent = '--';
      this.updateStatusBadge('NO FACE DETECTED', 'neutral', `${this.roster.length} authorized identities active · Awaiting subjects in FOV`);
      if (this.headerStatusEl) {
        this.headerStatusEl.textContent = 'READY';
        this.headerStatusEl.className = 'snc-status verified';
      }
      if (this.liveSubjectsListEl) {
        this.liveSubjectsListEl.innerHTML = `<div style="color:var(--text-tertiary); font-style:italic;">● Standby: No faces detected in optical feed</div>`;
      }
      return;
    }

    // 3. Independent Multi-Face Evaluation against Roster
    let globalMinDist = 999.0;
    let anyUnauthorized = false;
    let authCount = 0;
    let unauthCount = 0;

    const results = detections.map((det) => {
      let bestDist = 999.0;
      let bestPerson = null;

      for (const person of this.roster) {
        if (!person.descriptor) continue;
        const d = this.euclideanDistance(det.descriptor, person.descriptor);
        if (d < bestDist) {
          bestDist = d;
          bestPerson = person;
        }
      }

      if (bestDist < globalMinDist) {
        globalMinDist = bestDist;
      }

      const isMatch = (bestDist <= this.matchThreshold && bestPerson !== null);
      if (isMatch) {
        authCount++;
        return {
          detection: det,
          isMatch: true,
          matchedPerson: bestPerson,
          distance: bestDist,
          status: 'AUTHORIZED',
          label: `AUTHORIZED · ${bestPerson.name.toUpperCase()}`,
          color: '#42c47a'
        };
      } else {
        anyUnauthorized = true;
        unauthCount++;
        return {
          detection: det,
          isMatch: false,
          matchedPerson: null,
          distance: bestDist,
          status: 'UNAUTHORIZED',
          label: 'UNAUTHORIZED · UNKNOWN PERSON',
          color: '#ff4141'
        };
      }
    });

    // Update Counts & Readouts
    if (this.subjectCountEl) {
      this.subjectCountEl.textContent = `${results.length} IN FOV`;
    }
    if (this.distanceEl) {
      this.distanceEl.textContent = globalMinDist < 10 ? `${globalMinDist.toFixed(3)} (THR ${this.matchThreshold.toFixed(2)})` : '--';
      this.distanceEl.style.color = (globalMinDist <= this.matchThreshold) ? 'var(--state-verified)' : 'var(--state-critical)';
    }

    // Overall Status Badge
    if (anyUnauthorized) {
      this.updateStatusBadge('UNAUTHORIZED', 'critical', `${unauthCount} unauthorized unknown person(s) detected in sector FOV`);
      if (this.headerStatusEl) {
        this.headerStatusEl.textContent = 'UNAUTHORIZED';
        this.headerStatusEl.className = 'snc-status critical';
      }
    } else {
      this.updateStatusBadge('AUTHORIZED', 'verified', `All ${authCount} visible subject(s) successfully verified against roster`);
      if (this.headerStatusEl) {
        this.headerStatusEl.textContent = 'AUTHORIZED';
        this.headerStatusEl.className = 'snc-status verified';
      }
    }

    this.updateLiveSubjectsListUI(results);
    this.renderOverlay(results, video);
  }

  updateLiveSubjectsListUI(results) {
    if (!this.liveSubjectsListEl) return;
    this.liveSubjectsListEl.innerHTML = '';

    results.forEach((subj, idx) => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.justifyContent = 'space-between';
      row.style.alignItems = 'center';
      row.style.padding = '3px 0';
      row.style.borderBottom = '1px solid rgba(255,255,255,0.05)';

      const isAuth = subj.status === 'AUTHORIZED';
      const color = isAuth ? 'var(--state-verified)' : 'var(--state-critical)';
      const distStr = subj.distance < 10 ? `Dist ${subj.distance.toFixed(3)}` : '';

      row.innerHTML = `
        <span style="color:${color}; font-weight:700;">#${idx + 1} ${subj.label}</span>
        <span style="color:var(--text-tertiary); font-size:8px;">${distStr}</span>
      `;
      this.liveSubjectsListEl.appendChild(row);
    });
  }

  clearOverlay() {
    if (!this.overlayCanvas || !this.overlayCtx) return;
    const rect = this.overlayCanvas.getBoundingClientRect();
    this.overlayCtx.clearRect(0, 0, rect.width, rect.height);
  }

  renderOverlay(subjects, video) {
    if (!this.overlayCanvas || !this.overlayCtx) return;
    const ctx = this.overlayCtx;
    const rect = this.overlayCanvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    ctx.clearRect(0, 0, w, h);
    if (!subjects || subjects.length === 0) return;

    // Coordinate mapping: video stretches across w & h of canvas
    const scaleX = w / video.videoWidth;
    const scaleY = h / video.videoHeight;

    subjects.forEach((subj) => {
      const box = subj.detection.detection.box;
      const bx = box.x * scaleX;
      const by = box.y * scaleY;
      const bw = box.width * scaleX;
      const bh = box.height * scaleY;
      const color = subj.color;

      ctx.save();

      // Clean rectangular bounding box around face
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.0;
      ctx.strokeRect(bx, by, bw, bh);

      // Subtle translucent interior fill
      ctx.fillStyle = subj.status === 'AUTHORIZED' ? 'rgba(66, 196, 122, 0.10)' : 'rgba(255, 65, 65, 0.12)';
      ctx.fillRect(bx, by, bw, bh);

      // Text Label Tag above bounding box
      ctx.font = '700 9.5px "JetBrains Mono", monospace';
      const labelText = subj.label;
      const textMetrics = ctx.measureText(labelText);
      const tagW = Math.max(bw, textMetrics.width + 10);
      const tagH = 17;
      const tagX = bx;
      const tagY = Math.max(2, by - tagH - 3);

      ctx.fillStyle = 'rgba(5, 10, 16, 0.90)';
      ctx.fillRect(tagX, tagY, tagW, tagH);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.0;
      ctx.strokeRect(tagX, tagY, tagW, tagH);

      ctx.fillStyle = color;
      ctx.fillText(labelText, tagX + 5, tagY + 12);

      // Distance Sub-label below bounding box if computed
      if (subj.distance < 10) {
        ctx.font = '600 8.5px "JetBrains Mono", monospace';
        const metricText = `DIST: ${subj.distance.toFixed(3)} | THR: ${this.matchThreshold.toFixed(2)}`;
        const subY = by + bh + 14;
        ctx.fillStyle = 'rgba(5, 10, 16, 0.85)';
        ctx.fillRect(bx, subY - 11, ctx.measureText(metricText).width + 8, 14);
        ctx.fillStyle = color;
        ctx.fillText(metricText, bx + 4, subY);
      }

      ctx.restore();
    });
  }

  updateStatusBadge(badgeText, stateType, detailText) {
    if (this.statusBadgeEl) {
      this.statusBadgeEl.textContent = badgeText;
      if (stateType === 'verified') {
        this.statusBadgeEl.style.color = 'var(--state-verified)';
      } else if (stateType === 'critical') {
        this.statusBadgeEl.style.color = 'var(--state-critical)';
      } else if (stateType === 'warning') {
        this.statusBadgeEl.style.color = 'var(--state-warning)';
      } else {
        this.statusBadgeEl.style.color = 'var(--text-secondary)';
      }
    }

    if (this.statusDetailEl && detailText) {
      this.statusDetailEl.textContent = detailText;
    }
  }
}

// Global initialization upon DOM ready
window.addEventListener('DOMContentLoaded', () => {
  window.faceAuthEngine = new FaceAuthenticationEngine();
});
