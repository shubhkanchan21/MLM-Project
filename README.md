# Enterprise Binary MLM Visualization

This project is a production-ready single-page application that visualizes a binary-tree structured MLM network with payment-driven node activation.

Quick start

1. **Run the backend** – this repository contains a simple Express server that can talk to
   a PostgreSQL database.  From the workspace root:
   ```powershell
   cd "database(sql)"
   npm install      # if not already installed
   # create a ".env" file (see .env.example) with your connection settings:
   #   DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, JWT_SECRET
   node index.js    # starts on port 3000
   ```
   If the database is unavailable the server will still run and the front‑end will fall
   back to an in‑memory mock state.

2. **Serve the frontend** – the static HTTP server in `index.js` (port 8080 by default)
   delivers the HTML/JS/CSS assets and also exposes a tiny `/api/db-status` endpoint.
   Launch it with:
   ```powershell
   node index.js
   ```
   Then browse to `http://localhost:8080/frontend.html` to open the application.
   (You may also use `index.html` directly, but `frontend.html` has the real‑API flag set
   for you.)

3. **Use the app** – choose a role and user ID, hit *Enter*, and the UI will request
   `/mock/users` and `/mock/users/:id` from the backend.  With the database hooked up
   those endpoints now read live records from `core.users`; if the DB is not reachable they
   return the previous mock data stored in `js/api.js`.
   - You can also open the *Employees Database Report* by clicking the link on the
     entry screen or browsing to `employees_view.html`.  That view fetches `/users/report`
     and shows a table of all users from the database.  Rows are clickable and will open
     the main application focused on that user (via `index.html?userId=<id>`).
   - The report supports simple search (name/email) and will hit the backend with
     `?search=...` which is handled efficiently on the server side.  For very large
     tables you can also supply `?limit=100&offset=200` to paginate manually.

4. **Alternative view** – open `employees_view.html` in a separate tab to see a colorful
   paginated table of all users.  That page calls `/seeded/employees/report`, which is
   already backed by the database (with a file fallback).

The remainder of the README below documents the internal mock API and code
architecture, which you can ignore once the real backend is wired up.

> **Performance tip**
> - Add indexes on `core.users(id)`, `core.users(parent_id)` and `core.users(level)`
>   in PostgreSQL if you expect thousands of rows; the simple `SELECT ... ORDER BY id`
>   used by `/mock/users` will then still return within a few milliseconds.
> - Reduce page‑size on the frontend (see `js/app.js` paging logic) for very deep trees.

Files

- `index.html` — Main SPA shell.
- `styles.css` — Styling and responsive layout.
- `js/api.js` — Mock API: user data, simulated payment updates, localStorage persistence.
- `js/app.js` — App logic: tree build, rendering, level unlocking, modal, pan/zoom.

Added advanced modules:

- `js/payment.js` — Payment gateway abstraction and `payAndUpdate` helper. Replace adapter methods with Razorpay/Stripe/PayPal implementations for real integration.
- `js/admin.js` — Admin panel UI controller: sidebar, search, user management, payment overrides, manual level unlocks, and simple analytics.

Database schema and tables are documented as comments in `js/api.js` under the "DATABASE SCHEMA (DESIGN COMMENTS)" section.

Notes on security & extensibility

- Role-based rendering: entry UI selects `user` or `admin`. Admin panel exposes override actions; user will only see their subtree and can pay for their own node.
- Payment flow: `payAndUpdate` simulates gateway flow then calls API `setPaymentStatus`. Replace with real gateway webhooks for production.
- API-first design: `js/api.js` simulates server endpoints (searchUsers, setPaymentStatus, setLevelUnlock, fetchAnalytics) and persists to `localStorage` for demo.


Notes

- Root user `Aditya` is set to `COMPLETED` by default; other nodes start `PENDING`.
- Level unlocking follows the rule: Level N unlocks only when all nodes in Level N-1 are `COMPLETED`.
- Node activation requires both parent's payment `COMPLETED` and the level unlocked.
