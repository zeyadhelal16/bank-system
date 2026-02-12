const express = require("express");
const path = require("path");
const fs = require("fs/promises");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "db", "data.json");

const sessions = new Map();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function newId(prefix) {
  return `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(String(password)).digest("hex");
}

function getToken() {
  return crypto.randomBytes(24).toString("hex");
}

function sanitizeCustomer(customer) {
  return {
    id: customer.id,
    name: customer.name,
    email: customer.email,
    balance: customer.balance,
    createdAt: customer.createdAt
  };
}

function sanitizeEmployee(employee) {
  return {
    id: employee.id,
    name: employee.name,
    email: employee.email,
    department: employee.department,
    createdAt: employee.createdAt
  };
}

async function ensureDataFile() {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    const initialData = { customers: [], employees: [], transactions: [] };
    await fs.writeFile(DATA_FILE, JSON.stringify(initialData, null, 2), "utf-8");
  }
}

async function readDb() {
  await ensureDataFile();
  const content = await fs.readFile(DATA_FILE, "utf-8");
  return JSON.parse(content);
}

async function writeDb(data) {
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
}

function authRequired(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token || !sessions.has(token)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  req.session = sessions.get(token);
  req.token = token;
  return next();
}

function employeeOnly(req, res, next) {
  if (req.session.role !== "employee") {
    return res.status(403).json({ error: "Employee access required" });
  }
  return next();
}

function createTransaction(type, amount, fromAccount, toAccount, actor) {
  return {
    id: newId("TXN"),
    type,
    amount: round2(amount),
    fromAccount: fromAccount || null,
    toAccount: toAccount || null,
    performedBy: actor,
    createdAt: new Date().toISOString()
  };
}

app.post("/api/auth/register-customer", async (req, res) => {
  try {
    const { name, email, password, initialDeposit } = req.body;
    const normalizedEmail = normalizeEmail(email);
    const deposit = initialDeposit == null ? 0 : Number(initialDeposit);

    if (!name || !normalizedEmail || !password) {
      return res.status(400).json({ error: "name, email, and password are required" });
    }
    if (!Number.isFinite(deposit) || deposit < 0) {
      return res.status(400).json({ error: "initialDeposit must be 0 or higher" });
    }

    const db = await readDb();
    const exists =
      db.customers.some((c) => c.email === normalizedEmail) ||
      db.employees.some((e) => e.email === normalizedEmail);
    if (exists) {
      return res.status(409).json({ error: "Email is already in use" });
    }

    const customer = {
      id: newId("CUS"),
      name: String(name).trim(),
      email: normalizedEmail,
      passwordHash: hashPassword(password),
      balance: round2(deposit),
      createdAt: new Date().toISOString()
    };

    db.customers.push(customer);
    if (deposit > 0) {
      db.transactions.push(
        createTransaction("deposit", deposit, null, customer.id, {
          role: "customer",
          id: customer.id
        })
      );
    }
    await writeDb(db);

    return res.status(201).json({
      message: "Customer account created",
      customer: sanitizeCustomer(customer)
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to create customer account" });
  }
});

app.post("/api/auth/register-employee", async (req, res) => {
  try {
    const { name, email, password, department } = req.body;
    const normalizedEmail = normalizeEmail(email);
    if (!name || !normalizedEmail || !password) {
      return res.status(400).json({ error: "name, email, and password are required" });
    }

    const db = await readDb();
    const exists =
      db.customers.some((c) => c.email === normalizedEmail) ||
      db.employees.some((e) => e.email === normalizedEmail);
    if (exists) {
      return res.status(409).json({ error: "Email is already in use" });
    }

    const employee = {
      id: newId("EMP"),
      name: String(name).trim(),
      email: normalizedEmail,
      department: String(department || "General").trim(),
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString()
    };

    db.employees.push(employee);
    await writeDb(db);

    return res.status(201).json({
      message: "Employee account created",
      employee: sanitizeEmployee(employee)
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to create employee account" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password, role } = req.body;
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !password || !role) {
      return res.status(400).json({ error: "email, password, and role are required" });
    }
    if (!["customer", "employee"].includes(role)) {
      return res.status(400).json({ error: "role must be customer or employee" });
    }

    const db = await readDb();
    const pool = role === "customer" ? db.customers : db.employees;
    const user = pool.find((item) => item.email === normalizedEmail);

    if (!user || user.passwordHash !== hashPassword(password)) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = getToken();
    sessions.set(token, { role, id: user.id });

    return res.json({
      message: "Login successful",
      token,
      role,
      profile: role === "customer" ? sanitizeCustomer(user) : sanitizeEmployee(user)
    });
  } catch (error) {
    return res.status(500).json({ error: "Login failed" });
  }
});

app.post("/api/auth/logout", authRequired, (req, res) => {
  sessions.delete(req.token);
  return res.json({ message: "Logged out" });
});

app.get("/api/account/profile", authRequired, async (req, res) => {
  try {
    const db = await readDb();
    if (req.session.role === "customer") {
      const customer = db.customers.find((c) => c.id === req.session.id);
      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }
      return res.json({ profile: sanitizeCustomer(customer) });
    }

    const employee = db.employees.find((e) => e.id === req.session.id);
    if (!employee) {
      return res.status(404).json({ error: "Employee not found" });
    }
    return res.json({ profile: sanitizeEmployee(employee) });
  } catch (error) {
    return res.status(500).json({ error: "Failed to read profile" });
  }
});

app.get("/api/account/balance", authRequired, async (req, res) => {
  if (req.session.role !== "customer") {
    return res.status(403).json({ error: "Only customers have personal balances" });
  }

  try {
    const db = await readDb();
    const customer = db.customers.find((c) => c.id === req.session.id);
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    return res.json({ accountId: customer.id, balance: customer.balance });
  } catch (error) {
    return res.status(500).json({ error: "Failed to read balance" });
  }
});

app.get("/api/account/transactions", authRequired, async (req, res) => {
  try {
    const db = await readDb();
    if (req.session.role === "employee") {
      return res.json({
        transactions: db.transactions.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      });
    }

    const accountId = req.session.id;
    const transactions = db.transactions
      .filter((t) => t.fromAccount === accountId || t.toAccount === accountId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return res.json({ transactions });
  } catch (error) {
    return res.status(500).json({ error: "Failed to read transactions" });
  }
});

app.get("/api/customers", authRequired, employeeOnly, async (req, res) => {
  try {
    const db = await readDb();
    const customers = db.customers.map(sanitizeCustomer);
    return res.json({ customers });
  } catch (error) {
    return res.status(500).json({ error: "Failed to read customers" });
  }
});

app.get("/api/customers/:accountId/balance", authRequired, employeeOnly, async (req, res) => {
  try {
    const accountId = String(req.params.accountId || "").trim();
    if (!accountId) {
      return res.status(400).json({ error: "accountId is required" });
    }

    const db = await readDb();
    const customer = db.customers.find((c) => c.id === accountId);
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    return res.json({
      accountId: customer.id,
      name: customer.name,
      balance: customer.balance
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to read customer balance" });
  }
});

app.get("/api/employees", authRequired, employeeOnly, async (req, res) => {
  try {
    const db = await readDb();
    const employees = db.employees.map(sanitizeEmployee);
    return res.json({ employees });
  } catch (error) {
    return res.status(500).json({ error: "Failed to read employees" });
  }
});

app.post("/api/transactions/deposit", authRequired, async (req, res) => {
  try {
    const { amount, accountId } = req.body;
    const targetId = req.session.role === "customer" ? req.session.id : String(accountId || "").trim();
    const parsedAmount = Number(amount);

    if (!targetId) {
      return res.status(400).json({ error: "accountId is required for employee deposits" });
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: "amount must be a positive number" });
    }

    const db = await readDb();
    const customer = db.customers.find((c) => c.id === targetId);
    if (!customer) {
      return res.status(404).json({ error: "Target account not found" });
    }

    customer.balance = round2(customer.balance + parsedAmount);
    db.transactions.push(
      createTransaction("deposit", parsedAmount, null, customer.id, {
        role: req.session.role,
        id: req.session.id
      })
    );
    await writeDb(db);

    return res.json({
      message: "Deposit successful",
      accountId: customer.id,
      balance: customer.balance
    });
  } catch (error) {
    return res.status(500).json({ error: "Deposit failed" });
  }
});

app.post("/api/transactions/withdraw", authRequired, async (req, res) => {
  try {
    const { amount, accountId } = req.body;
    const targetId = req.session.role === "customer" ? req.session.id : String(accountId || "").trim();
    const parsedAmount = Number(amount);

    if (!targetId) {
      return res.status(400).json({ error: "accountId is required for employee withdrawals" });
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: "amount must be a positive number" });
    }

    const db = await readDb();
    const customer = db.customers.find((c) => c.id === targetId);
    if (!customer) {
      return res.status(404).json({ error: "Target account not found" });
    }
    if (customer.balance < parsedAmount) {
      return res.status(400).json({ error: "Insufficient funds" });
    }

    customer.balance = round2(customer.balance - parsedAmount);
    db.transactions.push(
      createTransaction("withdraw", parsedAmount, customer.id, null, {
        role: req.session.role,
        id: req.session.id
      })
    );
    await writeDb(db);

    return res.json({
      message: "Withdrawal successful",
      accountId: customer.id,
      balance: customer.balance
    });
  } catch (error) {
    return res.status(500).json({ error: "Withdrawal failed" });
  }
});

app.post("/api/transactions/transfer", authRequired, async (req, res) => {
  try {
    const { fromAccountId, toAccountId, amount } = req.body;
    const fromId =
      req.session.role === "customer" ? req.session.id : String(fromAccountId || "").trim();
    const toId = String(toAccountId || "").trim();
    const parsedAmount = Number(amount);

    if (!fromId || !toId) {
      return res.status(400).json({ error: "fromAccountId and toAccountId are required" });
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: "amount must be a positive number" });
    }
    if (fromId === toId) {
      return res.status(400).json({ error: "Cannot transfer to the same account" });
    }

    const db = await readDb();

    // Allow passing either an account ID or an email for convenience.
    const resolveCustomer = (identifier) => {
      if (!identifier) return null;
      const maybe = String(identifier).trim();
      if (maybe.includes("@")) {
        const normalized = normalizeEmail(maybe);
        return db.customers.find((c) => c.email === normalized) || null;
      }
      return db.customers.find((c) => c.id === maybe) || null;
    };

    const sender = resolveCustomer(fromId);
    const receiver = resolveCustomer(toId);

    if (!sender) {
      return res.status(404).json({ error: `Sender account not found: ${fromId}` });
    }
    if (!receiver) {
      return res.status(404).json({ error: `Receiver account not found: ${toId}` });
    }
    if (sender.balance < parsedAmount) {
      return res.status(400).json({ error: "Insufficient funds" });
    }

    sender.balance = round2(sender.balance - parsedAmount);
    receiver.balance = round2(receiver.balance + parsedAmount);
    db.transactions.push(
      createTransaction("transfer", parsedAmount, sender.id, receiver.id, {
        role: req.session.role,
        id: req.session.id
      })
    );
    await writeDb(db);

    return res.json({
      message: "Transfer successful",
      fromAccount: sender.id,
      toAccount: receiver.id,
      senderBalance: sender.balance
    });
  } catch (error) {
    return res.status(500).json({ error: "Transfer failed" });
  }
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

function startServer(port, attemptsLeft = 5) {
  const server = app.listen(port, () => {
    console.log(`Bank system server running at http://localhost:${port}`);
  });

  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      console.warn(`Port ${port} in use.`);
      if (attemptsLeft > 0) {
        const nextPort = port + 1;
        console.warn(`Retrying on port ${nextPort} (${attemptsLeft - 1} attempts left)...`);
        setTimeout(() => startServer(nextPort, attemptsLeft - 1), 200);
        return;
      }
      console.error('No available ports found. Exiting.');
      process.exit(1);
    }
    console.error('Server error:', err);
    process.exit(1);
  });
}

startServer(Number(PORT) || 3000);
