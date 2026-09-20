# Soulmate House Cafe — Orders & Payments

A mobile-first web app for taking cafe orders, recording payments, chasing dues and seeing
how much money has come in. Every person signs in with their own account (Admin or Staff).

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind CSS 4 · MongoDB + Prisma 6 ·
Server Actions · Recharts 3 · Zod.

---

## Setup

Requirements: Node.js 20+ and MongoDB 5+ **running as a replica set**. Prisma needs a
replica set for transactions. MongoDB Atlas, including the free M0 tier, is always a replica
set, so it works as-is.

```bash
# 1. Install dependencies (also generates the Prisma client)
npm install

# 2. Point the app at your database
cp .env.example .env
#    then set DATABASE_URL in .env, e.g.
#    mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/soulmate_cafe?retryWrites=true&w=majority

# 3. Create the indexes (MongoDB has no migrations; collections are created on first write)
npx prisma db push

# 4. Load sample data: 10 menu items and 15 orders over the last 30 days
npx prisma db seed               # WARNING: wipes all cafe data in that database first (not accounts)

# 5. Create the first admin account. Either (safe on a database with real orders):
npm run db:seed-admin            # creates "admin" with a random password printed once
#    or pick your own details (asks for anything you leave out; password is not echoed):
npm run user:create

# 6. Run
npm run dev                      # http://localhost:3000
# or, for production
npm run build && npm start
```

Steps 3 and 4 together: `npm run db:setup`.

### Using a local MongoDB instead of Atlas

A standalone `mongod` must be started as a single-node replica set once:

```bash
mongod --replSet rs0 --dbpath <some-folder>              # keep this running
mongosh --eval 'rs.initiate({_id:"rs0",members:[{_id:0,host:"localhost:27017"}]})'   # once
```

Then use `DATABASE_URL="mongodb://localhost:27017/soulmate_cafe?replicaSet=rs0&directConnection=true"`.

(With Docker: `docker run -d -p 27017:27017 mongo:7 --replSet rs0`, then run the same
`rs.initiate` through `docker exec <container> mongosh --eval '…'`.)

Other useful commands:

| Command | What it does |
|---|---|
| `npm run db:push` | Sync indexes after changing `prisma/schema.prisma` |
| `npx prisma studio` | Browse and edit the database in a GUI |
| `npm run typecheck` | Run a TypeScript check |
| `npm run db:backfill-customers` | Rebuild the customer suggestion list and phone keys from existing orders (safe to re-run) |
| `npm run db:seed-admin` | Create an `admin` account with a random password if there is no admin yet. Touches nothing else. `npm run db:seed` also does this at the end |
| `npm run user:create -- --username NAME --name "Full Name" --role ADMIN|STAFF` | Create an account from the command line |
| `npm run user:create -- --username NAME --reset` | Set a new password, re-enable the account and sign it out everywhere (recovery when no admin can sign in) |

To use the app from staff phones on the cafe Wi-Fi, run `npm run build && npm start` on a
machine on that network. Then open `http://<that-machine's-IP>:3000` on the phone.
In production the session cookie is HTTPS-only, so either put the app behind HTTPS (recommended,
e.g. Caddy or a tunnel) or set `COOKIE_SECURE=false` in `.env` for a trusted LAN. Over plain HTTP
anyone on the same Wi-Fi can read passwords and session cookies in transit.

---

## Screens

| Route | Screen |
|---|---|
| `/m` | **Public menu** for customers: no sign-in and read-only. Shows available items, sizes and prices by category, and updates as soon as the menu changes. |
| `/menu/qr` | **Table QR code** pointing at `/m`, ready to print. It uses `PUBLIC_BASE_URL`, else the address you opened it on, swapping `localhost` for this computer's Wi-Fi IP. |
| `/login` | **Sign in** with username and password. Everything else requires a signed-in user. |
| `/account` | **Account**: change your password, sign out, or sign out on all other devices. |
| `/users` | **Staff accounts** (admins only): add people, set Admin / Staff, disable access, reset passwords, sign someone out. |
| `/` | **New Order**: a greeting strip shows today's collections, order count and open dues. Drinks with sizes show one-tap **M / L** price buttons on the card. Typing a known 10-digit phone number looks the customer up, fills in their name and flags unpaid dues. Typing part of a **name** (any word, e.g. "singh") or the first 3+ digits of a **phone** lists matching regulars; tap one (or arrow keys + Enter) to fill both. Also: menu cards with category tabs and search, and tap to add. The running bill shows +/- quantity, customer details, a flat ₹ or % discount, and Paid / Partial / Unpaid with the amount and method. When the customer pays in cash, it works out the change. After saving, it shows the bill with a **Start next order** button. |
| `/dues` | **Due Payments**: every Unpaid and Partial order, oldest first. A filter box matches phone, name or order number, and `/dues?phone=…` opens it pre-filtered. Anything pending more than 24 hours gets a red edge and an "Over 24h" badge. **Record payment** takes a full or partial amount for one bill. When a customer has more than one open bill, a **Collect in one go** panel appears at the top: enter a single amount and it is split across their bills, oldest first, with a preview of what it settles. Each order expands to show its items and payment history. |
| `/history` | **Order History**: filter by date range, status, payment method and **customer phone**, and search by name or order number (`12` or `#0012`). Filtering by phone adds a customer card with visits, billed, paid and due, plus a "Collect" shortcut to their dues. Shows 20 orders per page. Has CSV export buttons. |
| `/orders/[id]` | **Order detail / printable bill**: record a payment, remove a mistaken payment, edit, delete, and **Print bill**. The print layout hides everything except the bill. |
| `/orders/[id]/edit` | **Edit an order**: items, quantities, customer and discount. |
| `/analytics` | **Analytics**: Today / This week / This month / Custom range. Includes summary cards, daily revenue, collected vs outstanding, payment methods, top 10 items by quantity and by revenue, sales by category, and the customers who owe the most. |
| `/menu` | **Menu Management**: add, edit and delete items, and switch availability on or off. **Sizes**: any item can have 2–6 sizes, each with its own price. Medium and Large are pre-filled, and new items in drink categories such as Coffee, Tea and Shakes get sizes switched on automatically. |
| `/api/export/orders` | CSV of orders. Takes the same query parameters as History. |
| `/api/export/payments` | CSV of payments. Takes `from`, `to` (YYYY-MM-DD) and `method`. |

---

## Sign-in and security

- **Accounts and roles.** Each person has their own username and password. **Staff** can take
  orders, record payments, edit orders, switch menu items on/off and view dues, history,
  analytics and exports. **Admins** can also add/edit/delete menu items, delete orders and
  payments, and manage staff accounts. An admin can't demote or disable themselves, so there is
  always at least one admin.
- **Passwords** are hashed with scrypt (N=2¹⁵, r=8, p=1, 16-byte random salt) using Node's
  built-in crypto; they are never stored or logged in plain text. Minimum 10 characters, must not
  contain the username.
- **Sessions** are server-side. The cookie holds a random 256-bit token; the database stores
  only its SHA-256 hash. The cookie is `HttpOnly`, `SameSite=Lax`, and in production `Secure`
  with the `__Host-` prefix. A session ends after **12 hours idle** or **7 days** at most. Signing
  out, changing a password, a password reset, disabling a user or changing their role ends the
  affected sessions immediately.
- **Every page, server action and export route checks the session itself** (`requireUser()` in
  `lib/auth.ts`); admin-only actions also check the role on the server, so hiding a button is
  never the only protection. `middleware.ts` only redirects visitors with no cookie to `/login`.
- **Brute force.** After 5 wrong passwords a username is locked for 15 minutes (an admin
  password reset clears it). Errors don't say whether the username exists, and unknown usernames
  take the same time to reject.
- **Other protections.** Server actions reject cross-site requests (Next.js Origin check). The
  `?next=` redirect after sign-in only accepts same-site paths. Security headers
  (`next.config.ts`) block framing, MIME sniffing and referrer leaks.
- **Adding auth to an existing database:** run `npx prisma db push` (creates the `User`,
  `Session` and `LoginThrottle` indexes), then `npm run user:create` for the first admin.

---

## File tree

```
soulmate-house-cafe/
├── .env.example
├── .gitignore
├── README.md
├── next.config.ts
├── package.json
├── postcss.config.mjs
├── tsconfig.json
├── prisma/
│   ├── schema.prisma                 # MenuItem, Order, OrderItem, Payment, Counter, User, Session, LoginThrottle
│   └── seed.ts                       # 10 items + 15 orders (paid / partial / unpaid)
├── scripts/
│   └── create-user.ts                # npm run user:create: first admin / password recovery
├── middleware.ts                     # redirects visitors without a session cookie to /login
├── lib/
│   ├── prisma.ts                     # Prisma client singleton
│   ├── money.ts                      # paise helpers, ₹ formatting, bill maths, status rule
│   ├── dates.ts                      # Asia/Kolkata day boundaries, periods, formatting
│   ├── ids.ts                        # ObjectId validation
│   ├── orders.ts                     # transactions + retry, order lock, counter, payment sync, filters
│   ├── analytics.ts                  # MongoDB aggregation pipelines
│   ├── csv.ts                        # streaming CSV response helpers
│   ├── public-menu.ts                # cached menu query for /m
│   ├── customers.ts                  # phone key + keeps the Customer list in step with orders
│   ├── auth.ts                       # sessions, requireUser / requireAdminPage, sign-in throttling
│   ├── password.ts                   # scrypt hashing, password and username rules
│   └── session-cookie.ts             # cookie name / Secure flag (shared with middleware)
├── app/
│   ├── layout.tsx                    # top nav (desktop) + bottom nav (mobile)
│   ├── globals.css                   # Tailwind + cafe palette
│   ├── icon.svg
│   ├── page.tsx                      # New Order
│   ├── error.tsx · not-found.tsx     # (no root loading.tsx; see assumption 14)
│   ├── actions/
│   │   ├── orders.ts                 # create/update/delete order, record/delete payment
│   │   ├── menu.ts                   # create/update/delete item, toggle availability
│   │   ├── auth.ts                   # sign in / out, change own password
│   │   └── users.ts                  # admin: create / edit / reset / sign out accounts
│   ├── login/page.tsx                # sign-in screen
│   ├── account/page.tsx              # own account, change password, sign out
│   ├── users/page.tsx                # staff accounts (admins only)
│   ├── m/page.tsx                    # public customer menu (QR code target, no sign-in)
│   ├── menu/qr/page.tsx              # printable table QR code
│   ├── dues/page.tsx · loading.tsx
│   ├── history/page.tsx
│   ├── analytics/page.tsx · loading.tsx
│   ├── menu/page.tsx · loading.tsx
│   ├── orders/[id]/page.tsx          # receipt-style bill + actions (+ loading.tsx)
│   ├── orders/[id]/edit/page.tsx
│   └── api/export/
│       ├── orders/route.ts
│       └── payments/route.ts
└── components/
    ├── Nav.tsx                       # brand header + floating bottom bar
    ├── CategoryIcon.tsx              # category icons/colours, brand mark
    ├── PageSkeleton.tsx              # per-route loading placeholder
    ├── ui.tsx                        # buttons, inputs, StatusBadge, OverdueBadge, …
    ├── Sheet.tsx                     # bottom sheet / dialog
    ├── MethodPicker.tsx              # Cash / UPI / Card
    ├── PaymentSheet.tsx              # record-payment form
    ├── OrderBuilder.tsx              # new + edit order UI
    ├── OrderActions.tsx              # order buttons, payment history, ConfirmSheet
    ├── DuesList.tsx
    ├── HistoryFilters.tsx
    ├── MenuManager.tsx
    ├── AnalyticsCharts.tsx           # Recharts bar charts
    ├── CustomerSuggestions.tsx       # name / phone suggestions (cached, narrows locally)
    ├── LoginForm.tsx
    ├── AccountForms.tsx              # change password, sign out other devices
    └── UserManager.tsx               # staff accounts list + add / edit / reset sheets
```

---

## How the data stays consistent

- **Snapshots.** Each `OrderItem` stores its own `itemName`, `variantName` (size), `category` and `unitPrice`. Editing
  a menu price or name never changes past bills. When a menu item is deleted,
  in the same transaction every `OrderItem.menuItemId` that pointed at it is set to `null`,
  and the historical line, its analytics and its category stay intact.
- **Payment totals.** `amountPaid`, `balanceDue` and `status` are always recomputed from
  `SUM(Payment.amount)`. This happens inside the same transaction that adds or removes a
  payment or changes an order's total (`syncOrderPayments` in `lib/orders.ts`). That
  transaction first writes to the order document, which claims it. If two staff record a
  payment at the same moment, MongoDB aborts one with a write conflict. `runTransaction`
  retries it against the fresh data, where the balance check rejects any overpayment.
- **Status rule.** Paid in full → `PAID`. Paid something → `PARTIAL`. Paid nothing → `UNPAID`.
  Recording the final amount moves an order to Paid automatically.
- **Guards.** A payment can't exceed the balance due. An edit can't bring the total below
  the amount already paid; remove a payment first.
- **No orphans.** MongoDB has no foreign keys or cascades, so deleting an order removes its
  items and payments in the same transaction.
- **Server-side prices.** The client only sends item ids and quantities. Prices and totals
  are always computed on the server.

---

## Assumptions & decisions

1. **Money is stored as integer paise** (₹1 = 100) in `Int` fields, which avoids
   floating-point rounding. The fields keep the names from the brief (`subtotal`, `total`,
   `amountPaid`, …); comments in the schema note the unit. The one exception is
   `discountValue`, which stores the raw input (rupees or percent) as a float. The discount
   actually applied is stored exactly in `discountAmount`.
2. **Time zone.** All "days", report periods and displayed times use **Asia/Kolkata**.
   Timestamps are stored as UTC BSON dates. The week starts on Monday. A custom range is
   capped at 366 days.
3. **Paid with change.** When an order is saved as Paid, only the bill total is recorded as
   a payment. The optional "cash received" field only works out the change.
4. **Revenue definitions (Analytics):**
   - *Revenue collected* is payments received during the period, whichever day the order
     was placed.
   - *Outstanding*, *Orders*, *Avg order value* and *Collected vs outstanding* cover orders
     **placed** in the period.
   - *Largest outstanding dues* and the "All-time dues" banner cover every unsettled order,
     regardless of period.
   - *Top items* and *Sales by category* use line totals **before** order-level discounts,
     because a discount applies to the whole bill, not to individual items.
   - Customers are grouped by name + phone. Orders without a name are grouped as
     "Walk-in (no name)".
5. **Order numbers.** MongoDB has no autoincrement, so a `Counter` document
   (`{ _id: "order", seq }`) is incremented inside the same transaction that creates the order.
   Numbers are sequential, unique (`orderNumber` has a unique index) and gap-free, because a
   failed save rolls back the increment too. They are shown as `#0001`, and the seed restarts
   them at 1.
6. **Deleting a menu item** removes it for good; past orders are unaffected (see above). To
   hide an item for the day, switch off *Available* instead.
7. **Deleting an order** also deletes its items and payments, and it drops out of analytics.
   To fix a single wrong payment, use *Remove* next to it on the order page instead.
8. **Order edits** keep the original price snapshot on existing lines. Newly added lines use
   the current menu price. Payments are managed on the order page, not in the edit form.
9. **History pagination** is page-based (20 per page, by URL), so it works with the back
   button and with shared links. CSV exports stream in batches of 500–1000 rows, so large
   exports never load everything into memory.
10. **Printing** uses the browser's print dialog (`window.print()`), with a print stylesheet
    that shows only the bill. It works for A4 and 80 mm thermal printers set up as system
    printers.
11. **Prisma 6** is pinned on purpose: Prisma 7 does not support MongoDB yet. Prisma 6 prints a
    harmless notice that `package.json#prisma` (used for the seed command) is deprecated.
12. **IDs** are MongoDB ObjectIds. A malformed id in a URL shows the not-found page instead of
    an error.
13. **Sizes.** Sizes are stored on the menu item as an embedded list: `variants: [{ name, price }]`. An item with sizes keeps
    `price` = its lowest size price. The server always prices a line from the chosen size, and an item that has sizes
    must be ordered with one. Items created before sizes existed simply have no sizes, so no data migration is
    needed. Analytics list sizes separately ("Cappuccino · Large").
14. **No app-wide loading screen.** A root `app/loading.tsx` wraps every page in a loading boundary. With the React
    version bundled in Next 15.5, that stops the History filters from updating while the text box has focus. So
    loading skeletons are per route (Dues, Analytics, Menu, order page), and History and New Order have none.
15. **Phone numbers** are saved digits-only (with a leading `+` kept), so "98765 43210" and "98765-43210" are the
    same customer. The returning-customer lookup needs an exact 10+ digit match; the History phone filter also
    accepts part of a number. Phones saved by the previous version with spaces or dashes won't match the lookup
    until the order is edited and saved again.
16. **Fonts** (Fraunces for headings, DM Sans for text) come from Google Fonts through `next/font`, which downloads
    them once at **build** time and serves them from the app itself. So `npm run build` needs internet access;
    running the app doesn't.
17. **Authentication.** See [Sign-in and security](#sign-in-and-security).
