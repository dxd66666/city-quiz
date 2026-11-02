/* =========================================================================
 * admin.js —— 管理后台逻辑（/admin）
 * 所有接口均需 Bearer 会话；会话由服务端校验，前端不接触 Supabase 密钥。
 * ========================================================================= */
(function () {
  'use strict';

  var SESSION_KEY = 'cq_admin_session';

  var $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function session() {
    try { return localStorage.getItem(SESSION_KEY); } catch (e) { return null; }
  }

  function api(path, body) {
    var opts = {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json' }
    };
    var s = session();
    if (s) opts.headers['Authorization'] = 'Bearer ' + s;
    if (body !== undefined) opts.body = JSON.stringify(body);
    return fetch(path, opts).then(function (r) { return r.json(); });
  }

  function fmt(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('zh-CN', { hour12: false });
  }

  var STATUS = {
    unused: { label: '未使用', cls: 'unused' },
    in_progress: { label: '测试中', cls: 'in_progress' },
    completed: { label: '已完成', cls: 'completed' },
    disabled: { label: '已禁用', cls: 'disabled' }
  };

  // —— 登录 ——
  function showLogin(msg) {
    $('loginView').classList.remove('hidden');
    $('mainView').classList.add('hidden');
    $('loginMsg').textContent = msg || '';
  }
  function showMain() {
    $('loginView').classList.add('hidden');
    $('mainView').classList.remove('hidden');
    loadData();
  }

  function doLogin() {
    var pw = $('pw').value;
    if (!pw) { $('loginMsg').textContent = '请输入口令'; return; }
    $('loginMsg').textContent = '';
    api('/api/admin/login', { password: pw }).then(function (r) {
      if (r && r.ok && r.token) {
        try { localStorage.setItem(SESSION_KEY, r.token); } catch (e) {}
        $('pw').value = '';
        showMain();
      } else {
        $('loginMsg').textContent = '口令错误';
      }
    }).catch(function () { $('loginMsg').textContent = '网络异常'; });
  }

  function doLogout() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
    showLogin();
  }

  // —— 数据 ——
  function loadData() {
    api('/api/admin/tokens').then(function (r) {
      if (r && r.ok && Array.isArray(r.tokens)) {
        renderStats(r.tokens);
        renderTable(r.tokens);
      } else {
        // 会话过期 / 未授权 → 回登录
        showLogin('会话已过期，请重新登录');
      }
    }).catch(function () { showLogin('网络异常'); });
  }

  function renderStats(tokens) {
    var c = { unused: 0, in_progress: 0, completed: 0, disabled: 0 };
    tokens.forEach(function (t) { if (c[t.status] != null) c[t.status]++; });
    var html = '';
    [['unused', '未使用'], ['in_progress', '测试中'], ['completed', '已完成'], ['disabled', '已禁用']].forEach(function (p) {
      html += '<div class="stat"><b>' + c[p[0]] + '</b><span>' + p[1] + '</span></div>';
    });
    $('stats').innerHTML = html;
  }

  function actionButtons(t) {
    var b = '';
    if (t.status === 'unused' && t.url) {
      b += '<button class="btn small" data-copy="' + esc(t.url) + '">复制</button> ';
    }
    if (t.status !== 'disabled') {
      b += '<button class="btn small danger" data-disable="' + esc(t.id) + '">禁用</button> ';
    }
    if (t.status !== 'unused') {
      b += '<button class="btn small ghost" data-reset="' + esc(t.id) + '">重置</button>';
    }
    return b || '<span class="muted">—</span>';
  }

  function renderTable(tokens) {
    var rows = tokens.map(function (t) {
      var s = STATUS[t.status] || { label: t.status, cls: '' };
      return '<tr>' +
        '<td><span class="badge ' + s.cls + '">' + s.label + '</span>' +
          (t.resultCode ? '<div class="muted">' + esc(t.resultCode) + '</div>' : '') +
        '</td>' +
        '<td class="muted">' + fmt(t.createdAt) + '</td>' +
        '<td class="muted">' + fmt(t.startedAt) + '</td>' +
        '<td class="muted">' + fmt(t.completedAt) + '</td>' +
        '<td>' + esc(t.resultCityName || '—') + '</td>' +
        '<td>' + actionButtons(t) + '</td>' +
      '</tr>';
    }).join('');
    $('tbody').innerHTML = rows || '<tr><td colspan="6" class="muted">暂无数据</td></tr>';
  }

  // —— 生成 ——
  function generate(count) {
    api('/api/admin/generate', { count: count }).then(function (r) {
      if (!r || !r.ok) { alert('生成失败'); return; }
      var items = r.links.map(function (l) {
        return '<div class="item"><span class="url">' + esc(l.url) + '</span>' +
          '<button class="btn small" data-copy="' + esc(l.url) + '">复制</button></div>';
      }).join('');
      $('genLinks').innerHTML = items;
      $('genResult').classList.remove('hidden');
      loadData();
    }).catch(function () { alert('生成失败'); });
  }

  // —— 复制 ——
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () { return fallbackCopy(text); });
    }
    return fallbackCopy(text);
  }
  function fallbackCopy(text) {
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      try { document.execCommand('copy'); resolve(); }
      catch (e) { reject(e); }
      document.body.removeChild(ta);
    });
  }

  function copyAllUnused() {
    api('/api/admin/tokens').then(function (r) {
      if (!r || !r.ok) { alert('获取失败'); return; }
      var urls = r.tokens.filter(function (t) { return t.status === 'unused' && t.url; }).map(function (t) { return t.url; });
      if (!urls.length) { alert('没有未使用链接'); return; }
      copyText(urls.join('\n')).then(function () { alert('已复制 ' + urls.length + ' 条未使用链接'); });
    });
  }

  function exportCsv() {
    api('/api/admin/tokens').then(function (r) {
      if (!r || !r.ok) { alert('获取失败'); return; }
      var rows = r.tokens.filter(function (t) { return t.status === 'unused' && t.url; });
      if (!rows.length) { alert('没有未使用链接'); return; }
      var lines = ['链接,创建时间'];
      rows.forEach(function (t) { lines.push('"' + t.url + '","' + fmt(t.createdAt) + '"'); });
      var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'unused-links-' + Date.now() + '.csv';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 0);
    });
  }

  // —— 事件委托 ——
  document.addEventListener('click', function (e) {
    var el = e.target;
    if (el.tagName !== 'BUTTON') return;
    var gen = el.getAttribute('data-gen');
    if (gen) { generate(parseInt(gen, 10)); return; }
    var copy = el.getAttribute('data-copy');
    if (copy) { copyText(copy).then(function () { el.textContent = '已复制'; setTimeout(function () { el.textContent = '复制'; }, 1000); }); return; }
    var disable = el.getAttribute('data-disable');
    if (disable) {
      if (confirm('确定禁用该链接？禁用后无法答题。')) {
        api('/api/admin/disable', { id: disable }).then(function () { loadData(); });
      }
      return;
    }
    var reset = el.getAttribute('data-reset');
    if (reset) {
      if (confirm('确定重置该链接？重置后恢复为「未使用」，可重新答题。')) {
        api('/api/admin/reset', { id: reset }).then(function () { loadData(); });
      }
      return;
    }
  });

  $('loginBtn').addEventListener('click', doLogin);
  $('pw').addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
  $('logoutBtn').addEventListener('click', doLogout);
  $('copyAllBtn').addEventListener('click', copyAllUnused);
  $('exportBtn').addEventListener('click', exportCsv);

  // 启动
  if (session()) { showMain(); } else { showLogin(); }
})();
