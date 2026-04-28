-- ===================================================
-- 智能菜谱助手 · 数据库建表脚本
-- 执行方法：在 mysqlsh 中切换到 SQL 模式并 source
-- ===================================================

-- 确保使用正确数据库（如果还没创建，需手动创建，但我们之前已创建 recipe_db）
-- CREATE DATABASE IF NOT EXISTS recipe_db DEFAULT CHARSET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE recipe_db;

-- =========================================
-- 基础分类表（菜系、季节、口味、难度）
-- =========================================
CREATE TABLE cuisine (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE season (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE taste (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE difficulty (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    level VARCHAR(20) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================
-- 用户表
-- =========================================
CREATE TABLE users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================
-- 核心菜谱表
-- =========================================
CREATE TABLE recipes (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    cooking_time INT UNSIGNED COMMENT '总耗时（分钟）',
    cuisine_id INT UNSIGNED,
    season_id INT UNSIGNED,
    taste_id INT UNSIGNED,
    difficulty_id INT UNSIGNED,
    created_by INT UNSIGNED COMMENT '关联 users 表，允许 NULL 表示匿名',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- 外键约束：基础分类数据不可随意删除
    FOREIGN KEY (cuisine_id) REFERENCES cuisine(id) ON DELETE RESTRICT,
    FOREIGN KEY (season_id) REFERENCES season(id) ON DELETE RESTRICT,
    FOREIGN KEY (taste_id) REFERENCES taste(id) ON DELETE RESTRICT,
    FOREIGN KEY (difficulty_id) REFERENCES difficulty(id) ON DELETE RESTRICT,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    
    -- 复合索引：加速 AI 多条件筛选（例如“夏季川菜麻辣”）
    INDEX idx_filter (cuisine_id, taste_id, season_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================
-- 食材表（所有食材和调料统一管理）
-- =========================================
CREATE TABLE ingredients (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================
-- 菜谱-食材关联表（多对多，带用量）
-- =========================================
CREATE TABLE recipe_ingredients (
    recipe_id INT UNSIGNED NOT NULL,
    ingredient_id INT UNSIGNED NOT NULL,
    quantity DECIMAL(6,2) COMMENT '用量数值',
    unit VARCHAR(20) COMMENT '单位，如“克”“勺”',
    notes VARCHAR(255) COMMENT '备注，如“一定不能选内酯豆腐”',
    
    PRIMARY KEY (recipe_id, ingredient_id),
    FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
    FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE RESTRICT,
    
    INDEX idx_recipe (recipe_id),
    INDEX idx_ingredient (ingredient_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================
-- 步骤表（菜谱的烹饪步骤，有序）
-- =========================================
CREATE TABLE steps (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    recipe_id INT UNSIGNED NOT NULL,
    step_number INT UNSIGNED NOT NULL COMMENT '步骤序号，从1开始',
    instruction TEXT NOT NULL,
    duration INT UNSIGNED COMMENT '该步骤预计耗时（秒）',
    
    FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
    INDEX idx_recipe_steps (recipe_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================
-- 自由标签表（例如“爆汁”“下饭菜”）
-- =========================================
CREATE TABLE tags (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================
-- 菜谱-标签关联表（多对多）
-- =========================================
CREATE TABLE recipe_tags (
    recipe_id INT UNSIGNED NOT NULL,
    tag_id INT UNSIGNED NOT NULL,
    
    PRIMARY KEY (recipe_id, tag_id),
    FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE RESTRICT,
    
    INDEX idx_recipe_tag (recipe_id),
    INDEX idx_tag_recipe (tag_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================
-- 收藏表（用户收藏菜谱）
-- =========================================
CREATE TABLE favorites (
    user_id INT UNSIGNED NOT NULL,
    recipe_id INT UNSIGNED NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY (user_id, recipe_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
    
    INDEX idx_user_favorites (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================
-- 浏览历史表（记录用户查看过的菜谱）
-- =========================================
CREATE TABLE history (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    recipe_id INT UNSIGNED NOT NULL,
    viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
    
    INDEX idx_user_history (user_id),
    UNIQUE KEY uniq_user_recipe (user_id, recipe_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
