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
| `owner.html` | main admin only | Manages the whole website: dashboard, menu & prices, offers & promo, staff accounts, student accounts |
| `admin.html` | staff only | Every student's orders; move them Preparing -> Ready -> Delivered, or cancel |

After logging in:
- a **student** goes to `index.html` (the main menu),
- the **staff account** goes to `admin.html`,
- the **main admin account** goes to `owner.html`.

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

## Email verification (students)
**Every time a student logs in** (and when they sign up) they must type a 6-digit code that is emailed to them.
**Staff and the main admin accounts never need it.**
- Flow: email + password -> code is emailed -> type the code -> logged in. The code step only opens after a correct password.
- Sign up needs an **email address**. Old accounts that signed up with a mobile number have no email to send to, so they still log in without a code.
- The code works for 10 minutes, allows 5 wrong tries, and "Resend code" waits 60 seconds (all in `config.php`).
- Mail is sent from **mcccanteen28@gmail.com** by `mailer.php` (Gmail SMTP). In `config.php` paste a Gmail **App Password**
  into `MAIL_APP_PASSWORD` (Google Account > Security > 2-Step Verification on > App passwords).
  While it is empty, on localhost the code is written to `mail-outbox.log` instead of being emailed (for testing).
- If you see "certificate verify failed" on Laragon, set `MAIL_VERIFY_SSL = false` (own computer only).

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

## Fixes in this version
- **Database**: `db.php` now creates/upgrades the `floor`, `delivery_fee` and `birthdate` columns that `api.php` needs
  (before, ordering, the profile page and the staff page failed on a database made by an older copy).
  You do not have to import any `.sql` file.
- **Menu ids**: `api.php` `$MENU` now matches every food button (Coffee & Cookies = 8, Siomai & drink = 9,
  Coffee & Fries = 10, Rice meal + Coke = 11). The duplicate Rice meal card was removed.
- **Landing page**: the round menu button was missing, which stopped `landing.js` (dropdown, windows). Added back.
  `.overview` CSS typo fixed.
- **Sign up** links (`signup.html` never existed) now open `login.html?tab=signup`; they hide once you are logged in.
- **Missing pictures** replaced (banner slides, Coffee & Fries, About Us photos).
- **Staff accounts** cannot place orders (menu page and server).
- Pages load their CSS/JS with `?v=3` and `.htaccess` turns off caching, so old cached files cannot break the layout.
- Old pages that no longer worked (owner, manager, staff copy, first order page...) are in `_unused/`.

## The main admin account
It manages the whole website on `owner.html` and is created automatically the first time the site is used.
Settings are in `config.php`:

    OWNER_EMAIL    = owner@mcc.local
    OWNER_PASSWORD = ChangeMe-2026

**Change `OWNER_PASSWORD` BEFORE the first run** (editing it later does not change an existing account).
On `owner.html` the main admin can:
- **Dashboard**: sales today / last 7 days / all time, order counts, best sellers, latest orders.
- **Menu & prices**: change a food's name, price or category, mark it sold out, add or delete a food.
- **Offers & promo**: switch the first-order discount on or off and change its percent (1-50%).
- **Staff accounts**: add a staff account, reset a password, suspend / activate, delete.
- **Student accounts**: reset a password, suspend / activate, delete (not possible once the student has orders: suspend instead).

The staff account (`admin.html`) still only handles orders and messages.

## Change the menu
Use **Menu & prices** on `owner.html`. The menu is stored in the database (table `menu_list`) and `api.php`
only trusts those prices. The student page (`index.html`) copies the name, price and Sold out state onto each food
button by its `data-id`. A food the main admin adds has no photo button yet, so the page creates one for it under
"New on the menu" (with the canteen photo). To give it its own photo, add a button with that food's `data-id`
and `<img>` to `index.html`. Every dish on `menu.html` is on the menu from the start (starting prices: rice meals 60, meryenda 10-15,
tusok-tusok 10, drinks 15): change the prices on `owner.html`. On `menu.html` an "Order Now" button is active when the
owner's menu has a food with the same name as its caption (and is not sold out).

## Troubleshooting
- **"Server error" / "PHP is not running"**: open the page through Laragon, not Live Server.
- **"Cannot connect to MySQL"**: open Laragon and click **Start All**.
- **Tables have the wrong columns**: import `canteen.sql` (rebuilds the tables).

## Files
- Pages: `landing.html`, `menu.html`, `login.html`, `index.html`, `offers.html`, `contact.html`, `about-us.html`, `profile.html`, `admin.html`
- Scripts: `common.js` (shared helpers), `script.js` (dashboard), `login.js`, `profile-page.js`, `admin.js`, `landing.js`, `menu.js`, `offers.js`, `contact.js`, `panels.js`
- Styles: `common.css`, `style.css` (dashboard + profile), `landing.css`, `menu.css`, `auth.css`, `admin.css`
- Backend: `api.php`, `db.php`, `config.php`, `canteen.sql`
- Pictures: `logo.png`, `img/` (food photos), `img/icons/` (icons)
