/* =========================================================
   AUTH.JS — Login, Register, dan pengecekan sesi
   Dipakai oleh index.html
   ========================================================= */

const loginView = document.getElementById("loginView");
const registerView = document.getElementById("registerView");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const loginMsg = document.getElementById("loginMsg");
const registerMsg = document.getElementById("registerMsg");

// Jika user sudah login, langsung arahkan ke dashboard
async function checkExistingSession() {
  const { data } = await supabaseClient.auth.getSession();
  if (data.session) {
    window.location.href = "dashboard.html";
  }
}
checkExistingSession();

// Toggle antara form login <-> register
document.getElementById("showRegister").addEventListener("click", (e) => {
  e.preventDefault();
  loginView.style.display = "none";
  registerView.style.display = "block";
});

document.getElementById("showLogin").addEventListener("click", (e) => {
  e.preventDefault();
  registerView.style.display = "none";
  loginView.style.display = "block";
});

function showMsg(el, text, type) {
  el.textContent = text;
  el.className = "auth-msg show " + type;
}

// ---------- LOGIN ----------
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("loginBtn");
  btn.disabled = true;
  btn.textContent = "Memproses...";

  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

  if (error) {
    showMsg(loginMsg, "Gagal masuk: " + translateError(error.message), "error");
    btn.disabled = false;
    btn.textContent = "Masuk";
    return;
  }

  window.location.href = "dashboard.html";
});

// ---------- REGISTER ----------
registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("registerBtn");
  btn.disabled = true;
  btn.textContent = "Memproses...";

  const name = document.getElementById("registerName").value.trim();
  const email = document.getElementById("registerEmail").value.trim();
  const password = document.getElementById("registerPassword").value;

  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: name }
    }
  });

  if (error) {
    showMsg(registerMsg, "Gagal daftar: " + translateError(error.message), "error");
    btn.disabled = false;
    btn.textContent = "Daftar";
    return;
  }

  // Jika konfirmasi email diaktifkan di Supabase, sesi belum ada
  if (data.session) {
    window.location.href = "dashboard.html";
  } else {
    showMsg(
      registerMsg,
      "Akun berhasil dibuat. Cek email kamu untuk verifikasi sebelum masuk.",
      "ok"
    );
    btn.disabled = false;
    btn.textContent = "Daftar";
  }
});

function translateError(msg) {
  const map = {
    "Invalid login credentials": "Email atau kata sandi salah.",
    "User already registered": "Email sudah terdaftar.",
    "Password should be at least 6 characters": "Kata sandi minimal 6 karakter."
  };
  return map[msg] || msg;
}