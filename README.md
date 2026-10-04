# 🎰 Simulasi Numerik Monte Carlo: European Roulette

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Chart.js](https://img.shields.io/badge/Chart.js-FF6384?style=for-the-badge&logo=chartdotjs&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)

Aplikasi berbasis web untuk memodelkan dan mengevaluasi distribusi probabilitas, risiko kebangkrutan (*Ruin Risk*), serta konvergensi persentase keunggulan kasino (*House Edge*) pada permainan **European Roulette** menggunakan metode komputasional **Simulasi Monte Carlo**.

---

## 📌 Deskripsi Penelitian & Latar Belakang

Perjudian *European Roulette* secara teoretis memiliki nilai ekspektasi negatif bagi pemain karena keberadaan angka nol tunggal ($0$ hijau), yang menciptakan keunggulan sistemik bagi kasino (*House Edge*) sebesar **2,70%** ($\frac{1}{37} \times 100\%$).

Aplikasi ini dikembangkan untuk membuktikan secara empiris **Hukum Bilangan Besar (*Law of Large Numbers*)**:

> *"Meskipun potongan bandar tergolong kecil pada setiap transaksi individu, pengulangan taruhan dalam skala sampel masif ($N \ge 10.000$) secara pasti akan mengikis modal pemain hingga mengalami kebangkrutan total."*

---

## 🚀 Fitur Utama Aplikasi

Aplikasi ini menyediakan dua mode simulasi komputasional interaktif:

### 1. ⚡ Mode 1: Simulasi Instan Monte Carlo ($N \le 10.000$)

* **Pengujian Skala Masif:** Eksekusi perulangan numerik hingga 10.000 putaran dalam hitungan milidetik.
* **Evaluasi Parameter Finansial:** Menghitung total ronde berjalan, *Total Win*, *Total Lose*, Sisa Modal Akhir, dan kalkulasi empiris *House Edge*.
* **Grafik Kartesius Real-time:** Visualisasi kurva fluktuasi modal (*Equity Curve*) berbasis *Chart.js*.

### 2. 🎮 Mode 2: Mode Interaktif / Real-Time Game

* **Visualisasi Papan Roulette:** Sorotan (*highlight*) angka keluar secara dinamis pada papan angka $0$–$36$.
* **Monitoring Risiko Kebangkrutan:** Indikator rasio ukuran taruhan terhadap sisa modal pemain secara *real-time*.
* **Histori Transaksi:** Pencatatan performa ronde demi ronde secara mendetail.

---

## ⚙️ Asumsi & Algoritma Matematika

### 1. Catatan Asumsi Taruhan

* Pemain secara konsisten mengambil pilihan taruhan *Even-Money* pada warna **MERAH**.
* Himpunan angka pemenang warna **MERAH** (18 angka):

  $$\text{Red} = \lbrace 1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36 \rbrace$$

* Himpunan angka **HITAM** (18 angka) dan **HIJAU** ($0$) dianggap sebagai kekalahan bagi pemain.

### 2. Rumus Kalkulasi House Edge

*House Edge* dihitung dari total volume taruhan (*turnover* / *handle*) yang berputar di meja, bukan sekadar persentase modal awal:

$$\text{House Edge (\%)} = \left( \frac{\text{Modal Awal} - \text{Modal Akhir}}{\text{Total Ronde} \times \text{Taruhan per Ronde}} \right) \times 100\%$$

---

## 💻 Teknologi yang Digunakan

* **Frontend:** HTML5, CSS3 (Modern Dark Slate Contrast Theme)
* **Bahasa Pemrograman:** JavaScript (ES6+)
* **Visualisasi Data:** Chart.js (CDN)
* **Hosting:** GitHub Pages

---

## 📂 Struktur Repositori

```text
├── index.html        # Kode sumber utama aplikasi (UI, logika Monte Carlo & Chart.js)
└── README.md         # Dokumentasi resmi proyek
```

---

## 🧪 Cara Menjalankan Proyek Secara Lokal

1. **Clone repositori ini:**

   ```bash
   git clone https://github.com/username/roulette-montecarlo-simulation.git
   ```

2. **Buka aplikasi:**

   Tidak memerlukan *environment* atau *server* tambahan. Cukup klik ganda (*double-click*) file `index.html` untuk membukanya langsung di *browser* favoritmu (Chrome, Edge, Firefox, atau Safari).

---

## 📖 Referensi Literatur Utama (Tinjauan Pustaka)

1. **Small, M., & Tse, C. K. (2012).** *Predicting the outcome of roulette*. Chaos: An Interdisciplinary Journal of Nonlinear Science, 22(3).
2. **Sarnecki, M. (2026).** *Comparison of the effectiveness of roulette betting strategies using Monte Carlo simulation*. Journal of Computer Sciences Institute, 40, 232–238.
3. **Georgiev, S., & Todorov, V. (2023).** *Efficient Monte Carlo Methods for Multidimensional Modeling of Slot Machines Jackpot*. Mathematics (MDPI), 11(2), 266.

---

## 📝 Lisensi

Proyek ini dikembangkan untuk memenuhi Tugas Mandiri Karya Tulis Ilmiah (Tema 10: Metode Numerik). Bebas digunakan dan dimodifikasi untuk kepentingan akademis dan pembelajaran (*Open Source under MIT License*).
