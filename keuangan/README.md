    # KeuanganKu — Aplikasi Keuangan Interaktif (Supabase)

Aplikasi pencatatan keuangan pribadi: transaksi, kategori, dan anggaran bulanan,
terhubung langsung ke Supabase. Struktur file dipisah sesuai permintaan:

```
finance-app/
├── index.html          -> Halaman login & register
├── dashboard.html       -> Halaman utama aplikasi
├── database.sql         -> Skema database + RLS untuk Supabase
├── css/
│   └── style.css        -> Semua styling
└── js/
    ├── supabase-config.js -> Konfigurasi koneksi Supabase
    ├── auth.js             -> Logika login/register
    └── dashboard.js        -> Logika CRUD & grafik dashboard
```

## Langkah setup

### 1. Buat project Supabase
1. Buka https://supabase.com dan buat project baru (gratis).
2. Setelah project siap, buka **Project Settings > API**.
3. Salin **Project URL** dan **anon public key**.

### 2. Buat tabel database
1. Buka **SQL Editor** di dashboard Supabase.
2. Buka file `database.sql`, salin semua isinya, tempel ke SQL Editor, lalu klik **Run**.
3. Ini akan membuat tabel `categories`, `transactions`, `budgets`, sekaligus
   mengaktifkan **Row Level Security (RLS)** sehingga setiap pengguna hanya
   bisa melihat dan mengubah datanya sendiri.

### 3. Aktifkan Auth Email
Secara default Supabase Auth dengan email/password sudah aktif. Jika ingin
menonaktifkan verifikasi email agar user langsung bisa login setelah daftar
(cocok untuk testing): **Authentication > Providers > Email > Confirm email > matikan**.

### 4. Hubungkan aplikasi ke project-mu
Buka `js/supabase-config.js`, ganti dua baris ini dengan milikmu:

```js
const SUPABASE_URL = "https://xxxxxxxxxxxxxxxxxxxx.supabase.co";
const SUPABASE_ANON_KEY = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
```

### 5. Jalankan aplikasi
Karena aplikasi ini murni HTML/CSS/JS (tanpa build step), kamu bisa:
- Buka `index.html` langsung di browser, **atau**
- Jalankan local server sederhana agar lebih stabil, contoh:
  ```
  npx serve .
  ```
  lalu buka `http://localhost:3000`.

Untuk hosting gratis: Netlify, Vercel, atau GitHub Pages — cukup upload folder ini.

## Fitur

- **Autentikasi**: daftar & masuk dengan email/password (Supabase Auth).
- **Dashboard ringkasan**: saldo, total pemasukan, total pengeluaran per bulan.
- **Grafik**: diagram donat pemasukan vs pengeluaran, dan bar chart pengeluaran per kategori (Chart.js).
- **Transaksi**: tambah/ubah/hapus, dengan filter jenis, kategori, dan bulan.
- **Kategori**: buat kategori pemasukan/pengeluaran dengan warna kustom.
- **Anggaran**: tetapkan batas pengeluaran per kategori per bulan, dengan progress bar (berubah merah jika melebihi batas).

## Catatan keamanan

Data setiap pengguna terisolasi lewat **Row Level Security** di Supabase —
query di frontend menggunakan `anon key` yang aman untuk dipakai di sisi klien,
karena akses data tetap dibatasi oleh kebijakan RLS berdasarkan `auth.uid()`.