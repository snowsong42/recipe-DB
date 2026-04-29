// ============================================================
// 智能菜谱助手 · 主逻辑 v2.0（带 Hash 路由）
// ============================================================

// ---- 全局状态 ----
let currentUser = null;
let token = localStorage.getItem('token');
let chartInstances = {};
let lastPage = 'vibe';
let pageHistory = ['vibe'];
let pendingAiRecipe = null;      // AI 生成待添加到菜谱库的数据
let lastAiRecipe = null;         // AI 返回的原始 JSON 快照（用于填充添加表单）
let editingRecipeId = null;      // 编辑模式：非 null 表示正在编辑某菜谱
let _addFormOptionsCache = null; // 添加表单的分类选项缓存，用于名称→ID 匹配

// ---- DOM 快捷引用 ----
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ============================================================
// 路由系统
// ============================================================
window.router = {
  navigate(pageId, param) {
    if (param) {
      window.location.hash = `#${pageId}/${param}`;
    } else {
      window.location.hash = `#${pageId}`;
    }
  },
  back() {
    if (pageHistory.length > 1) {
      pageHistory.pop();
      const prev = pageHistory[pageHistory.length - 1] || 'vibe';
      if (prev.includes('/')) {
        const [p, param] = prev.split('/');
        window.location.hash = `#${p}/${param}`;
      } else {
        window.location.hash = `#${prev}`;
      }
    } else {
      window.location.hash = '#vibe';
    }
  },
  handleHash() {
    let hash = window.location.hash.replace('#', '') || 'vibe';
    // 去掉末尾的 '/'
    if (hash.endsWith('/')) hash = hash.slice(0, -1);
    let pageId = hash;
    let param = null;
    if (hash.includes('/')) {
      const parts = hash.split('/');
      pageId = parts[0];
      param = parts.slice(1).join('/');
    }
    // 记录历史
    if (pageHistory[pageHistory.length - 1] !== hash && pageId !== 'detail') {
      pageHistory.push(hash);
    }
    showPage(pageId, param);
  }
};

// 监听 hash 变化
window.addEventListener('hashchange', () => router.handleHash());

// ============================================================
// 页面切换
// ============================================================
function showPage(pageId, param) {
  $$('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById('page-' + pageId);
  if (page) page.classList.add('active');

  // 高亮导航标签
  $$('.tab').forEach(t => t.classList.remove('active'));
  const activeTab = document.querySelector(`.tab[data-page="${pageId}"]`);
  if (activeTab) activeTab.classList.add('active');

  // 页面进入时触发
  lastPage = pageId;

  if (pageId === 'search') loadFilterOptions();
  if (pageId === 'stats') loadStats();
  if (pageId === 'profile') updateProfileUI();
  if (pageId === 'add') {
    // 编辑模式：修改标题和按钮文字
    const titleEl = document.getElementById('add-page-title');
    const submitBtn = document.getElementById('add-submit-btn');
    if (editingRecipeId) {
      if (titleEl) titleEl.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> 编辑菜谱';
      if (submitBtn) submitBtn.innerHTML = '<i class="fa-solid fa-cloud-upload-alt"></i> 更新菜谱';
    } else {
      if (titleEl) titleEl.innerHTML = '<i class="fa-solid fa-plus-circle"></i> 添加新菜谱';
      if (submitBtn) submitBtn.innerHTML = '<i class="fa-solid fa-cloud-upload-alt"></i> 提交菜谱';
      // 非编辑模式：重置表单到干净状态，防止残留旧数据
      const form = document.getElementById('add-recipe-form');
      if (form) {
        form.reset();
        // 重置分类下拉到「不限」
        ['add-cuisine', 'add-season', 'add-taste', 'add-difficulty'].forEach(id => {
          const sel = document.getElementById(id);
          if (sel) sel.selectedIndex = 0;
        });
        // 重置食材/步骤到各一行空白
        const ingList = document.getElementById('ingredient-list');
        if (ingList && ingList.children.length > 0) {
          const firstRow = ingList.querySelector('.dynamic-row');
          ingList.innerHTML = '';
          const blankRow = firstRow || document.createElement('div');
          if (!firstRow) {
            blankRow.className = 'dynamic-row';
            blankRow.dataset.idx = 0;
            blankRow.innerHTML =
              '<input type="text" class="ing-name" placeholder="食材名称" />' +
              '<input type="number" class="ing-qty" placeholder="用量" step="0.1" min="0" />' +
              '<input type="text" class="ing-unit" placeholder="单位" />' +
              '<input type="text" class="ing-notes" placeholder="备注（可选）" />' +
              '<button type="button" class="btn-remove" onclick="removeIngredientRow(this)" title="删除此行"><i class="fa-solid fa-trash-can"></i></button>';
          }
          ingList.appendChild(blankRow);
        }
        const stepList = document.getElementById('step-list');
        if (stepList && stepList.children.length > 0) {
          const firstRow = stepList.querySelector('.dynamic-row');
          stepList.innerHTML = '';
          const blankRow = firstRow || document.createElement('div');
          if (!firstRow) {
            blankRow.className = 'dynamic-row';
            blankRow.dataset.idx = 0;
            blankRow.innerHTML =
              '<span class="step-idx-badge">1</span>' +
              '<input type="text" class="step-instruction" placeholder="步骤描述" />' +
              '<input type="number" class="step-duration" placeholder="耗时（秒）" />' +
              '<button type="button" class="btn-remove" onclick="removeStepRow(this)" title="删除此行"><i class="fa-solid fa-trash-can"></i></button>';
          }
          stepList.appendChild(blankRow);
        }
      }
    }
    loadAddFormOptions().then(() => fillAddFormFromAiRecipe());
  }
  if (pageId === 'detail' && param) viewRecipeById(param);
  if (pageId === 'admin') { adminLoadUsers(); adminLoadRecipes(); adminLoadIngredients(); }
}

// ============================================================
// 分类选项加载
// ============================================================
async function loadFilterOptions() {
  const selects = {
    cuisine: document.getElementById('filter-cuisine'),
    season: document.getElementById('filter-season'),
    taste: document.getElementById('filter-taste'),
    difficulty: document.getElementById('filter-difficulty')
  };
  try {
    const res = await fetch('/api/options');
    if (!res.ok) return;
    const options = await res.json();
    ['cuisine', 'season', 'taste', 'difficulty'].forEach(cat => {
      const sel = selects[cat];
      if (sel && options[cat]) {
        const placeholder = sel.options[0];
        sel.innerHTML = '';
        if (placeholder) sel.appendChild(placeholder);
        options[cat].forEach(item => {
          const opt = document.createElement('option');
          opt.value = item.id;
          opt.textContent = item.name;
          sel.appendChild(opt);
        });
      }
    });
  } catch (e) {
    console.error('加载分类选项失败', e);
  }
}

// ============================================================
// 认证管理
// ============================================================
function updateAuthUI() {
  const loginLink = document.getElementById('login-link');
  const userInfo = document.getElementById('user-info');
  const usernameDisplay = document.getElementById('username-display');
  const adminTab = document.getElementById('nav-tab-admin');
  if (currentUser) {
    loginLink.style.display = 'none';
    userInfo.style.display = 'inline';
    usernameDisplay.textContent = currentUser.username.charAt(0).toUpperCase();
    // root 显示管理标签
    if (adminTab) {
      adminTab.style.display = (currentUser.username === 'root') ? 'inline-flex' : 'none';
    }
  } else {
    loginLink.style.display = 'inline';
    userInfo.style.display = 'none';
    if (adminTab) adminTab.style.display = 'none';
  }
}

async function checkAuth() {
  if (!token) return;
  try {
    const res = await fetch('/api/auth/me', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();
    if (data.status === 'success') {
      currentUser = data.user;
    } else {
      localStorage.removeItem('token');
      token = null;
    }
  } catch (e) {
    console.error('检查登录状态失败', e);
  }
  updateAuthUI();
}

window.logout = function() {
  fetch('/api/auth/logout', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token }
  }).catch(() => {});
  localStorage.removeItem('token');
  token = null;
  currentUser = null;
  updateAuthUI();
  updateProfileUI();
  router.navigate('vibe');
};

function getUserId() { return currentUser ? currentUser.id : null; }

// ============================================================
// Vibe 推荐
// ============================================================
window.vibeSearch = async function() {
  const prompt = document.getElementById('vibe-input').value.trim();
  if (!prompt) { alert('请先输入你的 vibe！'); return; }

  const loading = document.getElementById('vibe-loading');
  const resultDiv = document.getElementById('vibe-result');
  loading.style.display = 'block';
  resultDiv.innerHTML = '';

  // 逐行动画展示 AI 思考过程
  const steps = loading.querySelectorAll('.thinking-step');
  let currentStep = 0;
  steps.forEach(s => s.className = 'thinking-step');
  const stepTimer = setInterval(() => {
    if (currentStep < steps.length) {
      // 上一步标记为 done，当前步标记为 active
      if (currentStep > 0) steps[currentStep - 1].className = 'thinking-step done';
      steps[currentStep].className = 'thinking-step active';
      currentStep++;
    } else {
      clearInterval(stepTimer);
    }
  }, 600);

  try {
    const res = await fetch('/api/ai/vibe-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });
    const data = await res.json();
    clearInterval(stepTimer);
    // 所有步骤标记为 done
    steps.forEach(s => s.className = 'thinking-step done');
    // 短暂保留后隐藏
    setTimeout(() => { loading.style.display = 'none'; }, 400);

    if (data.status !== 'success') {
      resultDiv.innerHTML = '<p style="color:red">' + (data.message || '搜索失败') + '</p>';
      return;
    }

    // 保存 AI 原始数据快照（深拷贝，用于填充添加表单）
    lastAiRecipe = data.ai_recipe ? JSON.parse(JSON.stringify(data.ai_recipe)) : null;

    let html = '';

    // AI 理解结果
    if (data.conditions && Object.keys(data.conditions).length > 0) {
      const conds = data.conditions;
      const parts = [];
      if (conds.cuisine_name) parts.push('菜系：' + conds.cuisine_name);
      if (conds.season_name) parts.push('季节：' + conds.season_name);
      if (conds.taste_name) parts.push('口味：' + conds.taste_name);
      if (conds.difficulty_name) parts.push('难度：' + conds.difficulty_name);
      if (conds.keyword) parts.push('关键词：' + conds.keyword);
      if (parts.length > 0) {
        html += '<div class="ai-understand"><small>🤖 AI 理解：' + parts.join(' | ') + '</small></div>';
      }
    }

    // AI 生成的菜谱（或数据库中命中的菜谱）
    if (data.ai_recipe) {
      const r = data.ai_recipe;
      const fromDb = data.is_from_db === true;

      html += '<div class="ai-recipe-result">';
      // 来自数据库的菜谱加一个标志
      if (fromDb) {
        html += '<div class="db-match-badge"><i class="fa-solid fa-check-circle"></i> 已存在于菜谱库</div>';
      }
      html += '<h3>' + (fromDb ? '📚 ' : '✨ ') + '推荐：' + escapeHtml(r.title) + '</h3>';
      html += '<p>' + escapeHtml(r.description || '') + '</p>';
      html += '<div class="detail-meta">';
      if (r.cuisine_name) html += '<span>🍲 ' + r.cuisine_name + '</span>';
      if (r.season_name) html += '<span>🌤 ' + r.season_name + '</span>';
      if (r.taste_name) html += '<span>🌶 ' + r.taste_name + '</span>';
      if (r.difficulty_name) html += '<span>📊 ' + r.difficulty_name + '</span>';
      if (r.cooking_time) html += '<span>⏱ ' + r.cooking_time + '分钟</span>';
      html += '</div>';

      if (r.ingredients && r.ingredients.length > 0) {
        html += '<div class="detail-section"><h3>🥘 食材清单</h3><div class="ingredient-grid">';
        r.ingredients.forEach(i => {
          html += '<div class="ingredient-item"><span class="name">' + escapeHtml(i.name) + '</span><span class="qty">' + (i.quantity || '-') + ' ' + (i.unit || '') + '</span></div>';
        });
        html += '</div></div>';
      }
      if (r.steps && r.steps.length > 0) {
        html += '<div class="detail-section"><h3>👨‍🍳 烹饪步骤</h3><ul class="step-grid">';
        r.steps.forEach(s => {
          html += '<li class="step-item"><span class="step-number"></span><span class="step-content">' + escapeHtml(s.instruction) + (s.duration ? '<span class="step-time-badge">⏱ ' + s.duration + '秒</span>' : '') + '</span></li>';
        });
        html += '</ul></div>';
      }
      // 底部按钮：已存在则禁用并显示提示，否则可添加
      html += '<div style="margin-top:16px;text-align:right;">';
      if (fromDb) {
        html += '<button class="btn-primary" disabled style="opacity:0.6;cursor:not-allowed;background:var(--text-secondary);">';
        html += '<i class="fa-solid fa-check-circle"></i> 已存在于菜谱库';
        html += '</button>';
      } else {
        html += '<button class="btn-primary" onclick="fillAiRecipeToAdd()">';
        html += '<i class="fa-solid fa-plus-circle"></i> 添加到菜谱库';
        html += '</button>';
      }
      html += '</div></div>';
    }

    // DB 匹配结果
    if (data.db_results && data.db_results.length > 0) {
      html += '<h3 style="margin-bottom:12px;">📚 数据库中匹配的菜谱</h3>';
      html += renderRecipeCards(data.db_results);
    }

    if (!html) html = '<div class="empty-state"><i class="fa-regular fa-face-frown"></i><p>没有找到匹配的结果，试试换个描述？</p></div>';

    resultDiv.innerHTML = html;
    // 给 step-number 填充序号
    resultDiv.querySelectorAll('.step-item').forEach((item, idx) => {
      const num = item.querySelector('.step-number');
      if (num) num.textContent = idx + 1;
    });
  } catch (e) {
    loading.style.display = 'none';
    resultDiv.innerHTML = '<p style="color:red">网络错误：' + e.message + '</p>';
  }
};

// 回车触发
document.addEventListener('DOMContentLoaded', function() {
  const vibeInput = document.getElementById('vibe-input');
  if (vibeInput) {
    vibeInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); vibeSearch(); }
    });
  }
});

// ============================================================
// 渲染菜谱卡片列表（通用）
// ============================================================
function renderRecipeCards(recipes, emptyText) {
  if (!recipes || recipes.length === 0) {
    return '<div class="empty-state"><i class="fa-regular fa-face-frown"></i><p>' + (emptyText || '暂无数据') + '</p></div>';
  }
  let html = '<div class="recipe-grid">';
  recipes.forEach(r => {
    html += '<div class="recipe-card">';
    html += '<div class="recipe-card-left">';
    html += '<div class="recipe-card-title">' + escapeHtml(r.title) + '</div>';
    html += '<div class="recipe-card-desc">' + escapeHtml((r.description || '').substring(0, 50)) + '</div>';
    html += '<div class="recipe-card-tags">';
    if (r.cuisine_name) html += '<span class="recipe-tag cuisine">' + r.cuisine_name + '</span>';
    if (r.season_name) html += '<span class="recipe-tag season">' + r.season_name + '</span>';
    if (r.taste_name) html += '<span class="recipe-tag taste">' + r.taste_name + '</span>';
    if (r.difficulty_name) html += '<span class="recipe-tag difficulty">' + r.difficulty_name + '</span>';
    if (r.cooking_time) html += '<span class="recipe-tag">⏱ ' + r.cooking_time + 'min</span>';
    html += '</div></div>';
    html += '<div class="recipe-card-action"><a href="#detail/' + r.id + '" class="table-link" onclick="router.navigate(\'detail\', ' + r.id + ')">查看</a></div>';
    html += '</div>';
  });
  html += '</div>';
  return html;
}

// ============================================================
// 精确查找
// ============================================================
window.searchRecipes = async function() {
  const container = document.getElementById('search-results');
  container.innerHTML = '<div class="skeleton-box"><div class="skeleton-line w80"></div><div class="skeleton-line w60"></div><div class="skeleton-line w40"></div></div>';

  const params = new URLSearchParams();
  const cuisine = document.getElementById('filter-cuisine').value;
  const season = document.getElementById('filter-season').value;
  const taste = document.getElementById('filter-taste').value;
  const difficulty = document.getElementById('filter-difficulty').value;
  const keyword = document.getElementById('filter-keyword').value.trim();

  if (cuisine) params.set('cuisine_id', cuisine);
  if (season) params.set('season_id', season);
  if (taste) params.set('taste_id', taste);
  if (difficulty) params.set('difficulty_id', difficulty);
  if (keyword) params.set('keyword', keyword);

  try {
    const res = await fetch('/api/recipes?' + params.toString());
    const data = await res.json();
    if (data.status !== 'success') {
      container.innerHTML = '<p style="color:red">加载失败：' + (data.message || '未知错误') + '</p>';
      return;
    }
    const recipes = data.recipes;
    if (recipes.length === 0) {
      container.innerHTML = '<div class="empty-state"><i class="fa-regular fa-face-frown"></i><p>没有找到匹配的菜谱</p></div>';
      return;
    }
    let html = '<div class="result-count">共找到 <strong>' + recipes.length + '</strong> 个菜谱</div>';
    html += renderRecipeCards(recipes);
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = '<p style="color:red">网络错误：' + e.message + '</p>';
  }
};

// ============================================================
// 菜谱详情
// ============================================================
window.viewRecipe = function(recipeId) {
  router.navigate('detail', recipeId);
};

async function viewRecipeById(recipeId) {
  const container = document.getElementById('recipe-detail');
  container.innerHTML = '<div class="skeleton-box"><div class="skeleton-line w60"></div><div class="skeleton-line w80"></div><div class="skeleton-line w100"></div></div>';

  // 记录浏览历史
  if (currentUser) {
    fetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ recipe_id: recipeId })
    }).catch(() => {});
  }

  try {
    const res = await fetch('/api/recipes/' + recipeId);
    const data = await res.json();
    if (data.status !== 'success') {
      container.innerHTML = '<p style="color:red">' + (data.message || '加载失败') + '</p>';
      return;
    }

    const r = data.recipe;
    let html = '<div class="detail-header-card">';
    html += '<h2>' + escapeHtml(r.title) + '</h2>';
    html += '<div class="detail-meta">';
    if (r.cuisine_name) html += '<span>🍲 ' + r.cuisine_name + '</span>';
    if (r.season_name) html += '<span>🌤 ' + r.season_name + '</span>';
    if (r.taste_name) html += '<span>🌶 ' + r.taste_name + '</span>';
    if (r.difficulty_name) html += '<span>📊 ' + r.difficulty_name + '</span>';
    if (r.cooking_time) html += '<span>⏱ ' + r.cooking_time + '分钟</span>';
    html += '</div>';
    if (r.description) html += '<p class="detail-desc">' + escapeHtml(r.description) + '</p>';
    // 操作按钮组：收藏 + 编辑
    html += '<div class="detail-actions">';
    html += '<button id="fav-btn" onclick="toggleFavorite(' + r.id + ')" class="fav-btn">';
    html += (await getFavoriteStatus(r.id)) ? '❤️ 已收藏' : '🤍 收藏';
    html += '</button>';
    html += '<button onclick="editRecipe(' + r.id + ')" class="fav-btn" style="margin-left:8px;">';
    html += '<i class="fa-solid fa-pen-to-square"></i> 编辑';
    html += '</button>';
    html += '</div></div>';

    // 食材
    if (r.ingredients && r.ingredients.length > 0) {
      html += '<div class="detail-section"><h3>🥘 食材清单</h3><div class="ingredient-grid">';
      r.ingredients.forEach(i => {
        html += '<div class="ingredient-item">';
        html += '<div><span class="name">' + escapeHtml(i.name) + '</span>';
        if (i.notes) html += '<div class="notes">' + escapeHtml(i.notes) + '</div>';
        html += '</div>';
        html += '<span class="qty">' + (i.quantity || '-') + ' ' + (i.unit || '') + '</span>';
        html += '</div>';
      });
      html += '</div></div>';
    }

    // 步骤
    if (r.steps && r.steps.length > 0) {
      html += '<div class="detail-section"><h3>👨‍🍳 烹饪步骤</h3><ul class="step-grid">';
      r.steps.forEach(s => {
        html += '<li class="step-item">';
        html += '<span class="step-number"></span>';
        html += '<span class="step-content">' + escapeHtml(s.instruction) + (s.duration ? '<span class="step-time-badge">⏱ ' + s.duration + '秒</span>' : '') + '</span>';
        html += '</li>';
      });
      html += '</ul></div>';
    }

    container.innerHTML = html;
    // 填充步骤序号
    container.querySelectorAll('.step-item').forEach((item, idx) => {
      const num = item.querySelector('.step-number');
      if (num) num.textContent = idx + 1;
    });
  } catch (e) {
    container.innerHTML = '<p style="color:red">网络错误：' + e.message + '</p>';
  }
}

// ---- 收藏 ----
async function getFavoriteStatus(recipeId) {
  if (!token) return false;
  try {
    const res = await fetch('/api/favorites/' + recipeId + '/status', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();
    return data.favorited;
  } catch { return false; }
}

/** 编辑菜谱：从详情页跳转到添加表单并预填充数据 */
window.editRecipe = async function(recipeId) {
  if (!currentUser) {
    alert('请先登录后再编辑菜谱');
    router.navigate('profile');
    return;
  }
  editingRecipeId = recipeId;
  // 先获取完整菜谱数据（含食材、步骤）
  try {
    const res = await fetch('/api/recipes/' + recipeId);
    const data = await res.json();
    if (data.status !== 'success') {
      alert('获取菜谱数据失败：' + (data.message || ''));
      editingRecipeId = null;
      return;
    }
    const r = data.recipe;
    // 转换为 pendingAiRecipe 格式
    pendingAiRecipe = {
      title: r.title,
      description: r.description || '',
      cooking_time: r.cooking_time,
      cuisine_name: r.cuisine_name || '',
      season_name: r.season_name || '',
      taste_name: r.taste_name || '',
      difficulty_name: r.difficulty_name || '',
      ingredients: (r.ingredients || []).map(i => ({
        name: i.name,
        quantity: i.quantity,
        unit: i.unit || '',
        notes: i.notes || ''
      })),
      steps: (r.steps || []).map(s => ({
        step_number: s.step_number,
        instruction: s.instruction,
        duration: s.duration
      }))
    };
    router.navigate('add');
  } catch (e) {
    alert('获取菜谱数据失败：' + e.message);
    editingRecipeId = null;
  }
};

window.toggleFavorite = async function(recipeId) {
  if (!currentUser) {
    alert('请先登录后再收藏');
    router.navigate('profile');
    return;
  }
  try {
    const btn = document.getElementById('fav-btn');
    const isFav = await getFavoriteStatus(recipeId);
    if (isFav) {
      await fetch('/api/favorites/' + recipeId, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token }
      });
      btn.textContent = '🤍 收藏';
    } else {
      await fetch('/api/favorites/' + recipeId, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token }
      });
      btn.textContent = '❤️ 已收藏';
    }
  } catch (e) {
    alert('操作失败：' + e.message);
  }
};

// ============================================================
// 系统统计（交互式）
// ============================================================
let _statsTrendType = 'recipes';  // 当前增长曲线类型
let _statsTrendDays = 30;         // 当前天数

window.loadStats = async function() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();
    if (data.status !== 'success') return;
    const s = data.stats;
    document.getElementById('stat-total-recipes').textContent = s.total_recipes;
    document.getElementById('stat-today-recipes').textContent = s.today_recipes;
    document.getElementById('stat-total-ingredients').textContent = s.total_ingredients;
    document.getElementById('stat-total-users').textContent = s.total_users;
    document.getElementById('stat-total-page-views').textContent = s.total_page_views;

    // 渲染饼图
    renderPieChart('cuisineChart', s.cuisine_distribution, '菜系分布');
    renderPieChart('difficultyChart', s.difficulty_distribution, '难度分布');

    // 恢复默认视图（双图），隐藏趋势/食材
    document.getElementById('stats-charts-default').style.display = '';
    document.getElementById('stats-chart-trend').style.display = 'none';
    document.getElementById('stats-chart-ingredients').style.display = 'none';

    // 默认高亮「总菜谱」卡片
    document.querySelectorAll('.stats-grid .stat-card').forEach(c => c.classList.remove('accent'));
    const defaultCard = document.getElementById('stat-total-recipes');
    if (defaultCard) defaultCard.closest('.stat-card').classList.add('accent');
  } catch (e) {
    console.error('加载统计信息失败', e);
  }
};

function renderPieChart(canvasId, data, label) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !data || data.length === 0) return;
  if (chartInstances[canvasId]) chartInstances[canvasId].destroy();

  const colors = ['#e85d3a', '#3498db', '#2ecc71', '#f5a623', '#9b59b6', '#1abc9c', '#e67e22', '#34495e'];

  chartInstances[canvasId] = new Chart(canvas, {
    type: 'pie',
    data: {
      labels: data.map(d => d.name + ' (' + d.count + ')'),
      datasets: [{
        data: data.map(d => d.count),
        backgroundColor: data.map((_, i) => colors[i % colors.length]),
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 12 } } }
      }
    }
  });
}

// ---- 交互式统计卡片点击 ----

window.switchStatsView = function(type) {
  // 高亮当前卡片：移除所有 accent，再给对应卡片加上
  document.querySelectorAll('.stats-grid .stat-card').forEach(c => c.classList.remove('accent'));
  const cardMap = {
    recipes: 'stat-total-recipes',
    today: 'stat-today-recipes',
    ingredients: 'stat-total-ingredients',
    users: 'stat-total-users',
    views: 'stat-total-page-views'
  };
  const targetId = cardMap[type];
  if (targetId) {
    const card = document.getElementById(targetId);
    if (card) card.closest('.stat-card').classList.add('accent');
  }

  if (type === 'recipes') {
    // 总菜谱：显示双图（菜系 + 难度）
    document.getElementById('stats-charts-default').style.display = '';
    document.getElementById('stats-chart-trend').style.display = 'none';
    document.getElementById('stats-chart-ingredients').style.display = 'none';
  } else if (type === 'today') {
    // 今日新增：显示菜谱增长曲线
    document.getElementById('stats-charts-default').style.display = 'none';
    document.getElementById('stats-chart-trend').style.display = 'block';
    document.getElementById('stats-chart-ingredients').style.display = 'none';
    _statsTrendType = 'recipes';
    document.getElementById('trend-chart-title').innerHTML = '<i class="fa-solid fa-chart-line"></i> 菜谱增长曲线';
    loadTrendChart();
  } else if (type === 'ingredients') {
    // 食材：显示最近新增食材标签
    document.getElementById('stats-charts-default').style.display = 'none';
    document.getElementById('stats-chart-trend').style.display = 'none';
    document.getElementById('stats-chart-ingredients').style.display = 'block';
    loadRecentIngredients();
  } else if (type === 'users') {
    // 用户：显示用户增长曲线
    document.getElementById('stats-charts-default').style.display = 'none';
    document.getElementById('stats-chart-trend').style.display = 'block';
    document.getElementById('stats-chart-ingredients').style.display = 'none';
    _statsTrendType = 'users';
    document.getElementById('trend-chart-title').innerHTML = '<i class="fa-solid fa-chart-line"></i> 用户增长曲线';
    loadTrendChart();
  } else if (type === 'views') {
    // 浏览量：显示浏览量增长曲线
    document.getElementById('stats-charts-default').style.display = 'none';
    document.getElementById('stats-chart-trend').style.display = 'block';
    document.getElementById('stats-chart-ingredients').style.display = 'none';
    _statsTrendType = 'views';
    document.getElementById('trend-chart-title').innerHTML = '<i class="fa-solid fa-chart-line"></i> 浏览量增长曲线';
    loadTrendChart();
  }
};

// ---- 增长曲线 ----

window.changeTrendDays = function(days) {
  _statsTrendDays = days;
  // 更新按钮高亮
  document.querySelectorAll('.btn-trend').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.days) === days);
  });
  loadTrendChart();
};

async function loadTrendChart() {
  const canvas = document.getElementById('trendChart');
  if (!canvas) return;

  try {
    const res = await fetch(`/api/stats/trend?type=${_statsTrendType}&days=${_statsTrendDays}`);
    const data = await res.json();
    if (data.status !== 'success') return;

    const trend = data.trend || [];
    if (trend.length === 0) return;

    // 如果已有图表实例则销毁
    if (chartInstances['trendChart']) {
      chartInstances['trendChart'].destroy();
    }

    // 根据时间跨度决定 X 轴标签格式和密度
    const days = _statsTrendDays;
    const maxTicks = days <= 7 ? days : (days <= 30 ? 10 : (days <= 90 ? 14 : 12));
    const labels = trend.map(t => {
      const d = new Date(t.day_date);
      if (days >= 365) {
        // 长跨度（年）：只显示月份
        return (d.getMonth() + 1) + '月';
      }
      // 短跨度：显示 M/D
      return (d.getMonth() + 1) + '/' + d.getDate();
    });

    chartInstances['trendChart'] = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: '当日新增',
            data: trend.map(t => t.count),
            borderColor: '#e85d3a',
            backgroundColor: 'rgba(232,93,58,0.08)',
            fill: true,
            tension: 0.3,
            pointRadius: 3,
            pointBackgroundColor: '#e85d3a',
            yAxisID: 'y'
          },
          {
            label: '累积总量',
            data: trend.map(t => t.cumulative),
            borderColor: '#3498db',
            backgroundColor: 'rgba(52,152,219,0.05)',
            borderDash: [5, 5],
            fill: false,
            tension: 0.3,
            pointRadius: 2,
            pointBackgroundColor: '#3498db',
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            position: 'top',
            labels: { font: { size: 12 } }
          }
        },
        scales: {
          x: {
            ticks: {
              autoSkip: true,
              maxTicksLimit: maxTicks,
              maxRotation: 0,
              font: { size: 10 }
            }
          },
          y: {
            beginAtZero: true,
            position: 'left',
            title: { display: true, text: '当日新增', font: { size: 11 } }
          },
          y1: {
            beginAtZero: true,
            position: 'right',
            title: { display: true, text: '累积总量', font: { size: 11 } },
            grid: { drawOnChartArea: false }
          }
        }
      }
    });
  } catch (e) {
    console.error('加载趋势图失败', e);
  }
}

// ---- 最近新增食材 ----

async function loadRecentIngredients() {
  const container = document.getElementById('stats-ingredient-tags');
  if (!container) return;
  container.innerHTML = '<div class="skeleton-box"><div class="skeleton-line w60"></div><div class="skeleton-line w80"></div></div>';

  try {
    const res = await fetch('/api/stats/ingredients-recent');
    const data = await res.json();
    if (data.status !== 'success') {
      container.innerHTML = '<p style="color:red">' + (data.message || '加载失败') + '</p>';
      return;
    }

    const items = data.ingredients || [];
    if (items.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>暂无食材数据</p></div>';
      return;
    }

    let html = '<div class="ingredient-tag-grid">';
    items.forEach(item => {
      // 随机取一种颜色
      const tagColors = ['#e85d3a', '#3498db', '#2ecc71', '#f5a623', '#9b59b6', '#1abc9c', '#e67e22'];
      const color = tagColors[item.id % tagColors.length];
      html += `<div class="ingredient-tag-item" style="border-left: 4px solid ${color};">
        <div class="tag-name">${escapeHtml(item.name)}</div>
      </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = '<p style="color:red">网络错误：' + e.message + '</p>';
  }
}

// ============================================================
// 用户页
// ============================================================
window.switchProfileTab = function(tabId, el) {
  $$('#profile-login-section .mini-tab').forEach(t => t.classList.remove('active'));
  $$('#profile-login-section .profile-form').forEach(f => f.classList.remove('active'));
  el.classList.add('active');
  document.getElementById(tabId).classList.add('active');
};

window.switchProfileDataTab = function(tabId, el) {
  $$('#profile-user-section .mini-tab').forEach(t => t.classList.remove('active'));
  $$('.profile-data').forEach(d => d.classList.remove('active'));
  el.classList.add('active');
  document.getElementById(tabId).classList.add('active');
  if (tabId === 'favorites-tab') loadProfileFavorites();
  if (tabId === 'history-tab') loadProfileHistory();
  if (tabId === 'my-recipes-tab') loadProfileMyRecipes();
};

function updateProfileUI() {
  const loginSection = document.getElementById('profile-login-section');
  const userSection = document.getElementById('profile-user-section');
  if (currentUser) {
    loginSection.style.display = 'none';
    userSection.style.display = 'block';
    document.getElementById('profile-username').textContent = currentUser.username;
    document.getElementById('profile-avatar-text').textContent = currentUser.username.charAt(0).toUpperCase();
    if (currentUser.created_at) {
      document.getElementById('profile-joined').textContent = '注册于 ' + new Date(currentUser.created_at).toLocaleDateString();
    }
    loadProfileFavorites();
  } else {
    loginSection.style.display = 'block';
    userSection.style.display = 'none';
  }
}

// 登录
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const msgDiv = document.getElementById('login-message');
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: form.username.value, password: form.password.value })
    });
    const data = await res.json();
    if (data.status === 'success') {
      token = data.token;
      currentUser = data.user;
      localStorage.setItem('token', token);
      updateAuthUI();
      msgDiv.innerHTML = '<p style="color:green">✅ 登录成功！</p>';
      updateProfileUI();
      // root 强制跳转管理页，普通用户跳转个人中心
      if (data.is_root) {
        router.navigate('admin');
      } else {
        router.navigate('profile');
      }
    } else {
      msgDiv.innerHTML = '<p style="color:red">❌ ' + (data.message || '登录失败') + '</p>';
    }
  } catch (e) {
    msgDiv.innerHTML = '<p style="color:red">网络错误：' + e.message + '</p>';
  }
});

// 注册
document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const msgDiv = document.getElementById('register-message');
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: form.username.value, password: form.password.value })
    });
    const data = await res.json();
    if (data.status === 'success') {
      token = data.token;
      currentUser = data.user;
      localStorage.setItem('token', token);
      updateAuthUI();
      msgDiv.innerHTML = '<p style="color:green">✅ 注册成功！</p>';
      updateProfileUI();
      router.navigate('profile');
    } else {
      msgDiv.innerHTML = '<p style="color:red">❌ ' + (data.message || '注册失败') + '</p>';
    }
  } catch (e) {
    msgDiv.innerHTML = '<p style="color:red">网络错误：' + e.message + '</p>';
  }
});

// ---- 用户数据加载 ----
async function loadProfileFavorites() {
  const container = document.getElementById('favorites-tab');
  if (!currentUser) { container.innerHTML = '<div class="empty-state"><p>请先登录</p></div>'; return; }
  container.innerHTML = '<div class="skeleton-box"><div class="skeleton-line w80"></div><div class="skeleton-line w60"></div></div>';
  try {
    const res = await fetch('/api/favorites', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();
    if (data.status !== 'success') {
      container.innerHTML = '<p style="color:red">' + (data.message || '加载失败') + '</p>';
      return;
    }
    const favs = (data.favorites || []).map(r => ({
      id: r.id, title: r.title, cuisine_name: r.cuisine_name,
      season_name: r.season_name, taste_name: r.taste_name,
      difficulty_name: r.difficulty_name, cooking_time: null,
      description: '收藏于 ' + (r.favorited_at ? new Date(r.favorited_at).toLocaleDateString() : '')
    }));
    container.innerHTML = renderRecipeCards(favs, '还没有收藏任何菜谱，去看看有哪些好吃的吧！');
  } catch (e) {
    container.innerHTML = '<p style="color:red">网络错误：' + e.message + '</p>';
  }
}

async function loadProfileHistory() {
  const container = document.getElementById('history-tab');
  if (!currentUser) { container.innerHTML = '<div class="empty-state"><p>请先登录</p></div>'; return; }
  container.innerHTML = '<div class="skeleton-box"><div class="skeleton-line w80"></div><div class="skeleton-line w60"></div></div>';
  try {
    const res = await fetch('/api/history', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();
    if (data.status !== 'success') {
      container.innerHTML = '<p style="color:red">' + (data.message || '加载失败') + '</p>';
      return;
    }
    const hist = (data.history || []).map(r => ({
      id: r.id, title: r.title, cuisine_name: r.cuisine_name,
      season_name: null, taste_name: null, difficulty_name: null,
      cooking_time: null,
      description: '浏览于 ' + (r.viewed_at ? new Date(r.viewed_at).toLocaleString() : '')
    }));
    container.innerHTML = renderRecipeCards(hist, '暂无浏览历史，去看看菜谱吧！');
  } catch (e) {
    container.innerHTML = '<p style="color:red">网络错误：' + e.message + '</p>';
  }
}

async function loadProfileMyRecipes() {
  const container = document.getElementById('my-recipes-tab');
  if (!currentUser) { container.innerHTML = '<div class="empty-state"><p>请先登录</p></div>'; return; }
  container.innerHTML = '<div class="skeleton-box"><div class="skeleton-line w80"></div><div class="skeleton-line w60"></div></div>';
  try {
    const res = await fetch('/api/recipes/user/' + currentUser.id);
    const data = await res.json();
    if (data.status !== 'success') {
      container.innerHTML = '<p style="color:red">' + (data.message || '加载失败') + '</p>';
      return;
    }
    const recipes = (data.recipes || []).map(r => ({
      id: r.id, title: r.title, cuisine_name: r.cuisine_name,
      season_name: r.season_name, taste_name: r.taste_name,
      difficulty_name: r.difficulty_name, cooking_time: r.cooking_time,
      description: '发布于 ' + (r.created_at ? new Date(r.created_at).toLocaleDateString() : '')
    }));
    if (recipes.length === 0) {
      container.innerHTML = '<div class="empty-state"><i class="fa-regular fa-rectangle-list"></i><p>还没有发布过菜谱</p></div>';
      return;
    }
    container.innerHTML = renderRecipeCards(recipes);
  } catch (e) {
    container.innerHTML = '<p style="color:red">网络错误：' + e.message + '</p>';
  }
}

// ============================================================
// 工具函数
// ============================================================
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================================
// 添加菜谱表单
// ============================================================

/** 加载添加表单的分类下拉选项 */
async function loadAddFormOptions() {
  const selects = {
    cuisine: document.getElementById('add-cuisine'),
    season: document.getElementById('add-season'),
    taste: document.getElementById('add-taste'),
    difficulty: document.getElementById('add-difficulty')
  };
  try {
    const res = await fetch('/api/options');
    if (!res.ok) return;
    const options = await res.json();
    ['cuisine', 'season', 'taste', 'difficulty'].forEach(cat => {
      const sel = selects[cat];
      if (!sel) return;
      sel.innerHTML = '<option value="">不限</option>';
      (options[cat] || []).forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.id;
        opt.textContent = item.name;
        sel.appendChild(opt);
      });
    });
  } catch (e) {
    console.error('加载表单选项失败', e);
  }
}

/** 添加食材行 */
window.addIngredientRow = function() {
  const list = document.getElementById('ingredient-list');
  const idx = list.children.length;
  const row = document.createElement('div');
  row.className = 'dynamic-row';
  row.dataset.idx = idx;
  row.innerHTML = `
    <input type="text" class="ing-name" placeholder="食材名称" />
    <input type="number" class="ing-qty" placeholder="用量" step="0.1" min="0" />
    <input type="text" class="ing-unit" placeholder="单位" />
    <input type="text" class="ing-notes" placeholder="备注（可选）" />
    <button type="button" class="btn-remove" onclick="removeIngredientRow(this)" title="删除此行">
      <i class="fa-solid fa-trash-can"></i>
    </button>
  `;
  list.appendChild(row);
};

/** 删除食材行 */
window.removeIngredientRow = function(btn) {
  const row = btn.closest('.dynamic-row');
  if (row && document.querySelectorAll('#ingredient-list .dynamic-row').length > 1) {
    row.remove();
  } else {
    alert('至少保留一行食材');
  }
};

/** 添加步骤行 */
window.addStepRow = function() {
  const list = document.getElementById('step-list');
  const idx = list.children.length;
  const row = document.createElement('div');
  row.className = 'dynamic-row';
  row.dataset.idx = idx;
  row.innerHTML = `
    <span class="step-idx-badge">${idx + 1}</span>
    <input type="text" class="step-instruction" placeholder="步骤描述" />
    <input type="number" class="step-duration" placeholder="耗时（秒）" />
    <button type="button" class="btn-remove" onclick="removeStepRow(this)" title="删除此行">
      <i class="fa-solid fa-trash-can"></i>
    </button>
  `;
  list.appendChild(row);
  refreshStepIndices();
};

/** 删除步骤行 */
window.removeStepRow = function(btn) {
  const row = btn.closest('.dynamic-row');
  if (row && document.querySelectorAll('#step-list .dynamic-row').length > 1) {
    row.remove();
    refreshStepIndices();
  } else {
    alert('至少保留一行步骤');
  }
};

/** 刷新步骤序号 */
function refreshStepIndices() {
  document.querySelectorAll('#step-list .dynamic-row').forEach((row, i) => {
    const badge = row.querySelector('.step-idx-badge');
    if (badge) badge.textContent = i + 1;
  });
}

/** 将 AI 生成的菜谱存到全局，跳转到添加页 */
window.fillAiRecipeToAdd = function() {
  // 直接从原始 JSON 快照提取（零 DOM 依赖，100% 准确）
  if (!lastAiRecipe || !lastAiRecipe.title) {
    alert('没有可添加的 AI 菜谱数据');
    return;
  }

  // 如果 lastAiRecipe 来源于 DB（有 id 字段），不应允许手动添加
  if (lastAiRecipe.id) {
    alert('该菜谱已存在于菜谱库中，无需重复添加');
    return;
  }

  pendingAiRecipe = JSON.parse(JSON.stringify(lastAiRecipe));

  // 跳转到添加页
  router.navigate('add');
};

/** 用 pendingAiRecipe 填充添加表单 */
function fillAddFormFromAiRecipe() {
  if (!pendingAiRecipe) return;
  const r = pendingAiRecipe;

  // 基本信息
  const titleInput = document.getElementById('add-title');
  const descInput = document.getElementById('add-description');
  const timeInput = document.getElementById('add-cooking-time');
  if (titleInput && r.title) titleInput.value = r.title;
  if (descInput && r.description) descInput.value = r.description;
  if (timeInput && r.cooking_time) timeInput.value = r.cooking_time;

  // 分类下拉：按名称匹配 option 并选中
  const selectMap = {
    cuisine: r.cuisine_name,
    season: r.season_name,
    taste: r.taste_name,
    difficulty: r.difficulty_name
  };
  ['cuisine', 'season', 'taste', 'difficulty'].forEach(cat => {
    const sel = document.getElementById(`add-${cat}`);
    const targetName = selectMap[cat];
    if (sel && targetName) {
      for (let i = 0; i < sel.options.length; i++) {
        if (sel.options[i].textContent.trim() === targetName) {
          sel.selectedIndex = i;
          break;
        }
      }
    }
  });

  // 食材列表：清空默认行，逐行添加
  const ingList = document.getElementById('ingredient-list');
  if (ingList && r.ingredients && r.ingredients.length > 0) {
    ingList.innerHTML = ''; // 清空
    r.ingredients.forEach((ing, idx) => {
      const row = document.createElement('div');
      row.className = 'dynamic-row';
      row.dataset.idx = idx;
      row.innerHTML = `
        <input type="text" class="ing-name" placeholder="食材名称" value="${escapeHtml(ing.name)}" />
        <input type="number" class="ing-qty" placeholder="用量" step="0.1" min="0" value="${ing.quantity || ''}" />
        <input type="text" class="ing-unit" placeholder="单位" value="${escapeHtml(ing.unit || '')}" />
        <input type="text" class="ing-notes" placeholder="备注（可选）" value="${escapeHtml(ing.notes || '')}" />
        <button type="button" class="btn-remove" onclick="removeIngredientRow(this)" title="删除此行">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      `;
      ingList.appendChild(row);
    });
  }

  // 步骤列表：清空，逐行添加
  const stepList = document.getElementById('step-list');
  if (stepList && r.steps && r.steps.length > 0) {
    stepList.innerHTML = '';
    r.steps.forEach((step, idx) => {
      const row = document.createElement('div');
      row.className = 'dynamic-row';
      row.dataset.idx = idx;
      row.innerHTML = `
        <span class="step-idx-badge">${idx + 1}</span>
        <input type="text" class="step-instruction" placeholder="步骤描述" value="${escapeHtml(step.instruction)}" />
        <input type="number" class="step-duration" placeholder="耗时（秒）" value="${step.duration || ''}" />
        <button type="button" class="btn-remove" onclick="removeStepRow(this)" title="删除此行">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      `;
      stepList.appendChild(row);
    });
  }

  // 清理 pending，防止重复填充
  pendingAiRecipe = null;
}

/** 提交菜谱 */
window.submitRecipe = async function() {
  // 检查登录
  if (!currentUser) {
    alert('请先登录后再添加菜谱');
    router.navigate('profile');
    return;
  }

  const title = document.getElementById('add-title').value.trim();
  if (!title) { alert('请输入菜谱名称'); return; }

  const msgDiv = document.getElementById('add-message');
  msgDiv.innerHTML = '<p style="color:var(--text-secondary)">⏳ 正在提交...</p>';

  // 收集食材行
  const ingredients = [];
  document.querySelectorAll('#ingredient-list .dynamic-row').forEach(row => {
    const name = row.querySelector('.ing-name').value.trim();
    if (name) {
      ingredients.push({
        name,
        quantity: parseFloat(row.querySelector('.ing-qty').value) || null,
        unit: row.querySelector('.ing-unit').value.trim(),
        notes: row.querySelector('.ing-notes').value.trim()
      });
    }
  });

  // 收集步骤行
  const steps = [];
  document.querySelectorAll('#step-list .dynamic-row').forEach((row, i) => {
    const instruction = row.querySelector('.step-instruction').value.trim();
    if (instruction) {
      steps.push({
        step_number: i + 1,
        instruction,
        duration: parseInt(row.querySelector('.step-duration').value) || null
      });
    }
  });

  const payload = {
    title,
    description: document.getElementById('add-description').value.trim(),
    cooking_time: parseInt(document.getElementById('add-cooking-time').value) || null,
    cuisine_id: parseInt(document.getElementById('add-cuisine').value) || null,
    season_id: parseInt(document.getElementById('add-season').value) || null,
    taste_id: parseInt(document.getElementById('add-taste').value) || null,
    difficulty_id: parseInt(document.getElementById('add-difficulty').value) || null,
    created_by: currentUser.id,
    ingredients,
    steps
  };

  const isEditing = editingRecipeId !== null;
  const method = isEditing ? 'PUT' : 'POST';
  const url = isEditing ? `/api/recipes/${editingRecipeId}` : '/api/recipes';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.status === 'success') {
      const recipeId = data.recipe_id;
      if (isEditing) {
        msgDiv.innerHTML = '<p style="color:green">✅ 菜谱更新成功！即将跳转...</p>';
        editingRecipeId = null;
      } else {
        msgDiv.innerHTML = '<p style="color:green">✅ 菜谱添加成功！即将跳转...</p>';
        // 重置表单
        document.getElementById('add-recipe-form').reset();
        document.getElementById('ingredient-list').innerHTML = '<div class="dynamic-row" data-idx="0">' +
          '<input type="text" class="ing-name" placeholder="食材名称" />' +
          '<input type="number" class="ing-qty" placeholder="用量" step="0.1" min="0" />' +
          '<input type="text" class="ing-unit" placeholder="单位" />' +
          '<input type="text" class="ing-notes" placeholder="备注（可选）" />' +
          '<button type="button" class="btn-remove" onclick="removeIngredientRow(this)" title="删除此行"><i class="fa-solid fa-trash-can"></i></button></div>';
        document.getElementById('step-list').innerHTML = '<div class="dynamic-row" data-idx="0">' +
          '<span class="step-idx-badge">1</span>' +
          '<input type="text" class="step-instruction" placeholder="步骤描述" />' +
          '<input type="number" class="step-duration" placeholder="耗时（秒）" />' +
          '<button type="button" class="btn-remove" onclick="removeStepRow(this)" title="删除此行"><i class="fa-solid fa-trash-can"></i></button></div>';
      }
      // 跳转到详情页
      setTimeout(() => {
        router.navigate('detail', recipeId);
      }, 800);
    } else {
      msgDiv.innerHTML = '<p style="color:red">❌ ' + (data.message || (isEditing ? '更新失败' : '添加失败')) + '</p>';
    }
  } catch (e) {
    msgDiv.innerHTML = '<p style="color:red">网络错误：' + e.message + '</p>';
  }
};

// ============================================================
// 管理员后台
// ============================================================

window.adminLoadUsers = async function() {
  const tbody = document.getElementById('admin-user-tbody');
  const countSpan = document.getElementById('admin-user-count');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">加载中...</td></tr>';

  try {
    const res = await fetch('/api/admin/users', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();
    if (data.status !== 'success') {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:red">' + (data.message || '无权访问') + '</td></tr>';
      return;
    }
    const users = data.users || [];
    if (countSpan) countSpan.textContent = '共 ' + users.length + ' 个用户';
    if (users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">暂无用户数据</td></tr>';
      return;
    }
    tbody.innerHTML = '';
    users.forEach(u => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${u.id}</td>
        <td><strong>${escapeHtml(u.username)}</strong></td>
        <td>${u.created_at ? new Date(u.created_at).toLocaleDateString() : '-'}</td>
        <td>${u.recipe_count || 0}</td>
        <td>${u.favorite_count || 0}</td>
        <td>
          <button class="btn-sm btn-danger" onclick="adminDeleteUser(${u.id}, '${escapeHtml(u.username)}')">
            <i class="fa-solid fa-trash"></i> 删除
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:red">网络错误：' + e.message + '</td></tr>';
  }
};

window.adminDeleteUser = function(userId, username) {
  if (!confirm(`确定要删除用户「${username}」吗？\n该用户的所有收藏和浏览历史将被清除，其菜谱将变为匿名。\n此操作不可撤销！`)) return;

  fetch('/api/admin/users/' + userId, {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + token }
  })
  .then(res => res.json())
  .then(data => {
    if (data.status === 'success') {
      alert('✅ ' + data.message);
      adminLoadUsers();
    } else {
      alert('❌ ' + (data.message || '删除失败'));
    }
  })
  .catch(e => alert('网络错误：' + e.message));
};

// ============================================================
// 管理员 - 食材管理
// ============================================================

window.adminLoadIngredients = async function() {
  const tbody = document.getElementById('admin-ingredient-tbody');
  const pagination = document.getElementById('admin-ingredient-pagination');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center">加载中...</td></tr>';

  const search = document.getElementById('admin-ingredient-search').value.trim();
  const params = new URLSearchParams({ page: 1 });
  if (search) params.set('search', search);

  try {
    const res = await fetch('/api/admin/ingredients?' + params.toString(), {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();
    if (data.status !== 'success') {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:red">' + (data.message || '无权访问') + '</td></tr>';
      return;
    }
    const items = data.ingredients || [];
    if (items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center">暂无食材数据</td></tr>';
      pagination.innerHTML = '';
      return;
    }
    tbody.innerHTML = '';
    items.forEach(item => {
      const tr = document.createElement('tr');
      tr.dataset.id = item.id;
      tr.innerHTML = `
        <td>${item.id}</td>
        <td class="ing-name-cell">${escapeHtml(item.name)}</td>
        <td>${item.usage_count}</td>
        <td>
          <button class="btn-sm" onclick="adminEditIngredient(${item.id}, this)">
            <i class="fa-solid fa-pen"></i> 编辑
          </button>
          <button class="btn-sm btn-danger" onclick="adminDeleteIngredient(${item.id}, '${escapeHtml(item.name.replace(/'/g, "\\'"))}')">
            <i class="fa-solid fa-trash"></i> 删除
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
    pagination.innerHTML = `<span class="hint">共 ${data.total} 条</span>`;
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:red">网络错误：' + e.message + '</td></tr>';
  }
};

window.adminEditIngredient = function(id, btn) {
  const tr = btn.closest('tr');
  const nameCell = tr.querySelector('.ing-name-cell');

  // 检查是否已在编辑模式
  if (tr.classList.contains('editing')) {
    // 保存
    const nameInput = tr.querySelector('.edit-name-input');
    const newName = nameInput.value.trim();

    if (!newName) { alert('食材名称不能为空'); return; }

    fetch('/api/admin/ingredients/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ name: newName })
    })
    .then(res => res.json())
    .then(data => {
      if (data.status === 'success') {
        nameCell.textContent = newName;
        tr.classList.remove('editing');
        btn.innerHTML = '<i class="fa-solid fa-pen"></i> 编辑';
        // 移除输入框
        nameCell.querySelector('.edit-name-input')?.remove();
      } else {
        alert('❌ ' + (data.message || '更新失败'));
      }
    })
    .catch(e => alert('网络错误：' + e.message));
  } else {
    // 进入编辑模式
    tr.classList.add('editing');
    const currentName = nameCell.textContent;
    nameCell.innerHTML = `<input type="text" class="edit-name-input" value="${escapeHtml(currentName)}" style="width:120px;padding:4px 8px;border:1.5px solid var(--primary);border-radius:6px;font-family:var(--font);" />`;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> 保存';
  }
};

window.adminDeleteIngredient = function(id, name) {
  if (!confirm(`确定要删除食材「${name}」吗？`)) return;

  fetch('/api/admin/ingredients/' + id, {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + token }
  })
  .then(res => res.json())
  .then(data => {
    if (data.status === 'success') {
      alert('✅ ' + data.message);
      adminLoadIngredients();
    } else {
      alert('❌ ' + (data.message || '删除失败'));
    }
  })
  .catch(e => alert('网络错误：' + e.message));
};

// 回车触发食材搜索
document.addEventListener('DOMContentLoaded', function() {
  const searchInput = document.getElementById('admin-ingredient-search');
  if (searchInput) {
    searchInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); adminLoadIngredients(); }
    });
  }
});

window.adminLoadRecipes = async function() {
  const tbody = document.getElementById('admin-recipe-tbody');
  const pagination = document.getElementById('admin-recipe-pagination');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center">加载中...</td></tr>';

  const search = document.getElementById('admin-recipe-search').value.trim();
  const params = new URLSearchParams({ page: 1 });
  if (search) params.set('search', search);

  try {
    const res = await fetch('/api/admin/recipes?' + params.toString(), {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();
    if (data.status !== 'success') {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:red">' + (data.message || '无权访问') + '</td></tr>';
      return;
    }
    const recipes = data.recipes || [];
    if (recipes.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center">暂无菜谱数据</td></tr>';
      pagination.innerHTML = '';
      return;
    }
    tbody.innerHTML = '';
    recipes.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${r.id}</td>
        <td><a href="#detail/${r.id}" onclick="router.navigate('detail', ${r.id})" class="table-link">${escapeHtml(r.title)}</a></td>
        <td>${r.author_name ? escapeHtml(r.author_name) : '<span class="hint">匿名</span>'}</td>
        <td>${r.cuisine_name || '-'}</td>
        <td>${r.difficulty_name || '-'}</td>
        <td>${r.created_at ? new Date(r.created_at).toLocaleDateString() : '-'}</td>
        <td>
          <button class="btn-sm btn-danger" onclick="adminDeleteRecipe(${r.id}, '${escapeHtml(r.title.replace(/'/g, "\\'"))}')">
            <i class="fa-solid fa-trash"></i> 删除
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
    pagination.innerHTML = `<span class="hint">共 ${data.total} 条</span>`;
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:red">网络错误：' + e.message + '</td></tr>';
  }
};

window.adminDeleteRecipe = function(recipeId, title) {
  if (!confirm(`确定要删除菜谱「${title}」吗？\n其步骤、食材关系、收藏、浏览历史也将被清除。\n此操作不可撤销！`)) return;

  fetch('/api/admin/recipes/' + recipeId, {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + token }
  })
  .then(res => res.json())
  .then(data => {
    if (data.status === 'success') {
      alert('✅ ' + data.message);
      adminLoadRecipes();
    } else {
      alert('❌ ' + (data.message || '删除失败'));
    }
  })
  .catch(e => alert('网络错误：' + e.message));
};

// 回车触发菜谱搜索
document.addEventListener('DOMContentLoaded', function() {
  const searchInput = document.getElementById('admin-recipe-search');
  if (searchInput) {
    searchInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); adminLoadRecipes(); }
    });
  }
});

// 登录成功后的额外处理：root 强制跳转管理页
const origLoginSuccess = window.loginSuccessCallback;
window.addEventListener('auth-login', function(e) {
  if (e.detail && e.detail.is_root) {
    router.navigate('admin');
  }
});

// ============================================================
// 初始化
// ============================================================
(async function init() {
  await checkAuth();
  await loadFilterOptions();
  // 处理初始 hash
  router.handleHash();
})();
