<?php
// ---------------------------------------------------------------
// Database settings. These are Laragon's defaults: user "root" with NO password.
// ---------------------------------------------------------------
const DB_HOST = '127.0.0.1';
const DB_PORT = 3306;
const DB_NAME = 'canteen';
const DB_USER = 'root';
const DB_PASS = '';

// ---------------------------------------------------------------
// The staff account that holds and manages ALL orders.
// It is created automatically the first time the site is used.
// Log in with it on login.html and you land on the staff page (admin.html).
//
// CHANGE THE PASSWORD BEFORE THE FIRST RUN. (It is only used when the
// account is created. Changing it later here does not change an existing account.)
// ---------------------------------------------------------------
const ADMIN_NAME     = 'Canteen Admin';
const ADMIN_EMAIL    = 'admin@mcc.local';
const ADMIN_PASSWORD = 'canteen123';

// ---------------------------------------------------------------
// The MAIN ADMIN (owner) account. It manages the whole website on owner.html:
// dashboard, menu & prices, offers & promo, staff accounts and student accounts.
// It is created automatically the first time the site is used.
// CHANGE THE PASSWORD BEFORE THE FIRST RUN (editing it later does not change an existing account).
// ---------------------------------------------------------------
const OWNER_NAME     = 'Main Admin';
const OWNER_EMAIL    = 'owner@mcc.local';
const OWNER_PASSWORD = 'ChangeMe-2026';

// ---------------------------------------------------------------
// The "10% off for new customers" promo (see offers.html).
// This is only the STARTING value: the main admin can change it (or switch the promo off) on owner.html.
// A student gets it on their FIRST order only, after pressing Submit on the offer
// page. The server checks the student's order history, so it cannot be faked.
// ---------------------------------------------------------------
const FIRST_ORDER_DISCOUNT_PERCENT = 10;

// true  = show the real error message on the page (handy while you are learning)
// false = show a short generic message (use this when other people use the site)
const DEBUG = true;

// ---------------------------------------------------------------
// EMAIL (verification codes). The site sends mail from its own Gmail account.
//
// HOW TO GET THE APP PASSWORD (Gmail does NOT accept the normal password here):
//   1. Sign in to mcccanteen28@gmail.com and turn on 2-Step Verification
//      (Google Account > Security).
//   2. Open https://myaccount.google.com/apppasswords , create an app password named "MCC Canteen".
//   3. Paste the 16 letters below (spaces do not matter).
//
// While MAIL_APP_PASSWORD is empty nothing is emailed: on localhost the code is written to
// mail-outbox.log instead, so you can still test the sign-up on your own computer.
// ---------------------------------------------------------------
const MAIL_HOST         = 'smtp.gmail.com';
const MAIL_PORT         = 465;                          // 465 = SSL
const MAIL_USER         = 'mcccanteen28@gmail.com';
const MAIL_APP_PASSWORD = 'yxuh kunu uumu ozkr';                           // <-- paste the 16-letter Gmail app password here
const MAIL_FROM_NAME    = 'MCC Canteen';
// Laragon on Windows sometimes cannot check Google's certificate ("certificate verify failed").
// If that happens, set this to false (only on your own computer).
const MAIL_VERIFY_SSL   = true;

// Verification code rules
const VERIFY_CODE_MINUTES   = 10;   // how long a code works
const VERIFY_MAX_TRIES      = 5;    // wrong guesses before the code is thrown away
const VERIFY_RESEND_SECONDS = 60;   // wait time before a new code can be sent
