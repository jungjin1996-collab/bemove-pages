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
  var started = false;
  document.addEventListener('focusin', function (e) {
    if (started || !e.target.closest || !e.target.closest('.lead-form')) return;
    started = true;
    track('start');
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
      error.textContent = '';
      form.querySelectorAll('[aria-invalid]').forEach(function (el) { el.removeAttribute('aria-invalid'); });
      var data = new FormData(form);
      if (data.get('website')) return;

      var name = String(data.get('name')).trim();
      var phone = String(data.get('phone')).replace(/[^0-9]/g, '');
      if (name.length < 2) return fail('name', '이름을 입력해 주세요.');
      if (!/^01[016789][0-9]{7,8}$/.test(phone)) return fail('phone', '휴대폰 번호를 다시 확인해 주세요.');
      if (!data.get('consent_privacy')) return fail('consent_privacy', '개인정보 수집·이용에 동의해 주셔야 상담 신청이 가능합니다.');

      if (!CONNECTED) {
        showDone('미리보기 화면입니다', '아직 DB가 연결되지 않아 입력하신 내용은 저장되지 않았습니다.');
        return;
      }

      var submit = form.querySelector('button[type=submit]');
      var label = submit.textContent;
      submit.disabled = true;
      submit.textContent = '접수 중입니다';
      // 키 이름은 Formula X 폼 질문 key 와 같아야 응답 목록에 제목대로 보인다.
      rpc('marketing_submit_form', {
        p_payload: Object.assign({
          response_data: {
            name: name,
            phone: phone,
            request_type: form.dataset.type === 'free_pt' ? '무료 체험 PT' : '상담 신청',
            trainer: form.dataset.trainer || '',
            interests: data.getAll('interest'),
            consent_privacy: '동의'
          },
          source_context: { landing: 'bemove-landing', branch: form.dataset.branch },
          consent_marketing: !!data.get('consent_marketing')
        }, tracking())
      }).then(function (responseId) {
        if (!responseId) throw new Error('no_response_id');
        showDone('신청이 접수되었습니다', '확인 후 빠르게 연락드리겠습니다.');
      }).catch(function () {
        submit.disabled = false;
        submit.textContent = label;
        error.textContent = '접수에 실패했습니다. 잠시 후 다시 시도하거나 전화로 문의해 주세요.';
      });
    });
  }
  forms.forEach(bindForm);

  // 트레이너 프로필 창
  document.querySelectorAll('[data-sheet]').forEach(function (button) {
    button.addEventListener('click', function () {
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
  tourMore.addEventListener('click', function () { tourOpen = true; renderTour(); });
  tourItems.forEach(function (el) {
    if (!el.dataset.src) return;
    el.addEventListener('click', function () {
      tourView.querySelector('img').src = el.dataset.src;
      tourView.querySelector('img').alt = el.dataset.title;
      tourView.querySelector('p').textContent = el.dataset.title;
      tourView.showModal();
    });
  });
  renderTour();

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
      bar.querySelector('.go').hidden = true;
      bar.style.gridTemplateColumns = '1fr';
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
    bar.classList.toggle('hide', visible.size > 0);
  });
  document.querySelectorAll('.quick, #apply').forEach(function (el) { barWatch.observe(el); });
})();
