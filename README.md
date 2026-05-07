# 🍳 智能菜谱助手

> 数据库课程设计 · 全栈 Web 应用  
> 后端：Flask + PyMySQL + MySQL 8.0  
> 前端：Vite + 原生 HTML/CSS/JS  
> AI 集成：DeepSeek API（自然语言搜索 + 智能菜谱生成）

---

## 🚀 快速启动

### 1. 启动 MySQL 数据库

确保services.msc当中 MySQL 8.0 服务已启动（Windows 服务名 `MySQL80`）。或者在管理员模式cmd运行：

```
net start MySQL80
```

```powershell
# 用 MySQL Shell 初始化数据库（仅首次需要）
mysqlsh recipe_admin@localhost
\sql
\source D:/project/IndependentProjects/recipe-DB/database/schema.sql
\source D:/project/IndependentProjects/recipe-DB/database/seed.sql
```

### 2. 启动后端（Flask）

```powershell
# 在项目根目录
cd D:/project/IndependentProjects/recipe-DB

# 激活虚拟环境（如果未激活）
.venv\Scripts\activate

# 启动 Flask 后端（默认 http://localhost:5000）
uv run python backend/app.py
```

> 首次启动会自动检测并安装依赖。确保 `.env` 文件已正确配置数据库连接信息。

### 3. 启动前端（Vite 开发服务器）

**新开一个终端窗口**，不要关闭后端：

```powershell
cd D:/project/IndependentProjects/recipe-DB/frontend

# 安装依赖（仅首次）
npm install

# 启动 Vite 开发服务器（默认 http://localhost:5173）
npm run dev
```

### 4. 打开浏览器

访问 **http://localhost:5173** 即可使用！

---

## 🪟 完整启动流程（3 个 PowerShell 窗口）

> 推荐按顺序打开三个独立的 PowerShell 窗口，分别运行以下三个服务。

### 窗口 1 — 后端 Flask API（端口 5000）

```powershell
cd D:/project/IndependentProjects/recipe-DB
.venv\Scripts\activate
python backend/app.py
```

输出示例：
```
 * Serving Flask app 'app'
 * Running on http://127.0.0.1:5000
```

### 窗口 2 — 前端 Vite 开发服务器（端口 5173）

```powershell
cd D:/project/IndependentProjects/recipe-DB/frontend
npx vite --host
```

输出示例：
```
  VITE v5.x.x  ready in xxx ms
  ➜  Local:   http://localhost:5173/
  ➜  Network: http://192.168.x.x:5173/
```

### 窗口 3 — ngrok 公网隧道（可选）

如需从外网访问，启动 ngrok 隧道：

```powershell
ngrok http 5173
```

或（如果 `ngrok` 命令未找到）：
```powershell
& "C:\Users\snowsong\AppData\Local\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe" http 5173
```

输出示例：
```
Forwarding  https://xxxx.ngrok-free.dev -> http://localhost:5173
```

把 `https://xxxx.ngrok-free.dev` 发给任何人即可访问。

> ⚠️ **首次使用 ngrok 需要注册账号和配置 authtoken**：
> 1. 打开 https://dashboard.ngrok.com/signup 注册
> 2. 登录后拿到你的 authtoken
> 3. 运行 `ngrok config add-authtoken 你的token`

---

## 🌐 同一局域网下的其他用户如何访问？

在你的 Windows 机器上启动服务后，**不需要额外配置**即可让局域网内其他设备访问：

### 方法一：查看你的局域网 IP

```powershell
ipconfig
# 找到 IPv4 地址，例如 192.168.1.100
```

### 方法二：告诉其他用户访问

其他设备（手机、平板、其他电脑）在同一 WiFi 下，打开浏览器访问：

```
http://你的IP:5173
```

例如：`http://192.168.1.100:5173`

> 原理：Flask 后端以 `host='0.0.0.0'` 监听所有网络接口，Vite 前端自动代理 `/api/*` 请求到 Flask。跨局域网访问时，Vite 的代理同样工作在 `0.0.0.0` 上。

---

## 🐛 常见问题

### ❓ 端口被占用

如果启动时提示端口已被占用：
```powershell
# 查找占用端口的进程
netstat -ano | findstr :5000
netstat -ano | findstr :5173

# 杀掉占用进程（替换 PID）
taskkill /PID 1234 /F
```


## 📱 功能概览

| 页面 | 功能 | 说明 |
|------|------|------|
| ✨ **Vibe 推荐** | AI 自然语言推荐 | 输入一句话描述，AI 理解你的需求，返回推荐菜谱 + 数据库匹配结果 |
| 🔍 **精确查找** | 多条件筛选 + 关键词搜索 | 按菜系、季节、口味、难度筛选，支持关键词模糊搜索 |
| 📊 **系统信息** | 数据库统计面板 | 总菜谱数、今日新增、食材数、注册用户、收藏总数，菜系/难度饼状图，7 天趋势 |
| 👤 **用户中心** | 登录/注册 | 注册直接记录，无需验证；登录后可查看收藏、浏览历史、发布的菜谱 |
| ❤️ **收藏** | 收藏/取消收藏 | 在菜谱详情页点击收藏按钮，用户中心查看所有收藏 |
| 📖 **浏览历史** | 自动记录 | 登录后查看菜谱详情自动记录访问历史 |
| 🤖 **AI 生成** | 从描述生成菜谱 | 输入"给我生成一个番茄炒蛋的菜谱"，AI 自动生成结构化菜谱 |

---

## 🗂️ 项目结构

```
recipe-DB/
├── backend/
│   ├── app.py             # Flask 主入口（所有 API 路由）
│   ├── database.py        # 数据库连接封装
│   └── ai_service.py      # DeepSeek AI 服务层
├── frontend/
│   ├── index.html         # 页面主入口
│   ├── vite.config.js     # Vite 配置（含 API 代理）
│   ├── src/
│   │   ├── main.js        # 前端交互逻辑
│   │   └── style.css      # 全局样式
│   └── package.json
├── database/
│   ├── schema.sql         # 完整建表脚本（12 张表）
│   └── seed.sql           # 初始数据
├── .env                   # 数据库 & AI 密钥配置
├── pyproject.toml         # Python 项目声明
└── README.md
```

---

## 🔑 环境变量（.env）

```ini
DB_HOST=localhost
DB_USER=recipe_admin
DB_PASSWORD=你的MySQL密码
DB_NAME=recipe_db

DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

---

## 🧪 API 清单

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/options` | 获取分类选项（菜系/季节/口味/难度） |
| GET | `/api/recipes` | 菜谱列表（支持筛选和搜索） |
| GET | `/api/recipes/:id` | 菜谱详情（含食材和步骤） |
| POST | `/api/recipes` | 创建菜谱（事务写入） |
| GET | `/api/recipes/user/:id` | 用户发布的菜谱 |
| GET | `/api/stats` | 系统统计数据 |
| POST | `/api/auth/register` | 用户注册 |
| POST | `/api/auth/login` | 用户登录 |
| GET | `/api/auth/me` | 获取当前用户信息 |
| POST | `/api/auth/logout` | 退出登录 |
| GET | `/api/favorites` | 用户收藏列表 |
| POST | `/api/favorites/:id` | 收藏菜谱 |
| DELETE | `/api/favorites/:id` | 取消收藏 |
| GET | `/api/favorites/:id/status` | 检查收藏状态 |
| GET | `/api/history` | 浏览历史列表 |
| POST | `/api/history` | 记录浏览历史 |
| POST | `/api/ai/generate` | AI 生成菜谱 |
| POST | `/api/ai/search` | AI 自然语言搜索 |
| POST | `/api/ai/vibe-search` | AI Vibe 推荐（首页大输入框） |
