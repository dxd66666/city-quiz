/* =========================================================================
 * access.js —— 一次性测试资格门禁（用户端）
 *
 * 在 app.js 之后加载。职责：
 *   - 读取 ?token=，无 token / 无效 / 禁用 / 已完成 → 显示友好提示，不进入正式测试。
 *   - 有效 token → 调用 /api/quiz/start 领取资格（unused→in_progress）并放行答题。
 *   - 本地保存答题进度（localStorage）以便中途退出后恢复；完成结果也存本地，
 *     完成后仅原浏览器可回看报告；完成 / 锁定的链接不能重新作答。
 *   - 向 app.js 暴露 window.QuizAccess 桥接（begin / submit / 进度与结果存取）。
 * ========================================================================= */
(function (root) {
  'use strict';

  var App = root.CityQuizApp;

  var token = null;
  var m = /[?&]token=([^&]+)/.exec(root.location.search);
  if (m) {
    try { token = decodeURIComponent(m[1]); } catch (e) { token = m[1]; }
  }

  var state = 'unknown'; // missing | ready | completed | disabled | invalid | error
  var allowed = false;

  function key(name) { return 'cq_' + name + '_' + (token || ''); }

  // —— 进度（答题中）——
  function savedProgress() {
    try { var v = localStorage.getItem(key('progress')); return v ? JSON.parse(v) : null; }
    catch (e) { return null; }
  }
  function saveProgress(answers, current) {
    try { localStorage.setItem(key('progress'), JSON.stringify({ answers: answers, current: current })); }
    catch (e) {}
  }
  function clearProgress() {
    try { localStorage.removeItem(key('progress')); } catch (e) {}
  }

  // —— 结果（完成后，仅本浏览器可回看）——
  function savedResult() {
    try { var v = localStorage.getItem(key('result')); return v ? JSON.parse(v) : null; }
    catch (e) { return null; }
  }
  function saveResult(result, report) {
    try { localStorage.setItem(key('result'), JSON.stringify({ result: result, report: report })); }
    catch (e) {}
  }

  function post(path, body) {
    return fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    }).then(function (r) {
      return r.json();
    });
  }

  function begin() {
    return post('/api/quiz/start', { token: token });
  }
  function submit(answers) {
    return post('/api/quiz/submit', { token: token, answers: answers }).then(function (r) {
      if (r && r.ok) state = 'completed';
      return r;
    });
  }

  function renderGate(title, text, showRetry) {
    var retry = showRetry
      ? '<button class="btn-primary" id="gateRetry">重试</button>'
      : '';
    document.getElementById('app').innerHTML =
      '<main class="gate">' +
        '<div class="gate-card">' +
          '<p class="gate-kicker">你的灵魂适合哪座城市？</p>' +
          '<h1 class="gate-title">' + title + '</h1>' +
          '<p class="gate-text">' + text + '</p>' +
          retry +
        '</div>' +
      '</main>';
    if (showRetry) {
      var b = document.getElementById('gateRetry');
      if (b && App && App.retrySubmit) b.addEventListener('click', App.retrySubmit);
    }
  }

  function showBlocked(s) {
    var title, text;
    if (s === 'completed') {
      title = '本次测试已完成';
      text = '此专属链接只允许成功提交一次，已完成作答，无法重复测试。';
    } else if (s === 'disabled') {
      title = '链接已禁用';
      text = '此专属链接已被管理员禁用，如有疑问请联系发放方。';
    } else {
      title = '链接无效';
      text = '这不是有效的测试链接，请确认收到的网址是否完整。';
    }
    state = s;
    allowed = false;
    renderGate(title, text, false);
  }

  function showError() {
    state = 'error';
    renderGate('暂时无法保存', '网络或服务出现异常，本次结果尚未保存，你的测试资格不会被消耗，请重试。', true);
  }

  function showLoading() {
    renderGate('正在验证链接…', '请稍候，正在校验你的专属链接。', false);
  }

  // —— 暴露给 app.js 的桥接 ——
  root.QuizAccess = {
    token: token,
    get state() { return state; },
    get allowed() { return allowed; },
    savedProgress: savedProgress,
    saveProgress: saveProgress,
    clearProgress: clearProgress,
    savedResult: savedResult,
    saveResult: saveResult,
    begin: begin,
    submit: submit,
    showBlocked: showBlocked,
    showError: showError
  };

  // —— 启动流程 ——
  if (!token) {
    showBlocked('invalid');
    return;
  }

  // 本浏览器已保存完成结果 → 直接回看报告（不重新答题）
  var saved = savedResult();
  if (saved && saved.result && saved.report) {
    state = 'completed';
    allowed = false;
    if (App && App.renderSavedResult) App.renderSavedResult(saved);
    return;
  }

  showLoading();
  begin().then(function (r) {
    if (r && r.ok) {
      allowed = true;
      state = 'ready';
      if (App) App.init();
    } else {
      showBlocked(r && r.state ? r.state : 'invalid');
    }
  }).catch(function () {
    showError();
  });
})(typeof self !== 'undefined' ? self : this);
