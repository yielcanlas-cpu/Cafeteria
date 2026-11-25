-- =====================================================================
--  MCC Canteen database
--
--  HOW TO IMPORT
--    phpMyAdmin (Laragon):  open http://localhost/phpmyadmin
--                           -> click "Import" (top menu) -> choose this file -> Import
--                           (you do NOT need to create or select a database first)
--    Command line:          mysql -u root < canteen.sql
--
--  WARNING: this REBUILDS the tables users, orders, order_items and messages.
--  If they already exist in the "canteen" database they are deleted and
--  recreated, so any orders/accounts already stored in them are lost.
--  (Export them first with phpMyAdmin > Export if you want to keep them.)
--
--  IMPORTING IS OPTIONAL: the website creates and upgrades these tables by
--  itself the first time it is used. Import only if you want to start fresh.
--
--  The staff (admin) account is created automatically by the website the first
--  time it is used. Its email and password are set in config.php.
-- =====================================================================

-- 1. Create the database (if it does not exist yet) and use it
CREATE DATABASE IF NOT EXISTS `canteen`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `canteen`;

SET NAMES utf8mb4;


-- 2. Remove old versions of the tables so they are rebuilt with the right columns.
--    (Foreign key checks are switched off so the order of dropping does not matter.)
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS `email_codes`;
DROP TABLE IF EXISTS `messages`;
DROP TABLE IF EXISTS `menu_list`;
DROP TABLE IF EXISTS `site_settings`;
DROP TABLE IF EXISTS `order_items`;
DROP TABLE IF EXISTS `orders`;
DROP TABLE IF EXISTS `users`;
SET FOREIGN_KEY_CHECKS = 1;


-- 3. Table: users  (student accounts + the staff account)
CREATE TABLE `users` (
  `id`            INT          NOT NULL AUTO_INCREMENT,
  `name`          VARCHAR(60)  NOT NULL,
  `email`         VARCHAR(120) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role`          ENUM('student','admin','owner') NOT NULL DEFAULT 'student',   -- owner = the main admin (owner.html)
  `phone`         VARCHAR(20)  NOT NULL DEFAULT '',
  `location`      VARCHAR(80)  NOT NULL DEFAULT '',
  `bio`           VARCHAR(200) NOT NULL DEFAULT '',
  `birthdate`     DATE         NULL DEFAULT NULL,
  `promo_claimed_at` TIMESTAMP NULL DEFAULT NULL,   -- when the student passed the first-time-customer check
  `active`        TINYINT(1)   NOT NULL DEFAULT 1,   -- 0 = suspended by the main admin
  `email_verified` TINYINT(1)  NOT NULL DEFAULT 1,   -- new student sign-ups start at 0 until they type the emailed code (staff/admin: always 1)
  `created_at`    TIMESTAMP    NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=9
  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 4. Table: orders  (one row per order; needs users)
CREATE TABLE `orders` (
  `id`         INT           NOT NULL AUTO_INCREMENT,
  `user_id`    INT           NOT NULL,
  `room`       VARCHAR(10)   NOT NULL,
  `floor`      TINYINT       NULL DEFAULT NULL,       -- 1 = First Floor, 2 = Second Floor
  `note`       VARCHAR(120)  NOT NULL DEFAULT '',
  `subtotal`   DECIMAL(10,2) NOT NULL,
  `discount`   DECIMAL(10,2) NOT NULL DEFAULT 0,      -- first-order promo
  `delivery_fee` DECIMAL(10,2) NOT NULL DEFAULT 0,    -- once per order (subtotal - discount + delivery_fee = total)
  `status`     ENUM('Preparing','Ready','Delivered','Cancelled') NOT NULL DEFAULT 'Preparing',
  `created_at` TIMESTAMP     NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `orders_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=49
  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 5. Table: order_items  (the foods inside each order; needs orders)
CREATE TABLE `order_items` (
  `id`         INT           NOT NULL AUTO_INCREMENT,
  `order_id`   INT           NOT NULL,
  `item_id`    INT           NOT NULL,
  `name`       VARCHAR(80)   NOT NULL,
  `price`      DECIMAL(10,2) NOT NULL,
  `qty`        INT           NOT NULL,
  `line_total` DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `order_id` (`order_id`),
  CONSTRAINT `order_items_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=22
  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 5b. Table: messages  (contact page + the students' Messages window; staff reply here)
CREATE TABLE `messages` (
  `id`         INT           NOT NULL AUTO_INCREMENT,
  `user_id`    INT           NULL,
  `name`       VARCHAR(60)   NOT NULL,
  `email`      VARCHAR(120)  NOT NULL,
  `subject`    VARCHAR(100)  NOT NULL DEFAULT '',
  `message`    VARCHAR(1000) NOT NULL,
  `reply`      VARCHAR(1000) NULL,
  `replied_at` TIMESTAMP     NULL DEFAULT NULL,
  `created_at` TIMESTAMP     NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `messages_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 5c. Table: menu_list  (the menu; the main admin edits it on owner.html)
CREATE TABLE `menu_list` (
  `id`         INT           NOT NULL AUTO_INCREMENT,
  `name`       VARCHAR(80)   NOT NULL,
  `price`      DECIMAL(10,2) NOT NULL,
  `category`   VARCHAR(20)   NOT NULL DEFAULT 'Other',
  `available`  TINYINT(1)    NOT NULL DEFAULT 1,
  `sort_order` INT           NOT NULL DEFAULT 0,
  `image`      VARCHAR(120)  NOT NULL DEFAULT '',   -- photo shown for foods that have no button in index.html
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- (The other dishes of menu.html are added by the website itself the first time it is used.)
INSERT INTO `menu_list` (`id`, `name`, `price`, `category`, `sort_order`) VALUES
(1, 'Kwek-kwek', 5, 'Meryenda', 1), (2, 'Turon', 15, 'Meryenda', 2), (3, 'Iced Tea', 15, 'Drinks', 3),
(4, 'Chicken Katsu', 60, 'Rice Meal', 4), (5, 'Kare-kare', 60, 'Rice Meal', 5), (6, 'Ham & Cheese', 60, 'Meryenda', 6),
(7, 'Red Tea', 60, 'Drinks', 7), (8, 'Coffee & Cookies', 90, 'Bundle', 8), (9, 'Siomai & drink', 85, 'Bundle', 9),
(10, 'Coffee & Fries', 200, 'Bundle', 10), (11, 'Rice meal + Coke', 85, 'Bundle', 11);

-- 5d. Table: settings  (small switches, e.g. the first-order promo on/off and its percent)
CREATE TABLE `site_settings` (
  `k` VARCHAR(40)  NOT NULL,
  `v` VARCHAR(200) NOT NULL,
  PRIMARY KEY (`k`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `site_settings` (`k`, `v`) VALUES ('promo_enabled', '1'), ('promo_percent', '10');

-- NOTE: the MAIN ADMIN (owner) account is created automatically by the website the first time
-- it is used (see config.php: OWNER_EMAIL / OWNER_PASSWORD).


-- 6. Existing accounts (students)
--    Delete this whole block if you want an empty database.
INSERT INTO `users` (`id`, `name`, `email`, `password_hash`, `created_at`) VALUES
(1, 'asdads', 'jath@gmail.com', '$2y$10$XdDzkPSxj9nvtFQj8dKpuO4AVu0SJtxIr70qvf5gQN6J7ylnhiaqq', '2026-11-01 08:00:31'),
(8, 'Jon Bieber Gumtang', 'jonjon@gmail.com', '$2y$10$k09cVk..XAxZf3GIKmzteel9uFKbE4MGZ93JoRNwVTEQE7mZk.Mi6', '2026-11-01 08:14:17');
