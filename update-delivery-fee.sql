-- Run this ONCE in phpMyAdmin (SQL tab) on your existing canteen database.
-- The delivery fee and the floor are saved in these two new columns.
-- Old orders keep a delivery fee of 0, so their totals do not change.
ALTER TABLE `orders`
  ADD COLUMN `floor` TINYINT NULL DEFAULT NULL AFTER `room`,
  ADD COLUMN `delivery_fee` DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER `discount`;
