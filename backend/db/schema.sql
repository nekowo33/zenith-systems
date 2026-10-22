CREATE DATABASE IF NOT EXISTS zenith_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE zenith_db;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS laptops (
  id INT AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(191) NOT NULL UNIQUE,
  brand VARCHAR(50) NOT NULL,
  model VARCHAR(150) NOT NULL,
  category ENUM('everyday','work','gaming','creator','programming','chromebook','two_in_one','macbook','budget') NOT NULL,
  price_php INT NOT NULL,
  cpu VARCHAR(150) NOT NULL,
  gpu VARCHAR(150) NULL,
  ram_gb INT NOT NULL,
  storage_gb INT NOT NULL,
  display VARCHAR(150) NULL,
  battery_hours DECIMAL(4,1) NULL,
  weight_kg DECIMAL(3,2) NULL,
  os VARCHAR(100) NOT NULL,
  image_url VARCHAR(255) NULL,
  summary TEXT NULL,
  stock_qty INT NOT NULL DEFAULT 0,
  release_year INT NULL,
  is_active BOOLEAN NOT NULL DEFAULT 1,
  INDEX idx_laptops_category (category),
  INDEX idx_laptops_brand (brand),
  INDEX idx_laptops_price (price_php)
);

CREATE TABLE IF NOT EXISTS laptop_use_cases (
  laptop_id INT NOT NULL,
  use_case ENUM('school','office','creating','gaming','programming') NOT NULL,
  PRIMARY KEY (laptop_id, use_case),
  FOREIGN KEY (laptop_id) REFERENCES laptops(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cart_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  laptop_id INT NOT NULL,
  quantity INT NOT NULL,
  UNIQUE KEY uq_cart_user_laptop (user_id, laptop_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (laptop_id) REFERENCES laptops(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  total_php INT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  laptop_id INT NOT NULL,
  quantity INT NOT NULL,
  unit_price_php INT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (laptop_id) REFERENCES laptops(id)
);
