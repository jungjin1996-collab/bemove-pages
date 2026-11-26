(function () {
  // site.json 이 비어 있으면 미리보기로 동작하고 아무것도 저장하지 않는다.
  // Formula X 연결: site.json 의 formulaForms[지점] 폼으로 신청·방문·시작을 보낸다.
  // (Formula X 공개 폼이 쓰는 marketing_submit_form / marketing_track_event 와 같은 통로)
  var CONFIG = window.BEMOVE || {};
  // 내 PC 미리보기(localhost)에서는 Formula X 숫자가 오염되지 않게 기록·저장하지 않는다. 시험할 때만 ?live=1
  var LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && !/[?&]live=1\b/.test(location.search);
  var CONNECTED = !!(CONFIG.url && CONFIG.key && CONFIG.formId) && !LOCAL;
  var SESSION = (function () {
    try {
      var s = sessionStorage.getItem('bm_session');
      if (!s) { s = 's_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); sessionStorage.setItem('bm_session', s); }
      return s;
    } catch (e) { return 's_' + Date.now().toString(36); }
  })();

  function rpc(name, body) {
    return fetch(CONFIG.url + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: CONFIG.key, Authorization: 'Bearer ' + CONFIG.key },
      body: JSON.stringify(body)
    }).then(function (res) {
      if (!res.ok) throw new Error(res.status);
      return res.json();
    });
  }

  var forms = document.querySelectorAll('.lead-form');
  var bar = document.querySelector('.bar');
  var calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var canObserve = 'IntersectionObserver' in window;

  // Formula X 가 읽는 형식: form_id, session_id, page_path, referrer_host, utm_*, fbclid
  function tracking() {
    var q = new URLSearchParams(location.search);
    var out = {
      form_id: CONFIG.formId,
      session_id: SESSION,
      page_path: location.pathname + location.hash,
      referrer_host: document.referrer || ''
    };
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid'].forEach(function (k) {
      if (q.get(k)) out[k] = q.get(k);
    });
    if (q.get('n_keyword') && !out.utm_term) out.utm_term = q.get('n_keyword');
    return out;
  }

  function track(type) {
    if (!CONNECTED) return;
    rpc('marketing_track_event', { p_payload: Object.assign({ event_type: type }, tracking()) }).catch(function () {});
  }
  track('view');
  // 메타 픽셀(지점별 site.json metaPixels). 머리의 기본 코드가 localhost 에서는 fbq 를 만들지 않으므로 여기서도 조용히 넘어간다.
  function pixel(kind, name) {
    try { if (typeof window.fbq === 'function') window.fbq(kind, name); } catch (e) {}
  }
  // "시작" = 신청 창을 열거나, 입력칸을 처음 누르거나, (둘 다 없이) 바로 제출할 때 중 가장 먼저. 한 번만 셈
  var started = false;
  function markStart() { if (started) return; started = true; track('start'); }
  document.addEventListener('focusin', function (e) {
    if (!e.target.closest || !e.target.closest('.lead-form')) return;
    markStart();
  });

  function bindForm(form) {
    var error = form.querySelector('.form-error');

    function showDone(title, body) {
      form.outerHTML = '<div class="done" role="status"><strong>' + title + '</strong><p>' + body + '</p></div>';
    }

    function fail(field, message) {
      error.textContent = message;
      form.elements[field].setAttribute('aria-invalid', 'true');
      form.elements[field].focus();
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      markStart();
      error.textContent = '';
      form.querySelectorAll('[aria-invalid]').forEach(function (el) { el.removeAttribute('aria-invalid'); });
      var data = new FormData(form);
      if (data.get('website')) return;

      var name = String(data.get('name')).trim();
      var phone = String(data.get('phone')).replace(/[^0-9]/g, '');
      if (name.length < 2) return fail('name', '이름을 입력해 주세요.');
      if (!/^01[016789][0-9]{7,8}$/.test(phone)) return fail('phone', '휴대폰 번호를 다시 확인해 주세요.');
      if (!data.get('consent_privacy')) return fail('consent_privacy', '개인정보 수집·이용에 동의해 주셔야 상담 신청이 가능합니다.');

      // 지점 텔레그램 알림(구글 앱스 스크립트 중계). Formula X 정식 알림이 생기면 뺀다.
      var CAN_ALERT = !!CONFIG.alertUrl && !LOCAL;
      if (!CONNECTED && !CAN_ALERT) {
        showDone('미리보기 화면입니다', '아직 DB가 연결되지 않아 입력하신 내용은 저장되지 않았습니다.');
        return;
      }
      var doneTitle = form.dataset.doneTitle || '신청이 접수되었습니다';
      var doneBody = form.dataset.doneBody || '확인 후 빠르게 연락드리겠습니다.';
      var tr = tracking();
      function sendAlert() {
        if (!CAN_ALERT) return Promise.resolve();
        return fetch(CONFIG.alertUrl, {
          method: 'POST', mode: 'no-cors', keepalive: true,
          body: JSON.stringify({ branch: form.dataset.branch, name: name, phone: phone, visit: data.getAll('visit'), interests: data.getAll('trainer').map(function (t) { return '선생님: ' + t; }).concat(data.getAll('contact').map(function (c) { return '통화 편한 시간: ' + c; })).concat(data.getAll('interest'), data.getAll('history').map(function (h) { return '이전 이용: ' + h; }), data.getAll('perk').map(function (p) { return '받을 혜택: ' + p; })), time: data.getAll('time'), utm_source: tr.utm_source || '', utm_campaign: tr.utm_campaign || '' })
        }).catch(function () {});
      }

      var submit = form.querySelector('button[type=submit]');
      var label = submit.textContent;
      submit.disabled = true;
      submit.textContent = '접수 중입니다';
      // 키 이름은 Formula X 폼 질문 key 와 같아야 응답 목록에 제목대로 보인다.
      (CONNECTED ? rpc('marketing_submit_form', {
        p_payload: Object.assign({
          response_data: {
            name: name,
            phone: phone,
            request_type: form.dataset.request || (form.dataset.type === 'free_pt' ? '무료 체험 PT' : '상담 신청'),
            trainer: data.get('trainer') || form.dataset.trainer || '',
            interests: data.getAll('interest'),
            preferred_time: data.getAll('time'),
            visit_pref: data.getAll('visit'),
            history: data.getAll('history'),
            perk: data.get('perk') || '',
            contact: data.get('contact') || '',
            consent_privacy: '동의'
          },
          // Formula X 개별 응답 화면의 "유입"은 source_context.utm_source 를 읽는다
          source_context: Object.assign({ landing: 'bemove-landing', branch: form.dataset.branch, page: location.href }, tracking()),
          consent_marketing: !!data.get('consent_marketing')
        }, tracking())
      }) : Promise.resolve('alert-only')).then(function (responseId) {
        if (!responseId) throw new Error('no_response_id');
        // 메타 픽셀 Lead: Formula X 저장이 성공했을 때만. 이름·번호 같은 개인정보는 보내지 않는다.
        if (CONNECTED && responseId !== 'alert-only') pixel('track', 'Lead');
        sendAlert();
        showDone(doneTitle, doneBody);
      }).catch(function () {
        submit.disabled = false;
        submit.textContent = label;
        error.textContent = '접수에 실패했습니다. 잠시 후 다시 시도하거나 전화로 문의해 주세요.';
      });
    });
  }
  forms.forEach(bindForm);

  // 간단 신청형: 첫 신청 버튼이 화면에서 사라지면 아래 고정 버튼을 보여 준다(버튼 두 개가 동시에 보이지 않게)
  var qkBar = document.querySelector(".qk-bar"), qkFirst = document.querySelector(".qk-first");
  if (qkBar && qkFirst) {
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) { qkBar.hidden = es[0].isIntersecting || es[0].boundingClientRect.top > 0; }).observe(qkFirst);
    } else { qkBar.hidden = false; }
  }

  // 트레이너 프로필 창
  document.querySelectorAll('[data-sheet]').forEach(function (button) {
    button.addEventListener('click', function () {
      if (button.dataset.sheet === 'apply-sheet') { pixel('trackCustom', 'FormOpen'); markStart(); }
      document.getElementById(button.dataset.sheet).showModal();
    });
  });
  document.querySelectorAll('dialog.sheet').forEach(function (sheet) {
    sheet.querySelector('.sheet-close').addEventListener('click', function () { sheet.close(); });
    sheet.addEventListener('click', function (e) { if (e.target === sheet) sheet.close(); });
  });

  // 시설 둘러보기
  var tourItems = Array.prototype.slice.call(document.querySelectorAll('.tour-item'));
  var tourMore = document.querySelector('.tour-more');
  var tourCount = document.querySelector('.tour-count');
  var tourFilters = document.querySelectorAll('.tour-filter button');
  var tourView = document.getElementById('tour-view');
  var tourCat = '전체';
  var tourOpen = false;
  var TOUR_FIRST = 6;

  function renderTour() {
    var matched = tourItems.filter(function (el) { return tourCat === '전체' || el.dataset.cat === tourCat; });
    var limit = tourOpen ? matched.length : TOUR_FIRST;
    tourItems.forEach(function (el) { el.hidden = true; el.classList.remove('lead'); });
    matched.slice(0, limit).forEach(function (el, i) {
      el.hidden = false;
      if (i === 0) el.classList.add('lead');
    });
    tourCount.textContent = Math.min(limit, matched.length) + ' / ' + matched.length + ' PHOTOS';
    tourMore.hidden = matched.length <= limit;
  }
  tourFilters.forEach(function (button) {
    button.addEventListener('click', function () {
      tourCat = button.dataset.cat;
      tourOpen = false;
      tourFilters.forEach(function (b) { b.setAttribute('aria-pressed', b === button); });
      renderTour();
    });
  });
  if (tourMore) tourMore.addEventListener('click', function () { tourOpen = true; renderTour(); });
  tourItems.forEach(function (el) {
    if (!el.dataset.src) return;
    el.addEventListener('click', function () {
      tourView.querySelector('img').src = el.dataset.src;
      tourView.querySelector('img').alt = el.dataset.title;
      tourView.querySelector('p').textContent = el.dataset.title;
      tourView.showModal();
    });
  });
  if (tourCount) renderTour();

  // 마감 카운트다운 (오픈 전 사전등록 페이지 v2)
  var timers = document.querySelectorAll('[data-countdown]');
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function tickTimers() {
    timers.forEach(function (el) {
      var left = Math.max(0, Math.floor((new Date(el.dataset.countdown) - new Date()) / 1000));
      var d = Math.floor(left / 86400), h = Math.floor(left % 86400 / 3600), m = Math.floor(left % 3600 / 60), s = left % 60;
      // 숫자마다 고정 폭 칸에 넣어서 1초마다 글자가 흔들리지 않게 한다
      var dg = function (v) { return String(v).split('').map(function (c) { return '<span class="dg">' + c + '</span>'; }).join(''); };
      el.innerHTML = left === 0 ? '마감' : (d > 0 ? '<b class="sg">' + dg(d) + '</b><small>일</small>' : '') +
        '<span class="sg">' + dg(pad(h)) + '</span><i>:</i><span class="sg">' + dg(pad(m)) + '</span><i>:</i><em class="sg">' + dg(pad(s)) + '</em>';
    });
  }
  if (timers.length) { tickTimers(); setInterval(tickTimers, 1000); }

  // 위쪽 고정 바: 카운트다운 블록을 지나면 나타남
  var sticky = document.querySelector('.pv-sticky');
  var countBlock = document.querySelector('.pv-count');
  if (sticky && countBlock && canObserve) {
    new IntersectionObserver(function (entries) {
      var e = entries[0];
      var past = !e.isIntersecting && e.boundingClientRect.top < 0;
      sticky.classList.toggle('on', past);
      sticky.setAttribute('aria-hidden', String(!past));
    }).observe(countBlock);
  }

  // 선착순 실시간 인원
  document.querySelectorAll('[data-live-count]').forEach(function (box) {
    var cap = Number(box.dataset.capacity);
    var leftEl = box.querySelector('[data-left]');
    var meter = box.querySelector('[data-meter]');
    // 1차·2차로 나눠 보여 준다 (예: 1차 40명이 차면 2차 = 나머지). 숫자는 실제 신청 수 그대로
    var tier = Number(box.dataset.tier) || 0;
    var titleEl = box.querySelector('[data-seat-title]');
    function show(taken) {
      var first = tier && taken < tier;
      var size = first ? tier : (tier ? cap - tier : cap);
      var used = first ? taken : (tier ? taken - tier : taken);
      var left = Math.max(size - used, 0);
      var label = tier ? (first ? box.dataset.tierLabel : box.dataset.tierNext) + ' ' : '';
      if (titleEl && tier) titleEl.innerHTML = label + '선착순 <b>' + size + '</b>명';
      if (leftEl) leftEl.innerHTML = left === 0 ? '마감' : '남은 자리 <b>' + left + '</b>명';
      if (meter) meter.style.width = Math.min(100, used / size * 100) + '%';
      document.querySelectorAll('[data-left-short]').forEach(function (el) { el.textContent = left === 0 ? '선착순 마감' : label + '남은 자리 ' + left + '명'; });
    }
    // 집계는 텔레그램 알림 스크립트(?count=지점)가 알려 준다. 아직 없으면 안내 문구만
    if (!CONFIG.alertUrl || LOCAL) { if (leftEl) leftEl.textContent = '마감되면 정상가'; return; }
    var load = function () {
      fetch(CONFIG.alertUrl + '?count=' + encodeURIComponent(CONFIG.branch)).then(function (r) { return r.json(); })
        .then(function (j) { show(Number(j.taken) || 0); }).catch(function () { if (leftEl) leftEl.textContent = '마감되면 정상가'; });
    };
    load(); setInterval(load, 30000);
  });

  // 선착순 차수(1차 → 2차 → 3차…): 실제 신청 수 ÷ 차수 인원. 집계를 못 받으면 처음 글자(1차) 그대로
  var rolls = document.querySelectorAll('[data-tier-roll]');
  if (rolls.length && CONFIG.alertUrl && !LOCAL) {
    fetch(CONFIG.alertUrl + '?count=' + encodeURIComponent(CONFIG.branch)).then(function (r) { return r.json(); }).then(function (j) {
      var taken = Number(j.taken) || 0;
      rolls.forEach(function (el) { el.textContent = (Math.floor(taken / (Number(el.dataset.size) || 40)) + 1) + '차'; });
    }).catch(function () {});
  }

  // 오픈 D-day 표시 (오픈 전 사전등록 페이지)
  document.querySelectorAll('[data-dday]').forEach(function (el) {
    var open = new Date(el.dataset.dday + 'T00:00:00+09:00');
    var today = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }) + 'T00:00:00+09:00');
    var days = Math.round((open - today) / 86400000);
    if (days > 0) el.textContent = '오픈까지 D-' + days;
    else if (days === 0) el.textContent = '오늘 오픈';
  });

  // 50칸: 실제 등록 완료 건수만 표시한다
  function applySeats(status) {
    if (!status) return;
    var left = Math.max(status.capacity - status.taken, 0);
    var closed = left === 0 || status.active === false;
    document.querySelectorAll('.seats i').forEach(function (seat, i) {
      seat.classList.toggle('taken', i < status.taken);
    });
    document.querySelectorAll('[data-capacity]').forEach(function (el) {
      el.textContent = closed ? '모집 마감' : '잔여 ' + left + '명 / ' + status.capacity + '명';
    });
    if (closed) {
      document.querySelectorAll('.lead-form:not([data-type])').forEach(function (form) {
        form.outerHTML = '<div class="done" role="status"><strong>3주년 특가 모집이 마감되었습니다</strong><p>문의는 전화로 부탁드립니다.</p></div>';
      });
      if (bar) { bar.querySelector('.go').hidden = true; bar.style.gridTemplateColumns = '1fr'; }
    }
  }
  if (CONNECTED) {
    var loadSeats = function () {
      rpc('get_seat_status', { p_branch: CONFIG.branch }).then(applySeats).catch(function () {});
    };
    loadSeats();
    setInterval(loadSeats, 60000);
  }

  // 스크롤 연출
  document.querySelectorAll('[data-stagger]').forEach(function (group) {
    Array.prototype.forEach.call(group.children, function (el, i) {
      el.classList.add('reveal');
      el.style.setProperty('--d', Math.min(i, 6) * 80 + 'ms');
    });
  });

  function countUp(el) {
    var to = Number(el.dataset.count);
    var start = performance.now();
    function tick(now) {
      var t = Math.min((now - start) / 900, 1);
      el.textContent = Math.round(to * (1 - Math.pow(1 - t, 4)));
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  var targets = document.querySelectorAll('.reveal, .seats');
  if (!canObserve) {
    targets.forEach(function (el) { el.classList.add('in'); });
    return;
  }

  var revealer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('in');
      revealer.unobserve(entry.target);
      if (calm) return;
      var num = entry.target.querySelector && entry.target.querySelector('[data-count]');
      if (num) countUp(num);
    });
  }, { rootMargin: '0px 0px -12% 0px' });
  targets.forEach(function (el) { revealer.observe(el); });

  // 한 화면형(qk): 내릴 때 글이 한 줄(한 칸)씩 차례로 등장
  // 첫 화면은 바로 차례로 켬(신청 버튼이 화면 끝에 걸려도 안 숨게)
  document.querySelectorAll('.qk-copy > :not(.qk-points), .qk-points > li').forEach(function (el, i) {
    el.classList.add('reveal');
    el.style.setProperty('--d', 100 + i * 120 + 'ms');
    setTimeout(function () { el.classList.add('in'); }, 30);
  });
  var qkItems = document.querySelectorAll('.qk-sec > h2, .qk-sec > p, .qk-sec > .qk-mid, .qk-points2 > li, .qk-shots > figure, .qk-steps > li, .po-faq > details, .pv-facts > div');
  if (qkItems.length) {
    qkItems.forEach(function (el) { el.classList.add('reveal'); });
    var qkSeen = new IntersectionObserver(function (entries) {
      var n = 0;
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.style.setProperty('--d', Math.min(n++, 6) * 140 + 'ms');
        entry.target.classList.add('in');
        qkSeen.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    qkItems.forEach(function (el) { qkSeen.observe(el); });
  }

  var lines = document.querySelectorAll('.story p');
  var liner = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) entry.target.classList.add('on');
    });
  }, { rootMargin: '-40% 0px -40% 0px' });
  lines.forEach(function (line) { liner.observe(line); });

  var tabs = {};
  document.querySelectorAll('.tabs a').forEach(function (a) { tabs[a.hash] = a; });
  var spy = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      Object.keys(tabs).forEach(function (k) { tabs[k].classList.toggle('active', k === '#' + entry.target.id); });
    });
  }, { rootMargin: '-30% 0px -60% 0px' });
  Object.keys(tabs).forEach(function (k) {
    var section = document.querySelector(k);
    if (section) spy.observe(section);
  });

  // 신청 폼이 보일 때는 하단 버튼을 숨긴다
  var visible = new Set();
  var barWatch = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) visible.add(entry.target); else visible.delete(entry.target);
    });
    if (bar) bar.classList.toggle('hide', visible.size > 0);
  });
  document.querySelectorAll('.quick, #apply, .po-apply').forEach(function (el) { barWatch.observe(el); });
})();
