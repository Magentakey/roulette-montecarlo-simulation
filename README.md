# 🎰 Simulasi Numerik Monte Carlo: Roulette

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white) ![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black) ![Chart.js](https://img.shields.io/badge/Chart.js-FF6384?style=for-the-badge&logo=chartdotjs&logoColor=white) ![License](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge) [![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.23676479.svg)](https://doi.org/10.5281/zenodo.23676479)

Aplikasi web untuk memodelkan dan mengevaluasi probabilitas kemenangan, risiko kebangkrutan (*Ruin Risk*), dan konvergensi *House Edge* pada **European Roulette** (serta variasi La Partage dan American) dengan **Simulasi Monte Carlo**, dibandingkan langsung dengan solusi analitis *gambler's ruin*.

🔗 **Demo (GitHub Pages):** https://magentakey.github.io/roulette-montecarlo-simulation/

## 📌 Latar Belakang

Pada taruhan *even-money* (merah/hitam) European Roulette, peluang menang hanya 18/37 ≈ 48,65%, sehingga kasino memperoleh *House Edge* 1/37 ≈ **2,70%**. Aplikasi ini menunjukkan secara empiris Hukum Bilangan Besar: pada taruhan datar modal pemain terkuras dalam jangka panjang (peluang bangkrut eksak 97,95% untuk modal $1000, taruhan $10, 10.000 ronde).

## 🚀 Fitur Aplikasi (`index.html`)

**Pengaturan umum (semua mode)**
- **Aturan roda:** European (HE 2,70%), European + *La Partage* (1,35%), American 0 dan 00 (5,26%).
- **Generator angka acak:** `Math.random()` (default), PRNG ber-seed **sfc32** (hasil dapat diulang persis), atau `crypto.getRandomValues`.

**Mode 1 — Simulasi Instan**
- Parameter: modal, taruhan, N, **strategi** (Flat, Martingale, D'Alembert, Fibonacci), dan **batas meja**.
- Grafik modal selalu menyertakan **titik akhir sebenarnya**; ekspor **CSV** setiap ronde.
- Penjelasan otomatis: pada taruhan datar, sesi bangkrut selalu punya HE = (M0 − sisa)/(n·b), yaitu hanya fungsi dari n, jadi bukan estimasi independen dari House Edge.

**Mode 2 — Real-Time Game**
- **Modal awal dapat diatur** (tombol ↻ untuk mulai ulang), ekspor CSV riwayat.
- Indikator lama diganti nama menjadi **Proporsi Taruhan** (taruhan ÷ modal), ditambah **peluang bangkrut eksak** untuk 100 dan 1.000 ronde ke depan.

**Mode 3 — Replikasi Massal (baru)**
- Sampai 200.000 sesi di **Web Worker** (halaman tidak macet, ada tombol batal).
- Tabel ringkasan: rentang **Wilson** (proporsi) dan **bootstrap** (HE gabungan), VaR/CVaR kerugian, uji z terhadap nilai eksak/teoretis.
- Tiga grafik: sebaran HE per sesi, sebaran ronde hingga bangkrut, dan kurva peluang bangkrut vs horizon (simulasi vs eksak).
- Estimator **gabungan** (Σ kerugian / Σ turnover) dibandingkan dengan rata-rata per sesi (bias ke atas lewat ketaksamaan Jensen).
- Ekspor CSV per sesi dan ringkasan.

## ⚙️ Asumsi dan Matematika

- Taruhan even-money pada **MERAH**: Red = {1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36}. Angka hitam, 0, dan 00 kalah (kecuali 0 pada La Partage: kembali setengah taruhan).
- Taruhan = min(taruhan strategi, batas meja, sisa modal). Bangkrut jika modal < taruhan dasar.
- *House Edge* = (Modal Awal − Modal Akhir) / total turnover × 100%. Satu sesi hanya satu pengamatan acak; estimasi akurat memakai banyak sesi dengan estimator gabungan.
- **Solusi eksak (strategi flat):** peluang bangkrut dalam N ronde dihitung lewat rekursi peluang per tingkat modal (`exactRuin`), dan lama permainan tanpa batas lewat identitas Wald: K/|μ|, yaitu 3.700 ronde untuk K = 100 unit.

## 📊 Contoh Hasil (dapat direproduksi)

`node sim_roulette.js --rng=seed --seed=roulette-montecarlo-2026` menghasilkan `results.json` berikut (sama persis di setiap mesin):

| Pengukuran | Simulasi | Teori/eksak |
|---|---|---|
| Sesi bangkrut (10.000 sesi) | 97,81% | 97,95% (eksak, z = −0,96) |
| Median ronde hingga bangkrut | 3.068 | 3.086 (eksak) |
| *House Edge* gabungan | 2,70% [bootstrap 2,67 – 2,74] | 2,70% |
| *House Edge* per sesi (rata-rata) | 3,69% | bias karena Jensen |
| Chi-square keseragaman (1 juta) | χ² = 33,93, p = 0,567 | — |
| Uji runs / lag-1 / serial | p = 0,498 / 0,106 / 0,242 | tidak ada bukti ketergantungan |

Dengan seed `demo-1` dan parameter bawaan, Mode 1 selalu menghasilkan 3.780 ronde, 1.840 menang, 1.940 kalah, HE 2,65%. Tanpa seed, angka berbeda setiap kali karena `Math.random()` tidak dapat diberi seed. Contoh di artikel (8.810 ronde, HE 1,14%) adalah satu sesi acak tanpa seed.

## 🧮 Simulasi Massal Node.js (`sim_roulette.js`)

```
node sim_roulette.js                                   # Math.random (default)
node sim_roulette.js --rng=seed --seed=abc             # dapat diulang persis
node sim_roulette.js --rng=crypto
node sim_roulette.js --quick                           # ukuran ~10x lebih kecil
node sim_roulette.js --rule=american --sessions=20000  # opsi: --rule --modal --bet --n --sessions --boot --out
```

Eksperimen: **E2** replikasi sesi, **E3** konvergensi tanpa batas kebangkrutan, **E4** uji keseragaman, **E5** pembanding gambler's ruin, **E6** perbandingan strategi (+ VaR/CVaR), **E7** perbandingan aturan roda, **E8** uji independensi (runs, autokorelasi lag-1, serial). Data mentah disimpan ke `results.json`.

## ✅ Tes Otomatis

```
node test.js
```

26 tes (deterministik, ber-seed), termasuk: kecocokan teorema waktu tumbukan (`hittingTimeLaw`, lama sesi untuk modal besar) dengan rekursi eksak, RTP simulasi dalam ±3 SE dari teori untuk semua aturan, kecocokan rekursi eksak dengan enumerasi naif dan dengan angka 4,95% / 76,2% / 97,95%, kepatuhan batas meja, pola taruhan tiap strategi, serta uji independensi yang terbukti mampu mendeteksi generator buruk. Dijalankan otomatis di GitHub Actions (`.github/workflows/test.yml`).

## 📂 Struktur Repositori

```
├── index.html          # Aplikasi web: Mode 1, 2, 3 (UI, Chart.js, Web Worker)
├── roulette-core.js    # Inti simulasi bersama (web, worker, Node.js): PRNG, aturan, strategi, solusi eksak, statistik
├── sim_roulette.js     # Simulasi massal Node.js (E1–E8)
├── test.js             # Tes otomatis
├── results.json        # Hasil contoh ber-seed (reproduksibel)
├── CITATION.cff, .zenodo.json   # Metadata sitasi dan arsip DOI
└── .github/workflows/test.yml   # CI
```

## 🧪 Menjalankan Lokal

1. `git clone https://github.com/Magentakey/roulette-montecarlo-simulation.git`
2. Klik ganda `index.html` (tanpa server; internet hanya untuk memuat Chart.js dari CDN). Web Worker dibuat dari Blob sehingga tetap jalan lewat `file://`.
3. Opsional: `node test.js` dan `node sim_roulette.js` (Node.js ≥ 16, tanpa library tambahan).

## 📦 Arsip dan Cara Mengutip

Rilis **v2.0.1** diarsipkan di Zenodo: https://doi.org/10.5281/zenodo.23825714

DOI konsep (selalu mengarah ke versi terbaru): https://doi.org/10.5281/zenodo.23676479. Badge di atas memakai DOI konsep; untuk mengutip versi yang persis sama dengan artikel, pakai DOI versi di bawah.

> Sunarto, R. (2026). *Simulasi Numerik Monte Carlo untuk Estimasi Probabilitas Kemenangan dan House Edge pada Roulette* (v2.0.1) [Perangkat lunak]. Zenodo. https://doi.org/10.5281/zenodo.23825714

Metadata sitasi otomatis tersedia di `CITATION.cff` (tombol "Cite this repository" di GitHub).

## ⚠️ Keterbatasan

- Taruhan hanya pada merah (even-money); roda dianggap ideal dan putaran independen (diuji untuk generator, tidak untuk roda fisik).
- Solusi eksak hanya untuk strategi flat; strategi progresif dibandingkan secara simulasi (estimator gabungan tetap konsisten dengan HE teoretis).
- `Math.random()` non-kriptografis dan tanpa seed; gunakan opsi sfc32 untuk reprodusibilitas.
- Uang bersifat ilustratif, bukan uang sungguhan.

## 📖 Referensi

1. Georgiev, S., & Todorov, V. (2023). *Efficient Monte Carlo Methods for Multidimensional Modeling of Slot Machines Jackpot*. Mathematics, 11(2), 266. https://doi.org/10.3390/math11020266
2. Sarnecki, M. (2026). *Comparison of the effectiveness of roulette betting strategies using Monte Carlo simulation*. Journal of Computer Sciences Institute, 40, 232–238. https://doi.org/10.35784/jcsi.9728
3. Small, M., & Tse, C. K. (2012). *Predicting the outcome of roulette*. Chaos, 22(3), 033150. https://doi.org/10.1063/1.4753920
4. Feller, W. (1968). *An Introduction to Probability Theory and Its Applications, Vol. I* (3rd ed.). Wiley.

## 📝 Lisensi

Dikembangkan untuk Tugas Mandiri Karya Tulis Ilmiah (Tema 10: Metode Numerik). Dirilis di bawah **MIT License** (lihat `LICENSE`).
