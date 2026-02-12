(async () => {
  const base = 'http://localhost:3000';
  const headers = { 'Content-Type': 'application/json' };

  async function post(path, body, token) {
    const h = { ...headers };
    if (token) h.Authorization = `Bearer ${token}`;
    const res = await fetch(base + path, { method: 'POST', headers: h, body: JSON.stringify(body) });
    const txt = await res.text();
    let data;
    try { data = JSON.parse(txt); } catch (e) { data = txt; }
    return { status: res.status, data };
  }

  async function get(path, token) {
    const h = {};
    if (token) h.Authorization = `Bearer ${token}`;
    const res = await fetch(base + path, { headers: h });
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  }

  console.log('Registering alice...');
  const r1 = await post('/api/auth/register-customer', { name: 'alice', email: `alice-${Date.now()}@example.com`, password: 'pass123', initialDeposit: 100 });
  console.log('alice register:', r1.status, r1.data);

  console.log('Registering bob...');
  const r2 = await post('/api/auth/register-customer', { name: 'bob', email: `bob-${Date.now()}@example.com`, password: 'pass123', initialDeposit: 10 });
  console.log('bob register:', r2.status, r2.data);

  if (r1.status !== 201 || r2.status !== 201) {
    console.log('Failed to create test users');
    return;
  }

  const aliceEmail = r1.data.customer.email;
  const bobId = r2.data.customer.id;

  console.log('Logging in alice...');
  const login = await post('/api/auth/login', { role: 'customer', email: aliceEmail, password: 'pass123' });
  console.log('login:', login.status, login.data);
  if (!login.data || !login.data.token) return;
  const token = login.data.token;

  console.log('Attempting transfer from alice -> bob by ID');
  const t = await post('/api/transactions/transfer', { toAccountId: bobId, amount: 15 }, token);
  console.log('transfer by id:', t.status, t.data);

  console.log('Attempting transfer from alice -> bob by email');
  const t2 = await post('/api/transactions/transfer', { toAccountId: r2.data.customer.email, amount: 5 }, token);
  console.log('transfer by email:', t2.status, t2.data);
})();
