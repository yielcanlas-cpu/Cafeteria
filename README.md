# MCC Canteen (merged project)

Two parts in one folder:

| Part | Files | What it is |
|---|---|---|
| **Dashboard** (your design) | `index.html`, `profile.html`, `style.css`, `script.js`, `img/` | Sidebar, banner, food cards, right-side order panel, profile page. Static HTML/CSS/JS. |
| **Landing page** | `landing.html`, `landing.css`, `landing.js`, `img/hero.jpg`, `img/icons/landing-*.svg` | Welcome page: banner, 4 quick buttons (Menu, Order Now, About Us, Get app) and overview. |
| **Ordering system** (backend) | `order.html`, `canteen.css`, `app.js`, `api.php`, `db.php`, `config.php`, `admin.php`, `logo.png` | Login / sign up, room delivery, order history, staff screen. PHP + MySQL. |

`index.html` is the dashboard. The ordering system's old `index.html` is now `order.html`,
and its old `style.css` is now `canteen.css` (so it does not overwrite the dashboard's `style.css`).

## Run it with Laragon
1. Open Laragon and click **Start All** (Apache + MySQL must both be running).
2. Copy this whole folder into `C:\laragon\www\`.
3. Open:
   - `http://localhost/Mcc-Canteen/landing.html` -> landing page
   - `http://localhost/Mcc-Canteen/`            -> dashboard
   - `http://localhost/Mcc-Canteen/order.html`  -> students: log in and place an order
   - `http://localhost/Mcc-Canteen/admin.php`   -> staff: see and deliver orders

The dashboard works by just opening `index.html`. The ordering system and staff page need Laragon
(PHP + MySQL), so they will not work with VS Code Live Server alone.

The database `canteen` and its tables (`users`, `orders`, `order_items`) are created automatically
the first time the ordering system is used. Laragon's default MySQL login is user `root`, no password
(already set in `config.php`).

## Student flow (order.html)
1. Create an account or log in
2. Pick foods from the menu (+ / -)
3. Type the room, e.g. `MB 101`
4. See the subtotal, press **Place order**

## Staff (admin.php)
Lists new orders with room, items and total. Press **Mark delivered**.
Default password is `canteen123`. **Change `ADMIN_PASSWORD` in `config.php` before sharing this.**

## Change the menu
- Ordering system: edit the `$MENU` array at the top of `api.php`.
- Dashboard: edit the `.food` buttons in `index.html` (`data-name`, `data-price`, photo in `img/`).

## Note
The dashboard's cart is not connected to `api.php` / the database yet. Orders placed on the
dashboard are not saved; only orders placed through `order.html` are.

## Troubleshooting
- **"Server error" / "PHP is not running" when logging in or creating an account:**
  the page was not opened through Laragon. Do not use VS Code Live Server or double-click the file.
  Start Laragon (**Start All**), then open `http://localhost/Mcc-Canteen/order.html`.
  (If your folder has a different name, use that name in the address.)
- **"Cannot connect to MySQL":** open Laragon and click **Start All**.
- **Tables have the wrong columns:** re-import `canteen.sql` (it rebuilds the tables).
