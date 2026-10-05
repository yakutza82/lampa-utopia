```javascript
(function () {
    'use strict';

    if (!window.Lampa || !Lampa.Reguest) {
        console.error('UTOPIA TEST: Lampa.Reguest недоступний');
        return;
    }

    var network = new Lampa.Reguest();
    var url = 'https://utp.to/login';

    console.log('=================================');
    console.log('UTOPIA AUTH TEST');
    console.log('GET:', url);
    console.log('=================================');

    Lampa.Noty.show('UTOPIA: перевірка доступу...');

    network.silent(
        url,

        function (html, status, xhr) {

            console.log('UTOPIA TEST: SUCCESS');
            console.log('STATUS:', status);
            console.log('HTML LENGTH:', html ? html.length : 0);

            if (html) {
                var tokenMatch = html.match(
                    /name=["']_token["']\s+value=["']([^"']+)["']/
                );

                console.log(
                    'CSRF _token:',
                    tokenMatch ? tokenMatch[1] : 'НЕ ЗНАЙДЕНО'
                );

                console.log(
                    'HTML BEGIN:',
                    html.substring(0, 500)
                );
            }

            if (xhr) {
                console.log('XHR:', xhr);

                if (typeof xhr.getAllResponseHeaders === 'function') {
                    console.log(
                        'RESPONSE HEADERS:',
                        xhr.getAllResponseHeaders()
                    );
                }
            }

            Lampa.Noty.show(
                tokenMatch
                    ? 'UTOPIA: сторінка та CSRF отримані'
                    : 'UTOPIA: сторінка отримана, але CSRF не знайдений'
            );
        },

        function (error) {

            console.error('=================================');
            console.error('UTOPIA TEST: FAILED');
            console.error('ERROR:', error);
            console.error('ERROR TYPE:', typeof error);
            console.error('=================================');

            Lampa.Noty.show(
                'UTOPIA: помилка GET /login — дивись консоль'
            );
        }
    );
})();
```
