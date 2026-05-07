# Recipe-DB Ubuntu 服务器部署指南

## 一、前置准备

### 1.1 服务器要求

| 项目 | 最低配置 | 推荐配置 |
|------|---------|---------|
| 操作系统 | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |
| CPU | 1 核 | 2 核及以上 |
| 内存 | 1 GB | 2 GB 及以上 |
| 磁盘 | 10 GB | 20 GB 及以上 |
| Python | 3.10+ | 3.11+ |
| Node.js | 20.19.0+ | 20 LTS |
| MySQL | 8.0 | 8.0 |

### 1.2 所需软件

- **Git** — 代码版本管理
- **Python 3 + uv** — 后端运行环境
- **Node.js 20 LTS** — 前端构建环境
- **MySQL 8.0** — 数据库
- **Nginx** — 反向代理与静态文件服务
- **ngrok** — 公网隧道穿透（可选）

### 1.3 网络拓扑

```
公网用户 → ngrok 隧道 → Ubuntu 服务器 (192.168.5.2:80)
                                    ↓
                          Nginx 反向代理
                         /              \
                  静态文件 (dist)    Flask API (127.0.0.1:5000)
                                            ↓
                                       MySQL (recipe_db)
```

---

## 二、基础环境搭建

### 2.1 系统更新

```bash
sudo apt update && sudo apt upgrade -y
```

### 2.2 安装基础工具

```bash
sudo apt install -y git curl wget
```

### 2.3 安装 MySQL

```bash
sudo apt install -y mysql-server
sudo systemctl enable mysql
sudo systemctl start mysql
```

验证安装：
```bash
mysql --version
```

### 2.4 配置 MySQL 用户与数据库

```bash
sudo mysql
```

在 MySQL 交互界面中执行：

```sql
CREATE USER 'recipe_admin'@'localhost' IDENTIFIED BY 'Snowsong_42';
CREATE USER 'recipe_admin'@'%' IDENTIFIED BY 'Snowsong_42';
GRANT ALL PRIVILEGES ON recipe_db.* TO 'recipe_admin'@'localhost';
GRANT ALL PRIVILEGES ON recipe_db.* TO 'recipe_admin'@'%';
FLUSH PRIVILEGES;
CREATE DATABASE recipe_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
EXIT;
```

> ⚠️ 密码请自行替换为强密码。`utf8mb4_unicode_ci` 是跨版本兼容性最好的排序规则。

### 2.5 导入数据库表结构

```bash
sudo mysql -u recipe_admin -p recipe_db < ~/recipe-DB/database/schema.sql
```

### 2.6 安装 Node.js 20 LTS

Ubuntu 22.04 默认源提供的是 Node.js 12，版本太旧，需要通过 NodeSource 安装新版：

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

验证版本：
```bash
node --version   # 应输出 v20.x.x
npm --version    # 应输出 10.x.x
```

### 2.7 安装 uv 并同步依赖

```bash
# 安装 uv（包管理器，替代 pip）
curl -LsSf https://astral.sh/uv/install.sh | sh

# 重新登录以使 uv 命令生效，或直接 source 环境变量
source ~/.bashrc

# 进入项目目录，自动创建虚拟环境并安装所有依赖
cd ~/recipe-DB
uv sync
```

`uv sync` 会自动读取 `pyproject.toml` 中的依赖列表，并按 `uv.lock` 锁定版本精确安装，效果等价于 `pip install` 全部依赖，但版本可控、速度更快。

---

## 三、代码部署

### 3.1 从 Git 拉取代码

```bash
git clone https://github.com/snowsong42/recipe-DB.git ~/recipe-DB
```

如果已克隆，则拉取最新代码：
```bash
cd ~/recipe-DB
git pull origin main
```

### 3.2 配置环境变量

创建 `.env` 文件：

```bash
nano ~/recipe-DB/.env
```

内容如下：
```
DB_HOST=localhost
DB_USER=recipe_admin
DB_PASSWORD=Snowsong_42
DB_NAME=recipe_db
DEEPSEEK_API_KEY=sk-你的真实密钥
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

> ⚠️ `DEEPSEEK_API_KEY` 必须替换为你的真实 DeepSeek API Key，否则 Vibe 搜索功能不可用。

### 3.3 安装 Python 依赖

项目使用 `uv` 管理依赖，所有依赖已声明在 `pyproject.toml` 中。只需执行：

```bash
cd ~/recipe-DB
uv sync
```

`uv sync` 会自动创建 `.venv`（如果不存在），从 `pyproject.toml` 读取依赖，并按 `uv.lock` 精确锁定版本安装。

各依赖作用：

| 包名 | 用途 |
|------|------|
| flask | Web 框架，提供 RESTful API |
| pymysql | MySQL 数据库驱动 |
| python-dotenv | 加载 `.env` 环境变量 |
| flask-cors | 处理跨域请求 |
| openai | 调用 DeepSeek API（兼容 OpenAI 接口） |
| cryptography | MySQL 8.0 caching_sha2_password 认证所需 |

---

## 四、后端部署（systemd 服务）

### 4.1 创建 systemd 服务文件

```bash
sudo nano /etc/systemd/system/recipe-db.service
```

填入以下内容：

```ini
[Unit]
Description=Recipe DB Flask Backend
After=network.target mysql.service

[Service]
User=snow
WorkingDirectory=/home/snow/recipe-DB
Environment="PATH=/home/snow/recipe-DB/.venv/bin"
ExecStart=/home/snow/recipe-DB/.venv/bin/python backend/app.py
Restart=always

[Install]
WantedBy=multi-user.target
```

> ⚠️ 将 `User=snow` 和 `/home/snow/` 路径替换为你的实际用户名。

### 4.2 启动服务

```bash
sudo systemctl daemon-reload
sudo systemctl enable recipe-db
sudo systemctl start recipe-db
sudo systemctl status recipe-db
```

确认输出中显示 `active (running)`。

### 4.3 验证后端

```bash
curl http://127.0.0.1:5000/api/stats
```

应返回 JSON 格式的统计数据。

---

## 五、前端构建与 Nginx 配置

### 5.1 构建前端

```bash
cd ~/recipe-DB/frontend
npm install
npx vite build
```

成功输出示例：
```
dist/index.html                 20.79 kB │ gzip: 4.64 kB
dist/assets/index-CFKpIOHw.css  21.60 kB │ gzip: 4.61 kB
dist/assets/index-8Ihlmiz4.js   41.22 kB │ gzip: 9.57 kB
✓ built in 76ms
```

> 如果提示 `vite` 权限不足，先执行 `chmod +x node_modules/.bin/vite` 再构建。

### 5.2 安装并配置 Nginx

```bash
sudo apt install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

### 5.3 创建 Nginx 站点配置

```bash
sudo nano /etc/nginx/sites-available/recipe-db
```

填入以下内容：

```nginx
server {
    listen 80;
    server_name 192.168.5.2;

    root /home/snow/recipe-DB/frontend/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

> ⚠️ 将 `server_name` 和 `root` 路径替换为你的实际 IP 和用户名。

### 5.4 启用站点

```bash
sudo ln -sf /etc/nginx/sites-available/recipe-db /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t                # 测试配置是否正确
sudo systemctl restart nginx
```

### 5.5 权限问题处理

如果 Nginx 报 `Permission denied` 错误（日志位于 `/var/log/nginx/error.log`）：

```bash
# 开放静态文件目录的读取权限
chmod -R 755 ~/recipe-DB/frontend/dist
chmod +x ~/recipe-DB/frontend
sudo systemctl restart nginx
```

> **原因**：Nginx 以 `www-data` 用户运行，默认无权限访问 `/home/用户名/` 下的文件。

### 5.6 防火墙配置

```bash
sudo ufw allow 22/tcp      # SSH
sudo ufw allow 80/tcp      # HTTP
sudo ufw --force enable
sudo ufw status            # 验证规则
```

---

## 六、数据库迁移（Windows → Ubuntu）

### 6.1 在 Windows 上导出数据

#### ⚠️ 关键注意事项：PowerShell 重定向编码问题

Windows PowerShell 的 `>` 重定向操作符会生成 UTF-16 编码的文件，MySQL 无法识别。**必须使用 `--result-file` 参数。**

正确导出命令（在 Windows PowerShell 中执行）：

```powershell
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe" --no-tablespaces --default-character-set=utf8mb4 -u recipe_admin -p recipe_db --result-file=D:\project\IndependentProjects\recipe-DB\database\dump.sql
```

参数说明：
- `--no-tablespaces` — 跳过表空间导出（避免权限报错）
- `--default-character-set=utf8mb4` — 指定字符集
- `--result-file=路径` — **必须使用**，避免 UTF-16 编码问题

### 6.2 将文件传输到 Ubuntu

```powershell
scp D:\project\IndependentProjects\recipe-DB\database\dump.sql snow@192.168.5.2:~/recipe-DB/database/dump.sql
```

### 6.3 在 Ubuntu 上导入数据

```bash
# 1. 替换不兼容的排序规则（Windows 的 utf8mb4_0900_ai_ci 在旧版 MySQL 中不可用）
sed -i 's/utf8mb4_0900_ai_ci/utf8mb4_unicode_ci/g' ~/recipe-DB/database/dump.sql

# 2. 重建数据库（清除之前导入的空表结构）
sudo mysql -u recipe_admin -p recipe_db -e "DROP DATABASE IF EXISTS recipe_db; CREATE DATABASE recipe_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 3. 导入数据
sudo mysql -u recipe_admin -p recipe_db < ~/recipe-DB/database/dump.sql
```

### 6.4 验证导入结果

```bash
sudo mysql -u recipe_admin -p recipe_db -e "SELECT COUNT(*) AS total_recipes FROM recipes;"
```

### 6.5 重启后端服务

```bash
sudo systemctl restart recipe-db
```

### 6.6 迁移问题速查表

| 问题 | 原因 | 解决方法 |
|------|------|----------|
| `mysqldump` 命令找不到 | Windows PATH 未包含 MySQL bin 目录 | 使用完整路径 `"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe"` |
| `Access denied; need PROCESS privilege` | 默认导出包含表空间信息 | 添加 `--no-tablespaces` 参数 |
| 导入时报 `ASCII '\0'` 错误 | dump 文件为 UTF-16 编码 | 使用 `--result-file` 重新导出 |
| 导入时中文乱码 | 编码问题或字符集不匹配 | 确保导出和导入都使用 `utf8mb4` |
| `utf8mb4_0900_ai_ci` 排序规则错误 | Windows MySQL 8.0.46 默认规则在旧版不可用 | 用 `sed` 替换为 `utf8mb4_unicode_ci` |

---

## 七、公网访问（ngrok）

### 7.1 安装 ngrok

```bash
curl -sSL https://ngrok-agent.s3.amazonaws.com/ngrok.asc | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc
echo "deb https://ngrok-agent.s3.amazonaws.com buster main" | sudo tee /etc/apt/sources.list.d/ngrok.list
sudo apt update && sudo apt install -y ngrok
```

### 7.2 配置 Auth Token

在 [ngrok.com](https://ngrok.com) 注册账号后，在 Dashboard 获取 Auth Token：

```bash
ngrok config add-authtoken 你的AuthToken
```

### 7.3 注册为 systemd 服务（持久化运行）

直接运行 `ngrok http 80` 会在退出 SSH 后断开，必须注册为系统服务。

#### 7.3.1 确认 ngrok 安装路径

```bash
which ngrok
# 通常输出：/usr/local/bin/ngrok
```

#### 7.3.2 创建服务文件

```bash
sudo nano /etc/systemd/system/ngrok.service
```

填入以下内容：

```ini
[Unit]
Description=ngrok HTTP Tunnel
After=network.target nginx.service

[Service]
Type=simple
User=snow
ExecStart=/usr/local/bin/ngrok http 80 --log=stdout
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

> ⚠️ `ExecStart` 中的路径必须与 `which ngrok` 输出一致。

#### 7.3.3 启动服务

```bash
sudo systemctl daemon-reload
sudo systemctl enable ngrok
sudo systemctl start ngrok
sudo systemctl status ngrok
```

确认输出中显示 `active (running)`。

#### 7.3.4 获取公网地址

查看日志找到转发地址：

```bash
sudo journalctl -u ngrok --no-pager | grep "started tunnel"
```

输出示例：
```
started tunnel name=command_line addr=http://localhost:80 url=https://heading-divisive-spent.ngrok-free.dev
```

#### 7.3.5 可能遇到的问题

**问题：`status=203/EXEC` 错误**

```
Process: 4315 ExecStart=/usr/bin/ngrok http 80 --log=stdout (code=exited, status=203/EXEC)
```

**原因**：服务文件中的 `ExecStart` 路径错误。

**解决**：
```bash
which ngrok          # 确认实际路径，如 /usr/local/bin/ngrok
sudo sed -i 's|/usr/bin/ngrok|/usr/local/bin/ngrok|' /etc/systemd/system/ngrok.service
sudo systemctl daemon-reload
sudo systemctl restart ngrok
```

---

## 八、后续更新维护操作

### 8.1 代码更新部署流程

当在 Windows 开发机上修改代码并推送至 GitHub 后，在 Ubuntu 上执行完整更新：

```bash
# 1. SSH 登录服务器
ssh snow@192.168.5.2

# 2. 拉取最新代码
cd ~/recipe-DB
git pull origin main

# 3. 更新 Python 依赖（如果有新增）
uv sync   # 自动读取 pyproject.toml，按 uv.lock 锁定版本安装

# 4. 重新构建前端（如果前端代码有修改）
cd ~/recipe-DB/frontend
npm install
npx vite build

# 5. 重启后端服务
sudo systemctl restart recipe-db

# 6. 重启 Nginx（如果 Nginx 配置有修改）
sudo nginx -t
sudo systemctl restart nginx
```

### 8.2 仅更新前端

如果只修改了前端代码，只需重新构建即可：

```bash
cd ~/recipe-DB/frontend
git pull origin main
npm install
npx vite build
# 不需要重启任何服务，Nginx 会自动加载新文件
```

### 8.3 仅更新后端

如果只修改了后端代码：

```bash
cd ~/recipe-DB
git pull origin main
uv sync                             # 自动读取 pyproject.toml 同步依赖
sudo systemctl restart recipe-db    # 重启 Flask
```

### 8.4 数据库备份与恢复

#### 定时备份（推荐）

创建备份脚本：

```bash
nano ~/backup-recipe-db.sh
```

内容：
```bash
#!/bin/bash
BACKUP_DIR="/home/snow/backup"
mkdir -p $BACKUP_DIR
mysqldump -u recipe_admin -p'Snowsong_42' recipe_db > $BACKUP_DIR/recipe_db_$(date +%Y%m%d_%H%M%S).sql
# 保留最近 30 天的备份，删除更早的
find $BACKUP_DIR -name "recipe_db_*.sql" -mtime +30 -delete
```

设置执行权限并添加定时任务：

```bash
chmod +x ~/backup-recipe-db.sh
crontab -e
```

添加以下行（每天凌晨 3 点备份）：
```
0 3 * * * /home/snow/backup-recipe-db.sh
```

#### 手动备份

```bash
mysqldump -u recipe_admin -p recipe_db > ~/backup/recipe_db_$(date +%Y%m%d).sql
```

#### 恢复数据

```bash
sudo mysql -u recipe_admin -p recipe_db < ~/backup/recipe_db_20260429.sql
```

### 8.5 日志查看

| 组件 | 日志位置 | 实时查看命令 |
|------|---------|-------------|
| Flask 后端 | systemd 日志 | `sudo journalctl -u recipe-db -f` |
| Nginx 访问日志 | `/var/log/nginx/access.log` | `sudo tail -f /var/log/nginx/access.log` |
| Nginx 错误日志 | `/var/log/nginx/error.log` | `sudo tail -f /var/log/nginx/error.log` |
| ngrok 隧道 | systemd 日志 | `sudo journalctl -u ngrok -f` |

### 8.6 服务管理命令速查

| 操作 | recipe-db (Flask) | ngrok (隧道) | nginx (Web 服务器) | mysql (数据库) |
|------|------------------|-------------|-------------------|---------------|
| 查看状态 | `sudo systemctl status recipe-db` | `sudo systemctl status ngrok` | `sudo systemctl status nginx` | `sudo systemctl status mysql` |
| 启动 | `sudo systemctl start recipe-db` | `sudo systemctl start ngrok` | `sudo systemctl start nginx` | `sudo systemctl start mysql` |
| 停止 | `sudo systemctl stop recipe-db` | `sudo systemctl stop ngrok` | `sudo systemctl stop nginx` | `sudo systemctl stop mysql` |
| 重启 | `sudo systemctl restart recipe-db` | `sudo systemctl restart ngrok` | `sudo systemctl restart nginx` | `sudo systemctl restart mysql` |
| 开机自启 | `sudo systemctl enable recipe-db` | `sudo systemctl enable ngrok` | `sudo systemctl enable nginx` | `sudo systemctl enable mysql` |

### 8.7 Git 操作指引

#### 在 Windows 开发机上提交代码

```powershell
cd D:\project\IndependentProjects\recipe-DB
git add .
git commit -m "修改说明"
git push origin main
```

#### 在 Ubuntu 服务器上拉取更新

```bash
cd ~/recipe-DB
git pull origin main
```

> ⚠️ 如果 Ubuntu 上的文件被直接修改过，`git pull` 可能会产生冲突。建议不要直接在服务器上修改代码，统一在 Windows 开发机上修改并推送，服务器只做拉取。

### 8.8 常见故障排查

| 现象 | 可能原因 | 排查步骤 |
|------|---------|---------|
| 浏览器访问返回 **500** | Flask 后端报错 | `sudo journalctl -u recipe-db -n 50` 查看错误日志 |
| 浏览器访问返回 **502** | Nginx 无法连接 Flask | `curl http://127.0.0.1:5000/api/stats` 测试后端是否存活；检查 recipe-db 服务状态 |
| 浏览器访问返回 **403/404** | Nginx 静态文件路径错误或权限不足 | 检查 Nginx 配置中的 `root` 路径；`ls -la ~/recipe-DB/frontend/dist/` 确认目录存在 |
| 前端页面空白（控制台报错） | Vite 构建失败或 dist 目录不完整 | 重新执行 `npx vite build`；检查构建输出是否有错误 |
| Vibe 搜索报错 "openai 库未安装" | Python 依赖缺失 | `uv add openai` |
| Vibe 搜索报错 "cryptography 包缺失" | MySQL 认证库缺失 | `uv add cryptography` |
| Vibe 搜索报错 "API Key 无效" | DeepSeek API Key 未配置或无效 | 检查 `~/.env` 文件中 `DEEPSEEK_API_KEY` 是否正确 |
| 数据库连接失败 | MySQL 未运行或凭据错误 | `sudo systemctl status mysql`；检查 `.env` 中的数据库配置 |
| ngrok 无法连接 | 服务器无法访问海外网络 | 检查网络连通性 `ping 8.8.8.8`；考虑替换为 Cloudflare Tunnel |
| `mysqldump` 导出中文乱码 | PowerShell 重定向用了 UTF-16 | 改用 `--result-file` 参数重新导出 |

### 8.9 安全建议

1. **修改默认密码**：将 `recipe_admin` 的密码改为强密码，并更新 `.env` 文件
2. **关闭 root 远程登录**：MySQL 的 root 用户只允许本地登录
3. **定期更新系统**：`sudo apt update && sudo apt upgrade -y`
4. **监控磁盘空间**：`df -h` 定期检查，避免日志占满磁盘
5. **限制 SSH 登录尝试**：可配置 fail2ban 防止暴力破解

---

## 九、架构总览

### 9.1 组件关系图

```
┌─────────────────────────────────────────────────────┐
│                   公网用户                           │
│   https://heading-divisive-spent.ngrok-free.dev      │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│              ngrok Tunnel (日本节点)                  │
│            Session Status: Online                    │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│           Ubuntu Server (192.168.5.2)                 │
│                                                       │
│  ┌───────────────────────────────────────────────┐   │
│  │           Nginx (监听 80 端口)                 │   │
│  │                                               │   │
│  │  location / {                                 │   │
│  │    root /home/snow/recipe-DB/frontend/dist     │   │
│  │    try_files $uri $uri/ /index.html            │   │
│  │  }                                             │   │
│  │                                               │   │
│  │  location /api/ {                              │   │
│  │    proxy_pass http://127.0.0.1:5000            │   │
│  │  }                                             │   │
│  └──────────┬────────────────────┬───────────────┘   │
│             │                    │                     │
│             ▼                    ▼                     │
│  ┌──────────────────┐  ┌──────────────────┐          │
│  │  Flask Backend   │  │  Static Files    │          │
│  │  127.0.0.1:5000  │  │  (Vite 构建产物)  │          │
│  │  systemd 托管    │  │  dist/           │          │
│  └────────┬─────────┘  └──────────────────┘          │
│           │                                            │
│           ▼                                            │
│  ┌──────────────────┐                                 │
│  │  MySQL 8.0       │                                 │
│  │  recipe_db       │                                 │
│  │  systemd 托管    │                                 │
│  └──────────────────┘                                 │
└─────────────────────────────────────────────────────┘
│
▼
┌─────────────────────────────────────────────────────┐
│          DeepSeek API (AI 菜谱搜索)                  │
│          https://api.deepseek.com                    │
└─────────────────────────────────────────────────────┘
```

### 9.2 端口对应表

| 端口 | 用途 | 绑定地址 | 防火墙 |
|------|------|---------|--------|
| 22 | SSH 远程登录 | 0.0.0.0 | ✅ 已放行 |
| 80 | HTTP（Nginx + ngrok） | 0.0.0.0 | ✅ 已放行 |
| 5000 | Flask API（仅内网） | 127.0.0.1 | ❌ 不对外开放 |
| 3306 | MySQL（仅内网） | 127.0.0.1 | ❌ 不对外开放 |

### 9.3 服务依赖关系

```
nginx.service  ─── 依赖 ───→ network.target
                                    ↑
recipe-db.service ─── 依赖 ───→ network.target, mysql.service
                                    ↑
ngrok.service    ─── 依赖 ───→ network.target, nginx.service
                                    ↑
mysql.service    ─── 依赖 ───→ network.target
```

### 9.4 文件目录结构（服务器端）

```
/home/snow/recipe-DB/
├── .env                    # 环境变量（数据库密码、API Key）
├── .venv/                  # Python 虚拟环境
├── backend/
│   ├── app.py              # Flask 主程序
│   ├── ai_service.py       # DeepSeek AI 搜索服务
│   └── database.py         # 数据库连接模块
├── frontend/
│   ├── dist/               # Vite 构建产物（Nginx 提供静态服务）
│   ├── index.html          # 入口 HTML
│   └── src/                # 前端源代码
├── database/
│   ├── schema.sql          # 数据库表结构
│   └── dump.sql            # 从 Windows 导入的数据备份
└── backend/
    └── (后端代码)
```

---

> **编写日期**：2026 年 4 月 30 日
> 
> **适用环境**：Ubuntu 22.04 LTS + MySQL 8.0 + Python 3.11 + Node.js 20 + Nginx 1.18
> 
> **公网访问地址**：`https://heading-divisive-spent.ngrok-free.dev`
> 
> **内网访问地址**：`http://192.168.5.2`
