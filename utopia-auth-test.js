(function () {
  'use strict';

  // Модуль авторизації Utopia (utp.to)
  var UtopiaAuth = {
    getCsrfToken: function (proxyUrl, callback, onError) {
      var network = new Lampa.Reguest();
      var targetUrl = 'https://utp.to/login';
      var url = proxyUrl ? proxyUrl + encodeURIComponent(targetUrl) : targetUrl;

      network.silent(url, function (html, status, xhr) {
        if (!html) return onError('Порожня відповідь від сервера');

        var tokenMatch = html.match(/name="_token"\s+value="([^"]+)"/) || 
                         html.match(/content="([^"]+)"\s+name="csrf-token"/);

        if (tokenMatch && tokenMatch[1]) {
          var csrfToken = tokenMatch[1];
          var cookies = '';

          if (xhr && typeof xhr.getResponseHeader === 'function') {
            cookies = xhr.getResponseHeader('X-Set-Cookie') || xhr.getResponseHeader('Set-Cookie') || '';
          }

          callback({
            token: csrfToken,
            cookies: cookies
          });
        } else {
          onError('Не вдалося знайти CSRF _token на сторінці');
        }
      }, function (a, c) {
        onError('Помилка завантаження сторінки авторизації utp.to');
      });
    },

    login: function (username, password, proxyUrl, onSuccess, onError) {
      var self = this;

      self.getCsrfToken(proxyUrl, function (initData) {
        var network = new Lampa.Reguest();
        var targetUrl = 'https://utp.to/login';
        var url = proxyUrl ? proxyUrl + encodeURIComponent(targetUrl) : targetUrl;

        var body = '_token=' + encodeURIComponent(initData.token) +
                   '&username=' + encodeURIComponent(username) +
                   '&password=' + encodeURIComponent(password);

        var headers = {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest'
        };

        if (initData.cookies) {
          headers['Cookie'] = initData.cookies;
        }

        network.silent(url, function (response, status, xhr) {
          var authCookies = '';
          if (xhr && typeof xhr.getResponseHeader === 'function') {
            authCookies = xhr.getResponseHeader('X-Set-Cookie') || xhr.getResponseHeader('Set-Cookie') || '';
          }

          var finalCookies = authCookies || initData.cookies;

          if (finalCookies || status === 302 || status === 200) {
            Lampa.Storage.set('utopia_session_cookies', finalCookies);
            Lampa.Storage.set('utopia_auth_time', Date.now());
            onSuccess(finalCookies);
          } else {
            onError('Не вдалося отримати авторизаційні Cookie');
          }
        }, function () {
          onError('Помилка виконання POST-запиту авторизації');
        }, body, {
          headers: headers
        });

      }, onError);
    },

    getValidSession: function (callback, onError) {
      var login = Lampa.Storage.get('utopia_login', '');
      var password = Lampa.Storage.get('utopia_password', '');
      var proxy = Lampa.Storage.get('utopia_proxy', '');
      var cookies = Lampa.Storage.get('utopia_session_cookies', '');
      var authTime = Lampa.Storage.get('utopia_auth_time', 0);

      var maxAge = 90 * 60 * 1000; // 1.5 години (сесія діє 2 години)

      if (!login || !password) {
        return onError('У налаштуваннях не вказано логін або пароль');
      }

      if (cookies && (Date.now() - authTime < maxAge)) {
        return callback(cookies);
      }

      this.login(login, password, proxy, callback, onError);
    }
  };

  // Реєстрація налаштувань плагіна
  function initSettings() {
    if (!window.Lampa || !Lampa.SettingsApi) return;

    // Створення розділу
    Lampa.SettingsApi.addComponent({
      component: 'utopia_mod',
      name: 'Utopia',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-2-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>'
    });

    // Додавання полів
    Lampa.SettingsApi.addParam({
      component: 'utopia_mod',
      param: {
        name: 'utopia_login',
        type: 'input',
        default: ''
      },
      field: {
        name: 'Логін',
        description: 'Ваш логін на utp.to'
      }
    });

    Lampa.SettingsApi.addParam({
      component: 'utopia_mod',
      param: {
        name: 'utopia_password',
        type: 'input',
        default: ''
      },
      field: {
        name: 'Пароль',
        description: 'Ваш пароль на utp.to'
      }
    });

    Lampa.SettingsApi.addParam({
      component: 'utopia_mod',
      param: {
        name: 'utopia_proxy',
        type: 'input',
        default: ''
      },
      field: {
        name: 'CORS Proxy URL',
        description: 'Наприклад: https://cors.nb557.workers.dev/ (якщо потрібно)'
      }
    });
  }

  // Головна функція запуску
  function startPlugin() {
    initSettings();

    // Засвідчуємо плагін у реєстрі Lampa
    if (window.Lampa && Lampa.Plugins) {
      Lampa.Plugins.add('utopia_mod', {
        title: 'Utopia Tracker',
        description: 'Модуль авторизації та пошуку для utp.to',
        version: '1.0.0',
        author: 'Custom'
      });
    }

    // Експортуємо глобальний об'єкт для використання у пошуку
    window.UtopiaAuth = UtopiaAuth;
  }

  // Перевірка готовності Lampa перед запуск
  if (window.appready) {
    startPlugin();
  } else {
    if (window.Lampa && Lampa.Listener) {
      Lampa.Listener.follow('app', function (e) {
        if (e.type === 'ready') startPlugin();
      });
    } else {
      document.addEventListener('DOMContentLoaded', startPlugin);
    }
  }
})();
