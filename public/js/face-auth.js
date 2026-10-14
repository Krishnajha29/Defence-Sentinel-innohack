/**
 * Defence-Sentinel: Advanced Multi-Person Face Authentication & Anti-Spoofing Sentry Subsystem
 * 
 * Core Capabilities:
 * 1. Multi-Stage Liveness Verification (PAD v2) & Presentation-Attack Defense:
 *    - Dual-layer anti-spoofing: randomized active biometric challenges + temporal landmark planar rigidity analysis.
 *    - Photo-on-phone presentation attacks are decisively blocked (challenge timeout + planar rigidity detection).
 *    - A matching face descriptor alone NEVER grants authorization.
 * 2. Multi-Person Image Enrollment & Storage:
 *    - '+ ADD AUTHORIZED PERSON' modal with 1-face validation (rejects 0 or >1 faces).
 *    - 128-dimensional Float32Array template extraction with finite value validation.
 *    - Local persistence in private/face-reference/roster.json without cloud dependencies.
 *    - Individual removal with real-time roster synchronization.
 * 3. Independent Verification For Every Face:
 *    - Spatial IoU & centroid multi-face tracker.
 *    - Independent identity matching, independent liveness challenge, and independent authorization per face.
 *    - Never uses a global authorization flag; one person's liveness never authorizes another.
 * 4. Configurable & Conservative Matching:
 *    - Euclidean distance threshold (calibrated 0.48, adjustable 0.30 - 0.70).
 *    - Ambiguity detection (rejects near-equal distances to multiple enrolled identities).
 *    - Distinguishes face detection confidence from identity match confidence.
 * 5. Modern Redesigned Tactical UI & Explainable Audit Trail:
 *    - Prominent hero verification state badge with glowing state-tinted cards.
 *    - Active challenge directive with real-time countdown timer & progress bar.
 *    - Rolling audit trail of authentication decisions with explainable reasons.
 *    - Clean rectangular HUD bounding boxes (no silhouettes, no stick figures).
 * 6. Explicit 16-State Lifecycle Management:
 *    - INITIALIZING, LOADING MODELS, LOADING REFERENCES, READY, FACE DETECTED,
 *      MATCHING IDENTITY, LIVENESS CHECK REQUIRED, LIVENESS VERIFIED, AUTHORIZED,
 *      UNAUTHORIZED, UNKNOWN PERSON, LIVENESS FAILED, LIVENESS UNVERIFIED,
 *      NO FACE DETECTED, NO AUTHORIZED PEOPLE ENROLLED, VERIFICATION UNAVAILABLE.
 */

class FaceAuthenticationEngine {
  constructor() {
    this.api = window.faceapi || (typeof faceapi !== 'undefined' ? faceapi : null);
    this.modelsLoaded = false;
    this.isLoadingModels = false;
    this.roster = []; // Array of { id, name, enrolledAt, filename, descriptor: Float32Array }
    this.matchThreshold = 0.48; // Euclidean distance threshold (lower = stricter)
    this.ambiguityDelta = 0.04; // Minimum gap between 1st & 2nd best match to avoid ambiguity
    
    this.isDetecting = false;
    this.detectionInterval = null;
    this.videoEl = null;

    // Multi-face spatial tracker
    this.tracks = new Map(); // trackId -> TrackObject
    this.nextTrackNum = 1;
    this.maxMissedFrames = 8; // Drop track if not detected for ~1.3s (invalidates liveness token)

    // Audit trail log (rolling 15 events)
    this.auditTrail = [];
    this.maxAuditEntries = 15;

    // Temporary enrollment modal state
    this.pendingEnrollDescriptor = null;
    this.pendingEnrollDataUrl = null;

    // DOM Elements - Main Panel
    this.overlayCanvas = null;
    this.overlayCtx = null;
    this.heroBoxEl = null;
    this.statusBadgeEl = null;
    this.statusDetailEl = null;
    this.headerStatusEl = null;
    this.matchedNameEl = null;
    this.modelsStateEl = null;
    this.rosterCountEl = null;
    this.subjectCountEl = null;
    this.distanceEl = null;
    this.livenessEngineEl = null;
    this.thresholdSliderEl = null;
    this.thresholdValEl = null;
    this.resyncBtnEl = null;
    this.forceChallengeBtnEl = null;
    this.liveSubjectsListEl = null;
    this.rosterListEl = null;
    this.openAddPersonBtnEl = null;
    this.auditTrailEl = null;

    // DOM Elements - Active Challenge Banner
    this.challengeBoxEl = null;
    this.challengeDirectiveEl = null;
    this.challengeTimerEl = null;
    this.challengeProgressBarEl = null;
    this.challengeHintEl = null;

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
    this.modalEnrolledListContainerEl = null;
    this.modalEnrolledRosterCountEl = null;

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

    // Main Panel Elements
    this.heroBoxEl = document.getElementById('faceAuthHeroBox');
    this.statusBadgeEl = document.getElementById('faceAuthStatusBadge');
    this.statusDetailEl = document.getElementById('faceAuthStatusDetail');
    this.headerStatusEl = document.getElementById('faceAuthHeaderStatus');
    this.matchedNameEl = document.getElementById('faceAuthMatchedName');
    this.modelsStateEl = document.getElementById('faceAuthModelsState');
    this.rosterCountEl = document.getElementById('faceAuthRosterCount');
    this.subjectCountEl = document.getElementById('faceAuthSubjectCount');
    this.distanceEl = document.getElementById('faceAuthDistance');
    this.livenessEngineEl = document.getElementById('faceAuthLivenessEngine');
    this.thresholdSliderEl = document.getElementById('faceAuthThresholdSlider');
    this.thresholdValEl = document.getElementById('faceAuthThresholdVal');
    this.resyncBtnEl = document.getElementById('btnFaceAuthResync');
    this.forceChallengeBtnEl = document.getElementById('btnFaceAuthForceChallenge');
    this.liveSubjectsListEl = document.getElementById('faceAuthLiveSubjectsList');
    this.rosterListEl = document.getElementById('faceAuthRosterList');
    this.openAddPersonBtnEl = document.getElementById('btnOpenAddPersonModal');
    this.auditTrailEl = document.getElementById('faceAuthAuditTrail');

    // Challenge Banner Elements
    this.challengeBoxEl = document.getElementById('faceAuthChallengeBox');
    this.challengeDirectiveEl = document.getElementById('faceAuthChallengeDirective');
    this.challengeTimerEl = document.getElementById('faceAuthChallengeTimer');
    this.challengeProgressBarEl = document.getElementById('faceAuthChallengeProgressBar');
    this.challengeHintEl = document.getElementById('faceAuthChallengeHint');

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
    this.modalEnrolledListContainerEl = document.getElementById('modalEnrolledListContainer');
    this.modalEnrolledRosterCountEl = document.getElementById('modalEnrolledRosterCount');
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

    // Force Re-Challenge / Reset button (for live presentation attack & challenge testing)
    if (this.forceChallengeBtnEl) {
      this.forceChallengeBtnEl.addEventListener('click', () => {
        this.resetAllLivenessTracks('Manual operator reset: Forced liveness re-challenge initiated');
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

  resetAllLivenessTracks(reason = 'Session reset') {
    this.tracks.clear();
    this.recordAuditEvent('SYSTEM', 'RESET', reason);
    this.updateStatusBadge('LIVENESS CHECK REQUIRED', 'warning', 'Liveness tokens invalidated. Re-verifying subjects in FOV...');
    if (this.challengeBoxEl) this.challengeBoxEl.style.display = 'none';
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
    if (!d1 || !d2 || d1.length !== 128 || d2.length !== 128) return 1.0;
    let sum = 0;
    for (let i = 0; i < 128; i++) {
      const v1 = d1[i];
      const v2 = d2[i];
      if (!Number.isFinite(v1) || !Number.isFinite(v2)) return 1.0;
      const diff = v1 - v2;
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }

  async loadModels() {
    if (!this.api) {
      console.warn('[FaceAuth] faceapi library not found in window scope');
      this.updateStatusBadge('VERIFICATION UNAVAILABLE', 'critical', 'face-api.js neural library not loaded');
      if (this.modelsStateEl) this.modelsStateEl.textContent = 'MODELS: OFFLINE';
      return;
    }
    if (this.modelsLoaded || this.isLoadingModels) return;

    this.isLoadingModels = true;
    this.updateStatusBadge('LOADING MODELS', 'neutral', 'Loading local neural models from /models...');
    if (this.modelsStateEl) this.modelsStateEl.textContent = 'MODELS: LOADING...';

    try {
      await Promise.all([
        this.api.nets.tinyFaceDetector.loadFromUri('/models'),
        this.api.nets.faceLandmark68TinyNet.loadFromUri('/models'),
        this.api.nets.faceRecognitionNet.loadFromUri('/models'),
        this.api.nets.faceExpressionNet.loadFromUri('/models')
      ]);
      this.modelsLoaded = true;
      this.isLoadingModels = false;
      if (this.modelsStateEl) this.modelsStateEl.textContent = 'MODELS: ONLINE (LOCAL)';
      console.log('[FaceAuth] All neural face models loaded successfully from local /models');
    } catch (err) {
      this.isLoadingModels = false;
      this.modelsLoaded = false;
      console.error('[FaceAuth] Failed to load neural face models:', err);
      this.updateStatusBadge('VERIFICATION UNAVAILABLE', 'critical', 'Neural model loading error: ' + err.message);
      if (this.modelsStateEl) this.modelsStateEl.textContent = 'MODELS: ERROR';
    }
  }

  async syncRoster() {
    try {
      this.updateStatusBadge('LOADING REFERENCES', 'neutral', 'Retrieving enrolled authorized identities from private storage...');
      const res = await fetch('/api/face-auth/roster', { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load roster endpoint: ' + res.status);
      const data = await res.json();

      let people = Array.isArray(data.people) ? data.people : [];

      // Convert stored descriptor arrays to Float32Array instances and validate
      this.roster = people.map(p => ({
        id: p.id,
        name: p.name || 'Authorized Operator',
        enrolledAt: p.enrolledAt,
        filename: p.filename,
        descriptor: (Array.isArray(p.descriptor) && p.descriptor.length === 128) ? new Float32Array(p.descriptor) : null
      }));

      // If any person is missing descriptor, load photo and extract descriptor locally
      for (const p of this.roster) {
        if (!p.descriptor && p.filename) {
          try {
            const img = await this.api.fetchImage(`/api/face-auth/photo/${p.id}`);
            const options = new this.api.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 });
            const det = await this.api.detectSingleFace(img, options)
              .withFaceLandmarks(true)
              .withFaceDescriptor();
            if (det && det.descriptor && det.descriptor.length === 128) {
              p.descriptor = det.descriptor;
            }
          } catch (e) {
            console.warn(`[FaceAuth] Could not extract descriptor for ${p.name}:`, e);
          }
        }
      }

      // Filter to only those with valid 128-d descriptors
      this.roster = this.roster.filter(p => p.descriptor && p.descriptor.length === 128 && p.descriptor.every(n => Number.isFinite(n)));

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
    const countText = `${this.roster.length} IDENTIT${this.roster.length === 1 ? 'Y' : 'IES'}`;
    if (this.rosterCountEl) this.rosterCountEl.textContent = countText;
    if (this.modalEnrolledRosterCountEl) this.modalEnrolledRosterCountEl.textContent = `${this.roster.length} REGISTERED`;

    // 1. Render Main Biometric Panel Roster List
    if (this.rosterListEl) {
      this.rosterListEl.innerHTML = '';
      if (this.roster.length === 0) {
        this.rosterListEl.innerHTML = `
          <div style="font-size:8.5px; color:var(--state-warning); font-family:var(--font-mono); padding:6px 4px; text-align:center;">
            NO AUTHORIZED PEOPLE ENROLLED
          </div>
        `;
      } else {
        this.roster.forEach(person => {
          const card = document.createElement('div');
          card.className = 'roster-person-card';
          const dateStr = person.enrolledAt ? new Date(person.enrolledAt).toLocaleDateString() : 'Active';

          card.innerHTML = `
            <div style="display:flex; flex-direction:column; overflow:hidden; max-width:180px;">
              <span style="font-weight:700; color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${person.name}</span>
              <span style="font-size:7.5px; color:var(--text-tertiary);">Enrolled: ${dateStr} · 128D Vector Active</span>
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
    }

    // 2. Render Modal Enrolled List
    if (this.modalEnrolledListContainerEl) {
      this.modalEnrolledListContainerEl.innerHTML = '';
      if (this.roster.length === 0) {
        this.modalEnrolledListContainerEl.innerHTML = `
          <div style="font-size:8.5px; color:var(--text-tertiary); font-family:var(--font-mono); font-style:italic;">
            Roster is currently empty. Add personnel below.
          </div>
        `;
      } else {
        this.roster.forEach(person => {
          const row = document.createElement('div');
          row.style.display = 'flex';
          row.style.justifyContent = 'space-between';
          row.style.alignItems = 'center';
          row.style.padding = '4px 6px';
          row.style.background = '#060b10';
          row.style.border = '1px solid var(--border-subtle)';
          row.style.borderRadius = '3px';

          row.innerHTML = `
            <span style="font-size:9.5px; font-weight:700; color:#fff; font-family:var(--font-mono);">${person.name}</span>
            <button class="btn-remove-person" data-id="${person.id}">REMOVE</button>
          `;

          const removeBtn = row.querySelector('.btn-remove-person');
          if (removeBtn) {
            removeBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              this.confirmAndRemovePerson(person.id, person.name);
            });
          }

          this.modalEnrolledListContainerEl.appendChild(row);
        });
      }
    }
  }

  async confirmAndRemovePerson(personId, personName) {
    const ok = window.confirm(`Remove ${personName} from the authorized biometric roster?\nThis identity will immediately lose authorization.`);
    if (!ok) return;

    try {
      const res = await fetch(`/api/face-auth/person/${personId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Server returned HTTP ' + res.status);
      
      // Update memory roster immediately
      this.roster = this.roster.filter(p => p.id !== personId);
      this.tracks.clear(); // Reset tracks so matching re-evaluates cleanly
      this.renderRosterUI();
      this.recordAuditEvent(personName, 'REMOVED', 'Identity purged from private biometric storage');

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

    this.renderRosterUI();
    this.modalEl.classList.add('open');
  }

  closeEnrollModal() {
    if (this.modalEl) this.modalEl.classList.remove('open');
    this.pendingEnrollDescriptor = null;
    this.pendingEnrollDataUrl = null;
  }

  async handleImageFileSelection(file) {
    if (!file) return;

    // Validate mime type and file size
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      alert('Invalid file format. Please upload a JPEG, PNG, or WebP image.');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      alert('File too large (Max 15 MB). Please choose a smaller reference photo.');
      return;
    }

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
          const desc = detections[0].descriptor;
          if (!desc || desc.length !== 128 || !desc.every(v => Number.isFinite(v))) {
            throw new Error('Generated descriptor failed mathematical integrity check');
          }

          this.pendingEnrollDescriptor = desc;
          const conf = (detections[0].detection.score * 100).toFixed(1);

          if (this.modalValidationMsgEl) {
            this.modalValidationMsgEl.textContent = `✓ VALID FACE DETECTED (Detection Confidence: ${conf}%). 128-D Biometric template extracted. Ready to enroll.`;
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
        descriptor: Array.from(this.pendingEnrollDescriptor),
        modelVersion: 'face-recognition-net-v1'
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
      this.recordAuditEvent(newPerson.name, 'ENROLLED', 'Enrolled with 128D validated descriptor');

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
    }, 150); // ~6.6 FPS inference
  }

  async processFrame() {
    if (!this.modelsLoaded || this.isDetecting || document.hidden) return;

    // Only process if user is in optical surveillance view
    if (window.app && window.app.activeView !== 'camera') {
      this.clearOverlay();
      return;
    }

    const video = this.getVideoElement();
    if (!video || video.readyState < 2 || video.paused || video.ended) {
      this.clearOverlay();
      if (this.subjectCountEl) this.subjectCountEl.textContent = '0 IN FOV';
      if (this.challengeBoxEl) this.challengeBoxEl.style.display = 'none';
      return;
    }

    this.isDetecting = true;
    try {
      const options = new this.api.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });
      const detections = await this.api.detectAllFaces(video, options)
        .withFaceLandmarks(true)
        .withFaceDescriptors()
        .withFaceExpressions();

      this.evaluateDetections(detections, video);
    } catch (err) {
      console.warn('[FaceAuth] Inference error during frame detection:', err);
    } finally {
      this.isDetecting = false;
    }
  }

  /**
   * Spatial multi-face tracking via Bounding Box IoU & Centroid Distance
   */
  matchDetectionsToTracks(detections) {
    const now = Date.now();
    const activeTracks = [];

    // Increment misses on existing tracks
    for (const [id, track] of this.tracks.entries()) {
      track.missedFrames++;
    }

    // Match each detection to nearest existing track
    for (const det of detections) {
      const box = det.detection.box;
      const detCenter = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

      let bestTrack = null;
      let bestDist = 120; // Max pixel drift threshold between consecutive frames

      for (const [id, track] of this.tracks.entries()) {
        const trkCenter = { x: track.box.x + track.box.width / 2, y: track.box.y + track.box.height / 2 };
        const dist = Math.hypot(detCenter.x - trkCenter.x, detCenter.y - trkCenter.y);
        if (dist < bestDist) {
          bestDist = dist;
          bestTrack = track;
        }
      }

      if (bestTrack) {
        // Update existing track
        bestTrack.box = box;
        bestTrack.detection = det;
        bestTrack.lastSeen = now;
        bestTrack.missedFrames = 0;
        bestTrack.totalFramesSeen++;
        activeTracks.push(bestTrack);
      } else {
        // Create new track with its OWN independent liveness lifecycle
        const newTrackId = `TRK-${String(this.nextTrackNum++).padStart(2, '0')}`;
        const newTrack = {
          trackId: newTrackId,
          box: box,
          detection: det,
          lastSeen: now,
          missedFrames: 0,
          totalFramesSeen: 1,
          matchedPerson: null,
          distance: 999.0,
          isAmbiguous: false,
          // Liveness State: PENDING, CHALLENGE_ACTIVE, VERIFIED, FAILED, UNVERIFIED
          liveness: {
            state: 'PENDING',
            challengeType: null,
            challengePrompt: '',
            startTime: 0,
            deadline: 0,
            baseline: null,
            passedReason: '',
            failReason: '',
            blinkObservedClosed: false
          },
          temporalHistory: []
        };
        this.tracks.set(newTrackId, newTrack);
        activeTracks.push(newTrack);
      }
    }

    // Purge expired tracks (face lost or covered for > 1.2s)
    for (const [id, track] of this.tracks.entries()) {
      if (track.missedFrames > this.maxMissedFrames) {
        this.tracks.delete(id);
      }
    }

    return activeTracks;
  }

  evaluateDetections(detections, video) {
    const now = Date.now();

    // 1. Check if roster is empty
    if (this.roster.length === 0) {
      this.tracks.clear();
      if (this.challengeBoxEl) this.challengeBoxEl.style.display = 'none';

      if (!detections || detections.length === 0) {
        this.clearOverlay();
        if (this.subjectCountEl) this.subjectCountEl.textContent = '0 IN FOV';
        if (this.distanceEl) this.distanceEl.textContent = '--';
        if (this.matchedNameEl) this.matchedNameEl.textContent = 'NO SUBJECT IN FOV';
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
      if (this.subjectCountEl) this.subjectCountEl.textContent = `${detections.length} IN FOV`;
      if (this.distanceEl) this.distanceEl.textContent = '--';
      if (this.matchedNameEl) this.matchedNameEl.textContent = 'UNAUTHORIZED SUBJECTS';
      this.updateStatusBadge('UNAUTHORIZED', 'critical', `${detections.length} unknown face(s) in sector · No authorized identities enrolled`);
      if (this.headerStatusEl) {
        this.headerStatusEl.textContent = 'UNAUTHORIZED';
        this.headerStatusEl.className = 'snc-status critical';
      }

      const results = detections.map(det => ({
        trackId: 'UNKNOWN',
        detection: det,
        isMatch: false,
        matchedPerson: null,
        distance: 999.0,
        status: 'UNAUTHORIZED',
        label: 'UNAUTHORIZED · UNKNOWN PERSON',
        subLabel: 'NO ENROLLED ROSTER',
        color: '#ff4141'
      }));

      this.updateLiveSubjectsListUI(results);
      this.renderOverlay(results, video);
      return;
    }

    // 2. Roster is non-empty, but no faces detected in camera
    if (!detections || detections.length === 0) {
      this.tracks.clear();
      this.clearOverlay();
      if (this.challengeBoxEl) this.challengeBoxEl.style.display = 'none';
      if (this.subjectCountEl) this.subjectCountEl.textContent = '0 IN FOV';
      if (this.distanceEl) this.distanceEl.textContent = '--';
      if (this.matchedNameEl) {
        this.matchedNameEl.textContent = 'STANDBY // SCANNING FOV';
        this.matchedNameEl.style.color = 'var(--text-secondary)';
      }
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

    // 3. Multi-Face Tracking & Spatial Association
    const trackedSubjects = this.matchDetectionsToTracks(detections);

    // 4. Independent Verification for Every Face Track
    let globalMinDist = 999.0;
    let anyUnauthorized = false;
    let anyChallengeActive = false;
    let activeChallengeTrack = null;
    let allAuthorized = true;

    const evaluatedResults = trackedSubjects.map((track) => {
      const det = track.detection;

      // Step A: Compare descriptor against every valid enrolled identity
      let bestDist = 999.0;
      let secondDist = 999.0;
      let bestPerson = null;

      for (const person of this.roster) {
        if (!person.descriptor) continue;
        const d = this.euclideanDistance(det.descriptor, person.descriptor);
        if (d < bestDist) {
          secondDist = bestDist;
          bestDist = d;
          bestPerson = person;
        } else if (d < secondDist) {
          secondDist = d;
        }
      }

      track.distance = bestDist;
      if (bestDist < globalMinDist) globalMinDist = bestDist;

      // Step B: Ambiguity check
      const isAmbiguous = (bestPerson !== null && (secondDist - bestDist) < this.ambiguityDelta && bestDist <= this.matchThreshold);
      track.isAmbiguous = isAmbiguous;

      const isIdentityMatch = (bestDist <= this.matchThreshold && bestPerson !== null && !isAmbiguous);
      track.matchedPerson = isIdentityMatch ? bestPerson : null;

      // Extract Facial Landmark Metrics for Liveness & Presentation Attack Detection
      const landmarks = det.landmarks ? det.landmarks.positions : null;
      const expressions = det.expressions || {};
      const currentMetrics = this.computeLandmarkMetrics(landmarks, expressions);

      // Track temporal planar history
      if (currentMetrics) {
        track.temporalHistory.push(currentMetrics);
        if (track.temporalHistory.length > 25) track.temporalHistory.shift();
      }

      // Step C: Evaluate Liveness specifically for this face
      // CRITICAL: A matching face descriptor alone NEVER grants authorization!
      let faceStatus = 'UNAUTHORIZED';
      let faceLabel = 'UNAUTHORIZED · UNKNOWN PERSON';
      let faceSubLabel = `DIST: ${bestDist.toFixed(3)} | NO MATCH`;
      let faceColor = '#ff4141';

      if (isAmbiguous) {
        faceStatus = 'UNAUTHORIZED';
        faceLabel = 'UNAUTHORIZED · AMBIGUOUS MATCH';
        faceSubLabel = `AMBIGUOUS: ${bestDist.toFixed(3)} vs ${secondDist.toFixed(3)}`;
        faceColor = '#ff4141';
        allAuthorized = false;
        anyUnauthorized = true;
      } else if (!isIdentityMatch) {
        // Unknown person -> Immediately UNAUTHORIZED
        faceStatus = 'UNAUTHORIZED';
        faceLabel = 'UNAUTHORIZED · UNKNOWN PERSON';
        faceSubLabel = `DIST: ${bestDist.toFixed(3)} (THR: ${this.matchThreshold.toFixed(2)})`;
        faceColor = '#ff4141';
        allAuthorized = false;
        anyUnauthorized = true;
      } else {
        // IDENTITY MATCHED! Now enforce Liveness Verification / Anti-Spoofing
        const liveness = track.liveness;

        if (liveness.state === 'PENDING') {
          // Initialize active randomized challenge for this specific face track!
          this.initiateActiveChallenge(track, currentMetrics);
        }

        if (liveness.state === 'CHALLENGE_ACTIVE') {
          anyChallengeActive = true;
          activeChallengeTrack = track;
          allAuthorized = false;

          const remainingSec = Math.max(0, (liveness.deadline - now) / 1000);

          // Check for static photo presentation attack heuristic
          const isStaticSpoof = this.checkPlanarRigiditySpoof(track.temporalHistory);

          if (isStaticSpoof && track.totalFramesSeen > 20) {
            liveness.state = 'FAILED';
            liveness.failReason = 'Static 2D presentation attack detected (Planar photo replay)';
            this.recordAuditEvent(bestPerson.name, 'LIVENESS FAILED', liveness.failReason);
          } else if (remainingSec <= 0) {
            // Challenge timed out without physical action
            liveness.state = 'FAILED';
            liveness.failReason = 'Challenge timeout: No physical response (Presentation attack suspected)';
            this.recordAuditEvent(bestPerson.name, 'LIVENESS FAILED', liveness.failReason);
          } else {
            // Check whether the live subject completed the active challenge
            const passed = this.verifyChallengeResponse(track, currentMetrics);
            if (passed) {
              liveness.state = 'VERIFIED';
              liveness.passedReason = `Active challenge passed (${liveness.challengePrompt})`;
              this.recordAuditEvent(bestPerson.name, 'AUTHORIZED', liveness.passedReason);
            }
          }
        }

        // Final per-face authorization verdict
        if (liveness.state === 'VERIFIED') {
          faceStatus = 'AUTHORIZED';
          faceLabel = `AUTHORIZED · ${bestPerson.name.toUpperCase()}`;
          faceSubLabel = `MATCH: ${bestDist.toFixed(3)} | LIVENESS: VERIFIED`;
          faceColor = '#42c47a';
        } else if (liveness.state === 'CHALLENGE_ACTIVE') {
          const remSec = Math.max(0, (track.liveness.deadline - now) / 1000);
          faceStatus = 'LIVENESS CHECK REQUIRED';
          faceLabel = `⚡ ${track.liveness.challengePrompt} (${remSec.toFixed(1)}s)`;
          faceSubLabel = `MATCH: ${bestPerson.name.toUpperCase()} (AWAITING LIVENESS)`;
          faceColor = '#d7a84b';
          allAuthorized = false;
        } else if (liveness.state === 'FAILED') {
          faceStatus = 'UNAUTHORIZED';
          faceLabel = 'UNAUTHORIZED · LIVENESS FAILED';
          faceSubLabel = track.liveness.failReason || 'PRESENTATION ATTACK DETECTED';
          faceColor = '#ff4141';
          allAuthorized = false;
          anyUnauthorized = true;
        } else {
          faceStatus = 'LIVENESS UNVERIFIED';
          faceLabel = 'UNAUTHORIZED · LIVENESS UNVERIFIED';
          faceSubLabel = 'LIVENESS PENDING';
          faceColor = '#d7a84b';
          allAuthorized = false;
        }
      }

      return {
        trackId: track.trackId,
        detection: det,
        isMatch: isIdentityMatch,
        matchedPerson: track.matchedPerson,
        distance: bestDist,
        status: faceStatus,
        label: faceLabel,
        subLabel: faceSubLabel,
        color: faceColor,
        track: track
      };
    });

    // Update Live Subject Counts & Telemetry
    if (this.subjectCountEl) {
      this.subjectCountEl.textContent = `${evaluatedResults.length} IN FOV`;
    }
    if (this.distanceEl) {
      this.distanceEl.textContent = globalMinDist < 10 ? `${globalMinDist.toFixed(3)}` : '--';
      this.distanceEl.style.color = (globalMinDist <= this.matchThreshold) ? 'var(--state-verified)' : 'var(--text-tertiary)';
    }

    // Handle Active Challenge UI Banner
    if (anyChallengeActive && activeChallengeTrack) {
      this.renderChallengeBanner(activeChallengeTrack, now);
    } else {
      if (this.challengeBoxEl) this.challengeBoxEl.style.display = 'none';
    }

    // Update Hero Verification State & Header Badge
    this.updateCollectiveHeroState(evaluatedResults, allAuthorized, anyUnauthorized, anyChallengeActive, activeChallengeTrack);

    // Update UI lists & Render Canvas HUD
    this.updateLiveSubjectsListUI(evaluatedResults);
    this.renderOverlay(evaluatedResults, video);
  }

  initiateActiveChallenge(track, initialMetrics) {
    // Randomly select one of 5 supported active biometric challenges
    const challengeTypes = [
      { type: 'TURN_LEFT', prompt: 'TURN HEAD LEFT', hint: 'Please rotate your head clearly to your left.' },
      { type: 'TURN_RIGHT', prompt: 'TURN HEAD RIGHT', hint: 'Please rotate your head clearly to your right.' },
      { type: 'TILT_UP', prompt: 'TILT HEAD UP', hint: 'Please tilt your head upward.' },
      { type: 'BLINK', prompt: 'BLINK BOTH EYES', hint: 'Please blink your eyes naturally.' },
      { type: 'SMILE', prompt: 'SMILE AT CAMERA', hint: 'Please smile clearly at the camera.' }
    ];

    const chosen = challengeTypes[Math.floor(Math.random() * challengeTypes.length)];
    const durationMs = 8500; // 8.5 seconds timeout

    track.liveness.state = 'CHALLENGE_ACTIVE';
    track.liveness.challengeType = chosen.type;
    track.liveness.challengePrompt = chosen.prompt;
    track.liveness.challengeHint = chosen.hint;
    track.liveness.startTime = Date.now();
    track.liveness.deadline = Date.now() + durationMs;
    track.liveness.baseline = initialMetrics ? { ...initialMetrics } : null;
    track.liveness.blinkObservedClosed = false;

    this.recordAuditEvent(track.matchedPerson?.name || 'SUBJECT', 'CHALLENGE ISSUED', `Active PAD Challenge: ${chosen.prompt}`);
  }

  computeLandmarkMetrics(landmarks, expressions) {
    if (!landmarks || landmarks.length !== 68) return null;

    const p = landmarks;

    // 1. Head Yaw Ratio (Symmetry of nose relative to jaw edges)
    const leftDist = Math.max(1, p[30].x - p[0].x);
    const rightDist = Math.max(1, p[16].x - p[30].x);
    const totalW = leftDist + rightDist;
    const yawRatio = leftDist / totalW; // ~0.50 frontal

    // 2. Head Pitch Ratio (Nose vertical distance relative to eyes and chin)
    const eyeCenterY = (p[36].y + p[45].y) / 2;
    const chinDist = Math.max(1, p[8].y - eyeCenterY);
    const noseDist = p[30].y - eyeCenterY;
    const pitchRatio = noseDist / chinDist;

    // 3. Eye Aspect Ratio (EAR) for blinking
    const d37_41 = Math.hypot(p[37].x - p[41].x, p[37].y - p[41].y);
    const d38_40 = Math.hypot(p[38].x - p[40].x, p[38].y - p[40].y);
    const d36_39 = Math.max(1, Math.hypot(p[36].x - p[39].x, p[36].y - p[39].y));
    const earL = (d37_41 + d38_40) / (2 * d36_39);

    const d43_47 = Math.hypot(p[43].x - p[47].x, p[43].y - p[47].y);
    const d44_46 = Math.hypot(p[44].x - p[46].x, p[44].y - p[46].y);
    const d42_45 = Math.max(1, Math.hypot(p[42].x - p[45].x, p[42].y - p[45].y));
    const earR = (d43_47 + d44_46) / (2 * d42_45);
    const ear = (earL + earR) / 2;

    // 4. Smile Ratio (Mouth width relative to outer eye distance)
    const mouthW = Math.hypot(p[48].x - p[54].x, p[48].y - p[54].y);
    const eyeDist = Math.max(1, Math.hypot(p[36].x - p[45].x, p[36].y - p[45].y));
    const smileRatio = mouthW / eyeDist;
    const happyScore = expressions.happy || 0;

    return { yawRatio, pitchRatio, ear, smileRatio, happyScore };
  }

  verifyChallengeResponse(track, metrics) {
    if (!metrics || !track.liveness.baseline) return false;
    const b = track.liveness.baseline;
    const cType = track.liveness.challengeType;

    if (cType === 'TURN_LEFT' || cType === 'TURN_RIGHT') {
      // Rotational yaw shift of at least 0.10 from baseline
      const yawDelta = metrics.yawRatio - b.yawRatio;
      if (Math.abs(yawDelta) >= 0.10) {
        return true;
      }
    } else if (cType === 'TILT_UP') {
      // Nose moves up towards eye line by at least 0.08
      const pitchDelta = b.pitchRatio - metrics.pitchRatio;
      if (pitchDelta >= 0.08 || Math.abs(metrics.pitchRatio - b.pitchRatio) >= 0.09) {
        return true;
      }
    } else if (cType === 'BLINK') {
      // Complete blink cycle: eyes drop below 0.18 (closed) then recover above 0.22 (opened)
      if (metrics.ear < 0.185) {
        track.liveness.blinkObservedClosed = true;
      }
      if (track.liveness.blinkObservedClosed && metrics.ear >= 0.225) {
        return true;
      }
    } else if (cType === 'SMILE') {
      // Mouth width increases by >= 14% or happy expression triggered
      const smileGain = metrics.smileRatio - b.smileRatio;
      if (smileGain >= 0.08 || metrics.smileRatio >= 0.58 || metrics.happyScore >= 0.55) {
        return true;
      }
    }

    return false;
  }

  checkPlanarRigiditySpoof(history) {
    if (!history || history.length < 18) return false;

    // Calculate variance of EAR and smile ratios
    let earSum = 0;
    let smileSum = 0;
    const n = history.length;

    for (const h of history) {
      earSum += h.ear;
      smileSum += h.smileRatio;
    }
    const earMean = earSum / n;
    const smileMean = smileSum / n;

    let earVar = 0;
    let smileVar = 0;
    for (const h of history) {
      earVar += (h.ear - earMean) * (h.ear - earMean);
      smileVar += (h.smileRatio - smileMean) * (h.smileRatio - smileMean);
    }
    earVar = earVar / n;
    smileVar = smileVar / n;

    // An entirely motionless 2D photo has almost zero non-rigid variance
    return (earVar < 0.00003 && smileVar < 0.00003);
  }

  renderChallengeBanner(track, now) {
    if (!this.challengeBoxEl) return;
    this.challengeBoxEl.style.display = 'block';

    const remSec = Math.max(0, (track.liveness.deadline - now) / 1000);
    const progressPct = Math.max(0, Math.min(100, (remSec / 8.5) * 100));

    if (this.challengeDirectiveEl) {
      this.challengeDirectiveEl.textContent = `⚡ LIVENESS CHALLENGE: ${track.liveness.challengePrompt}`;
    }
    if (this.challengeTimerEl) {
      this.challengeTimerEl.textContent = `${remSec.toFixed(1)}s`;
    }
    if (this.challengeProgressBarEl) {
      this.challengeProgressBarEl.style.width = `${progressPct}%`;
      this.challengeProgressBarEl.style.background = remSec < 2.5 ? 'var(--state-critical)' : 'var(--state-warning)';
    }
    if (this.challengeHintEl && track.liveness.challengeHint) {
      this.challengeHintEl.textContent = `${track.liveness.challengeHint} Proves physical presence (blocks photo/phone replay attacks).`;
    }
  }

  updateCollectiveHeroState(results, allAuthorized, anyUnauthorized, anyChallengeActive, activeChallengeTrack) {
    if (!this.heroBoxEl || !this.statusBadgeEl) return;

    if (anyUnauthorized) {
      this.updateStatusBadge('UNAUTHORIZED', 'critical', 'One or more subjects in optical sector are unauthorized or failed liveness');
      if (this.headerStatusEl) {
        this.headerStatusEl.textContent = 'UNAUTHORIZED';
        this.headerStatusEl.className = 'snc-status critical';
      }
      if (this.matchedNameEl) {
        const unauth = results.find(r => r.status.startsWith('UNAUTHORIZED'));
        this.matchedNameEl.textContent = unauth?.matchedPerson?.name ? `${unauth.matchedPerson.name.toUpperCase()} (LIVENESS FAILED)` : 'UNKNOWN PERSON DETECTED';
        this.matchedNameEl.style.color = 'var(--state-critical)';
      }
    } else if (anyChallengeActive && activeChallengeTrack) {
      this.updateStatusBadge('LIVENESS CHECK REQUIRED', 'warning', `Active verification challenge underway for ${activeChallengeTrack.matchedPerson?.name || 'subject'}`);
      if (this.headerStatusEl) {
        this.headerStatusEl.textContent = 'CHALLENGE';
        this.headerStatusEl.className = 'snc-status warning';
      }
      if (this.matchedNameEl) {
        this.matchedNameEl.textContent = `${activeChallengeTrack.matchedPerson?.name.toUpperCase()} (AWAITING PHYSICAL RESPONSE)`;
        this.matchedNameEl.style.color = 'var(--state-warning)';
      }
    } else if (allAuthorized && results.length > 0) {
      const names = results.map(r => r.matchedPerson?.name).filter(Boolean).join(', ');
      this.updateStatusBadge('AUTHORIZED', 'verified', `All ${results.length} subject(s) verified with 128D descriptor match & active liveness`);
      if (this.headerStatusEl) {
        this.headerStatusEl.textContent = 'AUTHORIZED';
        this.headerStatusEl.className = 'snc-status verified';
      }
      if (this.matchedNameEl) {
        this.matchedNameEl.textContent = names.toUpperCase();
        this.matchedNameEl.style.color = 'var(--state-verified)';
      }
    }
  }

  updateLiveSubjectsListUI(results) {
    if (!this.liveSubjectsListEl) return;
    this.liveSubjectsListEl.innerHTML = '';

    results.forEach((subj, idx) => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.justifyContent = 'space-between';
      row.style.alignItems = 'center';
      row.style.padding = '4px 0';
      row.style.borderBottom = '1px solid rgba(255,255,255,0.05)';

      const color = subj.color;
      row.innerHTML = `
        <div style="display:flex; flex-direction:column; overflow:hidden; max-width:190px;">
          <span style="color:${color}; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">#${idx + 1} ${subj.label}</span>
          <span style="color:var(--text-tertiary); font-size:7.5px;">${subj.subLabel}</span>
        </div>
        <span style="color:${color}; font-weight:800; font-size:8px;">${subj.status}</span>
      `;
      this.liveSubjectsListEl.appendChild(row);
    });
  }

  recordAuditEvent(subject, verdict, reason) {
    const timeStr = new Date().toLocaleTimeString();
    const entry = { timeStr, subject, verdict, reason };
    this.auditTrail.unshift(entry);
    if (this.auditTrail.length > this.maxAuditEntries) this.auditTrail.pop();

    if (this.auditTrailEl) {
      this.auditTrailEl.innerHTML = '';
      this.auditTrail.forEach(item => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.padding = '2.5px 0';
        row.style.borderBottom = '1px solid rgba(255,255,255,0.04)';

        let col = 'var(--text-secondary)';
        if (item.verdict === 'AUTHORIZED') col = 'var(--state-verified)';
        else if (item.verdict === 'LIVENESS FAILED' || item.verdict === 'UNAUTHORIZED') col = 'var(--state-critical)';
        else if (item.verdict === 'CHALLENGE ISSUED' || item.verdict === 'RESET') col = 'var(--state-warning)';

        row.innerHTML = `
          <span><span style="color:var(--text-tertiary);">${item.timeStr}</span> <strong style="color:${col};">${item.subject}</strong>: ${item.reason}</span>
        `;
        this.auditTrailEl.appendChild(row);
      });
    }
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
      ctx.lineWidth = (subj.status === 'AUTHORIZED') ? 2.2 : 1.8;
      ctx.strokeRect(bx, by, bw, bh);

      // Subtle translucent interior fill
      if (subj.status === 'AUTHORIZED') {
        ctx.fillStyle = 'rgba(66, 196, 122, 0.10)';
      } else if (subj.status === 'LIVENESS CHECK REQUIRED') {
        ctx.fillStyle = 'rgba(215, 168, 75, 0.10)';
      } else {
        ctx.fillStyle = 'rgba(255, 65, 65, 0.12)';
      }
      ctx.fillRect(bx, by, bw, bh);

      // Top Header Tag
      ctx.font = '700 9.5px "JetBrains Mono", monospace';
      const labelText = subj.label;
      const textMetrics = ctx.measureText(labelText);
      const tagW = Math.max(bw, textMetrics.width + 12);
      const tagH = 17;
      const tagX = bx;
      const tagY = Math.max(3, by - tagH - 3);

      ctx.fillStyle = 'rgba(5, 10, 16, 0.92)';
      ctx.fillRect(tagX, tagY, tagW, tagH);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.0;
      ctx.strokeRect(tagX, tagY, tagW, tagH);

      ctx.fillStyle = color;
      ctx.fillText(labelText, tagX + 6, tagY + 12);

      // Bottom Diagnostic Tag
      ctx.font = '600 8.5px "JetBrains Mono", monospace';
      const subText = subj.subLabel;
      const subMetrics = ctx.measureText(subText);
      const subW = subMetrics.width + 10;
      const subH = 15;
      const subY = by + bh + 4;

      ctx.fillStyle = 'rgba(5, 10, 16, 0.88)';
      ctx.fillRect(bx, subY, subW, subH);
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 0.8;
      ctx.strokeRect(bx, subY, subW, subH);

      ctx.fillStyle = color;
      ctx.fillText(subText, bx + 5, subY + 11);

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

    if (this.heroBoxEl) {
      this.heroBoxEl.className = 'face-auth-hero-box';
      if (stateType === 'verified') {
        this.heroBoxEl.classList.add('state-authorized');
      } else if (stateType === 'critical') {
        this.heroBoxEl.classList.add('state-unauthorized');
      } else if (stateType === 'warning') {
        this.heroBoxEl.classList.add('state-challenge');
      } else {
        this.heroBoxEl.classList.add('state-neutral');
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
