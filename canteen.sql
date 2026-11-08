-- =====================================================================
--  MCC Canteen database
--
--  HOW TO IMPORT
--    phpMyAdmin (Laragon):  open http://localhost/phpmyadmin
--                           -> click "Import" (top menu) -> choose this file -> Import
--                           (you do NOT need to create or select a database first)
--    Command line:          mysql -u root < canteen.sql
--
--  WARNING: this REBUILDS the tables users, orders and order_items.
--  If they already exist in the "canteen" database they are deleted and
--  recreated, so any orders/accounts already stored in them are lost.
--  (Export them first with phpMyAdmin > Export if you want to keep them.)
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
DROP TABLE IF EXISTS `order_items`;
DROP TABLE IF EXISTS `orders`;
DROP TABLE IF EXISTS `users`;
SET FOREIGN_KEY_CHECKS = 1;


-- 3. Table: users  (student accounts)
CREATE TABLE `users` (
  `id`            INT          NOT NULL AUTO_INCREMENT,
  `name`          VARCHAR(60)  NOT NULL,
  `email`         VARCHAR(120) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
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
  `note`       VARCHAR(120)  NOT NULL DEFAULT '',
  `subtotal`   DECIMAL(10,2) NOT NULL,
  `status`     ENUM('Preparing','Delivered') NOT NULL DEFAULT 'Preparing',
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


-- 6. Existing accounts
--    Delete this whole block if you want an empty database.
INSERT INTO `users` (`id`, `name`, `email`, `password_hash`, `created_at`) VALUES
(1, 'asdads', 'jath@gmail.com', '$2y$10$XdDzkPSxj9nvtFQj8dKpuO4AVu0SJtxIr70qvf5gQN6J7ylnhiaqq', '2026-11-01 08:00:31'),
(8, 'Jon Bieber Gumtang', 'jonjon@gmail.com', '$2y$10$k09cVk..XAxZf3GIKmzteel9uFKbE4MGZ93JoRNwVTEQE7mZk.Mi6', '2026-11-01 08:14:17');
