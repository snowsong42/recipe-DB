# backend/app.py
# backend/app.py
from flask import Flask, jsonify, request
from database import get_db_connection
import hashlib
import secrets
import json
import os
from ai_service import ai_generate_recipe, ai_search_recipes
from datetime import datetime, date

app = Flask(__name__)

# 加载 root 配置
_ROOT_CONFIG_PATH = os.path.join(os.path.dirname(__file__), 'root_config.json')
_ROOT_PASSWORD = None
if os.path.exists(_ROOT_CONFIG_PATH):
    try:
        with open(_ROOT_CONFIG_PATH, 'r') as f:
            _ROOT_PASSWORD = json.load(f).get('root_password')
    except Exception:
        pass
_ROOT_SESSION_TOKEN = None  # root 登录后占用的 token
_ROOT_USER_ID = 0  # root 特殊标记


# ============================================================
# 用户系统（文件持久化 Token）
# ============================================================
_TOKENS_FILE = os.path.join(os.path.dirname(__file__), 'sessions.json')

def _load_tokens():
    """从文件加载 tokens"""
    if os.path.exists(_TOKENS_FILE):
        try:
            with open(_TOKENS_FILE, 'r') as f:
                return json.load(f)
        except Exception:
            pass
    return {}

def _save_tokens():
    """将 tokens 写入文件"""
    with open(_TOKENS_FILE, 'w') as f:
        json.dump(_tokens, f)

_tokens = _load_tokens()

def _hash_password(password):
    return hashlib.sha256(password.encode('utf-8')).hexdigest()

def _generate_token():
    return secrets.token_hex(32)

def _get_user_from_token():
    auth = request.headers.get('Authorization', '')
    if auth.startswith('Bearer '):
        return _tokens.get(auth[7:])
    return None


@app.route('/')
def index():
    return "智能菜谱助手后端服务已启动！"


@app.route('/api/test-db')
def test_db():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT 1')
        result = cursor.fetchone()
        conn.close()
        return jsonify({"status": "success", "message": "数据库连接成功！", "result": result})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# ============================================================
# 分类选项
# ============================================================

@app.route('/api/options', methods=['GET'])
def get_options():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT id, name FROM cuisine ORDER BY id')
        cuisine = cursor.fetchall()
        cursor.execute('SELECT id, name FROM season ORDER BY id')
        season = cursor.fetchall()
        cursor.execute('SELECT id, name FROM taste ORDER BY id')
        taste = cursor.fetchall()
        cursor.execute('SELECT id, level AS name FROM difficulty ORDER BY id')
        difficulty = cursor.fetchall()
        conn.close()
        return jsonify({"cuisine": cuisine, "season": season, "taste": taste, "difficulty": difficulty})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# ============================================================
# 菜谱 CRUD
# ============================================================

@app.route('/api/recipes', methods=['GET'])
def get_recipes():
    """菜谱列表，支持筛选和搜索"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cuisine_id = request.args.get('cuisine_id', type=int)
        season_id = request.args.get('season_id', type=int)
        taste_id = request.args.get('taste_id', type=int)
        difficulty_id = request.args.get('difficulty_id', type=int)
        keyword = request.args.get('keyword', '').strip()

        sql = """
            SELECT r.id, r.title, r.description, r.cooking_time,
                   r.created_at, r.created_by,
                   c.name AS cuisine_name,
                   s.name AS season_name,
                   t.name AS taste_name,
                   d.level AS difficulty_name
            FROM recipes r
            LEFT JOIN cuisine c ON r.cuisine_id = c.id
            LEFT JOIN season s ON r.season_id = s.id
            LEFT JOIN taste t ON r.taste_id = t.id
            LEFT JOIN difficulty d ON r.difficulty_id = d.id
            WHERE 1=1
        """
        params = []
        if cuisine_id:
            sql += ' AND r.cuisine_id = %s'
            params.append(cuisine_id)
        if season_id:
            sql += ' AND r.season_id = %s'
            params.append(season_id)
        if taste_id:
            sql += ' AND r.taste_id = %s'
            params.append(taste_id)
        if difficulty_id:
            sql += ' AND r.difficulty_id = %s'
            params.append(difficulty_id)
        if keyword:
            sql += ' AND (r.title LIKE %s OR r.description LIKE %s)'
            params.extend([f'%{keyword}%', f'%{keyword}%'])
        sql += ' ORDER BY r.created_at DESC'

        cursor.execute(sql, params)
        recipes = cursor.fetchall()
        conn.close()
        return jsonify({"status": "success", "recipes": recipes})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/recipes/<int:recipe_id>', methods=['GET'])
def get_recipe_detail(recipe_id):
    """菜谱详情（含食材、步骤）"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT r.id, r.title, r.description, r.cooking_time,
                   r.created_at, r.updated_at, r.created_by,
                   c.id AS cuisine_id, c.name AS cuisine_name,
                   s.id AS season_id, s.name AS season_name,
                   ta.id AS taste_id, ta.name AS taste_name,
                   d.id AS difficulty_id, d.level AS difficulty_name
            FROM recipes r
            LEFT JOIN cuisine c ON r.cuisine_id = c.id
            LEFT JOIN season s ON r.season_id = s.id
            LEFT JOIN taste ta ON r.taste_id = ta.id
            LEFT JOIN difficulty d ON r.difficulty_id = d.id
            WHERE r.id = %s
        """, (recipe_id,))
        recipe = cursor.fetchone()
        if not recipe:
            conn.close()
            return jsonify({"status": "error", "message": "菜谱不存在"}), 404

        cursor.execute("""
            SELECT i.id, i.name, ri.quantity, ri.unit, ri.notes
            FROM recipe_ingredients ri
            JOIN ingredients i ON ri.ingredient_id = i.id
            WHERE ri.recipe_id = %s ORDER BY i.name
        """, (recipe_id,))
        ingredients = cursor.fetchall()

        cursor.execute("""
            SELECT id, step_number, instruction, duration
            FROM steps WHERE recipe_id = %s ORDER BY step_number
        """, (recipe_id,))
        steps = cursor.fetchall()
        conn.close()

        recipe['ingredients'] = ingredients
        recipe['steps'] = steps
        return jsonify({"status": "success", "recipe": recipe})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/recipes/user/<int:user_id>', methods=['GET'])
def get_user_recipes(user_id):
    """获取指定用户发布的菜谱"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT r.id, r.title, r.description, r.cooking_time, r.created_at,
                   c.name AS cuisine_name, d.level AS difficulty_name
            FROM recipes r
            LEFT JOIN cuisine c ON r.cuisine_id = c.id
            LEFT JOIN difficulty d ON r.difficulty_id = d.id
            WHERE r.created_by = %s
            ORDER BY r.created_at DESC
        """, (user_id,))
        recipes = cursor.fetchall()
        conn.close()
        return jsonify({"status": "success", "recipes": recipes})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/recipes', methods=['POST'])
def create_recipe():
    """创建菜谱（事务）"""
    data = request.get_json()
    if not data:
        return jsonify({"status": "error", "message": "请求体为空"}), 400
    title = data.get('title', '').strip()
    if not title:
        return jsonify({"status": "error", "message": "菜谱名称不能为空"}), 400

    conn = None
    try:
        conn = get_db_connection()
        conn.autocommit(False)
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO recipes (title, description, cooking_time,
                                 cuisine_id, season_id, taste_id, difficulty_id, created_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """, (title, data.get('description','').strip(), data.get('cooking_time'),
              data.get('cuisine_id'), data.get('season_id'), data.get('taste_id'),
              data.get('difficulty_id'), data.get('created_by')))
        recipe_id = cursor.lastrowid

        for ing in data.get('ingredients', []):
            ing_name = ing.get('name', '').strip()
            if not ing_name:
                continue
            cursor.execute('SELECT id FROM ingredients WHERE name = %s', (ing_name,))
            existing = cursor.fetchone()
            if existing:
                ingredient_id = existing['id']
            else:
                cursor.execute('INSERT INTO ingredients (name) VALUES (%s)', (ing_name,))
                ingredient_id = cursor.lastrowid
            cursor.execute("""
                INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit, notes)
                VALUES (%s, %s, %s, %s, %s)
            """, (recipe_id, ingredient_id, ing.get('quantity'),
                  ing.get('unit','').strip() or None, ing.get('notes','').strip() or None))

        for step in data.get('steps', []):
            step_desc = step.get('instruction', '').strip()
            if not step_desc:
                continue
            cursor.execute("""
                INSERT INTO steps (recipe_id, step_number, instruction, duration)
                VALUES (%s, %s, %s, %s)
            """, (recipe_id, step.get('step_number'), step_desc, step.get('duration')))

        conn.commit()
        conn.close()
        return jsonify({"status": "success", "message": "菜谱添加成功！", "recipe_id": recipe_id}), 201
    except Exception as e:
        if conn:
            try:
                conn.rollback()
            except Exception:
                pass
            conn.close()
        return jsonify({"status": "error", "message": f"添加菜谱失败：{str(e)}"}), 500


@app.route('/api/recipes/<int:recipe_id>', methods=['PUT'])
def update_recipe(recipe_id):
    """编辑菜谱（事务：清空旧数据 → 写入新数据）"""
    data = request.get_json()
    if not data:
        return jsonify({"status": "error", "message": "请求体为空"}), 400
    title = data.get('title', '').strip()
    if not title:
        return jsonify({"status": "error", "message": "菜谱名称不能为空"}), 400

    conn = None
    try:
        conn = get_db_connection()
        conn.autocommit(False)
        cursor = conn.cursor()

        # 检查菜谱是否存在
        cursor.execute('SELECT id FROM recipes WHERE id = %s', (recipe_id,))
        if not cursor.fetchone():
            conn.close()
            return jsonify({"status": "error", "message": "菜谱不存在"}), 404

        # 1. 更新 recipes 基本信息
        cursor.execute("""
            UPDATE recipes SET
                title = %s, description = %s, cooking_time = %s,
                cuisine_id = %s, season_id = %s, taste_id = %s, difficulty_id = %s
            WHERE id = %s
        """, (title, data.get('description','').strip(), data.get('cooking_time'),
              data.get('cuisine_id'), data.get('season_id'), data.get('taste_id'),
              data.get('difficulty_id'), recipe_id))

        # 2. 清空旧食材关联
        cursor.execute('DELETE FROM recipe_ingredients WHERE recipe_id = %s', (recipe_id,))
        # 3. 清空旧步骤
        cursor.execute('DELETE FROM steps WHERE recipe_id = %s', (recipe_id,))

        # 4. 插入新食材
        for ing in data.get('ingredients', []):
            ing_name = ing.get('name', '').strip()
            if not ing_name:
                continue
            cursor.execute('SELECT id FROM ingredients WHERE name = %s', (ing_name,))
            existing = cursor.fetchone()
            if existing:
                ingredient_id = existing['id']
            else:
                cursor.execute('INSERT INTO ingredients (name) VALUES (%s)', (ing_name,))
                ingredient_id = cursor.lastrowid
            cursor.execute("""
                INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit, notes)
                VALUES (%s, %s, %s, %s, %s)
            """, (recipe_id, ingredient_id, ing.get('quantity'),
                  ing.get('unit','').strip() or None, ing.get('notes','').strip() or None))

        # 5. 插入新步骤
        for step in data.get('steps', []):
            step_desc = step.get('instruction', '').strip()
            if not step_desc:
                continue
            cursor.execute("""
                INSERT INTO steps (recipe_id, step_number, instruction, duration)
                VALUES (%s, %s, %s, %s)
            """, (recipe_id, step.get('step_number'), step_desc, step.get('duration')))

        conn.commit()
        conn.close()
        return jsonify({"status": "success", "message": "菜谱更新成功！", "recipe_id": recipe_id})
    except Exception as e:
        if conn:
            try:
                conn.rollback()
            except Exception:
                pass
            conn.close()
        return jsonify({"status": "error", "message": f"更新菜谱失败：{str(e)}"}), 500


# ============================================================
# 系统统计 API
# ============================================================

@app.route('/api/stats', methods=['GET'])
def get_stats():
    """系统统计数据"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # 总菜谱数
        cursor.execute('SELECT COUNT(*) AS cnt FROM recipes')
        total_recipes = cursor.fetchone()['cnt']

        # 今日新增
        today_str = date.today().isoformat()
        cursor.execute('SELECT COUNT(*) AS cnt FROM recipes WHERE DATE(created_at) = %s', (today_str,))
        today_recipes = cursor.fetchone()['cnt']

        # 总食材数
        cursor.execute('SELECT COUNT(*) AS cnt FROM ingredients')
        total_ingredients = cursor.fetchone()['cnt']

        # 总用户数
        cursor.execute('SELECT COUNT(*) AS cnt FROM users')
        total_users = cursor.fetchone()['cnt']

        # 总浏览量（total history records）
        cursor.execute('SELECT COUNT(*) AS cnt FROM history')
        total_page_views = cursor.fetchone()['cnt']

        # 各菜系菜谱分布
        cursor.execute("""
            SELECT c.name, COUNT(r.id) AS count
            FROM cuisine c
            LEFT JOIN recipes r ON r.cuisine_id = c.id
            GROUP BY c.id, c.name
            ORDER BY count DESC
        """)
        cuisine_distribution = cursor.fetchall()

        # 各难度分布
        cursor.execute("""
            SELECT d.level AS name, COUNT(r.id) AS count
            FROM difficulty d
            LEFT JOIN recipes r ON r.difficulty_id = d.id
            GROUP BY d.id, d.level
            ORDER BY d.id
        """)
        difficulty_distribution = cursor.fetchall()

        # 最近 30 天新增趋势（用于曲线图）
        cursor.execute("""
            SELECT DATE(created_at) AS day_date, COUNT(*) AS count
            FROM recipes
            WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
            GROUP BY DATE(created_at)
            ORDER BY day_date
        """)
        weekly_trend = cursor.fetchall()

        conn.close()

        return jsonify({
            "status": "success",
            "stats": {
                "total_recipes": total_recipes,
                "today_recipes": today_recipes,
                "total_ingredients": total_ingredients,
                "total_users": total_users,
                "total_page_views": total_page_views,
                "cuisine_distribution": cuisine_distribution,
                "difficulty_distribution": difficulty_distribution,
                "weekly_trend": weekly_trend
            }
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/stats/trend', methods=['GET'])
def get_stats_trend():
    """增长曲线数据（按类型）"""
    trend_type = request.args.get('type', 'recipes')
    days = request.args.get('days', 30, type=int)
    if days > 365:
        days = 365

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        if trend_type == 'recipes':
            cursor.execute("""
                SELECT DATE(created_at) AS day_date, COUNT(*) AS count
                FROM recipes
                WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL %s DAY)
                GROUP BY DATE(created_at)
                ORDER BY day_date
            """, (days,))
        elif trend_type == 'users':
            cursor.execute("""
                SELECT DATE(created_at) AS day_date, COUNT(*) AS count
                FROM users
                WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL %s DAY)
                GROUP BY DATE(created_at)
                ORDER BY day_date
            """, (days,))
        elif trend_type == 'views':
            cursor.execute("""
                SELECT DATE(viewed_at) AS day_date, COUNT(*) AS count
                FROM history
                WHERE viewed_at >= DATE_SUB(CURDATE(), INTERVAL %s DAY)
                GROUP BY DATE(viewed_at)
                ORDER BY day_date
            """, (days,))
        else:
            conn.close()
            return jsonify({"status": "error", "message": "未知趋势类型"}), 400

        rows = cursor.fetchall()
        conn.close()

        # 转为累积值以便画增长曲线
        cumulative = []
        total = 0
        for r in rows:
            total += r['count']
            cumulative.append({"day_date": r['day_date'], "count": r['count'], "cumulative": total})

        return jsonify({
            "status": "success",
            "trend": cumulative,
            "type": trend_type,
            "days": days
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/stats/ingredients-recent', methods=['GET'])
def get_recent_ingredients():
    """获取最近新增的食材标签（带时间）"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
    # ingredients 表没有 created_at 字段，用 id 倒序推断
        cursor.execute("""
            SELECT i.id, i.name,
                   NULL AS first_used_at
            FROM ingredients i
            ORDER BY i.id DESC
            LIMIT 20
        """)
        items = cursor.fetchall()
        conn.close()
        return jsonify({"status": "success", "ingredients": items})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# ============================================================
# 浏览历史 API
# ============================================================

@app.route('/api/history', methods=['GET'])
def get_history():
    """获取当前用户的浏览历史"""
    user_id = _get_user_from_token()
    if not user_id:
        return jsonify({"status": "error", "message": "请先登录"}), 401

    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT r.id, r.title, r.description,
                   c.name AS cuisine_name, h.viewed_at
            FROM history h
            JOIN recipes r ON h.recipe_id = r.id
            LEFT JOIN cuisine c ON r.cuisine_id = c.id
            WHERE h.user_id = %s
            ORDER BY h.viewed_at DESC
            LIMIT 50
        """, (user_id,))
        history = cursor.fetchall()
        conn.close()
        return jsonify({"status": "success", "history": history})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/history', methods=['POST'])
def add_history():
    """记录浏览历史（去重）"""
    user_id = _get_user_from_token()
    if not user_id:
        return jsonify({"status": "error", "message": "请先登录"}), 401

    data = request.get_json()
    recipe_id = data.get('recipe_id') if data else None
    if not recipe_id:
        return jsonify({"status": "error", "message": "缺少 recipe_id"}), 400

    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        # 如果已有记录则更新时间，否则插入
        cursor.execute(
            'SELECT 1 FROM history WHERE user_id = %s AND recipe_id = %s',
            (user_id, recipe_id)
        )
        if cursor.fetchone():
            cursor.execute(
                'UPDATE history SET viewed_at = NOW() WHERE user_id = %s AND recipe_id = %s',
                (user_id, recipe_id)
            )
        else:
            cursor.execute(
                'INSERT INTO history (user_id, recipe_id) VALUES (%s, %s)',
                (user_id, recipe_id)
            )
        conn.commit()
        conn.close()
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# ============================================================
# 用户认证 API
# ============================================================

@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.get_json()
    if not data:
        return jsonify({"status": "error", "message": "请求体为空"}), 400
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()
    if not username or not password:
        return jsonify({"status": "error", "message": "用户名和密码不能为空"}), 400

    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT id FROM users WHERE username = %s', (username,))
        if cursor.fetchone():
            conn.close()
            return jsonify({"status": "error", "message": "用户名已存在"}), 409
        password_hash = _hash_password(password)
        cursor.execute('INSERT INTO users (username, password_hash) VALUES (%s, %s)', (username, password_hash))
        user_id = cursor.lastrowid
        conn.commit()
        conn.close()
        token = _generate_token()
        _tokens[token] = user_id
        _save_tokens()
        return jsonify({"status": "success", "message": "注册成功", "user": {"id": user_id, "username": username}, "token": token}), 201
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json()
    if not data:
        return jsonify({"status": "error", "message": "请求体为空"}), 400
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()
    if not username or not password:
        return jsonify({"status": "error", "message": "用户名和密码不能为空"}), 400

    # root 管理员登录（不进 users 表）
    if username == 'root':
        global _ROOT_SESSION_TOKEN
        if _ROOT_SESSION_TOKEN:
            _tokens.pop(_ROOT_SESSION_TOKEN, None)
            _ROOT_SESSION_TOKEN = None
        if password == _ROOT_PASSWORD:
            token = _generate_token()
            _tokens[token] = _ROOT_USER_ID
            _ROOT_SESSION_TOKEN = token
            _save_tokens()
            return jsonify({
                "status": "success",
                "message": "登录成功",
                "user": {"id": 0, "username": "root"},
                "token": token,
                "is_root": True
            })
        else:
            return jsonify({"status": "error", "message": "root 密码错误"}), 401

    # 普通用户登录
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT id, username, created_at FROM users WHERE username = %s AND password_hash = %s',
                       (username, _hash_password(password)))
        user = cursor.fetchone()
        conn.close()
        if not user:
            return jsonify({"status": "error", "message": "用户名或密码错误"}), 401
        token = _generate_token()
        _tokens[token] = user['id']
        _save_tokens()
        return jsonify({"status": "success", "message": "登录成功", "user": user, "token": token})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/auth/me', methods=['GET'])
def get_current_user():
    user_id = _get_user_from_token()
    if not user_id:
        return jsonify({"status": "error", "message": "未登录"}), 401

    # root 特殊处理
    if user_id == _ROOT_USER_ID:
        return jsonify({
            "status": "success",
            "user": {"id": 0, "username": "root"},
            "is_root": True
        })

    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT id, username, created_at FROM users WHERE id = %s', (user_id,))
        user = cursor.fetchone()
        conn.close()
        if not user:
            return jsonify({"status": "error", "message": "用户不存在"}), 404
        return jsonify({"status": "success", "user": user})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/auth/logout', methods=['POST'])
def logout():
    global _ROOT_SESSION_TOKEN
    auth = request.headers.get('Authorization', '')
    if auth.startswith('Bearer '):
        token = auth[7:]
        if token == _ROOT_SESSION_TOKEN:
            _ROOT_SESSION_TOKEN = None
        _tokens.pop(token, None)
        _save_tokens()
    return jsonify({"status": "success", "message": "已退出登录"})


# ============================================================
# 收藏 API
# ============================================================

@app.route('/api/favorites', methods=['GET'])
def get_favorites():
    user_id = _get_user_from_token()
    if not user_id:
        return jsonify({"status": "error", "message": "请先登录"}), 401
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT r.id, r.title, r.description, r.cooking_time,
                   f.created_at AS favorited_at,
                   c.name AS cuisine_name, d.level AS difficulty_name
            FROM favorites f
            JOIN recipes r ON f.recipe_id = r.id
            LEFT JOIN cuisine c ON r.cuisine_id = c.id
            LEFT JOIN difficulty d ON r.difficulty_id = d.id
            WHERE f.user_id = %s ORDER BY f.created_at DESC
        """, (user_id,))
        favorites = cursor.fetchall()
        conn.close()
        return jsonify({"status": "success", "favorites": favorites})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/favorites/<int:recipe_id>', methods=['POST'])
def add_favorite(recipe_id):
    user_id = _get_user_from_token()
    if not user_id:
        return jsonify({"status": "error", "message": "请先登录"}), 401
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT id FROM recipes WHERE id = %s', (recipe_id,))
        if not cursor.fetchone():
            conn.close()
            return jsonify({"status": "error", "message": "菜谱不存在"}), 404
        cursor.execute('SELECT 1 FROM favorites WHERE user_id = %s AND recipe_id = %s', (user_id, recipe_id))
        if cursor.fetchone():
            conn.close()
            return jsonify({"status": "error", "message": "已经收藏过了"}), 409
        cursor.execute('INSERT INTO favorites (user_id, recipe_id) VALUES (%s, %s)', (user_id, recipe_id))
        conn.commit()
        conn.close()
        return jsonify({"status": "success", "message": "收藏成功"}), 201
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/favorites/<int:recipe_id>', methods=['DELETE'])
def remove_favorite(recipe_id):
    user_id = _get_user_from_token()
    if not user_id:
        return jsonify({"status": "error", "message": "请先登录"}), 401
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('DELETE FROM favorites WHERE user_id = %s AND recipe_id = %s', (user_id, recipe_id))
        conn.commit()
        conn.close()
        if cursor.rowcount == 0:
            return jsonify({"status": "error", "message": "未收藏该菜谱"}), 404
        return jsonify({"status": "success", "message": "已取消收藏"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/favorites/<int:recipe_id>/status', methods=['GET'])
def check_favorite(recipe_id):
    user_id = _get_user_from_token()
    if not user_id:
        return jsonify({"status": "success", "favorited": False})
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT 1 FROM favorites WHERE user_id = %s AND recipe_id = %s', (user_id, recipe_id))
        favorited = cursor.fetchone() is not None
        conn.close()
        return jsonify({"status": "success", "favorited": favorited})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# ============================================================
# AI 服务 API
# ============================================================

@app.route('/api/ai/generate', methods=['POST'])
def ai_generate():
    data = request.get_json()
    if not data:
        return jsonify({"status": "error", "message": "请求体为空"}), 400
    prompt = data.get('prompt', '').strip()
    if not prompt:
        return jsonify({"status": "error", "message": "请输入菜谱描述"}), 400
    try:
        result = ai_generate_recipe(prompt)
        return jsonify(result)
    except Exception as e:
        return jsonify({"status": "error", "message": f"AI 生成失败：{str(e)}"}), 500


@app.route('/api/ai/search', methods=['POST'])
def ai_search():
    data = request.get_json()
    if not data:
        return jsonify({"status": "error", "message": "请求体为空"}), 400
    query = data.get('query', '').strip()
    if not query:
        return jsonify({"status": "error", "message": "请输入搜索描述"}), 400
    try:
        result = ai_search_recipes(query)
        return jsonify(result)
    except Exception as e:
        return jsonify({"status": "error", "message": f"AI 搜索失败：{str(e)}"}), 500


@app.route('/api/ai/vibe-search', methods=['POST'])
def vibe_search():
    """
    AI Vibe 搜索：用户输入情绪/场景描述 → AI 理解 → 查询数据库推荐菜谱
    这是首页大输入框的核心 API
    """
    data = request.get_json()
    if not data:
        return jsonify({"status": "error", "message": "请求体为空"}), 400
    prompt = data.get('prompt', '').strip()
    if not prompt:
        return jsonify({"status": "error", "message": "请输入你的 vibe"}), 400

    try:
        # 1. AI 理解 vibe 并生成推荐菜谱
        recipe_result = ai_generate_recipe(
            f"根据用户的vibe描述，推荐一个最合适的菜谱。用户说：{prompt}"
        )

        # 2. AI 解析搜索条件
        search_result = ai_search_recipes(prompt)

        # 3. 如果 AI 生成了菜谱，尝试用搜索条件从数据库查找
        db_results = []
        conditions = search_result.get('conditions', {}) if search_result.get('status') == 'success' else {}
        if conditions.get('cuisine_name') or conditions.get('keyword'):
            conn = get_db_connection()
            cursor = conn.cursor()
            sql = """
                SELECT r.id, r.title, r.description, r.cooking_time,
                       c.name AS cuisine_name, d.level AS difficulty_name
                FROM recipes r
                LEFT JOIN cuisine c ON r.cuisine_id = c.id
                LEFT JOIN difficulty d ON r.difficulty_id = d.id
                WHERE 1=1
            """
            params = []
            cuisine_name = conditions.get('cuisine_name')
            keyword = conditions.get('keyword')
            if cuisine_name:
                sql += ' AND c.name = %s'
                params.append(cuisine_name)
            if keyword:
                sql += ' AND (r.title LIKE %s OR r.description LIKE %s)'
                params.extend([f'%{keyword}%', f'%{keyword}%'])
            sql += ' LIMIT 5'
            cursor.execute(sql, params)
            db_results = cursor.fetchall()
            conn.close()

        return jsonify({
            "status": "success",
            "ai_recipe": recipe_result.get('recipe') if recipe_result.get('status') == 'success' else None,
            "db_results": db_results,
            "conditions": conditions
        })
    except Exception as e:
        return jsonify({"status": "error", "message": f"Vibe 搜索失败：{str(e)}"}), 500


# ============================================================
# 管理员 API（仅 root 可用）
# ============================================================

def _require_root():
    """检查当前请求是否为 root，否则返回 403"""
    user_id = _get_user_from_token()
    if user_id is None or user_id != _ROOT_USER_ID:
        return None
    return True

@app.route('/api/admin/users', methods=['GET'])
def admin_get_users():
    """获取所有用户列表（含菜谱数、收藏数）"""
    if _require_root() is None:
        return jsonify({"status": "error", "message": "需要管理员权限"}), 403
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT u.id, u.username, u.created_at,
                   (SELECT COUNT(*) FROM recipes WHERE created_by = u.id) AS recipe_count,
                   (SELECT COUNT(*) FROM favorites WHERE user_id = u.id) AS favorite_count
            FROM users u
            ORDER BY u.created_at DESC
        """)
        users = cursor.fetchall()
        conn.close()
        return jsonify({"status": "success", "users": users})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/admin/users/<int:user_id>', methods=['DELETE'])
def admin_delete_user(user_id):
    """删除指定用户（级联清理其收藏/历史，其菜谱 created_by 置 NULL）"""
    if _require_root() is None:
        return jsonify({"status": "error", "message": "需要管理员权限"}), 403
    try:
        conn = get_db_connection()
        conn.autocommit(False)
        cursor = conn.cursor()

        # 检查用户是否存在
        cursor.execute('SELECT id, username FROM users WHERE id = %s', (user_id,))
        user = cursor.fetchone()
        if not user:
            conn.close()
            return jsonify({"status": "error", "message": "用户不存在"}), 404

        # 删除用户（级联：favorites、history 自动清除，recipes.created_by 自动 SET NULL）
        cursor.execute('DELETE FROM users WHERE id = %s', (user_id,))
        conn.commit()
        conn.close()
        return jsonify({"status": "success", "message": f"用户 {user['username']} 已删除"})
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        conn.close()
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/admin/recipes', methods=['GET'])
def admin_get_recipes():
    """获取所有菜谱（含作者名）"""
    if _require_root() is None:
        return jsonify({"status": "error", "message": "需要管理员权限"}), 403
    try:
        page = request.args.get('page', 1, type=int)
        per_page = 20
        offset = (page - 1) * per_page
        search = request.args.get('search', '').strip()

        conn = get_db_connection()
        cursor = conn.cursor()

        where_sql = ''
        params = []
        if search:
            where_sql = ' WHERE r.title LIKE %s'
            params.append(f'%{search}%')

        cursor.execute(f"""
            SELECT r.id, r.title, r.description, r.cooking_time,
                   r.created_at, r.created_by,
                   u.username AS author_name,
                   c.name AS cuisine_name,
                   d.level AS difficulty_name
            FROM recipes r
            LEFT JOIN users u ON r.created_by = u.id
            LEFT JOIN cuisine c ON r.cuisine_id = c.id
            LEFT JOIN difficulty d ON r.difficulty_id = d.id
            {where_sql}
            ORDER BY r.created_at DESC
            LIMIT %s OFFSET %s
        """, params + [per_page, offset])
        recipes = cursor.fetchall()

        cursor.execute(f"""
            SELECT COUNT(*) AS cnt FROM recipes r {where_sql}
        """, params)
        total = cursor.fetchone()['cnt']

        conn.close()
        return jsonify({
            "status": "success",
            "recipes": recipes,
            "total": total,
            "page": page,
            "per_page": per_page
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/admin/recipes/<int:recipe_id>', methods=['DELETE'])
def admin_delete_recipe(recipe_id):
    """删除指定菜谱（级联清理步骤、食材关系、收藏、历史）"""
    if _require_root() is None:
        return jsonify({"status": "error", "message": "需要管理员权限"}), 403
    try:
        conn = get_db_connection()
        conn.autocommit(False)
        cursor = conn.cursor()

        cursor.execute('SELECT id, title FROM recipes WHERE id = %s', (recipe_id,))
        recipe = cursor.fetchone()
        if not recipe:
            conn.close()
            return jsonify({"status": "error", "message": "菜谱不存在"}), 404

        # 删除菜谱（级联：steps、recipe_ingredients、favorites、history 自动清除）
        cursor.execute('DELETE FROM recipes WHERE id = %s', (recipe_id,))
        conn.commit()
        conn.close()
        return jsonify({"status": "success", "message": f"菜谱「{recipe['title']}」已删除"})
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        conn.close()
        return jsonify({"status": "error", "message": str(e)}), 500


# ============================================================
# 管理员 API - 食材管理
# ============================================================

@app.route('/api/admin/ingredients', methods=['GET'])
def admin_get_ingredients():
    """获取食材列表（含使用次数，支持搜索）"""
    if _require_root() is None:
        return jsonify({"status": "error", "message": "需要管理员权限"}), 403
    try:
        search = request.args.get('search', '').strip()
        page = request.args.get('page', 1, type=int)
        per_page = 30
        offset = (page - 1) * per_page

        conn = get_db_connection()
        cursor = conn.cursor()

        where_sql = ''
        params = []
        if search:
            where_sql = ' WHERE i.name LIKE %s'
            params.append(f'%{search}%')

        cursor.execute(f"""
            SELECT i.id, i.name,
                   (SELECT COUNT(*) FROM recipe_ingredients WHERE ingredient_id = i.id) AS usage_count
            FROM ingredients i
            {where_sql}
            ORDER BY i.id DESC
            LIMIT %s OFFSET %s
        """, params + [per_page, offset])
        items = cursor.fetchall()

        cursor.execute(f"""
            SELECT COUNT(*) AS cnt FROM ingredients i {where_sql}
        """, params)
        total = cursor.fetchone()['cnt']

        conn.close()
        return jsonify({
            "status": "success",
            "ingredients": items,
            "total": total,
            "page": page,
            "per_page": per_page
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/admin/ingredients/<int:ingredient_id>', methods=['PUT'])
def admin_update_ingredient(ingredient_id):
    """修改食材名称/分类"""
    if _require_root() is None:
        return jsonify({"status": "error", "message": "需要管理员权限"}), 403

    data = request.get_json()
    if not data:
        return jsonify({"status": "error", "message": "请求体为空"}), 400

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute('SELECT id, name FROM ingredients WHERE id = %s', (ingredient_id,))
        existing = cursor.fetchone()
        if not existing:
            conn.close()
            return jsonify({"status": "error", "message": "食材不存在"}), 404

        new_name = data.get('name', '').strip()

        if new_name and new_name != existing['name']:
            # 检查新名称是否已存在
            cursor.execute('SELECT id FROM ingredients WHERE name = %s AND id != %s', (new_name, ingredient_id))
            if cursor.fetchone():
                conn.close()
                return jsonify({"status": "error", "message": "食材名称已存在"}), 409

        if not new_name:
            conn.close()
            return jsonify({"status": "success", "message": "无需修改"})

        cursor.execute("UPDATE ingredients SET name = %s WHERE id = %s", (new_name, ingredient_id))
        conn.commit()
        conn.close()
        return jsonify({"status": "success", "message": "食材已更新"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/admin/ingredients/<int:ingredient_id>', methods=['DELETE'])
def admin_delete_ingredient(ingredient_id):
    """删除食材（如果有菜谱使用则拒绝）"""
    if _require_root() is None:
        return jsonify({"status": "error", "message": "需要管理员权限"}), 403

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute('SELECT id, name FROM ingredients WHERE id = %s', (ingredient_id,))
        ingredient = cursor.fetchone()
        if not ingredient:
            conn.close()
            return jsonify({"status": "error", "message": "食材不存在"}), 404

        # 检查是否被菜谱使用
        cursor.execute('SELECT COUNT(*) AS cnt FROM recipe_ingredients WHERE ingredient_id = %s', (ingredient_id,))
        usage = cursor.fetchone()['cnt']
        if usage > 0:
            conn.close()
            return jsonify({
                "status": "error",
                "message": f"食材「{ingredient['name']}」正在被 {usage} 个菜谱使用，请先删除相关菜谱"
            }), 409

        cursor.execute('DELETE FROM ingredients WHERE id = %s', (ingredient_id,))
        conn.commit()
        conn.close()
        return jsonify({"status": "success", "message": f"食材「{ingredient['name']}」已删除"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True, port=5000, host='0.0.0.0')
