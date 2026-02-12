const statusMessage = document.getElementById("statusMessage");
const authCard = document.getElementById("authCard");
const dashboard = document.getElementById("dashboard");
const userMeta = document.getElementById("userMeta");
const customerPanel = document.getElementById("customerPanel");
const employeePanel = document.getElementById("employeePanel");
const customerIdEl = document.getElementById("customerId");
const customerBalanceEl = document.getElementById("customerBalance");
const checkedBalanceResultEl = document.getElementById("checkedBalanceResult");
const customersTableBody = document.querySelector("#customersTable tbody");
const employeesTableBody = document.querySelector("#employeesTable tbody");
const transactionsTableBody = document.querySelector("#transactionsTable tbody");

const storageKey = "bank_auth";
let auth = { token: "", role: "" };

function setStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.style.color = isError ? "#b42318" : "#0f766e";
}

function saveAuth() {
  localStorage.setItem(storageKey, JSON.stringify(auth));
}

function clearAuth() {
  auth = { token: "", role: "" };
  localStorage.removeItem(storageKey);
}

function loadAuth() {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    auth.token = parsed.token || "";
    auth.role = parsed.role || "";
  } catch {
    clearAuth();
  }
}

async function api(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };
  if (auth.token) {
    headers.Authorization = `Bearer ${auth.token}`;
  }

  const response = await fetch(path, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}

function showDashboard() {
  authCard.classList.add("hidden");
  dashboard.classList.remove("hidden");
  customerPanel.classList.toggle("hidden", auth.role !== "customer");
  employeePanel.classList.toggle("hidden", auth.role !== "employee");
}

function showAuth() {
  dashboard.classList.add("hidden");
  authCard.classList.remove("hidden");
  customerPanel.classList.add("hidden");
  employeePanel.classList.add("hidden");
}

function fillCustomers(customers) {
  customersTableBody.innerHTML = "";
  customers.forEach((customer) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${customer.id}</td>
      <td>${customer.name}</td>
      <td>${customer.email}</td>
      <td>$${Number(customer.balance).toFixed(2)}</td>
    `;
    customersTableBody.appendChild(tr);
  });
}

function fillEmployees(employees) {
  employeesTableBody.innerHTML = "";
  employees.forEach((employee) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${employee.id}</td>
      <td>${employee.name}</td>
      <td>${employee.email}</td>
      <td>${employee.department || "-"}</td>
    `;
    employeesTableBody.appendChild(tr);
  });
}

function fillTransactions(transactions) {
  transactionsTableBody.innerHTML = "";
  transactions.forEach((txn) => {
    const tr = document.createElement("tr");
    const by = txn.performedBy ? `${txn.performedBy.role}:${txn.performedBy.id}` : "-";
    tr.innerHTML = `
      <td>${txn.id}</td>
      <td>${txn.type}</td>
      <td>$${Number(txn.amount).toFixed(2)}</td>
      <td>${txn.fromAccount || "-"}</td>
      <td>${txn.toAccount || "-"}</td>
      <td>${by}</td>
      <td>${new Date(txn.createdAt).toLocaleString()}</td>
    `;
    transactionsTableBody.appendChild(tr);
  });
}

async function loadProfileAndData() {
  const profileRes = await api("/api/account/profile");
  const profile = profileRes.profile;
  userMeta.textContent = `${auth.role.toUpperCase()} | ${profile.name} (${profile.email})`;

  if (auth.role === "customer") {
    customerIdEl.textContent = profile.id;
    customerBalanceEl.textContent = Number(profile.balance).toFixed(2);
  }

  await loadTransactions();
  if (auth.role === "customer") {
    await loadBalance();
  }
  if (auth.role === "employee") {
    await loadCustomers();
    await loadEmployees();
  }
}

async function loadBalance() {
  if (auth.role !== "customer") return;
  const balanceRes = await api("/api/account/balance");
  customerIdEl.textContent = balanceRes.accountId;
  customerBalanceEl.textContent = Number(balanceRes.balance).toFixed(2);
}

async function loadTransactions() {
  const txRes = await api("/api/account/transactions");
  fillTransactions(txRes.transactions || []);
}

async function loadCustomers() {
  if (auth.role !== "employee") return;
  const customersRes = await api("/api/customers");
  fillCustomers(customersRes.customers || []);
}

async function loadEmployees() {
  if (auth.role !== "employee") return;
  const employeesRes = await api("/api/employees");
  fillEmployees(employeesRes.employees || []);
}

// Registration forms were removed from the auth page to keep a single-login view.
// If you want to re-enable registration UI, re-add the forms in `index.html`
// and restore the handlers here.

// --- No-email registration UI behavior ---
const loginForm = document.getElementById("loginForm");
const showRegisterNoEmail = document.getElementById("showRegisterNoEmail");
const registerNoEmailForm = document.getElementById("registerNoEmailForm");
const cancelRegister = document.getElementById("cancelRegister");

function toggleToRegister(show) {
  if (show) {
    loginForm.classList.add("hidden");
    showRegisterNoEmail.classList.add("hidden");
    registerNoEmailForm.classList.remove("hidden");
  } else {
    registerNoEmailForm.classList.add("hidden");
    loginForm.classList.remove("hidden");
    showRegisterNoEmail.classList.remove("hidden");
  }
}

showRegisterNoEmail.addEventListener("click", (e) => {
  e.preventDefault();
  toggleToRegister(true);
});

cancelRegister.addEventListener("click", () => toggleToRegister(false));

registerNoEmailForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const fd = new FormData(event.target);
  const name = fd.get("name");
  let email = (fd.get("email") || "").trim();
  const password = fd.get("password");
  const initialDeposit = fd.get("initialDeposit") || 0;

  // If user didn't provide an email, synthesize a harmless placeholder email
  if (!email) {
    const stamp = Date.now();
    const safeName = (name || "user").toLowerCase().replace(/[^a-z0-9]/g, "_");
    email = `noemail+${safeName}_${stamp}@noemail.local`;
  }

  try {
    const res = await api("/api/auth/register-customer", {
      method: "POST",
      body: { name, email, password, initialDeposit }
    });

    // attempt to login automatically with created credentials
    try {
      const loginRes = await api("/api/auth/login", {
        method: "POST",
        body: { role: "customer", email, password }
      });
      auth = { token: loginRes.token, role: loginRes.role };
      saveAuth();
      toggleToRegister(false);
      showDashboard();
      await loadProfileAndData();
      setStatus("Account created and logged in");
    } catch (loginErr) {
      toggleToRegister(false);
      setStatus("Account created. Please login manually.", false);
    }
  } catch (error) {
    setStatus(error.message, true);
  }
});

document.getElementById("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(event.target);
  const body = {
    role: formData.get("role"),
    email: formData.get("email"),
    password: formData.get("password")
  };
  try {
    const res = await api("/api/auth/login", { method: "POST", body });
    auth = { token: res.token, role: res.role };
    saveAuth();
    showDashboard();
    await loadProfileAndData();
    setStatus("Logged in successfully");
  } catch (error) {
    setStatus(error.message, true);
  }
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  try {
    if (auth.token) {
      await api("/api/auth/logout", { method: "POST" });
    }
  } catch (_error) {
    // Logout should clear local state even if server-side token already expired.
  } finally {
    clearAuth();
    showAuth();
    transactionsTableBody.innerHTML = "";
    customersTableBody.innerHTML = "";
    employeesTableBody.innerHTML = "";
    checkedBalanceResultEl.textContent = "-";
    userMeta.textContent = "";
    setStatus("Logged out");
  }
});

document.getElementById("employeeBalanceForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const accountId = new FormData(event.target).get("accountId");
  try {
    const res = await api(`/api/customers/${encodeURIComponent(accountId)}/balance`);
    checkedBalanceResultEl.textContent = `${res.accountId} | ${res.name} | $${Number(
      res.balance
    ).toFixed(2)}`;
    setStatus("Customer balance fetched");
  } catch (error) {
    checkedBalanceResultEl.textContent = "-";
    setStatus(error.message, true);
  }
});

document.getElementById("depositForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const amount = new FormData(event.target).get("amount");
  try {
    const res = await api("/api/transactions/deposit", { method: "POST", body: { amount } });
    event.target.reset();
    await loadBalance();
    await loadTransactions();
    setStatus(`Deposit successful. New balance: $${Number(res.balance).toFixed(2)}`);
  } catch (error) {
    setStatus(error.message, true);
  }
});

document.getElementById("withdrawForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const amount = new FormData(event.target).get("amount");
  try {
    const res = await api("/api/transactions/withdraw", { method: "POST", body: { amount } });
    event.target.reset();
    await loadBalance();
    await loadTransactions();
    setStatus(`Withdrawal successful. New balance: $${Number(res.balance).toFixed(2)}`);
  } catch (error) {
    setStatus(error.message, true);
  }
});

document.getElementById("transferForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(event.target);
  const body = {
    toAccountId: formData.get("toAccountId"),
    amount: formData.get("amount")
  };
  try {
    const res = await api("/api/transactions/transfer", { method: "POST", body });
    event.target.reset();
    await loadBalance();
    await loadTransactions();
    setStatus(`Transfer successful. New balance: $${Number(res.senderBalance).toFixed(2)}`);
  } catch (error) {
    setStatus(error.message, true);
  }
});

document.getElementById("employeeDepositForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(event.target);
  const body = {
    accountId: formData.get("accountId"),
    amount: formData.get("amount")
  };
  try {
    await api("/api/transactions/deposit", { method: "POST", body });
    event.target.reset();
    await loadCustomers();
    await loadTransactions();
    setStatus("Employee deposit completed");
  } catch (error) {
    setStatus(error.message, true);
  }
});

document.getElementById("employeeWithdrawForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(event.target);
  const body = {
    accountId: formData.get("accountId"),
    amount: formData.get("amount")
  };
  try {
    await api("/api/transactions/withdraw", { method: "POST", body });
    event.target.reset();
    await loadCustomers();
    await loadTransactions();
    setStatus("Employee withdrawal completed");
  } catch (error) {
    setStatus(error.message, true);
  }
});

document.getElementById("employeeTransferForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(event.target);
  const body = {
    fromAccountId: formData.get("fromAccountId"),
    toAccountId: formData.get("toAccountId"),
    amount: formData.get("amount")
  };
  try {
    await api("/api/transactions/transfer", { method: "POST", body });
    event.target.reset();
    await loadCustomers();
    await loadTransactions();
    setStatus("Employee transfer completed");
  } catch (error) {
    setStatus(error.message, true);
  }
});

document.getElementById("refreshCustomerData").addEventListener("click", async () => {
  try {
    await loadBalance();
    await loadTransactions();
    setStatus("Customer data refreshed");
  } catch (error) {
    setStatus(error.message, true);
  }
});

document.getElementById("refreshCustomers").addEventListener("click", async () => {
  try {
    await loadCustomers();
    setStatus("Customers refreshed");
  } catch (error) {
    setStatus(error.message, true);
  }
});

document.getElementById("refreshEmployees").addEventListener("click", async () => {
  try {
    await loadEmployees();
    setStatus("Employees refreshed");
  } catch (error) {
    setStatus(error.message, true);
  }
});

document.getElementById("refreshTransactions").addEventListener("click", async () => {
  try {
    await loadTransactions();
    setStatus("Transactions refreshed");
  } catch (error) {
    setStatus(error.message, true);
  }
});

async function bootstrap() {
  loadAuth();
  if (!auth.token) {
    showAuth();
    return;
  }

  try {
    showDashboard();
    await loadProfileAndData();
    setStatus("Session restored");
  } catch (_error) {
    clearAuth();
    showAuth();
  }
}

bootstrap();
