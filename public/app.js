/* «Есть идея» — клиентская логика: навигация, анимация мотива, контакты и форма.
   Конфигурация приходит из /config.js (window.SITE_CONFIG), который генерирует сервер
   из переменных окружения. Ни один контакт не зашит в код. */
(function () {
  'use strict';

  var config = (window.SITE_CONFIG && typeof window.SITE_CONFIG === 'object') ? window.SITE_CONFIG : {};
  var email = isNonEmptyString(config.CONTACT_EMAIL) ? config.CONTACT_EMAIL.trim() : '';
  var telegram = isHttpsOrTg(config.CONTACT_TELEGRAM_URL) ? config.CONTACT_TELEGRAM_URL.trim() : '';
  var endpoint = isHttp(config.FORM_ENDPOINT) ? config.FORM_ENDPOINT.trim() : '';

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function isNonEmptyString(v) {
    return typeof v === 'string' && v.trim().length > 0;
  }
  function isHttp(v) {
    return isNonEmptyString(v) && /^https?:\/\//i.test(v.trim());
  }
  function isHttpsOrTg(v) {
    return isNonEmptyString(v) && /^(https:\/\/|tg:)/i.test(v.trim());
  }
  function $(sel, root) {
    return (root || document).querySelector(sel);
  }
  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      node.setAttribute(k, attrs[k]);
    });
    if (text) node.textContent = text;
    return node;
  }

  /* ---------- год в подвале ---------- */
  var year = $('#footer-year');
  if (year) year.textContent = String(new Date().getFullYear());

  /* ---------- мобильное меню ---------- */
  var toggle = $('.site-nav__toggle');
  var menu = $('#site-menu');
  if (toggle && menu) {
    var closeMenu = function () {
      menu.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    };
    toggle.addEventListener('click', function () {
      var open = menu.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    menu.addEventListener('click', function (e) {
      if (e.target.closest('a')) closeMenu();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menu.classList.contains('is-open')) {
        closeMenu();
        toggle.focus();
      }
    });
    document.addEventListener('click', function (e) {
      if (!menu.classList.contains('is-open')) return;
      if (!e.target.closest('.site-nav')) closeMenu();
    });
  }

  /* ---------- появление мотива при прокрутке ---------- */
  var animated = document.querySelectorAll('[data-animate]');
  if (animated.length) {
    if (reduceMotion || !('IntersectionObserver' in window)) {
      animated.forEach(function (node) { node.classList.add('is-visible'); });
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.2, rootMargin: '0px 0px -10% 0px' });
      animated.forEach(function (node) { io.observe(node); });
    }
  }

  /* ---------- прямые контакты ---------- */
  var buttons = $('#contact-buttons');
  var pending = $('#contact-pending');
  if (buttons) {
    if (email) {
      buttons.appendChild(el('a', {
        class: 'button button--light',
        href: 'mailto:' + email
      }, 'Написать на почту'));
    }
    if (telegram) {
      buttons.appendChild(el('a', {
        class: 'button button--outline-light',
        href: telegram,
        target: '_blank',
        rel: 'noopener noreferrer'
      }, 'Написать в Telegram'));
    }
    if (!email && !telegram && pending) {
      pending.hidden = false;
      var label = $('.contact__direct-label');
      if (label) label.textContent = 'Прямые контакты';
    }
  }

  /* страница политики: адрес для запросов на удаление */
  var privacyContact = $('#privacy-contact');
  var privacyPending = $('#privacy-contact-pending');
  if (privacyContact) {
    if (email) {
      privacyContact.appendChild(document.createTextNode('Адрес для запросов: '));
      privacyContact.appendChild(el('a', { href: 'mailto:' + email + '?subject=' + encodeURIComponent('Удаление данных') }, email));
    } else if (privacyPending) {
      privacyPending.hidden = false;
    }
  }

  /* ---------- форма диагностики ---------- */
  var form = $('#diagnostic-form');
  if (!form) return;

  var status = $('#form-status');
  var submit = $('#form-submit');
  var stageLabels = { idea: 'Идея', product: 'Существующий продукт', business: 'Бизнес' };

  function setStatus(text, kind) {
    if (!status) return;
    status.textContent = text || '';
    status.classList.remove('form__status--error', 'form__status--success');
    if (kind) status.classList.add('form__status--' + kind);
  }

  // Режим 3: ничего не настроено — форма отключена, объясняем честно.
  if (!endpoint && !email) {
    form.classList.add('form--disabled');
    form.setAttribute('aria-disabled', 'true');
    Array.prototype.forEach.call(form.querySelectorAll('input, select, textarea, button'), function (field) {
      field.disabled = true;
    });
    var note = el('p', { class: 'form__disabled-note' },
      'Приём запросов через сайт пока не настроен: контакты уточняются. Страница будет обновлена, как только появится канал связи.');
    form.insertBefore(note, form.querySelector('.form__grid'));
    return;
  }

  // Подсказка о способе отправки
  if (!endpoint && email && submit) {
    submit.textContent = 'Отправить письмом';
    var hint = $('.form__notice');
    if (hint) {
      hint.textContent = 'Форма откроет готовое письмо в вашем почтовом клиенте. Данные используются только для ответа на запрос.';
    }
  }

  function collect() {
    var data = {
      name: form.name.value.trim(),
      company: form.company.value.trim(),
      stage: form.stage.value,
      stageLabel: stageLabels[form.stage.value] || '',
      message: form.message.value.trim(),
      contact: form.contact.value.trim(),
      consent: form.consent.checked,
      source: 'est-ideya-site',
      page: window.location.href,
      submittedAt: new Date().toISOString()
    };
    return data;
  }

  function validate() {
    var firstInvalid = null;
    Array.prototype.forEach.call(form.querySelectorAll('[required]'), function (field) {
      var ok = field.type === 'checkbox' ? field.checked : field.value.trim().length > 0;
      field.setAttribute('aria-invalid', ok ? 'false' : 'true');
      if (!ok && !firstInvalid) firstInvalid = field;
    });
    if (firstInvalid) {
      setStatus('Заполните обязательные поля и подтвердите согласие.', 'error');
      firstInvalid.focus();
      return false;
    }
    return true;
  }

  function buildMailto(data) {
    var subject = 'Запрос на диагностику — ' + (data.stageLabel || 'Есть идея');
    var body = [
      'Имя: ' + data.name,
      'Компания / проект: ' + (data.company || '—'),
      'Что есть сейчас: ' + data.stageLabel,
      'Контакт: ' + data.contact,
      '',
      'Задача:',
      data.message,
      '',
      'Согласие на обработку данных для ответа: да'
    ].join('\n');
    return 'mailto:' + email + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    setStatus('');
    if (!validate()) return;

    var data = collect();

    if (!endpoint) {
      // Режим 2: только e-mail — открываем письмо
      window.location.href = buildMailto(data);
      setStatus('Открываем письмо в вашем почтовом клиенте. Если оно не открылось — напишите нам напрямую.', 'success');
      return;
    }

    // Режим 1: endpoint — отправляем JSON
    if (submit) {
      submit.disabled = true;
      submit.setAttribute('aria-busy', 'true');
    }
    setStatus('Отправляем…');

    var controller = ('AbortController' in window) ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, 15000) : null;

    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(data),
      signal: controller ? controller.signal : undefined
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      form.reset();
      Array.prototype.forEach.call(form.querySelectorAll('[aria-invalid]'), function (f) {
        f.removeAttribute('aria-invalid');
      });
      setStatus('Запрос отправлен. Мы ответим на указанный контакт.', 'success');
    }).catch(function () {
      var fallback = email ? ' Или напишите нам на почту напрямую.' : '';
      setStatus('Не удалось отправить запрос. Попробуйте ещё раз чуть позже.' + fallback, 'error');
    }).finally(function () {
      if (timer) clearTimeout(timer);
      if (submit) {
        submit.disabled = false;
        submit.removeAttribute('aria-busy');
      }
    });
  });

  // Снимаем подсветку ошибки при исправлении
  form.addEventListener('input', function (e) {
    var field = e.target;
    if (field.getAttribute('aria-invalid') === 'true') {
      var ok = field.type === 'checkbox' ? field.checked : field.value.trim().length > 0;
      if (ok) field.setAttribute('aria-invalid', 'false');
    }
  });
})();
