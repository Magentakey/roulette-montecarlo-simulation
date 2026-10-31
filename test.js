// Tes otomatis sederhana — jalankan: node test.js   (butuh Node.js ≥ 16, tanpa library tambahan)
// Semua tes memakai seed tetap sehingga deterministik (tidak "kadang lulus, kadang gagal").
'use strict';
const assert = require('assert');
const Core = require('./roulette-core.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { failed++; console.log('  ✗ ' + name + '\n      ' + (e && e.message ? e.message : e)); }
}
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ' diharapkan ' + b + ' ± ' + tol + ', didapat ' + a);
const seeded = s => Core.makeRng({ kind: 'seed', seed: s }).next;

console.log('\nAturan roda dan nilai teoretis');
test('House Edge teoretis: European 1/37, La Partage 1/74, American 2/38', () => {
  near(Core.theory('european').he, 1 / 37, 1e-12);
  near(Core.theory('lapartage').he, 1 / 74, 1e-12);
  near(Core.theory('american').he, 2 / 38, 1e-12);
});
test('Jumlah angka merah = 18 dan 0/00 bukan merah', () => {
  assert.strictEqual(Core.RED_LIST.length, 18);
  assert.strictEqual(Core.RED[0], 0); assert.strictEqual(Core.RED[37], 0);
});

console.log('\nGenerator angka acak');
test('PRNG ber-seed dapat diulang persis, seed berbeda → urutan berbeda', () => {
  const a = seeded('abc'), b = seeded('abc'), c = seeded('abd');
  let same = true, diff = false;
  for (let i = 0; i < 1000; i++) { const x = a(), y = b(), z = c(); if (x !== y) same = false; if (x !== z) diff = true; }
  assert.ok(same, 'seed sama harus identik'); assert.ok(diff, 'seed beda harus berbeda');
});
test('Semua generator mengembalikan nilai di [0, 1)', () => {
  ['math', 'seed', 'crypto'].forEach(k => {
    const g = Core.makeRng({ kind: k, seed: 'x' }).next;
    for (let i = 0; i < 10000; i++) { const u = g(); assert.ok(u >= 0 && u < 1, k + ' keluar rentang'); }
  });
});
test('Uji chi-square keseragaman (sfc32, 1.000.000 undian) lulus', () => {
  const t = Core.uniformityTest(seeded('uniform-test'), 1e6, 37);
  assert.ok(t.p > 0.01, 'p = ' + t.p);
});
test('Uji independensi (runs, lag-1, serial) lulus untuk sfc32', () => {
  const t = Core.independenceTests(seeded('indep-test'), 1e6, 37);
  assert.ok(t.runs.p > 0.01 && t.autocorr.p > 0.01 && t.serial.p > 0.01, JSON.stringify([t.runs.p, t.autocorr.p, t.serial.p]));
});
test('Uji independensi MENDETEKSI generator yang buruk (urutan 0,1,2,…,36 berulang)', () => {
  let k = 0; const bad = () => ((k++ % 37) + 0.5) / 37;
  const t = Core.independenceTests(bad, 100000, 37);
  assert.ok(t.serial.p < 1e-6, 'serial p = ' + t.serial.p);
});
test('chi-square: p(23,52; df 36) ≈ 0,946 dan nilai kritis df 36 ≈ 50,998', () => {
  near(Core.chiSqP(23.52, 36), 0.946, 0.001);
  near(Core.chiSqCritical(36, 0.05), 50.998, 0.01);
});

console.log('\nSimulasi satu sesi');
test('RTP simulasi dalam ±3 SE dari teori (semua aturan, 2.000.000 putaran)', () => {
  ['european', 'lapartage', 'american'].forEach(rule => {
    const th = Core.theory(rule), n = 2e6;
    const r = Core.playSession({ M0: 1e9, b: 1, N: n, rule, strategy: 'flat', tableMax: Infinity }, seeded('rtp-' + rule));
    assert.strictEqual(r.rounds, n);
    const he = (1e9 - r.cap) / r.turnover, se = th.sigma / Math.sqrt(n);
    assert.ok(Math.abs(he - th.he) <= 3 * se, rule + ': HE ' + he + ' vs ' + th.he + ' (SE ' + se + ')');
  });
});
test('Sesi flat bangkrut: modal akhir 0, HE = 100·M0/(n·b), kas konsisten', () => {
  const rec = { nums: new Uint8Array(10000), bets: new Float64Array(10000), caps: new Float64Array(10001) };
  let r; const g = seeded('bangkrut');
  do { r = Core.playSession({ M0: 1000, b: 10, N: 10000, rule: 'european', strategy: 'flat', tableMax: Infinity }, g, rec); } while (!r.ruined);
  assert.strictEqual(r.cap, 0);
  near(Core.sessionHE(r, 1000), 100 * 1000 / (r.rounds * 10), 1e-9);
  assert.strictEqual(r.cap, 1000 + 10 * (r.wins - r.losses));
  assert.strictEqual(r.turnover, r.rounds * 10);
  assert.strictEqual(rec.caps[r.rounds], r.cap);
});
test('Martingale mematuhi batas meja dan tidak bertaruh melebihi modal', () => {
  const rec = { nums: new Uint8Array(5000), bets: new Float64Array(5000), caps: new Float64Array(5001) };
  const r = Core.playSession({ M0: 1000, b: 10, N: 5000, rule: 'european', strategy: 'martingale', tableMax: 160 }, seeded('mart'), rec);
  for (let i = 0; i < r.rounds; i++) {
    assert.ok(rec.bets[i] <= 160 + 1e-9, 'taruhan melebihi batas meja: ' + rec.bets[i]);
    assert.ok(rec.bets[i] <= rec.caps[i] + 1e-9, 'taruhan melebihi modal');
    assert.ok(rec.bets[i] >= 10 - 1e-9, 'taruhan di bawah taruhan dasar');
  }
});
test('Pola taruhan: Martingale 10,20,40 setelah kalah beruntun; D\'Alembert +1 unit; Fibonacci 1,1,2,3', () => {
  // paksa kalah terus: u = 0.0 → angka 0 (kalah pada semua aturan)
  const lose = () => 0.0;
  const run = (strategy) => { const rec = { nums: new Uint8Array(6), bets: new Float64Array(6), caps: new Float64Array(7) };
    Core.playSession({ M0: 100000, b: 10, N: 6, rule: 'european', strategy, tableMax: Infinity }, lose, rec); return Array.from(rec.bets); };
  assert.deepStrictEqual(run('martingale'), [10, 20, 40, 80, 160, 320]);
  assert.deepStrictEqual(run('dalembert'), [10, 20, 30, 40, 50, 60]);
  assert.deepStrictEqual(run('fibonacci'), [10, 10, 20, 30, 50, 80]);
});
test('La Partage: angka 0 mengembalikan setengah taruhan', () => {
  const r = Core.playSession({ M0: 100, b: 10, N: 1, rule: 'lapartage', strategy: 'flat', tableMax: Infinity }, () => 0.0);
  assert.strictEqual(r.cap, 95); assert.strictEqual(r.halves, 1);
});
test('validateConfig menolak parameter tidak masuk akal', () => {
  const ok = { M0: 1000, b: 10, N: 100, rule: 'european', strategy: 'flat', tableMax: Infinity };
  assert.strictEqual(Core.validateConfig(ok), null);
  assert.ok(Core.validateConfig(Object.assign({}, ok, { M0: NaN })));
  assert.ok(Core.validateConfig(Object.assign({}, ok, { b: 2000 })));
  assert.ok(Core.validateConfig(Object.assign({}, ok, { N: 0 })));
  assert.ok(Core.validateConfig(Object.assign({}, ok, { tableMax: 5 })));
});

console.log('\nSolusi eksak gambler\'s ruin');
test('Cocok dengan angka artikel: K=22 → 4,95% (100 ronde), 76,2% (1000 ronde)', () => {
  const r = Core.ruinWithin('european', 220, 10, [100, 1000]);
  near(r[0], 0.0495, 0.0002); near(r[1], 0.762, 0.001);
});
test('Modal $1000, taruhan $10, N = 10.000 → peluang bangkrut 97,95%, median 3.086, Wald 3.700', () => {
  const e = Core.exactRuin('european', 1000, 10, 10000);
  near(e.pRuin, 0.9795, 0.0002); assert.strictEqual(e.medianCond, 3086); near(e.waldMean, 3700, 1e-6);
});
test('CDF eksak monoton naik dan di [0, 1]', () => {
  const e = Core.exactRuin('lapartage', 500, 10, 3000);
  for (let t = 1; t < e.cdf.length; t++) assert.ok(e.cdf[t] >= e.cdf[t - 1] - 1e-15 && e.cdf[t] <= 1 + 1e-12);
});
test('Rekursi eksak = enumerasi naif (semua aturan, kasus kecil)', () => {
  ['european', 'lapartage', 'american'].forEach(rule => {
    const th = Core.theory(rule), part = Core.RULES[rule].partage, s = part ? 2 : 1, amin = part ? 2 : 1;
    let m = new Map([[Math.floor(s * 30 / 10), 1]]), ab = 0;
    for (let t = 0; t < 40; t++) {
      const nx = new Map();
      for (const [c, p] of m) {
        const add = (k, q) => { if (k < amin) ab += q; else nx.set(k, (nx.get(k) || 0) + q); };
        add(c + s, p * th.pWin); add(c - s, p * th.pLose); if (part) add(c - 1, p * th.pHalf);
      }
      m = nx;
    }
    near(Core.exactRuin(rule, 30, 10, 40).pRuin, ab, 1e-12, rule);
  });
});
test('Simulasi 20.000 sesi cocok dengan peluang bangkrut eksak (|z| ≤ 3,5)', () => {
  const cfg = { M0: 1000, b: 10, N: 10000, rule: 'european', strategy: 'flat', tableMax: Infinity };
  const batch = Core.createBatch(cfg, 20000, { kind: 'seed', seed: 'verifikasi' });
  while (!batch.step(1000)) { /* sinkron */ }
  const s = Core.summarize(batch, { B: 100, rngSpec: { kind: 'seed', seed: 'verifikasi' } });
  assert.ok(s.analytic.available);
  assert.ok(Math.abs(s.analytic.zRuin) <= 3.5, 'z = ' + s.analytic.zRuin);
  near(s.roundsToRuin.median, s.analytic.medianCond, 60, 'median');
});

console.log('\nStatistik');
test('Wilson 50/100 ≈ [0,404; 0,596]', () => {
  const w = Core.wilson(50, 100); near(w.lo, 0.404, 0.001); near(w.hi, 0.596, 0.001);
});
test('HE gabungan (Σ kerugian / Σ turnover) konsisten untuk SEMUA strategi (|z| ≤ 3,5)', () => {
  Object.keys(Core.STRATEGIES).forEach(st => {
    const cfg = { M0: 1000, b: 10, N: 3000, rule: 'european', strategy: st, tableMax: 500 };
    const batch = Core.createBatch(cfg, 6000, { kind: 'seed', seed: 'he-' + st });
    while (!batch.step(1000)) { /* sinkron */ }
    const s = Core.summarize(batch, { B: 300, rngSpec: { kind: 'seed', seed: 'he-' + st } });
    assert.ok(Math.abs(s.hePooled.z) <= 3.5, st + ': z = ' + s.hePooled.z);
  });
});
test('HE rata-rata per sesi bangkrut lebih besar dari HE gabungan (ketaksamaan Jensen)', () => {
  const cfg = { M0: 1000, b: 10, N: 10000, rule: 'european', strategy: 'flat', tableMax: Infinity };
  const batch = Core.createBatch(cfg, 5000, { kind: 'seed', seed: 'jensen' });
  while (!batch.step(1000)) { /* sinkron */ }
  const s = Core.summarize(batch, { B: 100, rngSpec: { kind: 'seed', seed: 'jensen' } });
  assert.ok(s.hePerSession.mean > s.hePooled.value + 0.5, s.hePerSession.mean + ' vs ' + s.hePooled.value);
  assert.strictEqual(s.identity.share, 1);
});
test('Hasil batch dapat direproduksi dengan seed yang sama', () => {
  const cfg = { M0: 1000, b: 10, N: 2000, rule: 'american', strategy: 'dalembert', tableMax: 300 };
  const run = () => { const b = Core.createBatch(cfg, 500, { kind: 'seed', seed: 'repro' }); while (!b.step(1000)) { /* sinkron */ } return Core.summarize(b, { B: 100, rngSpec: { kind: 'seed', seed: 'repro' } }); };
  const a = run(), b = run();
  assert.strictEqual(a.hePooled.value, b.hePooled.value); assert.strictEqual(a.hePooled.lo, b.hePooled.lo); assert.strictEqual(a.ruin.k, b.ruin.k);
});
test('VaR/CVaR: CVaR ≥ VaR dan kerugian maksimum = modal awal', () => {
  const cfg = { M0: 1000, b: 10, N: 200, rule: 'european', strategy: 'flat', tableMax: Infinity };
  const batch = Core.createBatch(cfg, 3000, { kind: 'seed', seed: 'var' });
  while (!batch.step(1000)) { /* sinkron */ }
  const s = Core.summarize(batch, { B: 0 });
  assert.ok(s.risk.cvar95 >= s.risk.var95 && s.risk.cvar99 >= s.risk.var99 && s.risk.var99 >= s.risk.var95);
  assert.ok(s.risk.cvar99 <= 1000 + 1e-9);
});

test('Teorema waktu tumbukan cocok dengan rekursi eksak (K = 100, N = 10.000)', () => {
  const h = Core.hittingTimeLaw('european', 1000, 10, 10000), ex = Core.exactRuin('european', 1000, 10, 10000);
  near(h.pRuin, ex.pRuin, 1e-9, 'peluang bangkrut');
  assert.strictEqual(h.medianCond, ex.medianCond);
  near(h.meanCond, ex.meanCond, 1e-6, 'rata-rata bersyarat');
});
test('Sesi tunggal K = 10.000: rata-rata 37K, bangkrut hampir pasti dalam 1.000.000 ronde', () => {
  const h = Core.hittingTimeLaw('european', 100000, 10, 1000000);
  near(h.meanCond, 370000, 1, 'rata-rata');
  assert.ok(h.pRuin > 0.999999);
  near(h.percentileOf(400376), 0.908, 0.001, 'persentil ronde 400.376');
  assert.strictEqual(Core.hittingTimeLaw('lapartage', 1000, 10, 100), null);
});

console.log('\n' + passed + ' lulus, ' + failed + ' gagal');
process.exit(failed ? 1 : 0);
