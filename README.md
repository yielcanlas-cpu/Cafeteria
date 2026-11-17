# MCC Canteen

A canteen website: a landing page, a public menu, an ordering dashboard for students,
and a staff page that holds and manages ALL orders. PHP + MySQL (runs on Laragon).

## Pages

| Page | Who | What it is |
|---|---|---|
| `landing.html` | everyone | Welcome page (banner, Menu / Order Now / About Us / Get app) |
| `menu.html` | everyone | The menu, in rows: Rice Meal, Meryenda, Drinks |
| `login.html` | everyone | Log in / Sign up (with your email **or mobile number**) |
| `index.html` | students | **Main menu (dashboard)**: browse food, fill the order panel, confirm |
| `offers.html` | everyone | Offers. **10% off for new customers** has a first-time-customer check (log in, answer Yes, Submit) |
| `contact.html` | everyone | "Stay Connected" form; staff read and reply on the staff page |
| `profile.html` | logged-in | Name, email, join date; location, phone and bio are saved |
| `admin.html` | staff only | Every student's orders; move them Preparing -> Ready -> Delivered, or cancel |

After logging in:
- a **student** goes to `index.html` (the main menu),
- the **staff account** goes to `admin.html`.

Opening `index.html` or `profile.html` while logged out sends you to the login page first.

## New in this version
- **First-order discount**: the student presses Submit on `offers.html`; `api.php` checks the order history
  (no order yet, cancelled ones don't count) and only then switches on 10% off the next order. It works once.
  The percent is `FIRST_ORDER_DISCOUNT_PERCENT` in `config.php`. Orders now store `discount`.
- **View all** opens `menu.html?from=app`: no Login/Sign up, a **Back** button instead. The logo goes to the
  logged-in person's home (student `index.html`, staff `admin.html`); guests still go to the landing page.
- Dashboard sidebar now works: Delivery, Offers, Favorites (heart on each food), Messages, Notification, Help Center (`panels.js`).
- Landing: Offers, Updates, Contact us and Get app (install instructions) all have content.
- Staff page: **Messages** tab to reply to students; orders show the discount.
- Offer text lives at the top of `offers.js`. New photos are in `img/` (from the Canva design).

## Login page
- Sign up with an **email or a mobile number** (09123456789, 9123456789 and +63 912 345 6789 all count as the same number). Password: at least 8 characters.
- Log in with the same email or number. The eye shows or hides the password.
- "Forgot password?" only shows a message for now (there is no reset by email yet).
- Background photo: `img/login-bg.jpg` is the campus photo from your Canva design; the red tint is added by `--tint` in `auth.css`.
- Logo: `img/mcc-canteen-logo.svg` (used on the login page). Landing, menu and staff pages still use `logo.png`.

## Run it with Laragon
1. Open Laragon and click **Start All** (Apache + MySQL must both be running).
2. Copy this whole folder into `C:\laragon\www\`.
3. Open `http://localhost/Mcc-Canteen/landing.html`
   (use your folder's name if it is different).

Do not use VS Code Live Server or double-click the files: PHP only runs through Laragon.

The database `canteen` and its tables are created (and upgraded, if you have an older
copy) automatically the first time the site is used. `canteen.sql` is optional: import it
only if you want to start with a clean database (it REBUILDS the tables, so it deletes
the orders and accounts already stored in them).

## The staff account
It is created automatically the first time the site is used. Settings are in `config.php`:

    ADMIN_EMAIL    = admin@mcc.local
    ADMIN_PASSWORD = canteen123

Log in with these on `login.html` and you land on the staff page.
**Change `ADMIN_PASSWORD` in `config.php` BEFORE the first run** (it is only used when the
account is created; editing it later does not change an existing account).

On the staff page you can: see all orders (new ones pop up by themselves every 15 seconds),
filter them, search by order number / name / room, mark them Ready or Delivered, cancel them,
reopen them, and delete finished ones. Students can cancel their own order while it is
still "Preparing".

## Change the menu
Two places must agree:
1. `api.php` - the `$MENU` list (id, name, **price**). The server only trusts these prices.
2. `index.html` - each food button has `data-id="..."` matching the id above, and its photo.

A food button whose `data-id` is not in `$MENU` is greyed out and cannot be ordered.
`menu.html` is only a showcase (photos and names); edit it separately.

## Troubleshooting
- **"Server error" / "PHP is not running"**: open the page through Laragon, not Live Server.
- **"Cannot connect to MySQL"**: open Laragon and click **Start All**.
- **Tables have the wrong columns**: import `canteen.sql` (rebuilds the tables).

## Files
- Pages: `landing.html`, `menu.html`, `login.html`, `index.html`, `profile.html`, `admin.html`
- Scripts: `common.js` (shared helpers), `script.js` (dashboard), `login.js`, `profile.js`, `admin.js`, `landing.js`, `menu.js`
- Styles: `common.css`, `style.css` (dashboard + profile), `landing.css`, `menu.css`, `auth.css`, `admin.css`
- Backend: `api.php`, `db.php`, `config.php`, `canteen.sql`
- Pictures: `logo.png`, `img/` (food photos), `img/icons/` (icons)
