-- =========================================================
-- KEUANGANKU — Skema database Supabase
-- Jalankan seluruh isi file ini di:
-- Supabase Dashboard > SQL Editor > New query > Run
-- =========================================================

-- Pastikan ekstensi UUID tersedia
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------
-- TABEL: categories
-- ---------------------------------------------------------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (type in ('income', 'expense')),
  color text not null default '#c9a24b',
  created_at timestamptz not null default now()
);

alter table public.categories enable row level security;

drop policy if exists "categories_select_own" on public.categories;
create policy "categories_select_own" on public.categories
  for select using (auth.uid() = user_id);

drop policy if exists "categories_insert_own" on public.categories;
create policy "categories_insert_own" on public.categories
  for insert with check (auth.uid() = user_id);

drop policy if exists "categories_update_own" on public.categories;
create policy "categories_update_own" on public.categories
  for update using (auth.uid() = user_id);

drop policy if exists "categories_delete_own" on public.categories;
create policy "categories_delete_own" on public.categories
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------
-- TABEL: transactions
-- ---------------------------------------------------------
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  type text not null check (type in ('income', 'expense')),
  amount numeric(14, 2) not null check (amount > 0),
  description text,
  transaction_date date not null default current_date,
  income_period text,
  created_at timestamptz not null default now()
);

-- Kolom income_period: menandai pemasukan dialokasikan untuk periode apa
-- (harian/mingguan/bulanan/tahunan). Hanya relevan untuk type = 'income'.
alter table public.transactions
  add column if not exists income_period text;

alter table public.transactions
  drop constraint if exists chk_income_period;

alter table public.transactions
  add constraint chk_income_period
  check (income_period is null or income_period in ('harian', 'mingguan', 'bulanan', 'tahunan'));

create index if not exists idx_transactions_user_date
  on public.transactions (user_id, transaction_date desc);

alter table public.transactions enable row level security;

drop policy if exists "transactions_select_own" on public.transactions;
create policy "transactions_select_own" on public.transactions
  for select using (auth.uid() = user_id);

drop policy if exists "transactions_insert_own" on public.transactions;
create policy "transactions_insert_own" on public.transactions
  for insert with check (auth.uid() = user_id);

drop policy if exists "transactions_update_own" on public.transactions;
create policy "transactions_update_own" on public.transactions
  for update using (auth.uid() = user_id);

drop policy if exists "transactions_delete_own" on public.transactions;
create policy "transactions_delete_own" on public.transactions
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------
-- TABEL: budgets (anggaran bulanan per kategori)
-- ---------------------------------------------------------
create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  amount numeric(14, 2) not null check (amount > 0),
  month int not null check (month between 1 and 12),
  year int not null check (year between 2000 and 2100),
  created_at timestamptz not null default now(),
  unique (user_id, category_id, month, year)
);

alter table public.budgets enable row level security;

drop policy if exists "budgets_select_own" on public.budgets;
create policy "budgets_select_own" on public.budgets
  for select using (auth.uid() = user_id);

drop policy if exists "budgets_insert_own" on public.budgets;
create policy "budgets_insert_own" on public.budgets
  for insert with check (auth.uid() = user_id);

drop policy if exists "budgets_update_own" on public.budgets;
create policy "budgets_update_own" on public.budgets
  for update using (auth.uid() = user_id);

drop policy if exists "budgets_delete_own" on public.budgets;
create policy "budgets_delete_own" on public.budgets
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------
-- TABEL: savings (tabungan)
-- Menyimpan riwayat dana yang masuk/keluar dari "tabungan":
--   type = 'auto'        -> hasil sisa alokasi periode yang otomatis
--                            dipindahkan saat hari/minggu/bulan/tahun berganti
--   type = 'manual_in'   -> setoran manual oleh pengguna
--   type = 'manual_out'  -> penarikan manual oleh pengguna
-- ---------------------------------------------------------
create table if not exists public.savings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(14, 2) not null check (amount > 0),
  type text not null check (type in ('auto', 'manual_in', 'manual_out')),
  source_period_type text check (source_period_type is null or source_period_type in ('harian', 'mingguan', 'bulanan', 'tahunan')),
  period_label text,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_savings_user
  on public.savings (user_id, created_at desc);

alter table public.savings enable row level security;

drop policy if exists "savings_select_own" on public.savings;
create policy "savings_select_own" on public.savings
  for select using (auth.uid() = user_id);

drop policy if exists "savings_insert_own" on public.savings;
create policy "savings_insert_own" on public.savings
  for insert with check (auth.uid() = user_id);

drop policy if exists "savings_update_own" on public.savings;
create policy "savings_update_own" on public.savings
  for update using (auth.uid() = user_id);

drop policy if exists "savings_delete_own" on public.savings;
create policy "savings_delete_own" on public.savings
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------
-- TABEL: period_trackers
-- Menyimpan "periode terakhir yang tercatat" per jenis periode,
-- dipakai aplikasi untuk mendeteksi kapan hari/minggu/bulan/tahun
-- berganti sehingga sisa saldo periode itu bisa dipindah ke tabungan.
-- ---------------------------------------------------------
create table if not exists public.period_trackers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_type text not null check (period_type in ('harian', 'mingguan', 'bulanan', 'tahunan')),
  last_period_key text not null,
  updated_at timestamptz not null default now(),
  unique (user_id, period_type)
);

alter table public.period_trackers enable row level security;

drop policy if exists "period_trackers_select_own" on public.period_trackers;
create policy "period_trackers_select_own" on public.period_trackers
  for select using (auth.uid() = user_id);

drop policy if exists "period_trackers_insert_own" on public.period_trackers;
create policy "period_trackers_insert_own" on public.period_trackers
  for insert with check (auth.uid() = user_id);

drop policy if exists "period_trackers_update_own" on public.period_trackers;
create policy "period_trackers_update_own" on public.period_trackers
  for update using (auth.uid() = user_id);

drop policy if exists "period_trackers_delete_own" on public.period_trackers;
create policy "period_trackers_delete_own" on public.period_trackers
  for delete using (auth.uid() = user_id);