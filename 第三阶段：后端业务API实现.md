# 智能菜谱助手 · 后端业务 API 实现报告

**项目代号**：recipe-DB
**文档版本**：v1.0
**记录周期**：2026-04-28 开发里程碑
**撰文人**：snow
**前置依赖**：后端基础链路已打通（Flask ↔ PyMySQL ↔ MySQL），前端 Vite 项目已就绪

---

## 1. 本阶段目标与成果摘要

**核心目标**：实现两个核心业务 API，打通"前端表单填写 → 后端 API 处理 → 数据库持久化"的完整数据闭环。

**实际产出**：
- ✅ `GET /api/options`：返回菜系、季节、口味、难度四张分类表的全部数据，供前端下拉框动态加载。
- ✅ `POST /api/recipes`：接收前端提交的结构化 JSON，使用**数据库事务**原子性地写入 `recipes`、`ingredients`、`recipe_ingredients`、`steps` 四张表。
- ✅ 基础分类数据初始化脚本（`database/seed.sql`），包含 16 种菜系、5 个季节、13 种口味、3 个难度级别。
- ✅ 端到端验证通过：通过模拟 HTTP 请求成功添加"麻婆豆腐"（4 食材 + 5 步骤）和"番茄炒蛋"（3 食材 + 4 步骤）两条完整菜谱记录。

---

## 2. 核心 API 设计与实现

### 2.1 `GET /api/options` — 获取分类选项

**设计意图**：前端页面加载时，需要从后端获取所有分类数据来填充下拉选择框。如果在前端硬编码这些数据，后续修改分类（如新增"西北菜"）就需要同时修改前端代码，违背了数据与展示分离的原则。

**实现要点**：

| 要点 | 说明 |
|------|------|
| 查询范围 | `cuisine`、`season`、`taste`、`difficulty` 四张表 |
| 字段统一 | `difficulty` 表的字段名为 `level`，使用 `AS name` 别名与其余三张表的 `name` 字段对齐 |
| 排序策略 | 按 `id` 升序排列，保证前端下拉框选项顺序稳定 |
| 返回格式 | 单一 JSON 对象，四个 key 分别对应四张表的数组 |

**返回示例**：
```json
{
  "cuisine": [
    {"id": 1, "name": "川菜"},
    {"id": 2, "name": "粤菜"}
  ],
  "season": [
    {"id": 1, "name": "春"},
    {"id": 2, "name": "夏"}
  ],
  "taste": [
    {"id": 1, "name": "麻辣"},
    {"id": 2, "name": "酸辣"}
  ],
  "difficulty": [
    {"id": 1, "name": "简单"},
    {"id": 2, "name": "中等"}
  ]
}
```

**核心代码**（`backend/app.py`）：
```python
@app.route('/api/options', methods=['GET'])
def get_options():
    cursor.execute('SELECT id, name FROM cuisine ORDER BY id')
    cuisine = cursor.fetchall()
    cursor.execute('SELECT id, name FROM season ORDER BY id')
    season = cursor.fetchall()
    cursor.execute('SELECT id, name FROM taste ORDER BY id')
    taste = cursor.fetchall()
    cursor.execute('SELECT id, level AS name FROM difficulty ORDER BY id')
    difficulty = cursor.fetchall()
    return jsonify({"cuisine": cuisine, "season": season, "taste": taste, "difficulty": difficulty})
```

---

### 2.2 `POST /api/recipes` — 创建菜谱（事务性写入）

**设计意图**：一个菜谱的完整数据分散在 `recipes`、`ingredients`、`recipe_ingredients`、`steps` 四张表中。如果分多次请求写入，一旦中间某步失败，就会产生"有菜谱无步骤"或"有步骤无食材"的脏数据。因此必须使用**数据库事务**保证原子性。

#### 事务流程

```
┌─────────────────────────────────────────────────────────┐
│                    请求开始                              │
│  接收 JSON → 校验 title 非空 → conn.autocommit(False)   │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  步骤1：插入 recipes 表                                  │
│  INSERT INTO recipes (...) VALUES (...)                  │
│  → 获取 recipe_id（自增主键）                             │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  步骤2：遍历食材列表，逐个处理                            │
│  ┌─────────────────────────────────────────────────┐    │
│  │ 食材名已存在？ → SELECT id FROM ingredients      │    │
│  │ 是 → 复用已有 ingredient_id                      │    │
│  │ 否 → INSERT INTO ingredients → 获取新 id         │    │
│  └───────────────┬─────────────────────────────────┘    │
│                  ▼                                       │
│  INSERT INTO recipe_ingredients (recipe_id, ingredient_id,│
│                                  quantity, unit, notes)  │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  步骤3：遍历步骤列表，逐个插入                            │
│  INSERT INTO steps (recipe_id, step_number,              │
│                     instruction, duration)               │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  全部成功 → conn.commit() → 返回 201 + recipe_id        │
│  任何异常 → conn.rollback() → 返回 500 + 错误信息       │
└─────────────────────────────────────────────────────────┘
```

#### 食材去重策略

食材表 `ingredients` 的 `name` 字段有 `UNIQUE` 约束。当用户输入"豆腐"时，系统先查询是否已存在：

```python
cursor.execute('SELECT id FROM ingredients WHERE name = %s', (ing_name,))
existing = cursor.fetchone()
if existing:
    ingredient_id = existing['id']    # 复用已有食材
else:
    cursor.execute('INSERT INTO ingredients (name) VALUES (%s)', (ing_name,))
    ingredient_id = cursor.lastrowid  # 创建新食材
```

这种"先查后插"策略避免了重复插入同名食材，同时保证了 `recipe_ingredients` 关联表的外键引用正确性。

#### 前端提交的 JSON 结构

```json
{
  "title": "麻婆豆腐",
  "description": "麻辣鲜香，经典川菜",
  "cuisine_id": 1,
  "season_id": 5,
  "taste_id": 1,
  "difficulty_id": 2,
  "cooking_time": 30,
  "ingredients": [
    {"name": "豆腐", "quantity": 400, "unit": "克", "notes": "老豆腐"},
    {"name": "牛肉馅", "quantity": 100, "unit": "克", "notes": ""}
  ],
  "steps": [
    {"step_number": 1, "instruction": "豆腐切块焯水", "duration": 120},
    {"step_number": 2, "instruction": "炒牛肉馅", "duration": 180}
  ]
}
```

---

## 3. 基础分类数据初始化

### 3.1 数据清单

| 分类表 | 条目数 | 示例数据 |
|--------|--------|---------|
| `cuisine`（菜系） | 16 | 川菜、粤菜、湘菜、鲁菜、苏菜、浙菜、闽菜、徽菜、东北菜、西北菜、云南菜、日料、韩餐、西餐、东南亚菜、其他 |
| `season`（季节） | 5 | 春、夏、秋、冬、四季皆宜 |
| `taste`（口味） | 13 | 麻辣、酸辣、酸甜、清淡、咸鲜、甜、苦、香辣、蒜香、五香、酱香、咖喱、其他 |
| `difficulty`（难度） | 3 | 简单、中等、困难 |

### 3.2 执行方式

提供了两种方式：

**方式一：SQL 脚本（推荐用于部署）**
```sql
-- 在 mysqlsh 中执行
\source D:/project/IndependentProjects/recipe-DB/database/seed.sql
```

**方式二：Python 脚本（开发环境快速初始化）**
```python
# 使用 INSERT IGNORE 避免重复插入
cursor.execute('INSERT IGNORE INTO cuisine (name) VALUES (%s)', ('川菜',))
```

---

## 4. 关键设计决策

### 4.1 为什么用事务而非多条独立请求？

如果不使用事务，前端需要先 `POST /api/recipes` 创建菜谱，拿到 `recipe_id` 后再逐个 `POST /api/ingredients` 和 `POST /api/steps`。这种方案有三个致命缺陷：

1. **网络开销剧增**：一次菜谱提交需要 1 + N(食材) + M(步骤) 次 HTTP 请求。
2. **数据一致性无法保证**：如果第 3 个食材插入失败，前 2 个食材已经写入，产生脏数据。
3. **前端逻辑复杂**：需要处理多步骤的进度跟踪和错误重试。

使用事务后，前端只需**一次 POST 请求**，后端在数据库层面保证"要么全部成功，要么全部失败"。

### 4.2 为什么 `difficulty` 表的字段名是 `level` 而非 `name`？

这是 ER 设计阶段的有意区分：`cuisine`、`season`、`taste` 存储的是"名称"（name），而 `difficulty` 存储的是"级别"（level），语义上更准确（"简单"是一个级别而非名称）。在 API 层通过 `AS name` 别名统一输出，对前端透明。

### 4.3 为什么 `created_by` 设为 NULL？

当前阶段未实现用户登录功能，所有菜谱暂记为匿名提交。后续实现用户系统后，可通过 JWT 或 Session 从请求中提取用户 ID，替换此处的 `None`。

---

## 5. 验证结果

### 5.1 API 测试

| 测试项 | 方法 | 预期结果 | 实际结果 |
|--------|------|---------|---------|
| 获取分类选项 | `GET /api/options` | 返回 4 个数组，共 37 条分类数据 | ✅ 全部返回 |
| 创建菜谱（正常） | `POST /api/recipes` | 返回 201 + recipe_id | ✅ recipe_id = 1 |
| 创建菜谱（空标题） | `POST /api/recipes` | 返回 400 错误 | ✅ 校验生效 |
| 创建菜谱（空 JSON） | `POST /api/recipes` | 返回 400 错误 | ✅ 校验生效 |
| 创建第二个菜谱 | `POST /api/recipes` | 返回 201 + recipe_id | ✅ recipe_id = 2 |

### 5.2 数据库数据完整性验证

```
=== 菜谱1：麻婆豆腐 ===
食材关联数：4（豆腐、牛肉馅、豆瓣酱、花椒）
步骤数：5（焯水 → 炸肉 → 炒红油 → 炖煮 → 出锅）

=== 菜谱2：番茄炒蛋 ===
食材关联数：3（番茄、鸡蛋、葱）
步骤数：4（备料 → 炒蛋 → 炒番茄 → 调味出锅）
```

---

## 6. 当前项目结构

```
recipe-DB/
├── backend/
│   ├── app.py                 # Flask 应用入口（含 /api/options、/api/recipes）
│   ├── database.py            # 数据库连接封装
│   └── ai_service.py          # (预留) AI 服务接口
├── database/
│   ├── schema.sql             # 完整建表脚本（11 张表）
│   └── seed.sql               # 基础分类数据初始化
├── frontend/
│   ├── index.html             # 菜谱添加表单页面
│   ├── vite.config.js         # Vite 配置（含 API 代理）
│   ├── src/
│   │   ├── main.js            # 表单交互逻辑 & API 调用
│   │   └── style.css          # 页面样式
│   └── package.json
├── .env                       # 数据库连接配置
├── pyproject.toml             # Python 项目声明
└── uv.lock                    # 依赖锁定文件
```

---

## 7. 后续开发计划

当前已完成"前端表单 → 后端 API → 数据库"的完整数据闭环。后续可推进：

1. **菜谱查询 API**（`GET /api/recipes`）：支持按菜系、口味、季节等条件筛选，配合复合索引 `idx_filter` 实现高效查询。
2. **菜谱详情 API**（`GET /api/recipes/<id>`）：返回菜谱完整信息（含食材列表和步骤列表），用于详情页展示。
3. **AI 智能搜索**：集成 DeepSeek API，实现自然语言转 SQL 查询。
4. **用户系统**：注册、登录、JWT 鉴权，使 `created_by` 字段真正生效。
5. **收藏功能**：用户收藏/取消收藏菜谱。

---

## 8. 阶段总结

本阶段是项目从"基础设施搭建"迈向"核心业务功能"的关键一步。两个 API 的实现虽然代码量不大，但涵盖了数据库课程设计的多个核心知识点：

- **多表联合写入**：一次请求操作 4 张关联表
- **事务 ACID 特性**：`autocommit(False)` + `commit/rollback` 的完整实践
- **外键约束与级联**：`ON DELETE CASCADE` / `RESTRICT` 的实际应用
- **数据去重策略**：`SELECT → INSERT` 的防重复逻辑
- **前后端数据契约**：JSON 结构设计与字段对齐

这些设计决策和实现细节，都可以作为课程设计报告中的技术亮点进行阐述。
