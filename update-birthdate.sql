-- Run this ONCE in phpMyAdmin (SQL tab) on your existing canteen database.
-- The new profile page saves the birthdate in this column.
ALTER TABLE `users` ADD COLUMN `birthdate` DATE NULL DEFAULT NULL AFTER `bio`;
