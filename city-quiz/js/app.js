/* =========================================================================
 * app.js —— 界面逻辑（首页 / 答题 / 结果页）
 * 依赖：CityQuizQuestions, CityQuizMatching, CityQuizReports
 * 结果页不展示二进制编码、内部算法或匹配分数。
 * ========================================================================= */
(function (root) {
  'use strict';

  var Q = root.CityQuizQuestions;
  var M = root.CityQuizMatching;
  var R = root.CityQuizReports;

  // —— 每座城市的视觉（渐变 + 极简地标剪影，纯本地，无外部图片）——
  var CITY_ART = {
    paris: {
      gradient: 'linear-gradient(150deg, #F7E9E1 0%, #EDD6CC 100%)',
      svg: '<svg viewBox="0 0 160 120" fill="currentColor" aria-hidden="true"><path d="M72 12h16l5 10H67Z"/><path d="M74 26h12v14H74Z"/><path d="M70 44h20v6H70Z"/><path d="M66 54h28v10l-9 40H75l-9-40Z"/><path d="M56 118l9-30h30l9 30Z"/><rect x="40" y="113" width="80" height="4" rx="2"/></svg>'
    },
    tokyo: {
      gradient: 'linear-gradient(150deg, #EAEDF3 0%, #D7DEE9 100%)',
      svg: '<svg viewBox="0 0 160 120" fill="currentColor" aria-hidden="true"><path d="M78 8h4v8h-4Z"/><path d="M76 20h8v5h-8Z"/><path d="M74 29h12v6H74Z"/><path d="M70 39l9-2 3 62-12 1Z"/><rect x="66" y="42" width="28" height="4" rx="2"/><rect x="62" y="66" width="36" height="4" rx="2"/><rect x="56" y="106" width="48" height="5" rx="2.5"/></svg>'
    },
    new_york: {
      gradient: 'linear-gradient(150deg, #EEEDF2 0%, #DBDAE4 100%)',
      svg: '<svg viewBox="0 0 160 120" fill="currentColor" aria-hidden="true"><rect x="68" y="80" width="24" height="36" rx="1"/><rect x="62" y="66" width="36" height="10" rx="1"/><rect x="68" y="52" width="24" height="10" rx="1"/><rect x="74" y="34" width="12" height="16" rx="1"/><rect x="79" y="10" width="2" height="24"/><rect x="52" y="112" width="56" height="4" rx="2"/></svg>'
    },
    london: {
      gradient: 'linear-gradient(150deg, #E8EDEC 0%, #D3DEDD 100%)',
      svg: '<svg viewBox="0 0 160 120" fill="currentColor" aria-hidden="true"><rect x="78" y="18" width="4" height="16"/><path d="M58 52 80 34l22 18Z"/><rect x="62" y="52" width="36" height="62" rx="2"/><rect x="55" y="46" width="50" height="7" rx="3"/><circle cx="80" cy="74" r="8"/><rect x="48" y="112" width="64" height="4" rx="2"/></svg>'
    },
    rome: {
      gradient: 'linear-gradient(150deg, #F6E9DC 0%, #EBD4C2 100%)',
      svg: '<svg viewBox="0 0 160 120" fill="currentColor" aria-hidden="true"><ellipse cx="80" cy="80" rx="40" ry="34"/><rect x="46" y="48" width="68" height="10" rx="3"/><rect x="50" y="54" width="8" height="10"/><rect x="62" y="54" width="8" height="10"/><rect x="74" y="54" width="8" height="10"/><rect x="86" y="54" width="8" height="10"/><rect x="98" y="54" width="8" height="10"/><rect x="40" y="112" width="80" height="4" rx="2"/></svg>'
    },
    copenhagen: {
      gradient: 'linear-gradient(150deg, #E7F0EE 0%, #D3E4E1 100%)',
      svg: '<svg viewBox="0 0 160 120" fill="currentColor" aria-hidden="true"><path d="M40 112V80l8-14 8 14v32Z"/><path d="M56 112V72l10-16 10 16v40Z"/><path d="M76 112V84l9-13 9 13v28Z"/><path d="M94 112V76l10-14 10 14v36Z"/><rect x="40" y="112" width="72" height="4" rx="2"/></svg>'
    },
    seoul: {
      gradient: 'linear-gradient(150deg, #F1E8F3 0%, #E1D4E7 100%)',
      svg: '<svg viewBox="0 0 160 120" fill="currentColor" aria-hidden="true"><rect x="77" y="6" width="6" height="6"/><ellipse cx="80" cy="24" rx="10" ry="5"/><path d="M70 32h20l8 68H62Z"/><rect x="58" y="104" width="44" height="6" rx="3"/><rect x="46" y="112" width="68" height="4" rx="2"/></svg>'
    },
    amsterdam: {
      gradient: 'linear-gradient(150deg, #F8EEE3 0%, #EED9C3 100%)',
      svg: '<svg viewBox="0 0 160 120" fill="currentColor" aria-hidden="true"><rect x="60" y="70" width="42" height="42"/><path d="M58 70V56h10v-9h24v9h10v14Z"/><rect x="66" y="78" width="8" height="12"/><rect x="88" y="78" width="8" height="12"/><rect x="66" y="96" width="8" height="12"/><rect x="88" y="96" width="8" height="12"/><rect x="48" y="112" width="64" height="4" rx="2"/></svg>'
    },
    barcelona: {
      gradient: 'linear-gradient(150deg, #F9E9E1 0%, #F0D4C1 100%)',
      svg: '<svg viewBox="0 0 160 120" fill="currentColor" aria-hidden="true"><path d="M46 112 52 42h6l4 70Z"/><path d="M60 112l7-90h6l6 90Z"/><path d="M78 112l5-70h6l6 70Z"/><path d="M92 112l5-42h6l4 42Z"/><rect x="42" y="112" width="76" height="4" rx="2"/></svg>'
    },
    zurich: {
      gradient: 'linear-gradient(150deg, #EAF0F5 0%, #D8E1EB 100%)',
      svg: '<svg viewBox="0 0 160 120" fill="currentColor" aria-hidden="true"><path d="M50 42 62 24l12 18Z"/><rect x="52" y="42" width="20" height="70"/><path d="M70 76 80 62l10 14Z"/><rect x="70" y="78" width="20" height="34"/><path d="M86 42 98 24l12 18Z"/><rect x="88" y="42" width="20" height="70"/><rect x="40" y="112" width="80" height="4" rx="2"/></svg>'
    },
    melbourne: {
      gradient: 'linear-gradient(150deg, #EBF0E6 0%, #D8E3D1 100%)',
      svg: '<svg viewBox="0 0 160 120" fill="currentColor" aria-hidden="true"><path d="M60 112V78q20-26 40 0v34Z"/><rect x="76" y="58" width="8" height="12"/><rect x="50" y="86" width="12" height="26"/><rect x="98" y="86" width="12" height="26"/><rect x="44" y="112" width="72" height="4" rx="2"/></svg>'
    },
    istanbul: {
      gradient: 'linear-gradient(150deg, #F6EBDC 0%, #EAD8BE 100%)',
      svg: '<svg viewBox="0 0 160 120" fill="currentColor" aria-hidden="true"><path d="M44 100l3-8 5 8Z"/><rect x="44" y="100" width="6" height="16"/><path d="M112 100l3-8 5 8Z"/><rect x="112" y="100" width="6" height="16"/><path d="M48 104q32-40 64 0Z"/><rect x="52" y="112" width="56" height="4" rx="2"/></svg>'
    }
  };

  var rootEl = document.getElementById('app');
  var state = {
    view: 'home',
    answers: new Array(Q.QUESTION_COUNT).fill(null),
    current: 0,
    result: null
  };

  var OPTION_LETTERS = ['A', 'B', 'C', 'D'];

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function scrollTop() {
    window.scrollTo(0, 0);
  }

  function access() {
    return root.QuizAccess || null;
  }

  function saveProgress() {
    var a = access();
    if (a && a.saveProgress) a.saveProgress(state.answers, state.current);
  }

  function startQuiz() {
    state.answers = new Array(Q.QUESTION_COUNT).fill(null);
    state.current = 0;
    var a = access();
    if (a) {
      var p = a.savedProgress && a.savedProgress();
      if (p && p.answers && p.answers.length === Q.QUESTION_COUNT) {
        state.answers = p.answers.slice();
        if (typeof p.current === 'number' && p.current >= 0 && p.current < Q.QUESTION_COUNT) {
          state.current = p.current;
        }
      }
    }
    state.view = 'quiz';
    renderQuiz();
    scrollTop();
  }

  function renderHome() {
    rootEl.innerHTML =
      '<main class="home">' +
        '<div class="home-inner">' +
          '<p class="home-kicker">32 道选择题 · 找到与你灵魂最契合的城市</p>' +
          '<h1 class="home-title">你的灵魂适合<br>哪座城市？</h1>' +
          '<p class="home-sub">这是一份关于生活方式的趣味测试。没有标准答案，<br>只需要跟随你的直觉。</p>' +
          '<button class="btn-primary" id="startBtn">开始测试</button>' +
          '<p class="home-note">约 3 分钟 · 结果仅供娱乐参考</p>' +
        '</div>' +
      '</main>';
    document.getElementById('startBtn').addEventListener('click', function () {
      var a = access();
      if (a && !a.allowed) {
        a.begin().then(function (r) {
          if (r && r.ok) { a.allowed = true; startQuiz(); }
          else if (a.showBlocked) a.showBlocked(r && r.state ? r.state : 'invalid');
        }).catch(function () { if (a.showError) a.showError(); });
      } else {
        startQuiz();
      }
    });
  }

  function renderQuiz() {
    var q = Q.QUESTIONS[state.current];
    var answered = state.answers[state.current];
    var progress = Math.round((state.current / Q.QUESTION_COUNT) * 100);

    var optionsHtml = OPTION_LETTERS.map(function (letter) {
      var selected = answered === letter ? ' selected' : '';
      return '<button class="option' + selected + '" data-letter="' + letter + '">' +
        '<span class="option-letter">' + letter + '</span>' +
        '<span class="option-text">' + esc(q.options[letter]) + '</span>' +
        '</button>';
    }).join('');

    rootEl.innerHTML =
      '<main class="quiz">' +
        '<div class="quiz-top">' +
          '<div class="progress-track"><div class="progress-fill" style="width:' + progress + '%"></div></div>' +
          '<div class="quiz-meta">' +
            '<button class="btn-back" id="backBtn" ' + (state.current === 0 ? 'disabled' : '') + '>‹ 上一题</button>' +
            '<span class="quiz-count">' + (state.current + 1) + ' / ' + Q.QUESTION_COUNT + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="quiz-card">' +
          '<h2 class="question-text">' + esc(q.text) + '</h2>' +
          '<div class="options">' + optionsHtml + '</div>' +
        '</div>' +
      '</main>';

    document.getElementById('backBtn').addEventListener('click', function () {
      if (state.current > 0) {
        state.current--;
        saveProgress();
        renderQuiz();
      }
    });

    var optionEls = rootEl.querySelectorAll('.option');
    for (var i = 0; i < optionEls.length; i++) {
      optionEls[i].addEventListener('click', function (e) {
        var letter = e.currentTarget.getAttribute('data-letter');
        state.answers[state.current] = letter;
        saveProgress();
        if (state.current < Q.QUESTION_COUNT - 1) {
          state.current++;
          renderQuiz();
          scrollTop();
        } else {
          finishQuiz();
        }
      });
    }
  }

  function finishQuiz() {
    var answers = state.answers;
    for (var i = 0; i < answers.length; i++) {
      if (answers[i] == null) return; // 不应发生：全部已作答才进入
    }
    var result = M.computeResult(answers);
    var report = R.buildReport(result);

    var a = access();
    if (!a) {
      // 无资格系统（本地独立运行）时保持原行为
      state.result = { result: result, report: report };
      state.view = 'result';
      renderResult();
      scrollTop();
      return;
    }

    a.submit(answers).then(function (r) {
      if (r && r.ok) {
        if (a.saveResult) a.saveResult(result, report);
        if (a.clearProgress) a.clearProgress();
        state.result = { result: result, report: report };
        state.view = 'result';
        renderResult();
        scrollTop();
      } else if (r && r.state === 'completed') {
        if (a.showBlocked) a.showBlocked('completed');
      } else {
        if (a.showError) a.showError();
      }
    }).catch(function () {
      if (a.showError) a.showError();
    });
  }

  function renderResult() {
    var data = state.result;
    var result = data.result;
    var report = data.report;
    var city = report.city;
    var art = CITY_ART[city.id];
    var a = access();
    var isCompleted = !!(a && a.state === 'completed');

    var dimsHtml = report.dimensions.map(function (d) {
      var sentences = d.subs.map(function (s) {
        return '<p class="dim-sentence">' + esc(s.name) + ' · ' + esc(s.sentence) + '</p>';
      }).join('');
      return '<div class="dim-card">' +
        '<div class="dim-head">' +
          '<span class="dim-label">' + esc(d.label) + '</span>' +
          '<span class="dim-score">' + d.score + '<em> / 24</em></span>' +
        '</div>' +
        sentences +
        '</div>';
    }).join('');

    var traitsHtml = report.topTraits.map(function (t) {
      return '<p class="trait-line">' + esc(t.sentence) + '</p>';
    }).join('');

    var scenesHtml = report.scenes.map(function (s) {
      return '<p class="scene-line">' + esc(s.sentence) + '</p>';
    }).join('');

    var daysHtml = city.travel.days.map(function (day) {
      var items = day.items.map(function (it) { return '<li>' + esc(it) + '</li>'; }).join('');
      return '<div class="day-block">' +
        '<h4 class="day-title">' + esc(day.title) + '</h4>' +
        '<ul class="day-items">' + items + '</ul>' +
        '</div>';
    }).join('');

    rootEl.innerHTML =
      '<main class="result">' +

        // ① 海报
        '<section class="hero-card" style="background:' + art.gradient + '">' +
          '<div class="hero-art">' + art.svg + '</div>' +
          '<div class="hero-body">' +
            '<p class="hero-country">' + esc(city.nameEn) + ' · ' + esc(city.country) + '</p>' +
            '<h1 class="hero-name">' + esc(city.name) + '</h1>' +
            '<p class="hero-tagline">「' + esc(city.tagline) + '」</p>' +
          '</div>' +
        '</section>' +
        '<p class="hero-intro">' + esc(city.intro) + '</p>' +

        // ② 四维画像
        '<section class="section">' +
          '<h2 class="section-title">你的四维画像</h2>' +
          '<p class="section-sub">以下由你的选择计算而来，是对你生活偏好的温和描述。</p>' +
          '<div class="dims">' + dimsHtml + '</div>' +
        '</section>' +

        // ③ 为什么是这座城市
        '<section class="section">' +
          '<h2 class="section-title">为什么是' + esc(city.name) + '？</h2>' +
          '<p class="why-open">' + esc(city.whyOpening) + '</p>' +
          '<div class="traits-callout">' +
            '<p class="traits-label">关于你</p>' + traitsHtml +
          '</div>' +
          '<p class="why-close">' + esc(city.whyClosing) + '</p>' +
        '</section>' +

        // ④ 理想的一天
        '<section class="section">' +
          '<h2 class="section-title">如果生活在' + esc(city.name) + '</h2>' +
          '<p class="day-body">' + esc(city.day) + '</p>' +
          '<div class="scenes">' + scenesHtml + '</div>' +
        '</section>' +

        // ⑤⑥ 旅行攻略
        '<section class="section">' +
          '<h2 class="section-title">三天两夜 · ' + esc(city.name) + '旅行攻略</h2>' +
          '<div class="days">' + daysHtml + '</div>' +
          '<div class="guide">' +
            '<div class="guide-row"><span class="guide-label">代表性美食</span><span class="guide-val">' + esc(city.travel.food) + '</span></div>' +
            '<div class="guide-row"><span class="guide-label">推荐季节</span><span class="guide-val">' + esc(city.travel.season) + '</span></div>' +
            '<div class="guide-row"><span class="guide-label">交通</span><span class="guide-val">' + esc(city.travel.transport) + '</span></div>' +
            '<div class="guide-row"><span class="guide-label">注意</span><span class="guide-val">' + esc(city.travel.notes) + '</span></div>' +
          '</div>' +
          '<p class="disclaimer">' + esc(R.DISCLAIMER) + '</p>' +
        '</section>' +

        // ⑦ 写给你的话
        '<section class="section final-words">' +
          '<div class="final-quote">“' + esc(city.finalWords) + '”</div>' +
        '</section>' +

        (isCompleted
          ? '<p class="result-foot">本次测试已完成，链接已锁定，无法重复作答。</p>'
          : '<button class="btn-primary btn-restart" id="restartBtn">重新测试</button>') +
        '<p class="result-foot">结果由你的选择确定性生成，仅供娱乐参考。</p>' +
      '</main>';

    var restartBtn = document.getElementById('restartBtn');
    if (restartBtn) {
      restartBtn.addEventListener('click', function () {
        state.view = 'quiz';
        state.answers = new Array(Q.QUESTION_COUNT).fill(null);
        state.current = 0;
        state.result = null;
        renderQuiz();
        scrollTop();
      });
    }
  }

  function init() {
    renderHome();
  }

  // —— 对外接口（供 access.js 控制启动 / 重试 / 回看已保存结果）——
  root.CityQuizApp = {
    init: init,
    retrySubmit: finishQuiz,
    renderSavedResult: function (saved) {
      if (saved && saved.result && saved.report) {
        state.result = saved;
        state.view = 'result';
        renderResult();
        scrollTop();
      }
    }
  };
})(typeof self !== 'undefined' ? self : this);
