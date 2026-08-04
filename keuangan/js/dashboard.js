/* =========================================================
   DASHBOARD.JS — Logika utama aplikasi KeuanganKu
   Dipakai oleh dashboard.html
   ========================================================= */

let currentUser = null;
let categories = [];
let transactions = [];
let budgets = [];
let savings = [];
let periodTrackers = [];
let pieChart = null;
let barChart = null;

const PERIOD_TYPES = ["harian", "mingguan", "bulanan", "tahunan"];
const PERIOD_SUFFIX = { harian: "Day", mingguan: "Week", bulanan: "Month", tahunan: "Year" };
const PERIOD_LABEL_ID = { harian: "Harian", mingguan: "Mingguan", bulanan: "Bulanan", tahunan: "Tahunan" };

const rupiah = (n) =>
  "Rp " + Math.round(n).toLocaleString("id-ID", { maximumFractionDigits: 0 });

function pad2(n) {
  return String(n).padStart(2, "0");
}

// Parsing tanggal "YYYY-MM-DD" sebagai tanggal LOKAL (hindari pergeseran zona waktu)
function parseDateLocal(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function dateKey(d) {
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}

function todayMonthValue() {
  const d = new Date();
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1);
}

/* ---------------------------------------------------------
   PERIODE: harian / mingguan / bulanan / tahunan
   Dipakai untuk matriks ringkasan & deteksi pergantian periode
   --------------------------------------------------------- */

// Nomor minggu ISO-8601 (Senin sebagai awal minggu)
function getISOWeek(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((date - firstThursday) / (7 * 24 * 3600 * 1000));
  return { isoYear: date.getUTCFullYear(), week };
}

function periodKey(type, date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (type === "harian") return dateKey(d);
  if (type === "mingguan") {
    const { isoYear, week } = getISOWeek(d);
    return isoYear + "-W" + pad2(week);
  }
  if (type === "bulanan") return d.getFullYear() + "-" + pad2(d.getMonth() + 1);
  if (type === "tahunan") return String(d.getFullYear());
}

// Mengembalikan { start, end } (Date, inklusif) dari sebuah period key
function periodWindow(type, key) {
  if (type === "harian") {
    const d = parseDateLocal(key);
    return { start: d, end: d };
  }
  if (type === "mingguan") {
    const [yearStr, weekStr] = key.split("-W");
    const year = Number(yearStr);
    const week = Number(weekStr);
    const jan4 = new Date(year, 0, 4);
    const jan4Day = (jan4.getDay() + 6) % 7;
    const mondayWeek1 = new Date(jan4);
    mondayWeek1.setDate(jan4.getDate() - jan4Day);
    const start = new Date(mondayWeek1);
    start.setDate(mondayWeek1.getDate() + (week - 1) * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start, end };
  }
  if (type === "bulanan") {
    const [y, m] = key.split("-").map(Number);
    return { start: new Date(y, m - 1, 1), end: new Date(y, m, 0) };
  }
  if (type === "tahunan") {
    const y = Number(key);
    return { start: new Date(y, 0, 1), end: new Date(y, 11, 31) };
  }
}

function inWindow(dateStr, start, end) {
  const d = parseDateLocal(dateStr);
  return d >= start && d <= end;
}

// Total transaksi (income/expense) dalam rentang waktu, tanpa memandang income_period
function sumInWindow(list, txType, start, end) {
  return list
    .filter((t) => t.type === txType && inWindow(t.transaction_date, start, end))
    .reduce((s, t) => s + Number(t.amount), 0);
}

// Total pemasukan yang dialokasikan khusus untuk periode tertentu (harian/mingguan/dst)
function sumAllocatedIncome(list, periodType, start, end) {
  return list
    .filter((t) => t.type === "income" && t.income_period === periodType && inWindow(t.transaction_date, start, end))
    .reduce((s, t) => s + Number(t.amount), 0);
}

/* ---------------------------------------------------------
   INISIALISASI
   --------------------------------------------------------- */
async function init() {
  const { data } = await supabaseClient.auth.getSession();
  if (!data.session) {
    window.location.href = "index.html";
    return;
  }
  currentUser = data.session.user;
  document.getElementById("userEmail").textContent = currentUser.email;

  const currentMonth = todayMonthValue();
  document.getElementById("overviewMonth").value = currentMonth;
  document.getElementById("dailyHistoryMonth").value = currentMonth;
  document.getElementById("filterMonth").value = currentMonth;
  document.getElementById("budgetMonth").value = currentMonth;
  document.getElementById("txDate").valueAsDate = new Date();

  await loadCategories();
  await loadTransactions();
  await loadBudgets();
  await loadPeriodTrackers();
  await checkAndProcessRollovers();
  await loadSavings();

  renderAll();
  setupEventListeners();
}

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  window.location.href = "index.html";
});

/* ---------------------------------------------------------
   TOAST
   --------------------------------------------------------- */
function toast(msg, type = "ok") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = "toast show " + type;
  setTimeout(() => (el.className = "toast"), 2600);
}

/* ---------------------------------------------------------
   TABS
   --------------------------------------------------------- */
function setupEventListeners() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
    });
  });

  document.getElementById("overviewMonth").addEventListener("change", renderOverview);
  document.getElementById("dailyHistoryMonth").addEventListener("change", renderDailyHistory);
  document.getElementById("filterMonth").addEventListener("change", renderTxTable);
  document.getElementById("filterType").addEventListener("change", renderTxTable);
  document.getElementById("filterCategory").addEventListener("change", renderTxTable);
  document.getElementById("budgetMonth").addEventListener("change", async () => {
    await loadBudgets();
    renderBudgets();
  });

  // Modal transaksi
  document.getElementById("openAddTx").addEventListener("click", () => openTxModal());
  document.getElementById("cancelTx").addEventListener("click", () => closeModal("modalTx"));
  document.getElementById("txForm").addEventListener("submit", saveTransaction);
  document.getElementById("txType").addEventListener("change", () => {
    populateTxCategoryOptions();
    toggleIncomePeriodField();
  });

  // Modal kategori
  document.getElementById("openAddCategory").addEventListener("click", () => openModal("modalCategory"));
  document.getElementById("cancelCategory").addEventListener("click", () => closeModal("modalCategory"));
  document.getElementById("categoryForm").addEventListener("submit", saveCategory);

  // Modal anggaran
  document.getElementById("openAddBudget").addEventListener("click", () => openBudgetModal());
  document.getElementById("cancelBudget").addEventListener("click", () => closeModal("modalBudget"));
  document.getElementById("budgetForm").addEventListener("submit", saveBudget);

  // Modal tabungan
  document.getElementById("openAddSavings").addEventListener("click", () => openSavingsModal("manual_in"));
  document.getElementById("openWithdrawSavings").addEventListener("click", () => openSavingsModal("manual_out"));
  document.getElementById("cancelSavings").addEventListener("click", () => closeModal("modalSavings"));
  document.getElementById("savingsForm").addEventListener("submit", saveManualSavings);
}

function openModal(id) {
  document.getElementById(id).classList.add("show");
}
function closeModal(id) {
  document.getElementById(id).classList.remove("show");
}

/* ---------------------------------------------------------
   LOAD DATA DARI SUPABASE
   --------------------------------------------------------- */
async function loadCategories() {
  const { data, error } = await supabaseClient
    .from("categories")
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    toast("Gagal memuat kategori: " + error.message, "error");
    return;
  }
  categories = data || [];
}

async function loadTransactions() {
  const { data, error } = await supabaseClient
    .from("transactions")
    .select("*, categories(name, color)")
    .order("transaction_date", { ascending: false });

  if (error) {
    toast("Gagal memuat transaksi: " + error.message, "error");
    return;
  }
  transactions = data || [];
}

async function loadBudgets() {
  const [year, month] = document.getElementById("budgetMonth").value.split("-").map(Number);
  const { data, error } = await supabaseClient
    .from("budgets")
    .select("*, categories(name, color)")
    .eq("month", month)
    .eq("year", year);

  if (error) {
    toast("Gagal memuat anggaran: " + error.message, "error");
    return;
  }
  budgets = data || [];
}

async function loadSavings() {
  const { data, error } = await supabaseClient
    .from("savings")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    toast("Gagal memuat tabungan: " + error.message, "error");
    return;
  }
  savings = data || [];
}

async function loadPeriodTrackers() {
  const { data, error } = await supabaseClient.from("period_trackers").select("*");
  if (error) {
    toast("Gagal memuat status periode: " + error.message, "error");
    return;
  }
  periodTrackers = data || [];
}

/* ---------------------------------------------------------
   ROLLOVER OTOMATIS KE TABUNGAN
   Dijalankan setiap kali aplikasi dibuka. Untuk tiap jenis
   periode (harian/mingguan/bulanan/tahunan), bandingkan
   periode terakhir yang tercatat dengan periode saat ini.
   Jika sudah berganti, sisa alokasi pemasukan periode LAMA
   (pemasukan bertanda periode itu dikurangi semua pengeluaran
   pada rentang waktu itu) dipindahkan ke tabungan.
   --------------------------------------------------------- */
async function checkAndProcessRollovers() {
  for (const pt of PERIOD_TYPES) {
    const currentKey = periodKey(pt);
    const tracker = periodTrackers.find((t) => t.period_type === pt);

    if (!tracker) {
      // Pertama kali dipakai: hanya catat periode saat ini, belum ada yang dibandingkan
      const { error } = await supabaseClient
        .from("period_trackers")
        .insert({ user_id: currentUser.id, period_type: pt, last_period_key: currentKey });
      if (!error) {
        periodTrackers.push({ period_type: pt, last_period_key: currentKey });
      }
      continue;
    }

    if (tracker.last_period_key !== currentKey) {
      const oldKey = tracker.last_period_key;
      const { start, end } = periodWindow(pt, oldKey);
      const allocatedIncome = sumAllocatedIncome(transactions, pt, start, end);
      const expenseInWindow = sumInWindow(transactions, "expense", start, end);
      const leftover = allocatedIncome - expenseInWindow;

      if (leftover > 0) {
        await supabaseClient.from("savings").insert({
          user_id: currentUser.id,
          amount: leftover,
          type: "auto",
          source_period_type: pt,
          period_label: oldKey,
          note: "Sisa alokasi " + PERIOD_LABEL_ID[pt].toLowerCase() + " (" + oldKey + ")"
        });
      }

      await supabaseClient
        .from("period_trackers")
        .update({ last_period_key: currentKey, updated_at: new Date().toISOString() })
        .eq("user_id", currentUser.id)
        .eq("period_type", pt);

      tracker.last_period_key = currentKey;
    }
  }
}

/* ---------------------------------------------------------
   RENDER SEMUA
   --------------------------------------------------------- */
function renderAll() {
  populateCategoryFilters();
  renderOverview();
  renderTxTable();
  renderCategories();
  renderBudgets();
  renderSavingsTab();
}

function filterByMonth(list, monthValue) {
  if (!monthValue) return list;
  const [y, m] = monthValue.split("-").map(Number);
  return list.filter((t) => {
    const d = parseDateLocal(t.transaction_date);
    return d.getFullYear() === y && d.getMonth() + 1 === m;
  });
}

/* ---------------------------------------------------------
   TAB: RINGKASAN
   --------------------------------------------------------- */
function renderOverview() {
  const monthValue = document.getElementById("overviewMonth").value;
  const monthTx = filterByMonth(transactions, monthValue);

  const income = monthTx.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
  const expense = monthTx.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);

  renderPieChart(income, expense);
  renderBarChart(monthTx);
  renderRecent();
  renderPeriodMatrix();
  renderDailyHistory();
  document.getElementById("sumSavings").textContent = rupiah(computeSavingsTotal());
}

function renderPeriodMatrix() {
  const now = new Date();
  PERIOD_TYPES.forEach((pt) => {
    const key = periodKey(pt, now);
    const { start, end } = periodWindow(pt, key);
    const income = sumInWindow(transactions, "income", start, end);
    const expense = sumInWindow(transactions, "expense", start, end);
    const balance = income - expense;
    const suffix = PERIOD_SUFFIX[pt];

    document.getElementById("matIncome" + suffix).textContent = rupiah(income);
    document.getElementById("matExpense" + suffix).textContent = rupiah(expense);

    const balEl = document.getElementById("matBalance" + suffix);
    balEl.textContent = rupiah(balance);
    balEl.style.color = balance < 0 ? "var(--expense)" : "var(--gold)";
  });
}

/* ---------------------------------------------------------
   RIWAYAT HARIAN
   Rekap pemasukan/pengeluaran/saldo per TANGGAL (bukan cuma
   "hari ini" saja), supaya histori tiap hari tetap tercatat
   dan bisa dilihat kembali kapan saja.
   --------------------------------------------------------- */
function renderDailyHistory() {
  const monthValue = document.getElementById("dailyHistoryMonth").value;
  const monthTx = filterByMonth(transactions, monthValue);
  const wrap = document.getElementById("dailyHistoryList");

  if (monthTx.length === 0) {
    wrap.innerHTML = emptyState("Belum ada transaksi pada bulan ini.");
    return;
  }

  // Kelompokkan berdasarkan tanggal (transaction_date)
  const byDate = {};
  monthTx.forEach((t) => {
    if (!byDate[t.transaction_date]) {
      byDate[t.transaction_date] = { income: 0, expense: 0 };
    }
    if (t.type === "income") byDate[t.transaction_date].income += Number(t.amount);
    else byDate[t.transaction_date].expense += Number(t.amount);
  });

  // Urutkan tanggal terbaru di atas
  const sortedDates = Object.keys(byDate).sort((a, b) => (a < b ? 1 : -1));

  const rows = sortedDates
    .map((dateStr) => {
      const { income, expense } = byDate[dateStr];
      const balance = income - expense;
      const label = parseDateLocal(dateStr).toLocaleDateString("id-ID", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric"
      });

      return `
        <tr>
          <td>${label}</td>
          <td class="amount-income">${income > 0 ? "+ " + rupiah(income) : "—"}</td>
          <td class="amount-expense">${expense > 0 ? "− " + rupiah(expense) : "—"}</td>
          <td class="mono" style="color:${balance < 0 ? "var(--expense)" : "var(--gold)"};">${rupiah(balance)}</td>
        </tr>`;
    })
    .join("");

  wrap.innerHTML = `
    <div class="table-scroll">
      <table class="ledger">
        <thead>
          <tr><th>Tanggal</th><th>Pemasukan</th><th>Pengeluaran</th><th>Saldo hari itu</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderPieChart(income, expense) {
  const ctx = document.getElementById("pieChart");
  if (pieChart) pieChart.destroy();

  if (income === 0 && expense === 0) {
    ctx.getContext("2d").clearRect(0, 0, ctx.width, ctx.height);
    return;
  }

  pieChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Pemasukan", "Pengeluaran"],
      datasets: [{ data: [income, expense], backgroundColor: ["#7fb77e", "#d6725a"], borderWidth: 0 }]
    },
    options: {
      plugins: {
        legend: { labels: { color: "#f0ebdd", font: { family: "Inter" } } }
      },
      maintainAspectRatio: false
    }
  });
}

function renderBarChart(monthTx) {
  const ctx = document.getElementById("barChart");
  if (barChart) barChart.destroy();

  const expenseByCategory = {};
  monthTx
    .filter((t) => t.type === "expense")
    .forEach((t) => {
      const name = t.categories ? t.categories.name : "Tanpa kategori";
      expenseByCategory[name] = (expenseByCategory[name] || 0) + Number(t.amount);
    });

  const labels = Object.keys(expenseByCategory);
  const values = Object.values(expenseByCategory);

  if (labels.length === 0) {
    ctx.getContext("2d").clearRect(0, 0, ctx.width, ctx.height);
    return;
  }

  barChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: "Pengeluaran", data: values, backgroundColor: "#c9a24b", borderRadius: 4 }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#9bafa6" }, grid: { display: false } },
        y: { ticks: { color: "#9bafa6" }, grid: { color: "rgba(240,235,221,0.08)" } }
      },
      maintainAspectRatio: false
    }
  });
}

function renderRecent() {
  const wrap = document.getElementById("recentList");
  const recent = transactions.slice(0, 6);

  if (recent.length === 0) {
    wrap.innerHTML = emptyState("Belum ada transaksi tercatat.");
    return;
  }

  wrap.innerHTML = buildTable(recent, false);
}

/* ---------------------------------------------------------
   TAB: TRANSAKSI
   --------------------------------------------------------- */
function populateCategoryFilters() {
  const filterCat = document.getElementById("filterCategory");
  filterCat.innerHTML = '<option value="">Semua kategori</option>';
  categories.forEach((c) => {
    filterCat.innerHTML += `<option value="${c.id}">${escapeHtml(c.name)}</option>`;
  });
}

function renderTxTable() {
  const type = document.getElementById("filterType").value;
  const categoryId = document.getElementById("filterCategory").value;
  const monthValue = document.getElementById("filterMonth").value;

  let filtered = filterByMonth(transactions, monthValue);
  if (type) filtered = filtered.filter((t) => t.type === type);
  if (categoryId) filtered = filtered.filter((t) => t.category_id === categoryId);

  const wrap = document.getElementById("txTableWrap");
  if (filtered.length === 0) {
    wrap.innerHTML = emptyState("Tidak ada transaksi untuk filter ini.");
    return;
  }
  wrap.innerHTML = buildTable(filtered, true);
}

function buildTable(list, withActions) {
  const rows = list
    .map((t) => {
      const catName = t.categories ? escapeHtml(t.categories.name) : "—";
      const catColor = t.categories ? t.categories.color : "#666";
      const amountClass = t.type === "income" ? "amount-income" : "amount-expense";
      const sign = t.type === "income" ? "+" : "−";
      const date = parseDateLocal(t.transaction_date).toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric"
      });
      const periodBadge =
        t.type === "income" && t.income_period
          ? `<span class="pill income" style="margin-left:6px;">${PERIOD_LABEL_ID[t.income_period]}</span>`
          : "";

      return `
        <tr>
          <td>${date}</td>
          <td>${escapeHtml(t.description || "-")}</td>
          <td><span class="pill ${t.type}"><span class="chip-dot" style="width:7px;height:7px;background:${catColor}"></span>${catName}</span>${periodBadge}</td>
          <td class="${amountClass}">${sign} ${rupiah(t.amount)}</td>
          ${
            withActions
              ? `<td class="row-actions">
                  <button class="icon-btn" onclick="editTransaction('${t.id}')">Ubah</button>
                  <button class="icon-btn" onclick="deleteTransaction('${t.id}')">Hapus</button>
                 </td>`
              : ""
          }
        </tr>`;
    })
    .join("");

  return `
    <div class="table-scroll">
      <table class="ledger">
        <thead>
          <tr>
            <th>Tanggal</th>
            <th>Catatan</th>
            <th>Kategori</th>
            <th>Jumlah</th>
            ${withActions ? "<th>Aksi</th>" : ""}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function emptyState(text) {
  return `<div class="empty-state"><span class="stamp">Buku Kas</span>${text}</div>`;
}

/* ---------------------------------------------------------
   MODAL: TRANSAKSI (tambah/ubah)
   --------------------------------------------------------- */
function populateTxCategoryOptions() {
  const type = document.getElementById("txType").value;
  const select = document.getElementById("txCategory");
  const relevant = categories.filter((c) => c.type === type);

  select.innerHTML = relevant.length
    ? relevant.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("")
    : '<option value="">Belum ada kategori</option>';
}

function toggleIncomePeriodField() {
  const type = document.getElementById("txType").value;
  const field = document.getElementById("txIncomePeriodField");
  field.style.display = type === "income" ? "block" : "none";
  if (type !== "income") {
    document.getElementById("txIncomePeriod").value = "";
  }
}

function openTxModal() {
  document.getElementById("txModalTitle").textContent = "Tambah transaksi";
  document.getElementById("txForm").reset();
  document.getElementById("txId").value = "";
  document.getElementById("txDate").valueAsDate = new Date();
  populateTxCategoryOptions();
  toggleIncomePeriodField();
  openModal("modalTx");
}

window.editTransaction = function (id) {
  const t = transactions.find((x) => x.id === id);
  if (!t) return;

  document.getElementById("txModalTitle").textContent = "Ubah transaksi";
  document.getElementById("txId").value = t.id;
  document.getElementById("txType").value = t.type;
  populateTxCategoryOptions();
  toggleIncomePeriodField();
  document.getElementById("txCategory").value = t.category_id || "";
  document.getElementById("txIncomePeriod").value = t.income_period || "";
  document.getElementById("txAmount").value = t.amount;
  document.getElementById("txDate").value = t.transaction_date;
  document.getElementById("txDescription").value = t.description || "";
  openModal("modalTx");
};

async function saveTransaction(e) {
  e.preventDefault();
  const id = document.getElementById("txId").value;
  const type = document.getElementById("txType").value;

  const payload = {
    user_id: currentUser.id,
    type,
    amount: Number(document.getElementById("txAmount").value),
    transaction_date: document.getElementById("txDate").value,
    category_id: document.getElementById("txCategory").value || null,
    income_period: type === "income" ? (document.getElementById("txIncomePeriod").value || null) : null,
    description: document.getElementById("txDescription").value.trim()
  };

  let error;
  if (id) {
    ({ error } = await supabaseClient.from("transactions").update(payload).eq("id", id));
  } else {
    ({ error } = await supabaseClient.from("transactions").insert(payload));
  }

  if (error) {
    toast("Gagal menyimpan: " + error.message, "error");
    return;
  }

  closeModal("modalTx");
  toast("Transaksi tersimpan.");
  await loadTransactions();
  renderOverview();
  renderTxTable();
  renderBudgets();
}

window.deleteTransaction = async function (id) {
  if (!confirm("Hapus transaksi ini?")) return;
  const { error } = await supabaseClient.from("transactions").delete().eq("id", id);
  if (error) {
    toast("Gagal menghapus: " + error.message, "error");
    return;
  }
  toast("Transaksi dihapus.");
  await loadTransactions();
  renderOverview();
  renderTxTable();
  renderBudgets();
};

/* ---------------------------------------------------------
   TAB: KATEGORI
   --------------------------------------------------------- */
function renderCategories() {
  const wrap = document.getElementById("categoryList");
  if (categories.length === 0) {
    wrap.innerHTML = emptyState("Belum ada kategori. Tambahkan satu untuk mulai mencatat.");
    return;
  }

  wrap.innerHTML = categories
    .map(
      (c) => `
      <div class="chip-card">
        <span class="chip-dot" style="background:${c.color}"></span>
        ${escapeHtml(c.name)}
        <span class="pill ${c.type}" style="margin-left:4px;">${c.type === "income" ? "Masuk" : "Keluar"}</span>
        <button class="icon-btn" onclick="deleteCategory('${c.id}')">Hapus</button>
      </div>`
    )
    .join("");
}

async function saveCategory(e) {
  e.preventDefault();
  const payload = {
    user_id: currentUser.id,
    name: document.getElementById("catName").value.trim(),
    type: document.getElementById("catType").value,
    color: document.getElementById("catColor").value
  };

  const { error } = await supabaseClient.from("categories").insert(payload);
  if (error) {
    toast("Gagal menambah kategori: " + error.message, "error");
    return;
  }

  closeModal("modalCategory");
  document.getElementById("categoryForm").reset();
  toast("Kategori ditambahkan.");
  await loadCategories();
  populateCategoryFilters();
  renderCategories();
}

window.deleteCategory = async function (id) {
  if (!confirm("Hapus kategori ini? Transaksi terkait tidak akan terhapus.")) return;
  const { error } = await supabaseClient.from("categories").delete().eq("id", id);
  if (error) {
    toast("Gagal menghapus kategori: " + error.message, "error");
    return;
  }
  toast("Kategori dihapus.");
  await loadCategories();
  populateCategoryFilters();
  renderCategories();
};

/* ---------------------------------------------------------
   TAB: ANGGARAN
   --------------------------------------------------------- */
function openBudgetModal() {
  const select = document.getElementById("budgetCategory");
  const expenseCats = categories.filter((c) => c.type === "expense");
  select.innerHTML = expenseCats.length
    ? expenseCats.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("")
    : '<option value="">Belum ada kategori pengeluaran</option>';
  document.getElementById("budgetForm").reset();
  openModal("modalBudget");
}

async function saveBudget(e) {
  e.preventDefault();
  const [year, month] = document.getElementById("budgetMonth").value.split("-").map(Number);

  const payload = {
    user_id: currentUser.id,
    category_id: document.getElementById("budgetCategory").value,
    amount: Number(document.getElementById("budgetAmount").value),
    month,
    year
  };

  const { error } = await supabaseClient.from("budgets").upsert(payload, {
    onConflict: "user_id,category_id,month,year"
  });

  if (error) {
    toast("Gagal menyimpan anggaran: " + error.message, "error");
    return;
  }

  closeModal("modalBudget");
  toast("Anggaran tersimpan.");
  await loadBudgets();
  renderBudgets();
}

function renderBudgets() {
  const wrap = document.getElementById("budgetList");
  const monthValue = document.getElementById("budgetMonth").value;

  if (budgets.length === 0) {
    wrap.innerHTML = emptyState("Belum ada anggaran untuk bulan ini.");
    return;
  }

  const monthTx = filterByMonth(transactions, monthValue).filter((t) => t.type === "expense");

  wrap.innerHTML = budgets
    .map((b) => {
      const spent = monthTx
        .filter((t) => t.category_id === b.category_id)
        .reduce((s, t) => s + Number(t.amount), 0);
      const pct = Math.min(100, (spent / b.amount) * 100);
      const over = spent > b.amount;

      return `
        <div class="budget-item">
          <div class="budget-top">
            <span>${b.categories ? escapeHtml(b.categories.name) : "—"}</span>
            <span class="num">${rupiah(spent)} / ${rupiah(b.amount)}</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill ${over ? "over" : ""}" style="width:${pct}%;"></div>
          </div>
        </div>`;
    })
    .join("");
}

/* ---------------------------------------------------------
   TAB: TABUNGAN
   --------------------------------------------------------- */
function computeSavingsTotal() {
  return savings.reduce((sum, r) => sum + (r.type === "manual_out" ? -Number(r.amount) : Number(r.amount)), 0);
}

function renderSavingsTab() {
  const total = computeSavingsTotal();
  document.getElementById("savingsTotal").textContent = rupiah(total);
  document.getElementById("sumSavings").textContent = rupiah(total);

  const wrap = document.getElementById("savingsList");
  if (savings.length === 0) {
    wrap.innerHTML = emptyState("Belum ada riwayat tabungan.");
    return;
  }

  const rows = savings
    .map((s) => {
      const date = new Date(s.created_at).toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric"
      });
      const isOut = s.type === "manual_out";
      const sourceLabel =
        s.type === "auto"
          ? `<span class="pill income">Otomatis · ${PERIOD_LABEL_ID[s.source_period_type] || "-"}</span>`
          : isOut
          ? `<span class="pill expense">Penarikan manual</span>`
          : `<span class="pill income">Setoran manual</span>`;

      return `
        <tr>
          <td>${date}</td>
          <td>${sourceLabel}</td>
          <td>${escapeHtml(s.note || (s.period_label || "-"))}</td>
          <td class="${isOut ? "amount-expense" : "amount-income"}">${isOut ? "−" : "+"} ${rupiah(s.amount)}</td>
        </tr>`;
    })
    .join("");

  wrap.innerHTML = `
    <div class="table-scroll">
      <table class="ledger">
        <thead>
          <tr><th>Tanggal</th><th>Jenis</th><th>Keterangan</th><th>Jumlah</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function openSavingsModal(mode) {
  document.getElementById("savingsMode").value = mode;
  document.getElementById("savingsModalTitle").textContent =
    mode === "manual_out" ? "Ambil dana dari tabungan" : "Setor ke tabungan";
  document.getElementById("savingsForm").reset();
  openModal("modalSavings");
}

async function saveManualSavings(e) {
  e.preventDefault();
  const mode = document.getElementById("savingsMode").value;
  const amount = Number(document.getElementById("savingsAmount").value);
  const note = document.getElementById("savingsNote").value.trim();

  if (mode === "manual_out" && amount > computeSavingsTotal()) {
    toast("Saldo tabungan tidak cukup untuk penarikan ini.", "error");
    return;
  }

  const { error } = await supabaseClient.from("savings").insert({
    user_id: currentUser.id,
    amount,
    type: mode,
    note: note || null
  });

  if (error) {
    toast("Gagal menyimpan: " + error.message, "error");
    return;
  }

  closeModal("modalSavings");
  toast(mode === "manual_out" ? "Dana ditarik dari tabungan." : "Dana disetor ke tabungan.");
  await loadSavings();
  renderSavingsTab();
}

/* ---------------------------------------------------------
   UTIL
   --------------------------------------------------------- */
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

init();