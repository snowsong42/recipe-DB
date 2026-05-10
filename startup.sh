#!/bin/bash
# ============================================================
# Recipe-DB 服务启动脚本
# 本脚本汇总了所有服务的启动步骤
# ============================================================

set -e

echo "=========================================="
echo " Recipe-DB 服务启动中..."
echo "=========================================="

# 1. 启动 MySQL
echo ""
echo "[1/4] 启动 MySQL..."
sudo systemctl start mysql
sleep 1
echo "  ✓ MySQL 已启动"

# 2. 启动 Flask 后端
echo ""
echo "[2/4] 启动 Flask 后端..."
sudo systemctl start recipe-db
sleep 2
echo "  ✓ Flask 后端已启动"

# 3. 启动 Nginx
echo ""
echo "[3/4] 启动 Nginx..."
sudo systemctl start nginx
sleep 1
echo "  ✓ Nginx 已启动"

# 4. 验证服务状态
echo ""
echo "[4/4] 验证服务状态..."

# 验证后端
BACKEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5000/ 2>/dev/null || echo "000")
if [ "$BACKEND_STATUS" = "200" ]; then
    echo "  ✓ 后端 API (127.0.0.1:5000) 可用"
else
    echo "  ✗ 后端 API 不可用 (HTTP $BACKEND_STATUS)"
fi

# 验证数据库连接
DB_STATUS=$(curl -s http://127.0.0.1:5000/api/test-db | grep -c '"status":"success"' 2>/dev/null || echo "0")
if [ "$DB_STATUS" -ge 1 ]; then
    echo "  ✓ 数据库连接正常"
else
    echo "  ✗ 数据库连接异常"
fi

# 验证前端页面
NGINX_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1/ 2>/dev/null || echo "000")
if [ "$NGINX_STATUS" = "200" ]; then
    echo "  ✓ Nginx 前端页面 (127.0.0.1:80) 可用"
else
    echo "  ✗ Nginx 前端页面不可用 (HTTP $NGINX_STATUS)"
fi

echo ""
echo "=========================================="
echo " Recipe-DB 服务启动完成!"
echo "=========================================="
echo ""
echo "本地访问:    http://127.0.0.1"
echo "后端 API:    http://127.0.0.1:5000"
echo ""
echo "服务管理命令:"
echo "  sudo systemctl stop recipe-db   # 停止后端"
echo "  sudo systemctl restart nginx    # 重启 Nginx"
echo "  sudo journalctl -u recipe-db -f # 查看后端日志"
echo ""
