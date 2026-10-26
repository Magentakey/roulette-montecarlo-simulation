/*
 * roulette-core.js  —  inti simulasi Monte Carlo European/American Roulette
 *
 * Satu berkas ini dipakai bersama oleh:
 *   - index.html        (thread utama dan Web Worker)
 *   - sim_roulette.js   (simulasi massal Node.js)
 *   - test.js           (tes otomatis)
 * sehingga logika Mode 1, Mode 3, dan skrip Node.js dijamin identik.
 *
 * Isi: PRNG (Math.random / sfc32 ber-seed / crypto), aturan roda, strategi taruhan,
 * simulasi satu sesi, simulasi batch, solusi eksak gambler's ruin (rekursi/DP),
 * statistik (Wilson, bootstrap, VaR/CVaR), uji generator (chi-square, runs, serial).
 */
(function (root, factory) {
  var api = factory();
  // Sumber pabrik fungsi, dipakai index.html untuk membuat Web Worker dari Blob
  // (agar tetap jalan saat index.html dibuka langsung lewat file://).
  api.factorySource = '(' + factory.toString() + ')()';
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RouletteCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var EPS = 1e-9;
  var now = function () {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  };

  // ------------------------------------------------------------------ ATURAN RODA
  var RED_LIST = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
  var RED = new Uint8Array(38);
  RED_LIST.forEach(function (n) { RED[n] = 1; });

  // kantong 0..36; pada American, indeks 37 = "00"
  var RULES = {
    european: { id: 'european', label: 'European (0 tunggal)', pockets: 37, partage: false },
    lapartage: { id: 'lapartage', label: 'European + La Partage', pockets: 37, partage: true },
    american: { id: 'american', label: 'American (0 dan 00)', pockets: 38, partage: false }
  };
  var STRATEGIES = {
    flat: 'Flat (taruhan tetap)',
    martingale: 'Martingale (gandakan saat kalah)',
    dalembert: "D'Alembert (+1 unit saat kalah, −1 saat menang)",
    fibonacci: 'Fibonacci (naik saat kalah, mundur 2 langkah saat menang)'
  };
  var FIB = [1, 1];
  while (FIB.length < 40) FIB.push(FIB[FIB.length - 1] + FIB[FIB.length - 2]);

  /** Peluang dan nilai harapan per unit taruhan even-money pada merah. */
  function theory(ruleId) {
    var r = RULES[ruleId], n = r.pockets;
    var pWin = 18 / n, pHalf = r.partage ? 1 / n : 0, pLose = 1 - pWin - pHalf;
    var mu = pWin - pLose - 0.5 * pHalf;
    var e2 = pWin + pLose + 0.25 * pHalf;
    return { pWin: pWin, pLose: pLose, pHalf: pHalf, mu: mu, he: -mu, sigma: Math.sqrt(e2 - mu * mu) };
  }

  function validateConfig(c) {
    if (!(c.M0 > 0) || !isFinite(c.M0)) return 'Modal awal harus bilangan positif.';
    if (!(c.b > 0) || !isFinite(c.b)) return 'Taruhan per ronde harus bilangan positif.';
    if (c.b > c.M0) return 'Taruhan per ronde tidak boleh melebihi modal awal.';
    if (!Number.isInteger(c.N) || c.N < 1) return 'Total target putaran (N) harus bilangan bulat ≥ 1.';
    if (!RULES[c.rule]) return 'Aturan roda tidak dikenal.';
    if (!STRATEGIES[c.strategy]) return 'Strategi tidak dikenal.';
    if (c.tableMax !== undefined && c.tableMax !== Infinity && !(c.tableMax >= c.b))
      return 'Batas meja harus ≥ taruhan dasar (kosongkan untuk tanpa batas).';
    return null;
  }

  // ------------------------------------------------------------------ PRNG
  function xmur3(str) {
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
    };
  }
  function sfc32(a, b, c, d) {
    return function () {
      a |= 0; b |= 0; c |= 0; d |= 0;
      var t = (((a + b) | 0) + d) | 0;
      d = (d + 1) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11);
      c = (c + t) | 0;
      return (t >>> 0) / 4294967296;
    };
  }
  function getCrypto() {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) return crypto;
    if (typeof require === 'function') {
      try { return require('crypto').webcrypto; } catch (e) { /* abaikan */ }
    }
    return null;
  }
  function randomSeed() {
    var c = getCrypto(), s = '';
    if (c) {
      var u = new Uint32Array(2); c.getRandomValues(u);
      s = u[0].toString(36) + u[1].toString(36);
    } else {
      s = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    }
    return s.slice(0, 10);
  }
  /**
   * spec = { kind: 'math' | 'seed' | 'crypto', seed: string }
   * kind 'seed' memakai sfc32 yang di-seed lewat xmur3 (hasil dapat diulang persis).
   */
  function makeRng(spec) {
    spec = spec || {};
    var kind = spec.kind || 'math';
    if (kind === 'seed') {
      var seed = (spec.seed === undefined || spec.seed === null || spec.seed === '') ? randomSeed() : String(spec.seed);
      var h = xmur3(seed);
      var g = sfc32(h(), h(), h(), h());
      for (var i = 0; i < 15; i++) g();
      return { next: g, kind: 'seed', seed: seed };
    }
    if (kind === 'crypto') {
      var c = getCrypto();
      if (!c) throw new Error('crypto.getRandomValues tidak tersedia di lingkungan ini.');
      var buf = new Uint32Array(4096), pos = 4096;
      return {
        kind: 'crypto', seed: null,
        next: function () {
          if (pos >= 4096) { c.getRandomValues(buf); pos = 0; }
          return buf[pos++] / 4294967296;
        }
      };
    }
    return { next: Math.random, kind: 'math', seed: null };
  }

  // ------------------------------------------------------------------ SATU SESI
  /**
   * cfg = { M0, b, N, rule, strategy, tableMax }
   * Berhenti jika ronde mencapai N atau modal < taruhan dasar b (bangkrut).
   * Taruhan = min(taruhan strategi, batas meja, sisa modal).
   * rec (opsional) = { nums:Uint8Array(N), bets:Float64Array(N), caps:Float64Array(N+1) }
   */
  function playSession(cfg, next, rec) {
    var M0 = cfg.M0, b = cfg.b, N = cfg.N;
    var tmax = (cfg.tableMax === undefined || cfg.tableMax === null) ? Infinity : cfg.tableMax;
    var rule = RULES[cfg.rule], P = rule.pockets, partage = rule.partage, strat = cfg.strategy;
    var cap = M0, rounds = 0, wins = 0, losses = 0, halves = 0, turnover = 0, peak = M0;
    var mult = 1, units = 1, fi = 0;
    if (rec) rec.caps[0] = M0;
    while (rounds < N && cap >= b - EPS) {
      var bet = b;
      if (strat === 'martingale') bet = b * mult;
      else if (strat === 'dalembert') bet = b * units;
      else if (strat === 'fibonacci') bet = b * FIB[fi];
      if (bet > tmax) bet = tmax;
      if (bet > cap) bet = cap;
      var x = Math.floor(next() * P);
      rounds++; turnover += bet;
      var win = false;
      if (RED[x] === 1) { cap += bet; wins++; win = true; }
      else if (partage && x === 0) { cap -= bet / 2; halves++; }
      else { cap -= bet; losses++; }
      if (cap > peak) peak = cap;
      if (strat === 'martingale') { mult = win ? 1 : Math.min(mult * 2, 1e12); }
      else if (strat === 'dalembert') { units = win ? Math.max(1, units - 1) : units + 1; }
      else if (strat === 'fibonacci') { fi = win ? Math.max(0, fi - 2) : Math.min(fi + 1, FIB.length - 1); }
      if (rec) { rec.nums[rounds - 1] = x; rec.bets[rounds - 1] = bet; rec.caps[rounds] = cap; }
    }
    return { rounds: rounds, wins: wins, losses: losses, halves: halves, cap: cap, turnover: turnover, peak: peak, ruined: cap < b - EPS };
  }

  function sessionHE(r, M0) { return r.turnover > 0 ? (M0 - r.cap) / r.turnover * 100 : 0; }

  // ------------------------------------------------------------------ BATCH
  function createBatch(cfg, S, rngSpec) {
    var R = makeRng(rngSpec);
    var A = {
      rounds: new Int32Array(S), wins: new Int32Array(S), losses: new Int32Array(S), halves: new Int32Array(S),
      cap: new Float64Array(S), turnover: new Float64Array(S), peak: new Float64Array(S), ruined: new Uint8Array(S)
    };
    var done = 0;
    return {
      S: S, cfg: cfg, rng: R, arrays: A,
      get done() { return done; },
      /** Jalankan sesi sampai anggaran waktu ms habis. Mengembalikan true jika semua selesai. */
      step: function (ms) {
        var t0 = now();
        while (done < S && now() - t0 < ms) {
          var r = playSession(cfg, R.next);
          A.rounds[done] = r.rounds; A.wins[done] = r.wins; A.losses[done] = r.losses; A.halves[done] = r.halves;
          A.cap[done] = r.cap; A.turnover[done] = r.turnover; A.peak[done] = r.peak; A.ruined[done] = r.ruined ? 1 : 0;
          done++;
        }
        return done >= S;
      }
    };
  }

  // ------------------------------------------------------------------ STATISTIK DASAR
  function mean(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : NaN; }
  function sd(a) {
    if (a.length < 2) return NaN;
    var m = mean(a), s = 0;
    for (var i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m);
    return Math.sqrt(s / (a.length - 1));
  }
  function sortedCopy(a) { var b = Float64Array.from(a); b.sort(); return b; }
  function quantile(sorted, q) {
    var n = sorted.length; if (!n) return NaN;
    var h = (n - 1) * q, lo = Math.floor(h), hi = Math.ceil(h);
    return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
  }
  /** Rentang kepercayaan Wilson untuk proporsi k/n. */
  function wilson(k, n, z) {
    z = z || 1.96;
    if (!n) return { p: NaN, lo: NaN, hi: NaN };
    var p = k / n, z2 = z * z, den = 1 + z2 / n, c = p + z2 / (2 * n);
    var h = z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n));
    return { p: p, lo: (c - h) / den, hi: (c + h) / den };
  }
  /** Persentase nilai dalam sorted yang ≤ v (posisi persentil). */
  function percentileRank(sorted, v) {
    var lo = 0, hi = sorted.length;
    while (lo < hi) { var m = (lo + hi) >> 1; if (sorted[m] <= v) lo = m + 1; else hi = m; }
    return sorted.length ? lo / sorted.length * 100 : NaN;
  }
  function tailStats(sortedLoss, alpha) {
    var n = sortedLoss.length, v = quantile(sortedLoss, alpha);
    var k = Math.max(1, Math.ceil((1 - alpha) * n)), s = 0;
    for (var i = n - k; i < n; i++) s += sortedLoss[i];
    return { var: v, cvar: s / k };
  }
  function histogram(values, lo, hi, bins) {
    var w = (hi - lo) / bins, counts = new Array(bins).fill(0);
    for (var i = 0; i < values.length; i++) {
      var v = values[i], k = Math.floor((v - lo) / w);
      if (v < lo) continue;
      if (k >= bins) { if (v <= hi) k = bins - 1; else continue; }
      counts[k]++;
    }
    var pts = [{ x: lo, y: 0 }];
    for (var j = 0; j < bins; j++) pts.push({ x: lo + (j + 0.5) * w, y: counts[j] });
    pts.push({ x: hi, y: 0 });
    return { points: pts, max: Math.max.apply(null, counts) };
  }

  // ------------------------------------------------------------------ SOLUSI EKSAK GAMBLER'S RUIN
  /**
   * Peluang bangkrut eksak untuk taruhan FLAT (jalan acak) lewat rekursi peluang per modal.
   * Bangkrut = modal < b. cdf[t] = P(bangkrut pada atau sebelum ronde t), t = 0..N.
   * Batasan: hanya untuk strategi flat; N sampai 200.000.
   */
  function exactRuin(ruleId, M0, b, N) {
    var th = theory(ruleId), partage = RULES[ruleId].partage;
    var sW, sL, sH, aliveMin, c0;
    if (partage) { sW = 2; sL = 2; sH = 1; aliveMin = 2; c0 = Math.floor(2 * M0 / b + EPS); }
    else { sW = 1; sL = 1; sH = 0; aliveMin = 1; c0 = Math.floor(M0 / b + EPS); }
    var pW = th.pWin, pL = th.pLose, pH = th.pHalf;
    var cdf = new Float64Array(N + 1);
    if (c0 < aliveMin) { cdf.fill(1); return finishExact(cdf, N, c0, aliveMin, th, sW, sL, sH); }
    var L = c0 + sW * N + 4;
    if (L > 8e6) return null;
    var cur = new Float64Array(L), nxt = new Float64Array(L);
    var lo = c0, hi = c0, absorbed = 0, TRIM = 1e-22;
    cur[c0] = 1;
    for (var t = 1; t <= N; t++) {
      var zlo = Math.max(0, lo - sL), zhi = hi + sW;
      for (var z = zlo; z <= zhi; z++) nxt[z] = 0;
      for (var c = lo; c <= hi; c++) {
        var m = cur[c]; if (m === 0) continue;
        nxt[c + sW] += m * pW;
        var cl = c - sL;
        if (cl >= aliveMin) nxt[cl] += m * pL; else absorbed += m * pL;
        if (pH > 0) { var ch = c - sH; if (ch >= aliveMin) nxt[ch] += m * pH; else absorbed += m * pH; }
      }
      cdf[t] = absorbed;
      var nlo = Math.max(aliveMin, lo - sL), nhi = hi + sW;
      while (nlo <= nhi && nxt[nlo] < TRIM) nlo++;
      while (nhi >= nlo && nxt[nhi] < TRIM) nhi--;
      var tmp = cur; cur = nxt; nxt = tmp; lo = nlo; hi = nhi;
      if (lo > hi) { for (var u = t + 1; u <= N; u++) cdf[u] = absorbed; break; }
    }
    return finishExact(cdf, N, c0, aliveMin, th, sW, sL, sH);
  }
  function finishExact(cdf, N, c0, aliveMin, th, sW, sL, sH) {
    var pRuin = cdf[N], medianCond = NaN, meanCond = NaN;
    if (pRuin > 0) {
      var half = 0.5 * pRuin, s = 0;
      for (var t = 1; t <= N; t++) {
        if (isNaN(medianCond) && cdf[t] >= half) medianCond = t;
        s += t * (cdf[t] - cdf[t - 1]);
      }
      meanCond = s / pRuin;
    }
    // Perkiraan Wald untuk N tak terbatas: jarak ke batas dibagi laju rugi per ronde (satuan langkah)
    var muStep = th.pWin * sW - th.pLose * sL - th.pHalf * sH;
    var D = c0 - (aliveMin - 1);
    var wald = muStep < 0 ? D / (-muStep) : Infinity;
    return { pRuin: pRuin, cdf: cdf, medianCond: medianCond, meanCond: meanCond, waldMean: wald, units: D };
  }
  /** Peluang bangkrut pada horizon tertentu dari modal & taruhan sekarang (taruhan tetap). */
  function ruinWithin(ruleId, capital, bet, horizons) {
    var maxH = Math.max.apply(null, horizons);
    // Jika jarak ke batas bangkrut lebih besar dari penurunan maksimum dalam maxH ronde, peluangnya persis 0.
    var partage = RULES[ruleId].partage;
    var units = (partage ? Math.floor(2 * capital / bet + EPS) - 1 : Math.floor(capital / bet + EPS));
    if (units > (partage ? 2 : 1) * maxH) return horizons.map(function () { return 0; });
    var ex = exactRuin(ruleId, capital, bet, maxH);
    if (!ex) return null;
    return horizons.map(function (h) { return ex.cdf[h]; });
  }

  // ------------------------------------------------------------------ RINGKASAN BATCH
  function bootstrapRatio(loss, turn, he, B, rng) {
    var S = loss.length, est = new Float64Array(B), estM = new Float64Array(B);
    for (var k = 0; k < B; k++) {
      var sl = 0, st = 0, sh = 0;
      for (var j = 0; j < S; j++) {
        var i = Math.floor(rng() * S);
        sl += loss[i]; st += turn[i]; sh += he[i];
      }
      est[k] = sl / st * 100; estM[k] = sh / S;
    }
    var a = Float64Array.from(est).sort(), c = Float64Array.from(estM).sort();
    return {
      pooled: { lo: quantile(a, 0.025), hi: quantile(a, 0.975), se: sd(est) },
      perSession: { lo: quantile(c, 0.025), hi: quantile(c, 0.975), se: sd(estM) }
    };
  }

  /**
   * Meringkas hasil batch. opts: { B: jumlah resampel bootstrap, rngSpec }
   * Mengembalikan objek polos (aman untuk postMessage).
   */
  function summarize(batch, opts) {
    opts = opts || {};
    var cfg = batch.cfg, S = batch.S, A = batch.arrays, M0 = cfg.M0, N = cfg.N;
    var th = theory(cfg.rule);
    var loss = new Float64Array(S), he = new Float64Array(S);
    var ruinCount = 0, sumLoss = 0, sumTurn = 0, sumWins = 0, sumRounds = 0, identity = 0, ruinedRounds = [];
    for (var i = 0; i < S; i++) {
      loss[i] = M0 - A.cap[i];
      he[i] = A.turnover[i] > 0 ? loss[i] / A.turnover[i] * 100 : 0;
      sumLoss += loss[i]; sumTurn += A.turnover[i]; sumWins += A.wins[i]; sumRounds += A.rounds[i];
      if (A.ruined[i]) {
        ruinCount++; ruinedRounds.push(A.rounds[i]);
        if (cfg.strategy === 'flat' && Math.abs(A.cap[i]) < EPS) identity++;
      }
    }
    var ruinedSorted = Float64Array.from(ruinedRounds).sort();
    var heSorted = sortedCopy(he), lossSorted = sortedCopy(loss);
    var finalCaps = A.cap;
    var B = Math.max(0, Math.min(opts.B === undefined ? 1000 : opts.B, Math.floor(2e8 / Math.max(1, S))));
    var boot = null;
    if (B >= 50) {
      var bs = opts.rngSpec || {};
      var bRng = makeRng({ kind: bs.kind || 'math', seed: (bs.seed !== undefined && bs.seed !== null ? bs.seed : '') + '|bootstrap' });
      boot = bootstrapRatio(loss, A.turnover, he, B, bRng.next);
    }
    var hePooled = sumTurn > 0 ? sumLoss / sumTurn * 100 : 0;
    var heMean = mean(he);
    var winW = wilson(sumWins, sumRounds), ruinW = wilson(ruinCount, S);
    var v95 = tailStats(lossSorted, 0.95), v99 = tailStats(lossSorted, 0.99);

    // ---- pembanding analitis (hanya flat)
    var analytic = { available: false, reason: '' };
    if (cfg.strategy !== 'flat') analytic.reason = 'Solusi eksak hanya tersedia untuk strategi flat (jalan acak sederhana).';
    else if (N > 200000) analytic.reason = 'N > 200.000: rekursi eksak dilewati (terlalu berat); pakai perkiraan Wald.';
    else {
      var ex = exactRuin(cfg.rule, M0, cfg.b, N);
      if (ex) {
        var seRuin = Math.sqrt(Math.max(ex.pRuin * (1 - ex.pRuin), 1e-12) / S);
        analytic = {
          available: true, pRuin: ex.pRuin, medianCond: ex.medianCond, meanCond: ex.meanCond,
          waldMean: ex.waldMean, units: ex.units, zRuin: (ruinW.p - ex.pRuin) / seRuin, cdf: ex.cdf
        };
      } else analytic.reason = 'Ruang keadaan terlalu besar untuk rekursi eksak.';
    }
    // perkiraan Wald (tanpa batas N) untuk flat
    if (cfg.strategy === 'flat' && !analytic.available) {
      var thr = RULES[cfg.rule].partage ? { sW: 2, sL: 2, sH: 1, amin: 2, c0: Math.floor(2 * M0 / cfg.b + EPS) } : { sW: 1, sL: 1, sH: 0, amin: 1, c0: Math.floor(M0 / cfg.b + EPS) };
      var mu = th.pWin * thr.sW - th.pLose * thr.sL - th.pHalf * thr.sH;
      analytic.waldMean = mu < 0 ? (thr.c0 - thr.amin + 1) / (-mu) : Infinity;
    }

    // ---- data grafik
    var heLo = quantile(heSorted, 0.001), heHi = quantile(heSorted, 0.995);
    if (!(heHi > heLo)) { heLo = heLo - 1; heHi = heHi + 1; }
    var hHE = histogram(he, heLo, heHi, 60);
    var hR = histogram(ruinedRounds, 0, N, 60);
    var G = 200, grid = [], simCdf = [], exCdf = [];
    for (var g = 0; g <= G; g++) {
      var tg = Math.round(N * g / G);
      var lo = 0, hi = ruinedSorted.length;
      while (lo < hi) { var m = (lo + hi) >> 1; if (ruinedSorted[m] <= tg) lo = m + 1; else hi = m; }
      grid.push(tg); simCdf.push(lo / S * 100);
      if (analytic.available) exCdf.push(analytic.cdf[tg] * 100);
    }
    if (analytic.available) delete analytic.cdf;

    return {
      S: S, cfg: cfg, theory: th, B: B, turnoverMean: sumTurn / S,
      ruin: { k: ruinCount, p: ruinW.p, lo: ruinW.lo, hi: ruinW.hi },
      roundsToRuin: { n: ruinedRounds.length, mean: mean(ruinedRounds), median: quantile(ruinedSorted, 0.5), sd: sd(ruinedRounds) },
      finalCap: { mean: mean(finalCaps), sd: sd(finalCaps), survivors: S - ruinCount, survivorMean: (function () { var s = 0, k = 0; for (var q = 0; q < S; q++) if (!A.ruined[q]) { s += A.cap[q]; k++; } return k ? s / k : NaN; })() },
      win: { p: winW.p, lo: winW.lo, hi: winW.hi, rounds: sumRounds, z: (winW.p - th.pWin) / Math.sqrt(th.pWin * (1 - th.pWin) / Math.max(1, sumRounds)) },
      hePooled: { value: hePooled, lo: boot ? boot.pooled.lo : NaN, hi: boot ? boot.pooled.hi : NaN, se: boot ? boot.pooled.se : NaN, z: boot ? (hePooled - th.he * 100) / boot.pooled.se : NaN },
      hePerSession: { mean: heMean, median: quantile(heSorted, 0.5), sd: sd(he), p025: quantile(heSorted, 0.025), p975: quantile(heSorted, 0.975), meanLo: boot ? boot.perSession.lo : NaN, meanHi: boot ? boot.perSession.hi : NaN },
      identity: { applicable: cfg.strategy === 'flat', count: identity, share: ruinCount ? identity / ruinCount : NaN },
      risk: { var95: v95.var, cvar95: v95.cvar, var99: v99.var, cvar99: v99.cvar },
      analytic: analytic,
      hist: {
        he: { points: hHE.points, max: hHE.max, lo: heLo, hi: heHi },
        rounds: { points: hR.points, max: hR.max },
        ruinCurve: { x: grid, sim: simCdf, exact: exCdf }
      }
    };
  }

  // ------------------------------------------------------------------ UJI GENERATOR
  function lgamma(x) {
    var c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
    x -= 1;
    var a = c[0], t = x + 7.5;
    for (var i = 1; i < 9; i++) a += c[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }
  /** Q(a, x): fungsi gamma tak lengkap teregularisasi atas. */
  function gammaQ(a, x) {
    if (x <= 0) return 1;
    if (x < a + 1) {
      var ap = a, sum = 1 / a, del = sum;
      for (var n = 0; n < 5000; n++) { ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-16) break; }
      return 1 - sum * Math.exp(-x + a * Math.log(x) - lgamma(a));
    }
    var b = x + 1 - a, c = 1 / 1e-300, d = 1 / b, h = d;
    for (var i = 1; i < 5000; i++) {
      var an = -i * (i - a);
      b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
      c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
      d = 1 / d; var dl = d * c; h *= dl;
      if (Math.abs(dl - 1) < 1e-16) break;
    }
    return Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
  }
  function chiSqP(chi, df) { return gammaQ(df / 2, chi / 2); }
  function chiSqCritical(df, alpha) {
    var lo = 0, hi = df + 20 * Math.sqrt(2 * df) + 50;
    for (var i = 0; i < 200; i++) { var m = (lo + hi) / 2; if (chiSqP(m, df) > alpha) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }
  function normalTwoSidedP(z) { // 2·(1−Φ(|z|)) lewat erfc
    var x = Math.abs(z) / Math.SQRT2, t = 1 / (1 + 0.3275911 * x);
    var y = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
    return y * Math.exp(-x * x);
  }
  /** Uji keseragaman chi-square (H0: tiap kantong berpeluang 1/pockets). */
  function uniformityTest(next, n, pockets) {
    pockets = pockets || 37;
    var cnt = new Array(pockets).fill(0);
    for (var i = 0; i < n; i++) cnt[Math.floor(next() * pockets)]++;
    var e = n / pockets, chi = 0, mn = Infinity, mx = -Infinity;
    for (var k = 0; k < pockets; k++) { chi += (cnt[k] - e) * (cnt[k] - e) / e; if (cnt[k] < mn) mn = cnt[k]; if (cnt[k] > mx) mx = cnt[k]; }
    var df = pockets - 1;
    return { n: n, chi2: chi, df: df, critical: chiSqCritical(df, 0.05), p: chiSqP(chi, df), min: mn, max: mx, expected: e, counts: cnt };
  }
  /** Uji independensi: runs (Wald–Wolfowitz), autokorelasi lag-1, dan serial (pasangan berurutan). */
  function independenceTests(next, n, pockets) {
    pockets = pockets || 37;
    var x = new Uint8Array(n);
    for (var i = 0; i < n; i++) x[i] = Math.floor(next() * pockets);
    // runs test pada biner merah / bukan merah
    var n1 = 0, runs = 1, prev = RED[x[0]];
    for (var j = 0; j < n; j++) { var v = RED[x[j]]; if (v) n1++; if (j > 0 && v !== prev) runs++; prev = v; }
    var n2 = n - n1, mu = 2 * n1 * n2 / n + 1;
    var vr = 2 * n1 * n2 * (2 * n1 * n2 - n) / (n * n * (n - 1));
    var zRuns = (runs - mu) / Math.sqrt(vr);
    // autokorelasi lag-1
    var mx = 0; for (var a = 0; a < n; a++) mx += x[a]; mx /= n;
    var num = 0, den = 0;
    for (var c = 0; c < n; c++) { var d = x[c] - mx; den += d * d; if (c < n - 1) num += d * (x[c + 1] - mx); }
    var r1 = num / den, zAc = r1 * Math.sqrt(n);
    // serial test
    var cells = new Int32Array(pockets * pockets);
    for (var s = 0; s < n - 1; s++) cells[x[s] * pockets + x[s + 1]]++;
    var exp = (n - 1) / (pockets * pockets), chi = 0;
    for (var q = 0; q < cells.length; q++) chi += (cells[q] - exp) * (cells[q] - exp) / exp;
    var dfS = pockets * pockets - 1;
    return {
      n: n,
      runs: { runs: runs, expected: mu, z: zRuns, p: normalTwoSidedP(zRuns) },
      autocorr: { r1: r1, z: zAc, p: normalTwoSidedP(zAc) },
      serial: { chi2: chi, df: dfS, expectedPerCell: exp, p: chiSqP(chi, dfS) }
    };
  }

  return {
    EPS: EPS, RULES: RULES, STRATEGIES: STRATEGIES, RED: RED, RED_LIST: RED_LIST, FIB: FIB,
    theory: theory, validateConfig: validateConfig,
    makeRng: makeRng, randomSeed: randomSeed,
    playSession: playSession, sessionHE: sessionHE, createBatch: createBatch, summarize: summarize,
    exactRuin: exactRuin, ruinWithin: ruinWithin,
    mean: mean, sd: sd, quantile: quantile, sortedCopy: sortedCopy, wilson: wilson, percentileRank: percentileRank, histogram: histogram,
    chiSqP: chiSqP, chiSqCritical: chiSqCritical, uniformityTest: uniformityTest, independenceTests: independenceTests
  };
});
