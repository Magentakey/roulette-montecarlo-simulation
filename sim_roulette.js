// Simulasi Monte Carlo European Roulette (taruhan MERAH)
// Logika setara dengan index.html (Mode 1): berhenti jika N tercapai atau modal < taruhan.
// Jalankan : node sim_roulette.js     (butuh Node.js; tanpa library tambahan)
// Keluaran : ringkasan di terminal + berkas results.json
// Catatan  : Math.random() tidak bisa diberi seed, sehingga angka tiap eksekusi
//            sedikit berbeda; kesimpulannya (House Edge gabungan ~2,70%) sama.
const RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const spin = () => Math.floor(Math.random() * 37);

// Logika Mode 1: berhenti jika N tercapai atau modal < taruhan
function mode1(M0, b, N) {
  let cap = M0, rounds = 0, win = 0, lose = 0;
  while (rounds < N && cap >= b) {
    rounds++;
    if (RED.has(spin())) { cap += b; win++; } else { cap -= b; lose++; }
  }
  const he = rounds > 0 ? (M0 - cap) / (rounds * b) * 100 : 0;
  return { rounds, win, lose, cap, he, ruined: cap < b };
}

const out = {};

// E2: 10.000 sesi dengan parameter yang sama seperti Mode 1
const S = 10000, sessions = [];
for (let i = 0; i < S; i++) sessions.push(mode1(1000, 10, 10000));
out.sessions = sessions.map(s => [s.rounds, s.win, s.lose, s.cap, +s.he.toFixed(4), s.ruined ? 1 : 0]);

// E3: konvergensi tanpa batas kebangkrutan
// (a) satu run 1.000.000 ronde, catat House Edge berjalan
let net = 0; const run = [];
const cps = new Set(); for (let e = 1; e <= 6; e += 0.05) cps.add(Math.round(10 ** e));
for (let n = 1; n <= 1000000; n++) {
  net += RED.has(spin()) ? 1 : -1;
  if (cps.has(n)) run.push([n, -net / n * 100]);
}
out.run = run;
// (b) banyak sesi per ukuran N
const Ns = [100, 1000, 10000, 100000, 1000000], reps = [2000, 2000, 1000, 300, 100];
out.conv = Ns.map((N, k) => {
  const hes = [];
  for (let r = 0; r < reps[k]; r++) {
    let nt = 0;
    for (let n = 0; n < N; n++) nt += RED.has(spin()) ? 1 : -1;
    hes.push(-nt / N * 100);
  }
  return { N, reps: reps[k], hes };
});

// E4: uji keseragaman generator (1.000.000 pengundian)
const cnt = new Array(37).fill(0);
for (let i = 0; i < 1000000; i++) cnt[spin()]++;
out.counts = cnt;

require('fs').writeFileSync('results.json', JSON.stringify(out));

// ---------- Ringkasan di terminal ----------
const f2 = x => x.toFixed(2);
const mean = a => a.reduce((p, c) => p + c, 0) / a.length;
const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((p, c) => p + (c - m) ** 2, 0) / (a.length - 1)); };
const med = a => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const ruinRounds = sessions.filter(s => s.ruined).map(s => s.rounds);
const totLoss = sessions.reduce((p, s) => p + (1000 - s.cap), 0);
const totTurn = sessions.reduce((p, s) => p + s.rounds * 10, 0);
const totWin = sessions.reduce((p, s) => p + s.win, 0);
const totRounds = sessions.reduce((p, s) => p + s.rounds, 0);
console.log('\n=== E2: ' + S + ' sesi Mode 1 (modal 1000, taruhan 10, N 10000) ===');
console.log('Sesi bangkrut        : ' + f2(ruinRounds.length / S * 100) + '%');
console.log('Ronde s.d. bangkrut  : rata-rata ' + Math.round(mean(ruinRounds)) + ', median ' + med(ruinRounds));
console.log('House Edge per sesi  : rata-rata ' + f2(mean(sessions.map(s => s.he))) + '%, SD ' + f2(sd(sessions.map(s => s.he))) + '%');
console.log('House Edge gabungan  : ' + f2(totLoss / totTurn * 100) + '%  (teoretis 2.70%)');
console.log('Persentase menang    : ' + f2(totWin / totRounds * 100) + '%  (teoretis 48.65%)');
console.log('\n=== E3: konvergensi House Edge tanpa batas kebangkrutan ===');
console.log('N         sesi   rata-rata   SD empiris   SE teoretis');
out.conv.forEach(c => console.log(String(c.N).padEnd(9), String(c.reps).padEnd(6), f2(mean(c.hes)).padStart(8) + '%', f2(sd(c.hes)).padStart(10) + '%', f2(100 * Math.sqrt(1 - 1 / 1369) / Math.sqrt(c.N)).padStart(10) + '%'));
const expc = 1000000 / 37;
const chi = cnt.reduce((p, c) => p + (c - expc) ** 2 / expc, 0);
console.log('\n=== E4: uji chi-square keseragaman (1.000.000 pengundian) ===');
console.log('chi2 = ' + f2(chi) + '  (df 36, nilai kritis alpha 0.05 = 50.998) -> ' + (chi < 50.998 ? 'H0 tidak ditolak (seragam)' : 'H0 ditolak'));
console.log('\nSelesai. Data mentah disimpan di results.json');
