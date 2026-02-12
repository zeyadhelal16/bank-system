# Bank System Project (HTML/CSS/JS + Node/Express + JSON)

This project includes:
- Customer account creation
- Employee account creation
- Login for customer/employee
- Deposit, withdraw, transfer, and balance checks
- JSON file storage for customers, employees, and transactions

## 1) Install

```bash
npm install
```

## 2) Run

```bash
npm start
```

Server starts at:
- `http://localhost:3000`

## Data Storage

All data is stored in:
- `db/data.json`

Schema:
- `customers[]` (account + balance)
- `employees[]`
- `transactions[]`

## Main API Routes

Auth:
- `POST /api/auth/register-customer`
- `POST /api/auth/register-employee`
- `POST /api/auth/login`
- `POST /api/auth/logout`

Account:
- `GET /api/account/profile`
- `GET /api/account/balance` (customer role)
- `GET /api/account/transactions`

Transactions:
- `POST /api/transactions/deposit`
- `POST /api/transactions/withdraw`
- `POST /api/transactions/transfer`

Employee tools:
- `GET /api/customers`
- `GET /api/customers/:accountId/balance`
- `GET /api/employees`

## Notes

- Passwords are hashed with SHA-256 before storage.
- Session tokens are in-memory (users must login again after server restart).
- This is a starter project; for production use, add JWT/session store, stricter validation, and database-level transactions.
