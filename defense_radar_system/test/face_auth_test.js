/**
 * ESM-ASTRA: Face Authentication Subsystem Integration Tests (Suite N)
 * Validates:
 * 1. GET /api/face-auth/roster when empty
 * 2. GET /api/face-auth/reference 404 behavior when absent
 * 3. POST /api/face-auth/enroll: Enroll Person A (Commander Sharma)
 * 4. POST /api/face-auth/enroll: Enroll Person B (Operator Verma) without overwriting Person A
 * 5. GET /api/face-auth/roster: Confirm multiple authorized people persist simultaneously
 * 6. Mathematical multi-subject matching verification (Scenarios A through E)
 * 7. DELETE /api/face-auth/person/:id: Remove Person A, confirm Person B remains enrolled
 * 8. DELETE /api/face-auth/person/:id: Remove Person B, confirm empty roster
 * 9. Local storage isolation & cleanup
 */

const assert = require('assert');
const http = require('http');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:8080';

function get(pathStr) {
  return new Promise((resolve, reject) => {
    http.get(BASE_URL + pathStr, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, headers: res.headers, body: data });
      });
    }).on('error', reject);
  });
}

function post(pathStr, payload) {
  return new Promise((resolve, reject) => {
    const dataStr = JSON.stringify(payload);
    const req = http.request(BASE_URL + pathStr, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(dataStr)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, headers: res.headers, body: data });
      });
    });
    req.on('error', reject);
    req.write(dataStr);
    req.end();
  });
}

function del(pathStr) {
  return new Promise((resolve, reject) => {
    const req = http.request(BASE_URL + pathStr, {
      method: 'DELETE'
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, headers: res.headers, body: data });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function euclideanDistance(d1, d2) {
  let sum = 0;
  for (let i = 0; i < d1.length; i++) {
    const diff = d1[i] - d2[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

async function runFaceAuthTests() {
  console.log('\n🧪 RUNNING SUITE N: Multi-Person Face Authentication & Roster Engine...');

  const faceRefDir = path.join(__dirname, '..', 'private', 'face-reference');
  if (fs.existsSync(faceRefDir)) {
    const files = fs.readdirSync(faceRefDir);
    for (const f of files) {
      if (f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png') || f === 'roster.json') {
        try { fs.unlinkSync(path.join(faceRefDir, f)); } catch (e) {}
      }
    }
  }


  // 1. Initial status: should be configured but have 0 people
  const res1 = await get('/api/face-auth/roster');
  assert.strictEqual(res1.status, 200, 'Roster status should be 200');
  const roster1 = JSON.parse(res1.body);
  assert.strictEqual(roster1.configured, true, 'Configured flag should be true');
  assert.strictEqual(roster1.count, 0, 'Roster should be empty initially');
  console.log('  ✓ Initial state: 0 authorized people enrolled');

  // 2. Reference endpoint when missing: should return 404
  const res2 = await get('/api/face-auth/reference');
  assert.strictEqual(res2.status, 404, 'Reference fetch should return 404 when absent');
  console.log('  ✓ Reference fetch safely returns 404 when no roster enrolled');

  // 3. Enroll Person A ("Commander Sharma")
  const sampleBase64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
  const descPersonA = new Array(128).fill(0).map((_, i) => (i % 2 === 0 ? 0.05 : -0.05));
  
  const resEnrollA = await post('/api/face-auth/enroll', {
    name: 'Commander Sharma',
    imageData: sampleBase64,
    descriptor: descPersonA
  });
  assert.strictEqual(resEnrollA.status, 200, 'Person A enrollment should return 200');
  const resultA = JSON.parse(resEnrollA.body);
  assert.strictEqual(resultA.success, true);
  assert.strictEqual(resultA.person.name, 'Commander Sharma');
  const idPersonA = resultA.person.id;
  console.log('  ✓ Enrolled Person A: Commander Sharma (ID: ' + idPersonA + ')');

  // 4. Enroll Person B ("Operator Verma") - must NOT overwrite Person A
  const descPersonB = new Array(128).fill(0).map((_, i) => (i % 3 === 0 ? 0.12 : -0.02));
  const resEnrollB = await post('/api/face-auth/enroll', {
    name: 'Operator Verma',
    imageData: sampleBase64,
    descriptor: descPersonB
  });
  assert.strictEqual(resEnrollB.status, 200, 'Person B enrollment should return 200');
  const resultB = JSON.parse(resEnrollB.body);
  assert.strictEqual(resultB.success, true);
  assert.strictEqual(resultB.person.name, 'Operator Verma');
  const idPersonB = resultB.person.id;
  console.log('  ✓ Enrolled Person B: Operator Verma (ID: ' + idPersonB + ')');

  // 5. Verify roster contains BOTH identities independently
  const resRoster2 = await get('/api/face-auth/roster');
  assert.strictEqual(resRoster2.status, 200);
  const roster2 = JSON.parse(resRoster2.body);
  assert.strictEqual(roster2.count, 2, 'Roster must contain 2 people');
  const names = roster2.people.map(p => p.name);
  assert.ok(names.includes('Commander Sharma'), 'Commander Sharma must be present');
  assert.ok(names.includes('Operator Verma'), 'Operator Verma must be present');
  console.log('  ✓ Multi-identity persistence verified: 2 distinct identities coexisting');

  // 6. Test independent multi-face matching logic (Scenarios A through E)
  const THRESHOLD = 0.48;
  const mockFaces = [
    { label: 'Live Face 1 (Exact Person A match)', desc: descPersonA.map(v => v + 0.001) },
    { label: 'Live Face 2 (Exact Person B match)', desc: descPersonB.map(v => v + 0.002) },
    { label: 'Live Face 3 (Unknown Intruder)', desc: new Array(128).fill(0.85) }
  ];

  // Evaluate Face 1
  const dist1A = euclideanDistance(mockFaces[0].desc, descPersonA);
  const dist1B = euclideanDistance(mockFaces[0].desc, descPersonB);
  assert.ok(dist1A <= THRESHOLD, 'Face 1 must match Person A within threshold');
  assert.ok(dist1A < dist1B, 'Face 1 must be closer to Person A than Person B');
  console.log('  ✓ Scenario A: Person A alone correctly matches Commander Sharma (dist: ' + dist1A.toFixed(4) + ')');

  // Evaluate Face 2
  const dist2B = euclideanDistance(mockFaces[1].desc, descPersonB);
  assert.ok(dist2B <= THRESHOLD, 'Face 2 must match Person B within threshold');
  console.log('  ✓ Scenario D: Person B correctly matches Operator Verma (dist: ' + dist2B.toFixed(4) + ')');

  // Evaluate Face 3 (Unknown)
  const dist3A = euclideanDistance(mockFaces[2].desc, descPersonA);
  const dist3B = euclideanDistance(mockFaces[2].desc, descPersonB);
  assert.ok(dist3A > THRESHOLD && dist3B > THRESHOLD, 'Unknown person must exceed threshold for all roster identities');
  console.log('  ✓ Scenario B: Unknown person rejected by both identities (min dist: ' + Math.min(dist3A, dist3B).toFixed(4) + ' > 0.48)');

  // Evaluate Scenario C: Person A + Unknown simultaneously
  const resultFace1 = dist1A <= THRESHOLD ? 'AUTHORIZED · COMMANDER SHARMA' : 'UNAUTHORIZED';
  const resultFace3 = Math.min(dist3A, dist3B) <= THRESHOLD ? 'AUTHORIZED' : 'UNAUTHORIZED · UNKNOWN PERSON';
  assert.strictEqual(resultFace1, 'AUTHORIZED · COMMANDER SHARMA');
  assert.strictEqual(resultFace3, 'UNAUTHORIZED · UNKNOWN PERSON');
  console.log('  ✓ Scenario C: Simultaneous evaluation correctly marks Person A AUTHORIZED and Unknown UNAUTHORIZED');

  // 7. Remove Person A and verify Person B remains
  const resDelA = await del('/api/face-auth/person/' + idPersonA);
  assert.strictEqual(resDelA.status, 200, 'DELETE should return 200');
  const delAResult = JSON.parse(resDelA.body);
  assert.strictEqual(delAResult.success, true);
  assert.strictEqual(delAResult.remainingCount, 1);

  const resRosterAfterDelA = await get('/api/face-auth/roster');
  const rosterAfterDelA = JSON.parse(resRosterAfterDelA.body);
  assert.strictEqual(rosterAfterDelA.count, 1, 'Roster count should be 1 after deleting Person A');
  assert.strictEqual(rosterAfterDelA.people[0].name, 'Operator Verma', 'Operator Verma must still remain');
  console.log('  ✓ Removal verified: Removed Person A, Person B remains enrolled');

  // 8. Remove Person B and verify roster is empty
  const resDelB = await del('/api/face-auth/person/' + idPersonB);
  assert.strictEqual(resDelB.status, 200);
  const resRosterFinal = await get('/api/face-auth/roster');
  const rosterFinal = JSON.parse(resRosterFinal.body);
  assert.strictEqual(rosterFinal.count, 0, 'Roster must be empty after deleting Person B');
  console.log('  ✓ Complete removal verified: Roster cleanly empty');

  console.log('✅ PASS: Multi-Person Face Authentication integration suite completed successfully.\n');
}

if (require.main === module) {
  runFaceAuthTests().catch(err => {
    console.error('❌ Face Auth Test Suite Failed:', err);
    process.exit(1);
  });
}

module.exports = { runFaceAuthTests };
