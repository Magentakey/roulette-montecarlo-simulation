// Simulasi massal Monte Carlo Roulette (taruhan MERAH) — Node.js, tanpa library tambahan.
// Memakai roulette-core.js, logika identik dengan Mode 1 dan Mode 3 di index.html.
//
// Pemakaian:
//   node sim_roulette.js                          (default: Math.random, hasil berbeda tiap eksekusi)
//   node sim_roulette.js --rng=seed --seed=abc    (hasil dapat diulang persis)
//   node sim_roulette.js --rng=crypto
//   node sim_roulette.js --quick                  (ukuran dikecilkan ~10x untuk uji cepat / CI)
// Opsi lain: --rule=european|lapartage|american  --modal=1000 --bet=10 --n=10000
//            --sessions=10000 --boot=1000 --out=results.json --raw=0 (tanpa data mentah)
//
// Eksperimen:
//   E2 replikasi 10.000 sesi (+ rentang Wilson dan bootstrap)
//   E3 konvergensi House Edge tanpa batas kebangkrutan
//   E4 uji keseragaman generator (chi-square)
//   E5 pembanding analitis gambler's ruin (rekursi eksak)
//   E6 perbandingan strategi (flat, Martingale, D'Alembert, Fibonacci) + VaR/CVaR
//   E7 perbandingan aturan roda (European, La Partage, American)
//   E8 uji independensi (runs, autokorelasi lag-1, serial)
'use strict';
const fs = require('fs');
const Core = require('./roulette-core.js');

// ---------- argumen ----------
const args = {};
process.argv.slice(2).forEach(a => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  if (m) args[m[1]] = m[2] === undefined ? true : m[2];
});
const quick = !!args.quick;
const rngKind = args.rng || 'math';
const seed = args.seed !== undefined ? String(args.seed) : (rngKind === 'seed' ? 'roulette-montecarlo-2026' : '');
const rule = args.rule || 'european';
const M0 = parseFloat(args.modal || 1000), b = parseFloat(args.bet || 10), N = parseInt(args.n || 10000, 10);
const S = parseInt(args.sessions || (quick ? 2000 : 10000), 10);
const B = parseInt(args.boot || (quick ? 300 : 1000), 10);
const outFile = args.out || 'results.json';
const keepRaw = args.raw !== '0';
const scale = quick ? 0.1 : 1;

const mk = tag => Core.makeRng({ kind: rngKind, seed: seed + '|' + tag });
const baseCfg = { M0, b, N, rule, strategy: 'flat', tableMax: Infinity };
const err = Core.validateConfig(baseCfg);
if (err) { console.error('Parameter tidak valid: ' + err); process.exit(1); }

const f2 = x => (Number.isFinite(x) ? x.toFixed(2) : String(x));
const f4 = x => (Number.isFinite(x) ? x.toFixed(4) : String(x));
const pct = x => f2(x * 100) + '%';
const th = Core.theory(rule);
const out = { meta: { generator: rngKind, seed: rngKind === 'seed' ? seed : null, rule, M0, b, N, sessions: S, quick } };

console.log('Generator: ' + rngKind + (rngKind === 'seed' ? ' (seed "' + seed + '")' : '') + ' | aturan: ' + Core.RULES[rule].label +
  ' | HE teoretis ' + f2(th.he * 100) + '%');

// ---------- E2: replikasi sesi ----------
function runBatch(cfg, sessions, tag) {
  const spec = { kind: rngKind, seed: seed + '|' + tag };
  const batch = Core.createBatch(cfg, sessions, spec);
  while (!batch.step(1000)) { /* sinkron */ }
  return { batch, summary: Core.summarize(batch, { B, rngSpec: spec }) };
}
const e2 = runBatch(baseCfg, S, 'E2');
const s2 = e2.summary;
out.e2 = { summary: stripHist(s2) };
if (keepRaw) {
  const A = e2.batch.arrays;
  out.e2.sessions = Array.from({ length: S }, (_, i) => [A.rounds[i], A.wins[i], A.losses[i], A.cap[i], +((A.turnover[i] > 0 ? (M0 - A.cap[i]) / A.turnover[i] * 100 : 0)).toFixed(4), A.ruined[i]]);
  out.e2.sessionColumns = ['ronde', 'menang', 'kalah', 'modal_akhir', 'house_edge_persen', 'bangkrut'];
}
console.log('\n=== E2: ' + S + ' sesi (modal ' + M0 + ', taruhan ' + b + ', N ' + N + ') ===');
console.log('Sesi bangkrut        : ' + pct(s2.ruin.p) + '  [Wilson 95%: ' + pct(s2.ruin.lo) + ' – ' + pct(s2.ruin.hi) + ']');
console.log('Ronde s.d. bangkrut  : rata-rata ' + Math.round(s2.roundsToRuin.mean) + ', median ' + Math.round(s2.roundsToRuin.median) + ', SD ' + Math.round(s2.roundsToRuin.sd));
console.log('House Edge per sesi  : rata-rata ' + f2(s2.hePerSession.mean) + '%, median ' + f2(s2.hePerSession.median) + '%, SD ' + f2(s2.hePerSession.sd) + '%');
console.log('House Edge gabungan  : ' + f2(s2.hePooled.value) + '%  [bootstrap 95%: ' + f2(s2.hePooled.lo) + ' – ' + f2(s2.hePooled.hi) + ']  (teoretis ' + f2(th.he * 100) + '%)');
console.log('Persentase menang    : ' + pct(s2.win.p) + '  (teoretis ' + pct(th.pWin) + ')');
if (s2.identity.applicable) console.log('Sesi bangkrut dgn HE = 100·K/n persis: ' + pct(s2.identity.share) + '  (HE sesi bangkrut hanya fungsi dari n)');
console.log('VaR/CVaR kerugian    : 95% → ' + f2(s2.risk.var95) + ' / ' + f2(s2.risk.cvar95) + ' ; 99% → ' + f2(s2.risk.var99) + ' / ' + f2(s2.risk.cvar99));

// ---------- E5: analitis ----------
if (s2.analytic.available) {
  const a = s2.analytic;
  out.e5 = { pRuin: a.pRuin, medianCond: a.medianCond, meanCond: a.meanCond, waldMean: a.waldMean, zRuin: a.zRuin };
  console.log('\n=== E5: pembanding analitis gambler\'s ruin (flat) ===');
  console.log('P(bangkrut ≤ N)      : simulasi ' + pct(s2.ruin.p) + ' vs eksak ' + pct(a.pRuin) + '  (z = ' + f2(a.zRuin) + ')');
  console.log('Median ronde bangkrut: simulasi ' + Math.round(s2.roundsToRuin.median) + ' vs eksak ' + a.medianCond);
  console.log('Rata-rata (N = ∞)    : Wald ≈ ' + Math.round(a.waldMean) + ' ronde');
  const hor = [100, 1000, 10000, 20000, 30000];
  const ruinTable = hor.map(h => ({ horizon: h, pRuin: Core.exactRuin(rule, M0, b, h).pRuin }));
  out.e5.byHorizon = ruinTable;
  console.log('Peluang bangkrut eksak menurut horizon: ' + ruinTable.map(r => r.horizon + ' → ' + pct(r.pRuin)).join('; '));
}

// ---------- E3: konvergensi tanpa batas kebangkrutan ----------
console.log('\n=== E3: konvergensi House Edge tanpa batas kebangkrutan ===');
{
  const R = mk('E3').next, red = Core.RED, P = Core.RULES[rule].pockets, part = Core.RULES[rule].partage;
  const outcome = () => { const x = Math.floor(R() * P); return red[x] === 1 ? 1 : (part && x === 0 ? -0.5 : -1); };
  const runLen = Math.round(1e6 * (quick ? 0.1 : 1));
  let net = 0; const run = [];
  const cps = new Set(); for (let e = 1; e <= 6; e += 0.05) cps.add(Math.round(10 ** e));
  for (let n = 1; n <= runLen; n++) { net += outcome(); if (cps.has(n)) run.push([n, -net / n * 100]); }
  out.e3 = { run, conv: [] };
  const Ns = [100, 1000, 10000, 100000, 1000000].filter(n => n <= runLen);
  const reps0 = [2000, 2000, 1000, 300, 100];
  console.log('N         sesi   rata-rata   SD empiris   SE teoretis');
  Ns.forEach((n, k) => {
    const reps = Math.max(20, Math.round(reps0[k] * scale)), hes = [];
    for (let r = 0; r < reps; r++) { let s = 0; for (let i = 0; i < n; i++) s += outcome(); hes.push(-s / n * 100); }
    out.e3.conv.push({ N: n, reps, hes: keepRaw ? hes.map(v => +v.toFixed(5)) : undefined, mean: Core.mean(hes), sd: Core.sd(hes) });
    console.log(String(n).padEnd(9), String(reps).padEnd(6), (f2(Core.mean(hes)) + '%').padStart(9), (f2(Core.sd(hes)) + '%').padStart(11), (f2(100 * th.sigma / Math.sqrt(n)) + '%').padStart(11));
  });
}

// ---------- E4: uji keseragaman ----------
{
  const pockets = Core.RULES[rule].pockets, n = Math.round(1e6 * (quick ? 0.2 : 1));
  const u = Core.uniformityTest(mk('E4').next, n, pockets);
  out.e4 = u;
  console.log('\n=== E4: uji chi-square keseragaman (' + n + ' pengundian) ===');
  console.log('chi2 = ' + f2(u.chi2) + ' (df ' + u.df + ', kritis α=0,05: ' + f2(u.critical) + '), p = ' + f4(u.p) + ' → ' + (u.p > 0.05 ? 'H0 tidak ditolak (seragam)' : 'H0 ditolak'));
}

// ---------- E6: strategi ----------
console.log('\n=== E6: perbandingan strategi (' + Core.RULES[rule].label + ', batas meja ' + (b * 50) + ' untuk strategi progresif) ===');
console.log('Strategi      Bangkrut   HE gabungan   Modal akhir rata2   VaR95 / CVaR95 kerugian');
out.e6 = [];
Object.keys(Core.STRATEGIES).forEach(st => {
  const cfg = Object.assign({}, baseCfg, { strategy: st, tableMax: st === 'flat' ? Infinity : b * 50 });
  const r = runBatch(cfg, Math.max(500, Math.round(S / 2)), 'E6-' + st).summary;
  out.e6.push({ strategy: st, tableMax: cfg.tableMax === Infinity ? null : cfg.tableMax, ruin: r.ruin.p, hePooled: r.hePooled.value, heLo: r.hePooled.lo, heHi: r.hePooled.hi, meanFinal: r.finalCap.mean, var95: r.risk.var95, cvar95: r.risk.cvar95, var99: r.risk.var99, cvar99: r.risk.cvar99 });
  console.log(st.padEnd(13), pct(r.ruin.p).padStart(8), (f2(r.hePooled.value) + '%').padStart(13), f2(r.finalCap.mean).padStart(19), (f2(r.risk.var95) + ' / ' + f2(r.risk.cvar95)).padStart(24));
});

// ---------- E7: aturan roda ----------
console.log('\n=== E7: perbandingan aturan roda (flat) ===');
console.log('Aturan                    HE teoretis   HE gabungan [bootstrap 95%]    Bangkrut sim / eksak');
out.e7 = [];
Object.keys(Core.RULES).forEach(rid => {
  const cfg = Object.assign({}, baseCfg, { rule: rid });
  const r = runBatch(cfg, S, 'E7-' + rid).summary, t = Core.theory(rid);
  out.e7.push({ rule: rid, heTheory: t.he * 100, hePooled: r.hePooled.value, heLo: r.hePooled.lo, heHi: r.hePooled.hi, ruin: r.ruin.p, ruinExact: r.analytic.available ? r.analytic.pRuin : null });
  console.log(Core.RULES[rid].label.padEnd(25), (f2(t.he * 100) + '%').padStart(10), ('   ' + f2(r.hePooled.value) + '% [' + f2(r.hePooled.lo) + ' – ' + f2(r.hePooled.hi) + ']').padEnd(32), pct(r.ruin.p) + ' / ' + (r.analytic.available ? pct(r.analytic.pRuin) : '—'));
});

// ---------- E8: independensi ----------
{
  const pockets = Core.RULES[rule].pockets, n = Math.round(1e6 * (quick ? 0.2 : 1));
  const t = Core.independenceTests(mk('E8').next, n, pockets);
  out.e8 = t;
  console.log('\n=== E8: uji independensi antar putaran (' + n + ' putaran) ===');
  console.log('Runs test (merah/bukan)  : runs = ' + t.runs.runs + ', harapan ' + f2(t.runs.expected) + ', z = ' + f2(t.runs.z) + ', p = ' + f4(t.runs.p));
  console.log('Autokorelasi lag-1       : r = ' + t.autocorr.r1.toExponential(2) + ', z = ' + f2(t.autocorr.z) + ', p = ' + f4(t.autocorr.p));
  console.log('Serial (pasangan, ' + pockets + '×' + pockets + ') : chi2 = ' + f2(t.serial.chi2) + ' (df ' + t.serial.df + '), p = ' + f4(t.serial.p));
  console.log('→ ' + ((t.runs.p > 0.05 && t.autocorr.p > 0.05 && t.serial.p > 0.05) ? 'tidak ada bukti ketergantungan antar putaran' : 'ada uji yang menolak H0 pada α = 0,05 (dengan 3 uji, satu penolakan kebetulan terjadi ≈ 14% dari waktu)'));
}

fs.writeFileSync(outFile, JSON.stringify(out));
console.log('\nSelesai. Data disimpan di ' + outFile);

function stripHist(s) {
  const c = JSON.parse(JSON.stringify(s, (k, v) => (typeof v === 'number' && !Number.isFinite(v) ? null : v)));
  delete c.hist; return c;
}
