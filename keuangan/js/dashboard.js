/* =========================================================
   DASHBOARD.JS — Logika utama aplikasi KeuanganKu
   Dipakai oleh dashboard.html
   ========================================================= */

let currentUser = null;
let categories = [];
let transactions = [];
let budgets = [];
let pieChart = null;
let barChart = null;

const rupiah = (n) =>
  "Rp " + Math.round(n).toLocaleString("id-ID", { maximumFractionDigits: 0 });

function todayMonthValue() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
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
  document.getElementById("filterMonth").value = currentMonth;
  document.getElementById("budgetMonth").value = currentMonth;
  document.getElementById("txDate").valueAsDate = new Date();

  await loadCategories();
  await loadTransactions();
  await loadBudgets();

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
  document.getElementById("txType").addEventListener("change", populateTxCategoryOptions);

  // Modal kategori
  document.getElementById("openAddCategory").addEventListener("click", () => openModal("modalCategory"));
  document.getElementById("cancelCategory").addEventListener("click", () => closeModal("modalCategory"));
  document.getElementById("categoryForm").addEventListener("submit", saveCategory);

  // Modal anggaran
  document.getElementById("openAddBudget").addEventListener("click", () => openBudgetModal());
  document.getElementById("cancelBudget").addEventListener("click", () => closeModal("modalBudget"));
  document.getElementById("budgetForm").addEventListener("submit", saveBudget);
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

/* ---------------------------------------------------------
   RENDER SEMUA
   --------------------------------------------------------- */
function renderAll() {
  populateCategoryFilters();
  renderOverview();
  renderTxTable();
  renderCategories();
  renderBudgets();
}

function filterByMonth(list, monthValue) {
  if (!monthValue) return list;
  const [y, m] = monthValue.split("-").map(Number);
  return list.filter((t) => {
    const d = new Date(t.transaction_date);
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

  document.getElementById("sumIncome").textContent = rupiah(income);
  document.getElementById("sumExpense").textContent = rupiah(expense);
  document.getElementById("sumBalance").textContent = rupiah(income - expense);

  renderPieChart(income, expense);
  renderBarChart(monthTx);
  renderRecent();
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
      const date = new Date(t.transaction_date).toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric"
      });

      return `
        <tr>
          <td>${date}</td>
          <td>${escapeHtml(t.description || "-")}</td>
          <td><span class="pill ${t.type}"><span class="chip-dot" style="width:7px;height:7px;background:${catColor}"></span>${catName}</span></td>
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
    </table>`;
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

function openTxModal() {
  document.getElementById("txModalTitle").textContent = "Tambah transaksi";
  document.getElementById("txForm").reset();
  document.getElementById("txId").value = "";
  document.getElementById("txDate").valueAsDate = new Date();
  populateTxCategoryOptions();
  openModal("modalTx");
}

window.editTransaction = function (id) {
  const t = transactions.find((x) => x.id === id);
  if (!t) return;

  document.getElementById("txModalTitle").textContent = "Ubah transaksi";
  document.getElementById("txId").value = t.id;
  document.getElementById("txType").value = t.type;
  populateTxCategoryOptions();
  document.getElementById("txCategory").value = t.category_id || "";
  document.getElementById("txAmount").value = t.amount;
  document.getElementById("txDate").value = t.transaction_date;
  document.getElementById("txDescription").value = t.description || "";
  openModal("modalTx");
};

async function saveTransaction(e) {
  e.preventDefault();
  const id = document.getElementById("txId").value;

  const payload = {
    user_id: currentUser.id,
    type: document.getElementById("txType").value,
    amount: Number(document.getElementById("txAmount").value),
    transaction_date: document.getElementById("txDate").value,
    category_id: document.getElementById("txCategory").value || null,
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
   UTIL
   --------------------------------------------------------- */
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

init();