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
      }, function () {
        onError('Помилка завантаження сторінки авторизації utp.to');
      });
    },

    login: function (username, password, proxyUrl, onSuccess, onError) {
      var self = this;

      if (!username || !password) {
        return onError('Заповніть логін та пароль у налаштуваннях');
      }

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
    }
  };

  // Хелпер для створення активних полів із викликом клавіатури
  function addInputField(paramName, title, defaultDesc, isPassword) {
    Lampa.SettingsApi.addParam({
      component: 'utopia_mod',
      param: {
        name: paramName,
        type: 'title'
      },
      field: {
        name: title,
        description: (function () {
          var val = Lampa.Storage.get(paramName, '');
          if (!val) return defaultDesc;
          return isPassword ? '••••••••' : val;
        })()
      },
      onRender: function (item) {
        // Додаємо клас 'selector', щоб елемент став активним для пульта/миші
        item.addClass('selector');
        item.css({ 'cursor': 'pointer' });

        item.on('hover:enter', function () {
          Lampa.Input.edit({
            title: title,
            value: Lampa.Storage.get(paramName, ''),
            free: true
          }, function (new_val) {
            Lampa.Storage.set(paramName, new_val);
            
            // Динамічно оновлюємо текст опису під полем
            var descText = defaultDesc;
            if (new_val) {
              descText = isPassword ? '••••••••' : new_val;
            }
            item.find('.settings-param__descr').text(descText);
          });
        });
      }
    });
  }

  // Реєстрація розділу та полів
  function initSettings() {
    if (!window.Lampa || !Lampa.SettingsApi) return;

    Lampa.SettingsApi.addComponent({
      component: 'utopia_mod',
      name: 'Utopia',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-2-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>'
    });

    addInputField('utopia_login', 'Логін', 'Натисніть для введення логіна', false);
    addInputField('utopia_password', 'Пароль', 'Натисніть для введення пароля', true);
    addInputField('utopia_proxy', 'CORS Proxy URL', 'Приклад: https://cors.nb557.workers.dev/', false);

    // Кнопка перевірки авторизації
    Lampa.SettingsApi.addParam({
      component: 'utopia_mod',
      param: {
        name: 'utopia_test_connection',
        type: 'title'
      },
      field: {
        name: 'Перевірити авторизацію',
        description: 'Натисніть для тестового входу на utp.to'
      },
      onRender: function (item) {
        item.addClass('selector');
        item.css({ 'cursor': 'pointer', 'color': '#28a745' });

        item.on('hover:enter', function () {
          var login = Lampa.Storage.get('utopia_login', '');
          var password = Lampa.Storage.get('utopia_password', '');
          var proxy = Lampa.Storage.get('utopia_proxy', '');

          if (!login || !password) {
            return Lampa.Noty.show('Спочатку вкажіть логін та пароль');
          }

          Lampa.Noty.show('Виконується авторизація...');

          UtopiaAuth.login(login, password, proxy, function () {
            Lampa.Noty.show('Успішно! Сесія Utopia збережена.');
          }, function (err) {
            Lampa.Noty.show('Помилка: ' + err);
          });
        });
      }
    });
  }

  function startPlugin() {
    initSettings();
    window.UtopiaAuth = UtopiaAuth;
  }

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
