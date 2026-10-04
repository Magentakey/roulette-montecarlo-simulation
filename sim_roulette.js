// Simulasi Monte Carlo European Roulette (taruhan MERAH) - replikasi logika aplikasi
// Jalankan: node sim_roulette.js   (hasil: results.json)
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

// E1: 10.000 sesi dengan parameter yang sama seperti Mode 1
const S = 10000, sessions = [];
for (let i = 0; i < S; i++) sessions.push(mode1(1000, 10, 10000));
out.sessions = sessions.map(s => [s.rounds, s.win, s.lose, s.cap, +s.he.toFixed(4), s.ruined ? 1 : 0]);

// E2: konvergensi tanpa batas kebangkrutan
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

// E3: uji keseragaman generator (1.000.000 pengundian)
const cnt = new Array(37).fill(0);
for (let i = 0; i < 1000000; i++) cnt[spin()]++;
out.counts = cnt;

require('fs').writeFileSync('results.json', JSON.stringify(out));
console.log('selesai');
