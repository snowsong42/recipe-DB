"""
AI 智能服务层
集成 DeepSeek API，提供：
1. ai_generate_recipe(prompt) — 根据一句话描述生成结构化菜谱
2. ai_search_recipes(query) — 根据自然语言搜索条件查询菜谱
"""
import os
import json
from dotenv import load_dotenv

load_dotenv()

DEEPSEEK_API_KEY = os.getenv('DEEPSEEK_API_KEY')
DEEPSEEK_BASE_URL = os.getenv('DEEPSEEK_BASE_URL', 'https://api.deepseek.com')

# 尝试导入 openai 库，如果未安装则提供友好提示
try:
    from openai import OpenAI
    _client = OpenAI(api_key=DEEPSEEK_API_KEY, base_url=DEEPSEEK_BASE_URL)
except ImportError:
    _client = None


def _get_client():
    """获取 OpenAI 客户端，检查配置是否就绪"""
    if _client is None:
        raise ImportError(
            "openai 库未安装，请执行: uv add openai"
        )
    if not DEEPSEEK_API_KEY or DEEPSEEK_API_KEY == 'your-api-key-here':
        raise ValueError(
            "请在 .env 文件中配置有效的 DEEPSEEK_API_KEY"
        )
    return _client


# ============================================================
# AI 生成菜谱
# ============================================================

_GENERATE_SYSTEM_PROMPT = """你是一个专业的菜谱结构化助手。请根据用户的描述，生成一个完整的菜谱 JSON。

请严格按照以下 JSON 格式返回，不要包含任何其他文字：

{
  "title": "菜谱名称",
  "description": "简短描述",
  "cuisine_name": "菜系（如川菜、粤菜等）",
  "season_name": "季节（春/夏/秋/冬/四季皆宜）",
  "taste_name": "口味（麻辣/清淡/酸甜等）",
  "difficulty_name": "难度（简单/中等/困难）",
  "cooking_time": 30,
  "ingredients": [
    {"name": "食材名", "quantity": 数量, "unit": "单位", "notes": "备注（可选）"}
  ],
  "steps": [
    {"step_number": 1, "instruction": "步骤描述", "duration": 秒数}
  ]
}

要求：
1. title 必须要有
2. ingredients 至少 2 种食材
3. steps 至少 2 个步骤，step_number 从 1 开始递增
4. cooking_time 是总烹饪时间（分钟）
5. duration 是每个步骤的耗时（秒）
6. 如果用户没有明确说明分类，根据菜谱内容合理推断
7. 所有字段都必须填写，不要有空值"""


def ai_generate_recipe(prompt):
    """
    根据用户的一句话描述，调用 DeepSeek 生成结构化菜谱 JSON

    参数:
        prompt: 用户的描述，例如 "我想做一个适合夏天的清爽凉拌菜"

    返回:
        {
            "status": "success",
            "recipe": { ... 结构化菜谱 ... }
        }
        或
        {
            "status": "error",
            "message": "错误信息"
        }
    """
    client = _get_client()

    try:
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": _GENERATE_SYSTEM_PROMPT},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=2000
        )

        content = response.choices[0].message.content.strip()

        # 尝试从返回内容中提取 JSON（可能被 ```json ... ``` 包裹）
        if '```json' in content:
            content = content.split('```json')[1].split('```')[0].strip()
        elif '```' in content:
            content = content.split('```')[1].split('```')[0].strip()

        recipe = json.loads(content)

        # 验证必要字段
        if not recipe.get('title'):
            return {"status": "error", "message": "AI 生成的菜谱缺少标题"}

        return {
            "status": "success",
            "recipe": recipe
        }

    except json.JSONDecodeError:
        return {
            "status": "error",
            "message": f"AI 返回的数据格式不正确，无法解析为 JSON。原始返回：\n{content}"
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"调用 DeepSeek API 失败：{str(e)}"
        }


# ============================================================
# AI 智能搜索
# ============================================================

_SEARCH_SYSTEM_PROMPT = """你是一个菜谱搜索助手。请根据用户的自然语言描述，将其转换为数据库查询条件。

请严格按照以下 JSON 格式返回，不要包含任何其他文字：

{
  "cuisine_name": "菜系名称（如川菜），如果不确定则为 null",
  "season_name": "季节名称（如夏），如果不确定则为 null",
  "taste_name": "口味名称（如麻辣），如果不确定则为 null",
  "difficulty_name": "难度（简单/中等/困难），如果不确定则为 null",
  "keyword": "关键词（用于搜索标题和描述），如果没有则为 null"
}

要求：
1. 所有字段值必须从以下列表中选取，不要自创：
   - 菜系：川菜、粤菜、湘菜、鲁菜、苏菜、浙菜、闽菜、徽菜、东北菜、西北菜、云南菜、日料、韩餐、西餐、东南亚菜、其他
   - 季节：春、夏、秋、冬、四季皆宜
   - 口味：麻辣、酸辣、酸甜、清淡、咸鲜、甜、苦、香辣、蒜香、五香、酱香、咖喱、其他
   - 难度：简单、中等、困难
2. 如果用户描述中没有明确提到某个分类，设为 null
3. keyword 用于模糊搜索标题和描述，提取用户描述中的核心关键词"""


def ai_search_recipes(query):
    """
    根据用户的自然语言搜索描述，调用 DeepSeek 解析为查询条件

    参数:
        query: 用户的搜索描述，例如 "适合夏天的麻辣川菜"

    返回:
        {
            "status": "success",
            "conditions": { ... 解析后的查询条件 ... }
        }
        或
        {
            "status": "error",
            "message": "错误信息"
        }
    """
    client = _get_client()

    try:
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": _SEARCH_SYSTEM_PROMPT},
                {"role": "user", "content": query}
            ],
            temperature=0.3,
            max_tokens=500
        )

        content = response.choices[0].message.content.strip()

        # 尝试从返回内容中提取 JSON
        if '```json' in content:
            content = content.split('```json')[1].split('```')[0].strip()
        elif '```' in content:
            content = content.split('```')[1].split('```')[0].strip()

        conditions = json.loads(content)

        return {
            "status": "success",
            "conditions": conditions
        }

    except json.JSONDecodeError:
        return {
            "status": "error",
            "message": f"AI 返回的数据格式不正确。原始返回：\n{content}"
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"调用 DeepSeek API 失败：{str(e)}"
        }
