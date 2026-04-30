# Recipe-DB Windows 本地开发测试指南

## 一、前置准备

### 1.1 系统要求

| 项目 | 要求 |
|------|------|
| 操作系统 | Windows 10 或 Windows 11 |
| MySQL | 8.0.x（Windows 安装版） |
| Python | 3.10+ |
| Node.js | 20.19.0+ |
| npm | 10.x+（随 Node.js 一起安装） |
| Git | 任意版本 |

### 1.2 检查已有环境

打开 PowerShell 或 cmd，执行以下命令确认各项工具是否就绪：

```powershell
# 检查 MySQL
sc query MySQL80 | find "RUNNING"

# 检查 Python
python --version

# 检查 Node.js
node --version

# 检查 npm
npm --version

# 检查 Git
git --version
```

### 1.3 项目目录结构

```
D:\project\IndependentProjects\recipe-DB\
├── .env                        # 环境变量配置（需手动创建）
├── .venv/                      # Python 虚拟环境
├── backend/
│   ├── app.py                  # Flask 后端主程序
│   ├── ai_service.py           # DeepSeek AI 搜索服务
│   └── database.py             # MySQL 数据库连接模块
├── frontend/
│   ├── index.html              # 入口 HTML
│   ├── package.json            # 前端依赖与脚本
│   ├── vite.config.js          # Vite 开发服务器配置
│   └── src/
│       └── main.js             # 前端主逻辑
├── database/
│   └── schema.sql              # 数据库表结构
└── start_server.bat            # 一键启动脚本
```

---

## 二、MySQL 数据库配置

### 2.1 确认 MySQL 服务已安装

MySQL 8.0 在 Windows 上安装后默认注册为系统服务，名称为 `MySQL80`。

查看服务状态：
```powershell
sc query MySQL80
```

如果输出中 `STATE` 不是 `RUNNING`，手动启动：
```powershell
net start MySQL80
```

> 启动 MySQL 需要管理员权限。`start_server.bat` 会自动以管理员身份启动。

### 2.2 创建数据库与用户

```powershell
mysql -u root -p
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

### 2.3 导入表结构

```powershell
mysql -u recipe_admin -p recipe_db < D:\project\IndependentProjects\recipe-DB\database\schema.sql
```

### 2.4 验证表创建成功

```powershell
mysql -u recipe_admin -p recipe_db -e "SHOW TABLES;"
```

应看到以下表：
- `cuisine`、`season`、`taste`、`difficulty`（分类字典）
- `recipes`（菜谱主表）
- `ingredients`（食材表）
- `recipe_ingredients`（菜谱-食材关联）
- `steps`（烹饪步骤）
- `users`（用户）
- `favorites`（收藏）
- `history`（浏览历史）

---

## 三、Python 后端环境

### 3.1 创建虚拟环境

```powershell
cd D:\project\IndependentProjects\recipe-DB
python -m venv .venv
```

### 3.2 激活虚拟环境

```powershell
.venv\Scripts\activate
```

激活后命令行前面会出现 `(.venv)` 标识。

### 3.3 安装依赖

项目使用 `uv` 管理依赖，所有依赖已声明在 `pyproject.toml` 中。安装 uv 后执行同步：

```powershell
# 安装 uv（包管理器）
powershell -c "irm https://astral.sh/uv/install.ps1 | iex"

# 在项目目录中同步依赖（自动创建 .venv，按 uv.lock 锁定版本安装）
cd D:\project\IndependentProjects\recipe-DB
uv sync
```
如果当前环境尚未安装 uv，首次运行后需重新打开终端使 PATH 生效。`uv sync` 会自动创建虚拟环境并安装 `pyproject.toml` 中声明的全部依赖。

各依赖作用：

| 包名 | 用途 |
|------|------|
| flask | Web 框架，提供 RESTful API |
| pymysql | MySQL 数据库驱动 |
| python-dotenv | 加载 `.env` 环境变量 |
| flask-cors | 处理跨域请求 |
| openai | 调用 DeepSeek API（兼容 OpenAI 接口） |
| cryptography | MySQL 8.0 caching_sha2_password 认证所需 |

### 3.4 配置环境变量

在项目根目录创建 `.env` 文件：

```
DB_HOST=localhost
DB_USER=recipe_admin
DB_PASSWORD=Snowsong_42
DB_NAME=recipe_db
DEEPSEEK_API_KEY=sk-你的真实密钥
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

> ⚠️ `DEEPSEEK_API_KEY` 必须替换为你在 DeepSeek 官网申请的 API Key，否则 AI Vibe 搜索功能不可用。

### 3.5 验证后端能启动

```powershell
cd D:\project\IndependentProjects\recipe-DB
.venv\Scripts\activate
python backend\app.py
```

启动成功输出示例：
```
 * Serving Flask app 'app'
 * Debug mode: on
 * Running on all addresses (0.0.0.0)
 * Running on http://127.0.0.1:5000
 * Running on http://192.168.5.35:5000
```

按 `Ctrl+C` 先停止，后续通过启动脚本统一管理。

---

## 四、前端环境

### 4.1 安装依赖

```powershell
cd D:\project\IndependentProjects\recipe-DB\frontend
npm install
```

### 4.2 Vite 配置说明

`frontend/vite.config.js` 内容如下：

```js
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',           // 允许局域网访问
    allowedHosts: true,         // 允许 ngrok 等转发源
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',  // 将 /api 请求代理到 Flask
        changeOrigin: true
      }
    }
  }
});
```

关键点：
- Vite 开发服务器默认端口 **5173**
- 配置了 `/api` 代理，开发时前端 `/api/xxx` 请求自动转发到 Flask 的 `localhost:5000`
- 解决了跨域问题，无需额外配置 CORS

### 4.3 验证前端能启动

```powershell
cd D:\project\IndependentProjects\recipe-DB\frontend
npx vite --host
```

启动成功输出示例：
```
  VITE v8.0.10  ready in 175 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: http://192.168.5.35:5173/
```

按 `Ctrl+C` 先停止。

---

## 五、启动服务

### 方式 A：一键启动（推荐）

以 **管理员身份** 双击运行 `start_server.bat`。

该脚本自动完成以下步骤：

| 步骤 | 操作 | 端口 |
|------|------|------|
| 1/4 | 以管理员身份启动 MySQL 服务 | 3306 |
| 2/4 | 激活虚拟环境，启动 Flask 后端 | 5000 |
| 3/4 | 启动 Vite 前端开发服务器 | 5173 |
| 4/4 | 启动 ngrok 公网隧道（可选） | → ngrok URL |

启动后，会出现 3 个命令行窗口：
- **Flask Backend** — Flask 日志输出，API 请求会显示在这里
- **Vite Frontend** — Vite 开发服务器日志，热更新状态显示在这里
- **Ngrok Tunnel** — ngrok 隧道状态，公网地址显示在这里

### 方式 B：手动分步启动（推荐用于排错）

如果一键启动遇到问题，可以分步启动以便定位：

**步骤 1：启动 MySQL**

```powershell
net start MySQL80
```

**步骤 2：启动 Flask 后端**

新开一个 cmd 窗口：

```powershell
cd D:\project\IndependentProjects\recipe-DB
.venv\Scripts\activate
python backend\app.py
```

Flask 运行在 `http://127.0.0.1:5000`，开启 debug 模式，代码修改后自动重载。

**步骤 3：启动 Vite 前端**

新开一个 cmd 窗口：

```powershell
cd D:\project\IndependentProjects\recipe-DB\frontend
npx vite --host
```

Vite 运行在 `http://localhost:5173`，代码修改后浏览器自动热更新。

**步骤 4（可选）：启动 ngrok 公网隧道**

```powershell
ngrok http 5173
```

启动后从输出中找到 `Forwarding` 行，类似：
```
Forwarding                    https://xxxx-xxxx-xxxx.ngrok-free.dev -> http://localhost:5173
```

---

## 六、访问测试

### 6.1 本地访问

| 地址 | 说明 |
|------|------|
| `http://localhost:5173` | 本地开发访问（推荐） |
| `http://127.0.0.1:5173` | 本地回路地址，效果同上 |
| `http://192.168.5.35:5173` | 局域网内其他设备访问（替换为你的实际 IP） |

### 6.2 公网访问

使用 ngrok 分配的 URL，例如：
```
https://heading-divisive-spent.ngrok-free.dev
```

### 6.3 API 直接测试

Flask 后端直接访问地址（不经过 Vite 代理）：

| 接口 | 命令 | 预期结果 |
|------|------|---------|
| 健康检查 | `curl http://127.0.0.1:5000/` | 返回 "智能菜谱助手后端服务已启动！" |
| 数据库连接 | `curl http://127.0.0.1:5000/api/test-db` | 返回 `{"status":"success","message":"数据库连接成功！"}` |
| 统计数据 | `curl http://127.0.0.1:5000/api/stats` | 返回 JSON 统计数据 |
| 分类选项 | `curl http://127.0.0.1:5000/api/options` | 返回菜系、季节、口味、难度选项 |

### 6.4 功能验证清单

| 功能模块 | 操作步骤 | 预期结果 |
|---------|---------|---------|
| Vibe 搜索 | 首页输入 "适合夏天的清淡菜"，点击搜索 | AI 返回推荐菜谱，显示思考动画 |
| 精确搜索 | 切换到搜索页，选择条件后搜索 | 显示过滤后的菜谱列表 |
| 菜谱详情 | 点击任意菜谱卡片 | 显示完整的食材、步骤、分类标签 |
| 用户注册 | 个人中心 → 填写用户名密码注册 | 注册成功，自动登录 |
| 用户登录 | 退出后重新登录 | 登录成功，显示用户名首字母头像 |
| 收藏菜谱 | 在菜谱详情页点击收藏 | 按钮变为 "❤️ 已收藏" |
| 添加菜谱 | 填写表单，添加食材和步骤后提交 | 菜谱添加成功，跳转到详情页 |
| 编辑菜谱 | 在详情页点击编辑 | 表单预填充原数据，修改后提交成功 |
| 浏览历史 | 个人中心 → 浏览历史 | 显示最近浏览过的菜谱 |
| 管理员 | 用 root 账号登录 | 显示管理标签，可管理用户/菜谱/食材 |

---

## 七、开发工作流

### 7.1 日常开发流程

```
修改代码 → 浏览器自动刷新（前端）或 Flask 自动重载（后端）→ 验证效果
```

- **前端修改**：Vite 自动热更新（HMR），修改保存后浏览器即时生效，无需手动刷新
- **后端修改**：Flask debug 模式自动检测文件变更并重启，约 1-2 秒延迟
- **数据库修改**：修改表结构后需手动重启 Flask（或等待自动重载）

### 7.2 代码提交流程

```powershell
# 查看修改
git status
git diff

# 暂存并提交
git add .
git commit -m "feat: 本次修改说明"

# 推送到 GitHub
git push origin main
```

### 7.3 更新到 Ubuntu 服务器

在 Windows 上推送代码后，SSH 登录 Ubuntu 服务器执行：

```bash
cd ~/recipe-DB
git pull origin main
uv sync                             # 自动读取 pyproject.toml 同步依赖
cd frontend && npm install && npx vite build
sudo systemctl restart recipe-db
```

---

## 八、常见问题排查

### 8.1 Flask 启动相关

| 现象 | 原因 | 解决方法 |
|------|------|----------|
| `Address already in use` | 端口 5000 被占用 | `netstat -ano \| findstr :5000` 找到 PID，`taskkill /PID <PID> /F` |
| `pymysql.err.OperationalError` | MySQL 未启动或凭据错误 | 检查 MySQL 服务状态；检查 `.env` 中的数据库配置 |
| `ModuleNotFoundError: No module named 'openai'` | 缺少 openai 库 | `uv add openai` |
| `ModuleNotFoundError: No module named 'cryptography'` | 缺少 cryptography 库 | `uv add cryptography` |
| `ImportError: openai 库未安装` | 同上 | 同上 |
| `.env` 文件不生效 | `.env` 文件位置或格式错误 | 确认 `.env` 在项目根目录；检查 `=` 两边没有空格 |
| `ValueError: 请在 .env 文件中配置有效的 DEEPSEEK_API_KEY` | API Key 未配置或为默认值 | 检查 `.env` 中 `DEEPSEEK_API_KEY` 是否正确 |

### 8.2 Vite 启动相关

| 现象 | 原因 | 解决方法 |
|------|------|----------|
| `You must use Node.js >= 20.19.0` | Node.js 版本过旧 | 卸载旧版，从 [nodejs.org](https://nodejs.org) 安装 20 LTS |
| `'vite' 不是内部或外部命令` | 依赖未安装 | `cd frontend && npm install` |
| 浏览器访问返回 502 | Flask 未启动 | 先启动 Flask（端口 5000）再启动 Vite |
| 代理不生效，API 返回 404 | Vite 代理配置错误 | 检查 `vite.config.js` 中的 `proxy.target` 是否为 `http://127.0.0.1:5000` |

### 8.3 数据库相关

| 现象 | 原因 | 解决方法 |
|------|------|----------|
| `Can't connect to MySQL server` | MySQL 服务未运行 | `net start MySQL80` |
| `Access denied for user 'recipe_admin'` | 密码错误或用户不存在 | 用 root 登录重新创建用户并授权 |
| `Table 'recipe_db.recipes' doesn't exist` | 表结构未导入 | `mysql -u recipe_admin -p recipe_db < schema.sql` |
| `Unknown collation: 'utf8mb4_0900_ai_ci'` | 排序规则版本不兼容 | 将 SQL 文件中的 `utf8mb4_0900_ai_ci` 替换为 `utf8mb4_unicode_ci` |

### 8.4 权限问题

| 现象 | 原因 | 解决方法 |
|------|------|----------|
| `start_server.bat` 启动 MySQL 失败 | 未以管理员身份运行 | 右键 → "以管理员身份运行" |
| Vite 启动后局域网无法访问 | 防火墙阻止端口 5173 | 在 Windows Defender 防火墙中放行 5173 端口 |

---

## 九、环境差异提醒（Windows vs Ubuntu）

在 Windows 上开发和 Ubuntu 上部署时，注意以下差异：

### 9.1 MySQL 服务名不同

| 操作 | Windows | Ubuntu |
|------|---------|--------|
| 启动服务 | `net start MySQL80` | `sudo systemctl start mysql` |
| 停止服务 | `net stop MySQL80` | `sudo systemctl stop mysql` |
| 查看状态 | `sc query MySQL80` | `sudo systemctl status mysql` |

### 9.2 Python 虚拟环境路径

| 操作 | Windows | Ubuntu |
|------|---------|--------|
| 激活 | `.venv\Scripts\activate` | `source .venv/bin/activate` |
| 退出 | `deactivate` | `deactivate` |

### 9.3 路径分隔符

| 概念 | Windows | Ubuntu |
|------|---------|--------|
| 目录分隔符 | `\`（反斜杠） | `/`（正斜杠） |
| 项目根路径 | `D:\project\IndependentProjects\recipe-DB` | `/home/snow/recipe-DB` |
| 环境变量路径 | `PATH` 用 `;` 分隔 | `PATH` 用 `:` 分隔 |

### 9.4 数据库迁移注意事项

Windows → Ubuntu 迁移时（`mysqldump`）：

1. **必须使用 `--result-file` 参数**，不能用 `>` 重定向（PowerShell 会生成 UTF-16 编码）
2. 导出后需将 `utf8mb4_0900_ai_ci` 替换为 `utf8mb4_unicode_ci`
3. 通过 `scp` 或 U 盘将 SQL 文件传输到 Ubuntu 服务器

### 9.5 服务管理方式不同

| 组件 | Windows | Ubuntu |
|------|---------|--------|
| Flask | 直接运行 `python app.py` 或 `start_server.bat` | systemd 服务 `recipe-db.service` |
| 前端 | Vite 开发服务器（`npx vite`） | Nginx 提供静态文件服务 |
| 数据库 | Windows 服务 `MySQL80` | systemd 服务 `mysql.service` |

---

## 十、端口占用汇总

| 端口 | 用途 | 启动方式 |
|------|------|---------|
| 3306 | MySQL 数据库 | 系统服务 |
| 5000 | Flask API 后端 | `python backend\app.py` |
| 5173 | Vite 前端开发服务器 | `npx vite --host` |
| 4040 | ngrok Web 管理界面（仅供本地查看） | ngrok 自动启动 |
| 随机 | ngrok 公网隧道 | ngrok 自动分配 |

> 如果端口被其他程序占用，可在对应配置文件中修改。Flask 端口在 `backend/app.py` 最末行的 `app.run(port=5000)` 修改；Vite 端口在 `frontend/vite.config.js` 中添加 `port: 5174` 修改。

---

> **编写日期**：2026 年 4 月 30 日
> 
> **适用环境**：Windows 10/11 + MySQL 8.0 + Python 3.11 + Node.js 20
> 
> **本地开发地址**：`http://localhost:5173`
> 
> **API 后端地址**：`http://127.0.0.1:5000`
