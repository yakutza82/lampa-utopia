(function () {
    'use strict';

    var network = new Lampa.Reguest();

    var proxy = 'https://cors.nb557.workers.dev/';
    var url = proxy + encodeURIComponent('https://utp.to/login');

    Lampa.Noty.show('GET https://utp.to/login...');

    network.silent(
        url,

        function (html, status, xhr) {
            console.log('=== UTOPIA AUTH TEST ===');
            console.log('STATUS:', status);
            console.log('HTML LENGTH:', html ? html.length : 0);
            console.log('HTML:', html);

            var tokenMatch =
                html && (
                    html.match(/name="_token"\s+value="([^"]+)"/) ||
                    html.match(/content="([^"]+)"\s+name="csrf-token"/)
                );

            console.log(
                'CSRF TOKEN:',
                tokenMatch ? tokenMatch[1] : 'НЕ НАЙДЕН'
            );

            if (xhr && typeof xhr.getAllResponseHeaders === 'function') {
                console.log(
                    'RESPONSE HEADERS:',
                    xhr.getAllResponseHeaders()
                );
            }

            Lampa.Noty.show(
                tokenMatch
                    ? 'OK: CSRF token отримано'
                    : 'ПОМИЛКА: CSRF token не знайдено'
            );
        },

        function (error) {
            console.error('=== UTOPIA AUTH ERROR ===', error);
            Lampa.Noty.show('Помилка GET /login');
        }
    );
})();
