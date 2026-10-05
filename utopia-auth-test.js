(function () {
    'use strict';

    console.log('================================');
    console.log('UTOPIA AUTH TEST START');
    console.log('================================');

    if (!window.Lampa || !Lampa.Reguest) {
        console.error('UTOPIA: Lampa.Reguest не знайдений');
        return;
    }

    var network = new Lampa.Reguest();

    /*
     * Це той самий принцип, який використовує online_mod.js:
     *
     * network["native"](...)
     * returnHeaders: true
     *
     * native повертає JSON:
     * {
     *     body: '...',
     *     headers: {
     *         'set-cookie': [...]
     *     }
     * }
     */

    var url = 'https://utp.to/login';

    network.clear();
    network.timeout(10000);

    console.log('UTOPIA: GET', url);

    network["native"](
        url,

        function (response) {

            console.log('UTOPIA: NATIVE SUCCESS');
            console.log('RAW RESPONSE:', response);

            var json = response;

            /*
             * У деяких версіях Lampa native може повернути
             * JSON як текст.
             */
            if (typeof response === 'string') {
                try {
                    json = Lampa.Arrays.decodeJson(response, {});
                } catch (e) {
                    console.error('UTOPIA: не вдалося розібрати JSON');
                    console.error(response);
                    Lampa.Noty.show('UTOPIA: неправильна відповідь native');
                    return;
                }
            }

            var html = json && json.body ? json.body : '';

            console.log('UTOPIA: BODY LENGTH:', html.length);
            console.log('UTOPIA: BODY BEGIN:', html.substring(0, 1000));

            /*
             * Шукаємо CSRF token.
             */
            var tokenMatch = html.match(
                /name=["']_token["'][^>]*value=["']([^"']+)["']/
            );

            if (!tokenMatch) {
                /*
                 * Другий варіант порядку атрибутів.
                 */
                tokenMatch = html.match(
                    /value=["']([^"']+)["'][^>]*name=["']_token["']/
                );
            }

            if (tokenMatch) {
                console.log('UTOPIA: CSRF TOKEN FOUND');
                console.log('TOKEN:', tokenMatch[1]);

                Lampa.Storage.set(
                    'utopia_test_csrf',
                    tokenMatch[1]
                );

                Lampa.Noty.show(
                    'UTOPIA: GET працює, CSRF знайдений'
                );
            } else {
                console.error('UTOPIA: CSRF TOKEN NOT FOUND');
                Lampa.Noty.show(
                    'UTOPIA: сторінка отримана, але _token не знайдений'
                );
            }

            /*
             * Перевіряємо Set-Cookie.
             */
            var cookieHeaders =
                json &&
                json.headers &&
                json.headers['set-cookie'];

            console.log(
                'UTOPIA: SET-COOKIE:',
                cookieHeaders
            );

            if (cookieHeaders && cookieHeaders.forEach) {

                var cookies = [];

                cookieHeaders.forEach(function (item) {

                    console.log(
                        'UTOPIA COOKIE HEADER:',
                        item
                    );

                    var firstPart = item.split(';')[0];

                    if (firstPart) {
                        cookies.push(firstPart);
                    }
                });

                console.log(
                    'UTOPIA COOKIES:',
                    cookies.join('; ')
                );

                Lampa.Storage.set(
                    'utopia_test_cookies',
                    cookies.join('; ')
                );
            }

            console.log('================================');
            console.log('UTOPIA AUTH TEST FINISHED');
            console.log('================================');
        },

        function (error, code) {

            console.error('================================');
            console.error('UTOPIA NATIVE ERROR');
            console.error('ERROR:', error);
            console.error('CODE:', code);
            console.error('================================');

            Lampa.Noty.show(
                'UTOPIA: помилка native GET'
            );
        },

        false,

        {
            dataType: 'text',
            headers: {},
            returnHeaders: true
        }
    );
})();
