var UtopiaAuth = {
  // 1. Отримання CSRF токена та початкових cookie
  getCsrfToken: function(proxyUrl, callback, onError) {
    var network = new Lampa.Reguest();
    var targetUrl = 'https://utp.to/login';
    
    // Якщо використовується CORS-проксі, запит іде через нього
    var url = proxyUrl ? proxyUrl + encodeURIComponent(targetUrl) : targetUrl;

    network.silent(url, function(html, status, xhr) {
      // Витягуємо _token з meta-тегу або прихованого input
      var tokenMatch = html.match(/name="_token"\s+value="([^"]+)"/) || 
                         html.match(/content="([^"]+)"\s+name="csrf-token"/);
      
      if (tokenMatch && tokenMatch[1]) {
        var csrfToken = tokenMatch[1];
        
        // Збираємо Cookie з заголовків відповіді (якщо проксі їх повертає)
        var cookies = xhr.getResponseHeader('X-Set-Cookie') || xhr.getResponseHeader('Set-Cookie') || '';

        callback({
          token: csrfToken,
          cookies: cookies
        });
      } else {
        onError('Не вдалося знайти CSRF _token на сторінці');
      }
    }, function() {
      onError('Помилка завантаження сторінки авторизації');
    });
  },

  // 2. Відправка POST-запиту з даними
  login: function(username, password, proxyUrl, onSuccess, onError) {
    var self = this;

    self.getCsrfToken(proxyUrl, function(initData) {
      var network = new Lampa.Reguest();
      var targetUrl = 'https://utp.to/login';
      var url = proxyUrl ? proxyUrl + encodeURIComponent(targetUrl) : targetUrl;

      // Формуємо payload у форматі application/x-www-form-urlencoded
      var body = new URLSearchParams();
      body.append('_token', initData.token);
      body.append('username', username);
      body.append('password', password);

      var headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest'
      };

      if (initData.cookies) {
        headers['Cookie'] = initData.cookies;
      }

      network.silent(url, function(response, status, xhr) {
        // У разі успіху Laravel віддає 302 або повертає оновлені авторизовані кукі
        var authCookies = xhr.getResponseHeader('X-Set-Cookie') || xhr.getResponseHeader('Set-Cookie');

        if (authCookies || status === 302 || status === 200) {
          // Зберігаємо авторизовану сесію в локальне сховище Lampa
          var finalCookies = authCookies || initData.cookies;
          Lampa.Storage.set('utopia_session_cookies', finalCookies);
          onSuccess(finalCookies);
        } else {
          onError('Невірна відповідь сервера при вході');
        }
      }, function(a, c) {
        onError('Помилка виконання POST-запиту авторизації');
      }, body.toString(), {
        headers: headers
      });

    }, onError);
  }
};
