// 혜택형 랜딩 전용 (templates/offer.js). 폼 저장·신청 창·마감 시계·선착순 차수는 app.js가 함
(function () {
  var C = window.BEMOVE || {};

  // 오늘(한국 시간) 등록하면 무료로 다니는 날 수 = 오늘부터 freeUntil까지 (오늘 포함). 상인처럼 freeUntil이 있을 때만
  if (C.freeUntil) {
    var kstDay = function (d) { return new Date(d.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }) + 'T00:00:00+09:00'); };
    var end = new Date(C.freeUntil + 'T00:00:00+09:00');
    var days = Math.max(0, Math.round((end - kstDay(new Date())) / 86400000) + 1);
    document.querySelectorAll('[data-free-days]').forEach(function (el) { el.textContent = days; });
    document.querySelectorAll('[data-bar-today]').forEach(function (el) { el.style.setProperty('--w', Math.max(3, days / 40 * 100) + '%'); });

    // 11월 안이면 "11월에 등록하면 한 달 넘게 무료" 안내 (12월이 되면 저절로 숨김)
    var m = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }).slice(5, 7);
    var nov = document.querySelector('[data-nov-note]');
    if (nov && m === '11') nov.hidden = false;
  }

  // 막대는 화면에 들어올 때 한 번 채워짐
  var bars = document.querySelector('.of-bars');
  if (bars && 'IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    bars.classList.add('wait');
    new IntersectionObserver(function (es, ob) {
      if (es[0].isIntersecting) { bars.classList.remove('wait'); ob.disconnect(); }
    }, { threshold: 0.4 }).observe(bars);
  }

  // "이걸로 받기" / "이 선생님께 체험 받기"를 누르면 신청 창에서 미리 골라져 있음
  function preselect(attr, name) {
    document.querySelectorAll('[data-sheet][data-' + attr + ']').forEach(function (b) {
      b.addEventListener('click', function () {
        var r = document.querySelector('#apply-sheet input[name=' + name + '][value="' + b.getAttribute('data-' + attr) + '"]');
        if (r) r.checked = true;
      });
    });
  }
  preselect('perk', 'perk');
  preselect('trainer', 'trainer');

  // 목표로 선생님 고르기: 누른 목표에 맞는 선생님 카드만 보여 줌 (다시 누르거나 "전체"를 누르면 모두)
  var goalBtns = document.querySelectorAll('.of-goals button[data-goal]');
  var allBtn = document.querySelector('.of-goals-all');
  function showGoal(key) {
    document.querySelectorAll('.of-trlist .of-tr').forEach(function (card) {
      var goals = (card.getAttribute('data-goals') || '').split(' ');
      card.classList.toggle('of-tr--dim', !!key && goals.indexOf(key) === -1);
    });
    goalBtns.forEach(function (b) { if (b !== allBtn) b.setAttribute('aria-pressed', String(!!key && b.getAttribute('data-goal') === key)); });
    if (allBtn) allBtn.hidden = !key;
    var list = document.querySelector('.of-trlist');
    if (key && list) list.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  goalBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      var key = b.getAttribute('data-goal');
      showGoal(b.getAttribute('aria-pressed') === 'true' ? '' : key);
    });
  });

  // 아래 고정 버튼: 첫 화면 버튼이 안 보일 때만
  var bar = document.querySelector('.of-bar');
  var first = document.querySelector('.of-hero .of-cta');
  if (bar && first && 'IntersectionObserver' in window) {
    bar.classList.add('off');
    new IntersectionObserver(function (es) { bar.classList.toggle('off', es[0].isIntersecting); }).observe(first);
  }
})();
