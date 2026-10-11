# Defence Sentinel — Adaptive RF/ESM Radar Security System

[![SIH 2026](https://img.shields.io/badge/SIH-2026--SIH26055-blue?style=flat-square)](https://www.sih.gov.in/)
[![Node.js](https://img.shields.io/badge/Node.js-v24-green?style=flat-square&logo=node.js)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18-61dafb?style=flat-square&logo=react)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178c6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-4.5-646cff?style=flat-square&logo=vite)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38bdf8?style=flat-square&logo=tailwindcss)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

> **SIMULATION / PROTOTYPE — NOT FOR OPERATIONAL DEPLOYMENT**  
> This system is a research prototype built for Smart India Hackathon 2026 (Problem Statement SIH26055).  
> It is not connected to real cameras, biometric systems, military networks, or any operational security infrastructure.

---

## Table of Contents

- [Overview](#overview)
- [System Architecture](#system-architecture)
- [7-Page Command & Control Suite](#7-page-command--control-suite)
- [Project Structure](#project-structure)
- [Module 1 — ESM-ASTRA (Node.js Backend & Dashboard)](#module-1--esm-astra-nodejs-backend--dashboard)
- [Module 2 — Radar Scanner (React Frontend)](#module-2--radar-scanner-react-frontend)
- [Core Algorithm — Recency-Augmented UCB1](#core-algorithm--recency-augmented-ucb1)
- [Multi-Sensor Fusion & Incident Response](#multi-sensor-fusion--incident-response)
- [12-Step Integrated Demonstration](#12-step-integrated-demonstration)
- [Quick Start](#quick-start)
- [Automated & Live Acceptance Test Suite](#automated--live-acceptance-test-suite)
- [API Reference](#api-reference)
- [Disclaimer & Team](#disclaimer--team)

---

## Overview

**Defence Sentinel** is an end-to-end tactical electronic warfare and situational awareness platform built for Smart India Hackathon 2026 (Problem Statement SIH26055: *Adaptive Scan Strategy for Electronic Warfare*).

The system integrates:
1. **Adaptive RF/ESM Scan Scheduling** — The primary mathematical contribution. A `Recency-Augmented UCB1` multi-armed bandit algorithm dynamically prioritizes RF dwell time across candidate radar bands, balancing exploration of unvisited frequencies with exploitation of bursty, frequency-agile threats.
2. **Tactical Multi-Sensor Command & Control** — A comprehensive 7-page C2 interface unifying:
   - 360° Perimeter Tactical Radar with moving kinematics and 450m breach boundary
   - Real-time RF / ESM Spectrum Analyzer, Waterfall Spectrogram, and Burst Timeline
   - Optical Context with 4 surveillance cameras, CV bounding boxes, and infrared view
   - 4-Sensor Fusion Correlation Matrix with 7-step causal reasoning traces
   - Adaptive Scheduler Diagnostics with Bayesian Beta distributions and ablation modes
   - Analytics & 5-Scenario Comprehensive Benchmark engine with CSV/JSON/Report exports
   - Multi-Sensor Simulation Control Center with execution controls, speed multipliers, and 12-step automated demo
3. **Synchronized React Radar Scanner** — Modern React 18 / TypeScript frontend connected directly to the C2 WebSocket server.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                   DEFENCE SENTINEL                                      │
│                                                                                         │
│  ┌───────────────────────────────────────────────────────────────────────────────────┐  │
│  │                     MODULE 1: ESM-ASTRA SERVER (Port 8080)                         │  │
│  │                                                                                   │  │
│  │  ┌───────────────────────────────┐     ┌──────────────────────────────────────┐   │  │
│  │  │ Recency-Augmented UCB1 Engine │     │ Multi-Sensor Simulation Engine       │   │  │
│  │  │ Q(b) = μ̂_b + c·√(lnN/N_b)     │     │ - 7 Canonical Entities               │   │  │
│  │  │        + λ·tanh(Δt_b/τ)       │     │ - 25 Hz Physics Tick & Kinematics    │   │  │
│  │  └──────────────┬────────────────┘     │ - 4 Cameras (CAM-01 to CAM-04)       │   │  │
│  │                 │                      │ - Incident Response & Alert Engine   │   │  │
│  │                 ▼                      └──────────────────┬───────────────────┘   │  │
│  │  ┌───────────────────────────────┐                        │                       │  │
│  │  │ 5-Scenario Benchmark Runner   │                        ▼                       │  │
│  │  │ Deterministic Mulberry32 PRNG │     ┌──────────────────────────────────────┐   │  │
│  │  └───────────────────────────────┘     │ WebSocket C2 Server (/ws/c2)         │   │  │
│  │                                        │ Broadcasts 20 Hz C2_FRAME telemetry  │   │  │
│  │                                        └──────────┬────────────────┬──────────┘   │  │
│  └───────────────────────────────────────────────────┼────────────────┼──────────────┘  │
│                                                      │                │                 │
│                                  WebSocket Stream    │                │                 │
│                                                      ▼                ▼                 │
│  ┌───────────────────────────────────────────────────────┐  ┌────────────────────────┐  │
│  │ C2 Tactical Command Dashboard (http://localhost:8080) │  │ React Radar Scanner    │  │
│  │ Single Page Application with 7 integrated views:      │  │ (http://localhost:5173)│  │
│  │ 1. Tactical Context        5. Adaptive Scheduler      │  │ React 18 + TypeScript  │  │
│  │ 2. RF / ESM Spectrum       6. Analytics & Benchmark   │  │ Vite + Tailwind CSS    │  │
│  │ 3. Optical Surveillance    7. Simulation Center       │  │ SVG Radar + Alerts     │  │
│  │ 4. Multi-Sensor Fusion                                │  │ Personnel Database     │  │
│  └───────────────────────────────────────────────────────┘  └────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 7-Page Command & Control Suite

| # | Page | Key Visual & Functional Features |
|---|---|---|
| **1** | **Tactical Context** | 360° rotating radar sweep, 7 canonical tracks with motion trails, 450m perimeter warning zone, personnel database panel, live alerts feed. |
| **2** | **RF / ESM** | Dynamic RF spectrum analyzer, 75-row waterfall spectrogram, live receiver telemetry (tuned freq, IBW, SNR, power, state), RF burst timeline. |
| **3** | **Optical Context** | 4 switchable surveillance cameras (CAM-01 to CAM-04), canvas IR rendering, CV detection bounding boxes, optical correlation panel, optical event timeline. |
| **4** | **Sensor Fusion** | 7-entity multi-sensor correlation matrix, Radar + Optical + RF + Personnel evidence weighting, 7-step causal reasoning trace. |
| **5** | **Adaptive Scheduler** | 5-band state table, 24-dwell hit/miss history bar, dynamic Bayesian Beta distributions, priority comparison ranking, "Why This Band" attribution, 4 ablation modes (`FULL_ADAPTIVE`, `UCB_ONLY`, `NO_EXPLORATION`, `OPEN_LOOP`). |
| **6** | **Analytics & Benchmark** | 6 verified metric cards (Detection Rate, Latency, FAR, Accuracy, Utilization, Sensitivity), 5-scenario benchmark breakdown table, cumulative interception chart, interactive experiments with deterministic replay, JSON / CSV / Report REST exports. |
| **7** | **Multi-Sensor Simulation** | Scenario controls, execution controls (Pause, Resume, Step, Reset), speed multipliers (1x, 2x, 5x), subsystem health badges, live JSON telemetry inspector, 12-step automated demo runner. |

---

## Project Structure

```
Defence-Sentinel/
│
├── defense_radar_system/          # Module 1 — ESM-ASTRA Node.js Backend & Dashboard
│   ├── server.js                  # Main Express + WebSocket server
│   ├── package.json
│   ├── server/
│   │   ├── scheduler_engine.js    # Recency-Augmented UCB1 scheduler (CORE)
│   │   ├── benchmark_runner.js    # 5-scenario statistical benchmark runner
│   │   ├── incident_engine.js     # Security alert & incident management
│   │   └── prng.js                # Deterministic Mulberry32 PRNG
│   ├── public/                    # Tactical Command Dashboard SPA
│   │   ├── index.html             # 7-page C2 unified interface
│   │   └── js/
│   │       ├── app.js             # SPA orchestrator & WebSocket handler
│   │       ├── radar.js           # Tactical radar scope canvas renderer
│   │       ├── spectrum.js        # RF spectrum & waterfall spectrogram
│   │       ├── camera.js          # Optical monitor & IR simulation
│   │       └── analytics.js       # Benchmark charts & metric calculation
│   └── test/
│       ├── run_all_tests.js       # 13-suite core automated runner (Suites A–M)
│       └── test_*.js              # Headless browser & E2E acceptance test suites
│
├── radar-scanner/                 # Module 2 — React Radar Scanner
│   ├── src/
│   │   ├── App.tsx                # Main application component
│   │   ├── main.tsx               # Entry point
│   │   ├── components/            # RadarScope, TrackList, AlertsPanel, etc.
│   │   └── hooks/                 # useC2Backend, useAlerts, usePersonnel, etc.
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
│
└── README.md
```

---

## Core Algorithm — Recency-Augmented UCB1

**File:** `defense_radar_system/server/scheduler_engine.js`

Standard Upper Confidence Bound (UCB1) algorithms assume stationary reward distributions. However, electronic warfare threats are **frequency-agile** and **bursty** — emitters transmit in pulses and hop across channels.

### Mathematical Formulation

The composite selection score $Q(b)$ for candidate frequency band $b$ is computed as:

$$Q(b) = \hat{\mu}_b + c \cdot \sqrt{\frac{\ln N}{N_b}} + \lambda \cdot \tanh\!\left(\frac{\Delta t_b}{\tau}\right)$$

Where:
- $\hat{\mu}_b$: Bayesian posterior mean reward ($\frac{\alpha_b}{\alpha_b + \beta_b}$)
- $c \cdot \sqrt{\frac{\ln N}{N_b}}$: Standard UCB exploration term ($c = \sqrt{2} \approx 1.414$)
- $\lambda \cdot \tanh\!\left(\frac{\Delta t_b}{\tau}\right)$: **Recency augmentation term** ($\lambda = 0.20$, $\tau = 5.0\text{ s}$)

### Ablation Modes

The scheduler supports dynamic switching across 4 ablation modes:
1. `FULL_ADAPTIVE`: Full Recency-Augmented UCB1 with aging term.
2. `UCB_ONLY`: Classical UCB1 without recency term ($\lambda = 0$).
3. `NO_EXPLORATION`: Greedy exploitation of empirical reward ($c = 0$, $\lambda = 0$).
4. `OPEN_LOOP`: Fixed round-robin sequential scanning.

---

## Multi-Sensor Fusion & Incident Response

### 7 Canonical Entities

| Entity ID | Type | Classification | Details |
|---|---|---|---|
| **TRK-014** | PERSON | ✅ VERIFIED | Lt. R. Sharma (TAG-ALPHA-01) — Friendly Patrol |
| **TRK-007** | PERSON | ✅ VERIFIED | Sep. K. Patel (TAG-CHARLIE-01) — Friendly Staff |
| **TRK-042** | PERSON | ✅ VERIFIED | Hav. D. Singh (TAG-BRAVO-02) — Perimeter Guard |
| **TRK-033** | VEHICLE | ✅ VERIFIED | QRT Patrol Vehicle 4 (TAG-VEHICLE-04) |
| **TRK-021** | PERSON | 🔴 ANOMALOUS | **Perimeter Intruder (Suspect)** — Unmatched tag inside 450m |
| **TRK-055** | ANOMALOUS_OBJECT | 🔴 ANOMALOUS | Unknown drone/object with anomalous RF signature |
| **TRK-019** | WILDLIFE | 🟡 WILDLIFE | Low RCS, non-threatening movement |

---

## 12-Step Integrated Demonstration

The Multi-Sensor Simulation Center features an automated 12-step guided demonstration:
1. **Step 1/12**: Baseline Tactical Monitoring initialized.
2. **Step 2/12**: Radar track detection established.
3. **Step 3/12**: Camera handoff and optical correlation engaged.
4. **Step 4/12**: Procedural infrared feed locks onto sector.
5. **Step 5/12**: RF emitter detection and signal burst logged.
6. **Step 6/12**: Multi-sensor fusion correlates 4 evidence layers.
7. **Step 7/12**: Threat anomaly identified for TRK-021.
8. **Step 8/12**: Scheduler switches to agile band tracking.
9. **Step 9/12**: Dwell time maximized on threat frequency.
10. **Step 10/12**: Simulated security alert generated.
11. **Step 11/12**: QRT simulated incident dispatch triggered.
12. **Step 12/12**: Operational state engages `ANOMALY VERIFICATION ENGAGED`.

---

## Quick Start

### 0. Clone the Repository

```bash
git clone https://github.com/Krishnajha29/Defence-Sentinel.git
cd Defence-Sentinel
```

### 1. Start the C2 Backend & Main Dashboard (Port 8080)

```bash
cd defense_radar_system
npm install
node server.js
```

Open: **http://localhost:8080**

### 2. Start the React Radar Scanner (Port 5173)

Open a second terminal:

```bash
cd radar-scanner
npm install
npm run dev -- --host
```

Open: **http://localhost:5173**

---

## Automated & Live Acceptance Test Suite

### Run All 13 Core Test Suites (A to M)

```bash
cd defense_radar_system
node test/run_all_tests.js
```

| Suite | Description | Status |
|---|---|---|
| **Suite A** | PRNG Determinism (Mulberry32) | ✅ PASS |
| **Suite B** | Scheduler UCB Mathematical Formula | ✅ PASS |
| **Suite C** | Beta Posterior Probability Updates | ✅ PASS |
| **Suite D** | Unvisited Band Exploration Guarantee | ✅ PASS |
| **Suite E** | Stationary Environment Convergence | ✅ PASS |
| **Suite F** | Deterministic Single-Timeline Replay | ✅ PASS |
| **Suite G** | Metric Calculations & Brier Score Validation | ✅ PASS |
| **Suite H** | Single Source of Truth Entity Synchronization | ✅ PASS |
| **Suite I** | Experimental Benchmark Engine & 5-Scenario Suite | ✅ PASS |
| **Suite J** | Adaptive Learning Loop & Causal Decision Trace | ✅ PASS |
| **Suite K** | Robustness Engine & Failure-Injection Suite | ✅ PASS |
| **Suite L** | Simulated Security Alert & Incident Engine | ✅ PASS |
| **Suite M** | Phase 3 RF Telemetry & C2 WebSocket Sync | ✅ PASS |

### Run Full End-to-End Presentation Acceptance

Executes an automated headless browser session that verifies all 7 pages, the 12-step demo, zero-refresh presentation flow, console audit, and backend reconnection:

```bash
cd defense_radar_system
node test/test_final_presentation_acceptance.js
```

---

## API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/status` | `GET` | Snapshot of radar, RF, scheduler, hardware, and simulation state |
| `/api/hardware/status` | `GET` | Hardware readiness registry, device adapter interfaces, and physical connection state |
| `/api/sitrep` | `GET` | Formatted tactical situation report |
| `/api/entities` | `GET` | Array of 7 canonical entities with multi-sensor evidence |
| `/api/analytics` | `GET` | Current scheduler benchmarks and metric calculations |
| `/api/benchmark/suite` | `POST` | Execute 5-scenario comprehensive benchmark suite |
| `/api/benchmark/export?format=json` | `GET` | Export benchmark results as JSON |
| `/api/benchmark/export?format=csv` | `GET` | Export benchmark results as CSV |
| `/api/benchmark/export?format=report` | `GET` | Export benchmark results as text report |
| `/api/incidents` | `GET` | Active simulated incidents and audit trails |
| `/api/reset` | `POST` | Reset simulation state and re-seed entities |
| `/api/scenario/:name` | `POST` | Switch active simulation scenario |

---

## Disclaimer & Team

This project is a **software simulation prototype** developed for the **Smart India Hackathon 2026** under Problem Statement **SIH26055** (*Adaptive Scan Strategy for Electronic Warfare*).

- All radar signals, optical feeds, RF spectra, and incidents are synthetic simulations.
- It is **not connected** to real defense hardware, weapons systems, or operational radar networks.
- All personnel profiles and incident logs are fictional demonstration data.

### License
MIT License. See [LICENSE](LICENSE) for details.
