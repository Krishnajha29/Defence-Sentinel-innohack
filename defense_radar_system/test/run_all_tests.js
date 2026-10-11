/**
 * ESM-ASTRA: Master Test Suite Runner
 * Runs all deterministic validation suites (Suites A through L) and reports results.
 */

console.log('===========================================================');
console.log('  ESM-ASTRA: Credibility-First Verification Suite (SIH26055)');
console.log('  Property-Based Invariant Testing (No Predetermined Margins)');
console.log('===========================================================\n');

const { runSuiteLTests } = require('./incident.test.js'); // Suite L: Simulated Alert Engine

try {
  require('./prng.test.js');             // Suite A: PRNG Determinism & Bounds
  require('./scheduler_math.test.js');   // Suites B, C, D: UCB Math, Beta Updates, Unvisited Bands
  require('./convergence.test.js');      // Suite E: Stationary Convergence & Non-Starvation
  require('./benchmark_replay.test.js'); // Suite F: Single-Timeline Deterministic Replay
  require('./metrics.test.js');          // Suite G: Metric Calculations & Brier Calibration
  require('./entity_sync.test.js');      // Suite H: Single Source of Truth Synchronization
  require('./experiment_harness.test.js'); // Suite I: Experimental Benchmark Engine & 5-Scenario Suite
  require('./adaptive_learning_loop.test.js'); // Suite J: Adaptive Learning Loop, Per-Band State & Decision Traces
  require('./robustness.test.js');            // Suite K: Robustness Engine & Failure Injection Suite

  // Suite L: Simulated Security Alert & Incident Response Engine
  const suiteL = runSuiteLTests();
  if (!suiteL.success) throw new Error(`Suite L FAILED: ${suiteL.fail} test(s) failed`);
  console.log('✅ PASS: Simulated Security Alert & Incident Response Engine Verified.\n');

  // Suite M: Phase 3 System Completion Verification
  const { runPhase3Tests } = require('./test_phase3_completion.js');
  const { runFaceAuthTests } = require('./face_auth_test.js');

  runPhase3Tests().then(() => {
    return runFaceAuthTests();
  }).then(() => {
    console.log('===========================================================');
    console.log('  🎉 ALL AUTOMATED TEST SUITES PASSED (14/14 SUITES)');
    console.log('  - Suite A (PRNG Determinism): VERIFIED');
    console.log('  - Suite B (UCB Mathematical Correctness): VERIFIED');
    console.log('  - Suite C (Beta Posterior Updates): VERIFIED');
    console.log('  - Suite D (Unvisited Band Exploration): VERIFIED');
    console.log('  - Suite E (Stationary Convergence): VERIFIED');
    console.log('  - Suite F (Deterministic Single-Timeline Replay): VERIFIED');
    console.log('  - Suite G (Metric Calculations & Brier Score): VERIFIED');
    console.log('  - Suite H (Single Source of Truth Entity Sync): VERIFIED');
    console.log('  - Suite I (Experimental Benchmark Engine & Suite): VERIFIED');
    console.log('  - Suite J (Adaptive Learning Loop & Decision Traces): VERIFIED');
    console.log('  - Suite K (Robustness Engine & Failure Injection): VERIFIED');
    console.log('  - Suite L (Simulated Security Alert & Incident Engine): VERIFIED');
    console.log('  - Suite M (Phase 3 System Completion & RF Telemetry): VERIFIED');
    console.log('  - Suite N (Local Face Authentication & Verification): VERIFIED');
    console.log('===========================================================');
    process.exit(0);
  }).catch(err => {
    console.error('\n❌ TEST SUITE FAILED:', err);
    process.exit(1);
  });

} catch (err) {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
}
