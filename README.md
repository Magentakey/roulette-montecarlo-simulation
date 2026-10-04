# 🎰 Simulasi Numerik Monte Carlo: European Roulette

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Chart.js](https://img.shields.io/badge/Chart.js-FF6384?style=for-the-badge&logo=chartdotjs&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)

Aplikasi berbasis web untuk memodelkan dan mengevaluasi distribusi probabilitas, risiko kebangkrutan (*Ruin Risk*), serta konvergensi persentase keunggulan kasino (*House Edge*) pada permainan **European Roulette** menggunakan metode komputasional **Simulasi Monte Carlo**.

🔗 **Demo (GitHub Pages):** https://magentakey.github.io/roulette-montecarlo-simulation/

---

## 📌 Deskripsi Penelitian & Latar Belakang

Permainan *European Roulette* secara teoretis memiliki nilai ekspektasi negatif bagi pemain karena keberadaan angka nol tunggal ($0$ hijau). Pada taruhan *even-money* (merah/hitam), peluang menang hanya $\frac{18}{37} \approx 48{,}65\%$ sehingga kasino memperoleh keunggulan sistemik (*House Edge*) sebesar **2,70%** ($\frac{1}{37} \times 100\%$).

Aplikasi ini dikembangkan untuk menunjukkan secara empiris **Hukum Bilangan Besar (*Law of Large Numbers*)**:

> Meskipun potongan bandar kecil pada setiap taruhan, pengulangan taruhan dalam jumlah besar membuat hasil empiris mendekati nilai teoretis dan, pada strategi taruhan datar, menguras modal pemain. Pada simulasi 10.000 sesi (modal $1000, taruhan $10, maksimum 10.000 ronde), 98,06% sesi berakhir bangkrut dengan median sekitar 3.062 ronde.

---

## 🚀 Fitur Utama Aplikasi

Aplikasi (`index.html`) menyediakan dua mode simulasi interaktif:

### 1. ⚡ Mode 1: Simulasi Instan Monte Carlo

* **Pengujian jumlah putaran besar:** perulangan hingga N putaran (default 10.000) dalam hitungan milidetik; simulasi berhenti lebih awal jika modal < taruhan.
* **Parameter yang dapat diatur:** Modal Awal, Taruhan per Ronde, dan Total Target Putaran (N).
* **Keluaran:** Total Ronde Berjalan, *Total Win*, *Total Lose*, Modal Akhir, dan *Calculated House Edge*.
* **Grafik kartesius:** kurva fluktuasi modal (*Equity Curve*) berbasis *Chart.js*, diambil dari sekitar 100 titik sampel (satu titik tiap N/100 putaran) agar efisien, sehingga titik terakhir grafik bisa belum menunjukkan modal akhir yang sebenarnya jika simulasi berhenti di antara dua titik sampel.

### 2. 🎮 Mode 2: Mode Interaktif / Real-Time Game

* **Modal awal konstan:** `MODE2_MODAL_AWAL = 250` (nilai tetap di kode). Nilainya ditampilkan pada panel Mode 2 dan pada detail *Status Ronde Terakhir* sebagai **Modal Awal (Konstan)**; titik awal grafik juga memakai konstanta ini.
* **Papan angka:** sorotan (*highlight*) angka keluar secara dinamis pada papan 0–36 beserta lingkaran angka terakhir.
* **Detail status ronde:** angka keluar, hasil ronde, total ronde, total *Win*, total *Lose*, **selisih modal terhadap modal awal**, dan indikator risiko.
* **Indikator risiko:** berdasarkan rasio taruhan terhadap sisa modal (≤10% = Sangat Rendah, 10–20% = Sedang, >20% = Tinggi). Ini indikator proporsi taruhan, bukan peluang bangkrut yang sebenarnya.
* **Grafik dinamis:** pergerakan modal diperbarui setiap putaran.

---

## ⚙️ Asumsi & Algoritma Matematika

### 1. Asumsi Taruhan

* Pemain selalu memasang taruhan *even-money* pada warna **MERAH**, dengan besar taruhan tetap (*flat betting*).
* Himpunan angka pemenang (18 angka):

  $$\text{Red} = \lbrace 1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36 \rbrace$$

* Angka **hitam** (18 angka) dan **hijau** ($0$) dianggap kekalahan.
* Angka acak dibangkitkan dengan `Math.floor(Math.random() * 37)`.

### 2. Rumus *House Edge*

*House Edge* dihitung dari total volume taruhan (*turnover*), bukan dari modal awal:

$$\text{House Edge (\%)} = \left( \frac{\text{Modal Awal} - \text{Modal Akhir}}{\text{Total Ronde} \times \text{Taruhan per Ronde}} \right) \times 100\%$$

> ⚠️ Nilai ini adalah estimasi dari **satu sesi**. Variansi antar sesi besar (galat baku ≈ $1/\sqrt{N}$), sehingga satu sesi bisa jauh dari 2,70%. Estimasi yang akurat memerlukan banyak sesi atau banyak ronde (lihat bagian *Simulasi Massal*).

---

## 📊 Contoh Hasil

| Pengujian | Hasil |
|---|---|
| Mode 1, satu sesi (modal $1000, taruhan $10, N = 10.000) | 9.794 ronde, 4.847 menang, 4.947 kalah, modal akhir $0, *House Edge* 1,02% |
| Mode 2, satu sesi (modal awal konstan $250) | 340 ronde, 174 menang, 166 kalah, modal akhir $330 (selisih +$80) |
| 10.000 sesi dengan logika Mode 1 | 98,06% bangkrut; median 3.062 ronde; *House Edge* gabungan 2,73% |
| Galat *House Edge* tanpa batas kebangkrutan | ±10% (N = 100) menyusut menjadi ±0,1% (N = 1.000.000) |
| Uji *chi-square* keseragaman `Math.random()` (1.000.000 putaran) | χ² = 23,52 (df 36), p = 0,946 |

Angka pada simulasi massal akan sedikit berbeda setiap dijalankan karena `Math.random()` tidak dapat diberi *seed*.

---

## 🧮 Simulasi Massal (`sim_roulette.js`)

Skrip Node.js ini menjalankan logika yang setara dengan Mode 1 berulang kali dan mencetak ringkasan ke terminal:

* **E2:** 10.000 sesi dengan parameter Mode 1 (persentase bangkrut, median ronde, *House Edge* per sesi dan gabungan).
* **E3:** konvergensi *House Edge* tanpa batas kebangkrutan pada N = 10², …, 10⁶.
* **E4:** uji *chi-square* keseragaman generator angka acak.

```bash
node sim_roulette.js
```

Perlu Node.js (tanpa library tambahan). Data mentah disimpan ke `results.json`. Untuk memakai aplikasi web (`index.html`) tidak diperlukan Node.js.

---

## 💻 Teknologi yang Digunakan

* **Frontend:** HTML5, CSS3 (*Modern Dark Slate Contrast Theme*)
* **Bahasa Pemrograman:** JavaScript (ES6+)
* **Visualisasi Data:** Chart.js (CDN)
* **Simulasi massal:** Node.js
* **Hosting:** GitHub Pages

---

## 📂 Struktur Repositori

```text
├── index.html          # Aplikasi web (UI, logika Monte Carlo Mode 1 & 2, Chart.js)
├── sim_roulette.js     # Simulasi massal Node.js (10.000 sesi, konvergensi, uji chi-square)
├── LICENSE             # Lisensi MIT
└── README.md           # Dokumentasi proyek
```

---

## 🧪 Cara Menjalankan Proyek Secara Lokal

1. **Clone repositori:**

   ```bash
   git clone https://github.com/Magentakey/roulette-montecarlo-simulation.git
   cd roulette-montecarlo-simulation
   ```

2. **Aplikasi web:** klik ganda `index.html` untuk membukanya di *browser* (Chrome, Edge, Firefox, atau Safari). Tidak perlu server; koneksi internet dibutuhkan hanya untuk memuat Chart.js dari CDN.

3. **Simulasi massal (opsional):** `node sim_roulette.js`

---

## ⚠️ Keterbatasan

* Hanya strategi taruhan datar pada warna merah yang diuji; strategi progresif (*Martingale*, dll.) belum diimplementasikan.
* Roda dianggap ideal (tanpa bias fisik) dan putaran saling bebas.
* `Math.random()` adalah generator pseudo-acak non-kriptografis tanpa *seed*.
* Mode 1 dan Mode 2 di aplikasi masing-masing menjalankan satu sesi; replikasi massal hanya tersedia lewat `sim_roulette.js`.
* Uang pada simulasi bersifat ilustratif, bukan uang sungguhan.

---

## 📖 Referensi Literatur Utama (Tinjauan Pustaka)

1. **Georgiev, S., & Todorov, V. (2023).** *Efficient Monte Carlo Methods for Multidimensional Modeling of Slot Machines Jackpot*. Mathematics (MDPI), 11(2), 266. https://doi.org/10.3390/math11020266
2. **Sarnecki, M. (2026).** *Comparison of the effectiveness of roulette betting strategies using Monte Carlo simulation*. Journal of Computer Sciences Institute, 40, 232–238. https://doi.org/10.35784/jcsi.9728
3. **Small, M., & Tse, C. K. (2012).** *Predicting the outcome of roulette*. Chaos: An Interdisciplinary Journal of Nonlinear Science, 22(3), 033108. https://doi.org/10.1063/1.4728526

---

## 📝 Lisensi

Proyek ini dikembangkan untuk memenuhi Tugas Mandiri Karya Tulis Ilmiah (Tema 10: Metode Numerik). Dirilis di bawah **MIT License** (lihat berkas `LICENSE`); bebas digunakan dan dimodifikasi untuk kepentingan akademis dan pembelajaran.
