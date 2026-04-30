# Recipe-DB

`Python 3.11` `Flask` `PyMySQL` `MySQL 8.0` `Vite` `Vanilla JS` `DeepSeek API` `Nginx`

[![Python](https://img.shields.io/badge/Python-3.11-blue?logo=python)](https://www.python.org/)
[![Flask](https://img.shields.io/badge/Flask-3.1-lightgrey?logo=flask)](https://flask.palletsprojects.com/)
[![MySQL](https://img.shields.io/badge/MySQL-8.0-orange?logo=mysql)](https://www.mysql.com/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite)](https://vite.dev/)
[![DeepSeek](https://img.shields.io/badge/AI-DeepSeek-4F6BED)](https://deepseek.com/)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

> 基于自然语言理解的智能菜谱管理系统。输入"今天想吃点清淡的"或"来个下饭菜"，AI 理解你的需求，从数据库匹配或生成合适的菜谱。
>
> —— 数据库课程设计作品，从 Windows 开发到 Ubuntu 部署上线的全栈实践。

---

## Features

- **AI Vibe Search** — 用自然语言描述需求，DeepSeek 理解语义并从数据库推荐或 AI 生成菜谱
- **Multi-condition Search** — 按菜系、季节、口味、难度精确筛选，支持关键词模糊搜索
- **Full CRUD** — 菜谱的创建、编辑、查看、删除，含食材和步骤的事务级写入
- **User System** — 注册 / 登录 / 收藏 / 浏览历史自动记录
- **Admin Dashboard** — 用户管理、菜谱管理、食材管理，仅 root 账号可访问
- **Growth Analytics** — 统计面板含饼图与增长曲线，展示菜谱/用户/浏览量的累积趋势

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vite + Vanilla JavaScript, Chart.js |
| Backend | Flask + PyMySQL |
| Database | MySQL 8.0 |
| AI | DeepSeek API (Chat) |
| Deployment | Nginx, systemd, ngrok |

## Quick Start

```bash
# 1. 克隆仓库
git clone https://github.com/snowsong42/recipe-DB.git
cd recipe-DB

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，填入数据库连接信息和 DeepSeek API Key

# 3. 启动服务（详见下方指南）
```

完整的环境搭建、数据库初始化、前后端启动步骤，请参考：

> **[RECIPE-DB_WINDOWS_DEV_GUIDE.md](./RECIPE-DB_WINDOWS_DEV_GUIDE.md)** — Windows 本地开发测试指南

## Deploy to Ubuntu

完整的从零部署流程，含 MySQL 迁移、Nginx 反向代理、systemd 服务注册、ngrok 公网穿透：

> **[RECIPE-DB_UBUNTU_DEPLOY_GUIDE.md](./RECIPE-DB_UBUNTU_DEPLOY_GUIDE.md)** — Ubuntu 服务器部署指南

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/options` | 获取分类选项（菜系/季节/口味/难度） |
| `GET` | `/api/recipes` | 菜谱列表（支持筛选和搜索） |
| `GET` | `/api/recipes/:id` | 菜谱详情（含食材和步骤） |
| `POST` | `/api/recipes` | 创建菜谱（事务写入） |
| `PUT` | `/api/recipes/:id` | 编辑菜谱 |
| `GET` | `/api/recipes/user/:id` | 用户发布的菜谱 |
| `GET` | `/api/stats` | 系统统计数据 |
| `GET` | `/api/stats/trend` | 增长曲线数据（按类型/天数） |
| `GET` | `/api/stats/ingredients-recent` | 最近新增食材 |
| `POST` | `/api/auth/register` | 用户注册 |
| `POST` | `/api/auth/login` | 用户登录 |
| `GET` | `/api/auth/me` | 获取当前用户信息 |
| `POST` | `/api/auth/logout` | 退出登录 |
| `GET` | `/api/favorites` | 用户收藏列表 |
| `POST` | `/api/favorites/:id` | 收藏菜谱 |
| `DELETE` | `/api/favorites/:id` | 取消收藏 |
| `GET` | `/api/favorites/:id/status` | 检查收藏状态 |
| `GET` | `/api/history` | 浏览历史列表 |
| `POST` | `/api/history` | 记录浏览历史 |
| `POST` | `/api/ai/generate` | AI 生成菜谱 |
| `POST` | `/api/ai/search` | AI 自然语言搜索 |
| `POST` | `/api/ai/vibe-search` | AI Vibe 推荐（首页大输入框） |
| `GET` | `/api/admin/users` | *管理员* 用户列表 |
| `DELETE` | `/api/admin/users/:id` | *管理员* 删除用户 |
| `GET` | `/api/admin/recipes` | *管理员* 菜谱列表 |
| `DELETE` | `/api/admin/recipes/:id` | *管理员* 删除菜谱 |
| `GET` | `/api/admin/ingredients` | *管理员* 食材列表 |
| `PUT` | `/api/admin/ingredients/:id` | *管理员* 修改食材 |
| `DELETE` | `/api/admin/ingredients/:id` | *管理员* 删除食材 |

## Project Structure

```
recipe-DB/
├── backend/
│   ├── app.py              # Flask 主入口（全部 API 路由）
│   ├── database.py         # 数据库连接封装
│   └── ai_service.py       # DeepSeek AI 服务层
├── frontend/
│   ├── index.html          # 页面主入口
│   ├── vite.config.js      # Vite 配置（含 API 代理）
│   └── src/
│       ├── main.js         # 前端交互逻辑
│       └── style.css       # 全局样式
├── database/
│   ├── schema.sql          # 完整建表脚本（12 张表）
│   └── seed.sql            # 初始种子数据
├── .env                    # 环境变量（数据库 & API Key）
├── .gitignore
├── pyproject.toml
├── start_server.bat
├── RECIPE-DB_WINDOWS_DEV_GUIDE.md
└── RECIPE-DB_UBUNTU_DEPLOY_GUIDE.md
```

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

## Acknowledgments

做这个项目的时候刚好 V4 发布了，致谢一下。

"开源、高效、低图形、可部署"，这个生态位 linux 实践过，算是蛮不错的生存之道。

「不诱于誉，不恐于诽，率道而行，端然正己。」彰显了自由软件运动的格局与素养。

开源精神是共产主义的序曲。推广到社会的方方面面，世界将会更公平、更宜居、更普惠。

哪怕十年、二十年以后，DS 结局不尽如人意，我大概也依然会逢人便说：

**"I use deepseek, btw".**

开源不灭 🤘
