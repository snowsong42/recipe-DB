# backend/database.py
import os
import pymysql
from dotenv import load_dotenv

# 加载 .env 文件中的环境变量
load_dotenv()

def get_db_connection():
    """获取数据库连接"""
    # 从环境变量读取配置，未设置时使用默认值
    connection = pymysql.connect(
        host=os.getenv('DB_HOST', 'localhost'),
        user=os.getenv('DB_USER'),
        password=os.getenv('DB_PASSWORD'),
        database=os.getenv('DB_NAME'),
        cursorclass=pymysql.cursors.DictCursor
    )
    return connection