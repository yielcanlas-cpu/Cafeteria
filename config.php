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
// Log in with it on login.html and you land on the staff page (staff.html).
//
// CHANGE THE PASSWORD BEFORE THE FIRST RUN. (It is only used when the
// account is created. Changing it later here does not change an existing account.)
// ---------------------------------------------------------------
const ADMIN_NAME     = 'Canteen Admin';
const ADMIN_EMAIL    = 'admin@mcc.local';
const ADMIN_PASSWORD = '123456';

// ---------------------------------------------------------------
// The "10% off for new customers" promo (see offers.html).
// A student gets it on their FIRST order only, after pressing Submit on the offer
// page. The server checks the student's order history, so it cannot be faked.
// ---------------------------------------------------------------
const FIRST_ORDER_DISCOUNT_PERCENT = 10;

// true  = show the real error message on the page (handy while you are learning)
// false = show a short generic message (use this when other people use the site)
const DEBUG = true;
