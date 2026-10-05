(function () {
    'use strict';

    console.log('================================');
    console.log('UTOPIA SESSION TEST START');
    console.log('================================');

    if (!window.Lampa || !Lampa.Reguest) {
        console.error('UTOPIA: Lampa.Reguest не знайдений');
        return;
    }

    var cookie = Lampa.Storage.get(
        'utopia_test_cookies',
        ''
    );

    console.log(
        'UTOPIA STORED COOKIE:',
        cookie || '(немає)'
    );

    if (!cookie) {
        Lampa.Noty.show(
            'UTOPIA: cookies не знайдені. Спочатку виконай LOGIN TEST'
        );
        return;
    }

    var network = new Lampa.Reguest();
    var url = 'https://utp.to/';

    var headers = {
        'Cookie': cookie
    };

    console.log('UTOPIA: AUTH GET', url);

    network.clear();
    network.timeout(10000);

    network["native"](
        url,

        function (response) {

            console.log('================================');
            console.log('UTOPIA: AUTH GET SUCCESS');
            console.log('================================');

            console.log(
                'RAW RESPONSE:',
                response
            );

            var json = response;

            if (typeof response === 'string') {
                try {
                    json = Lampa.Arrays.decodeJson(
                        response,
                        {}
                    );
                } catch (e) {
                    console.log(
                        'UTOPIA: response не JSON'
                    );
                }
            }

            var body =
                json &&
                json.body
                    ? json.body
                    : '';

            console.log(
                'UTOPIA AUTH BODY LENGTH:',
                body.length
            );

            console.log(
                'UTOPIA AUTH BODY BEGIN:',
                body.substring(0, 2000)
            );

            console.log(
                'UTOPIA AUTH HEADERS:',
                json && json.headers
            );

            /*
             * Простий пошук ознак авторизованого акаунта.
             */

            var authenticated =
                body.indexOf('Logout') !== -1 ||
                body.indexOf('Выйти') !== -1 ||
                body.indexOf('Вийти') !== -1 ||
                body.indexOf('logout') !== -1;

            console.log(
                'UTOPIA AUTHENTICATED:',
                authenticated
            );

            if (authenticated) {

                Lampa.Noty.show(
                    'UTOPIA: СЕСІЯ АВТОРИЗОВАНА'
                );

            } else {

                Lampa.Noty.show(
                    'UTOPIA: відповідь отримана, але ознаку авторизації не знайдено'
                );
            }

        },

        function (a, c) {

            var details = '';

            try {
                details = JSON.stringify(a);
            } catch (e) {
                details = String(a);
            }

            console.error(
                '================================'
            );

            console.error(
                'UTOPIA AUTH GET ERROR:',
                details
            );

            console.error(
                'CODE:',
                c
            );

            console.error(
                '================================'
            );

            Lampa.Noty.show(
                'UTOPIA AUTH ERROR: ' + details
            );
        },

        false,

        {
            dataType: 'text',
            headers: headers,
            returnHeaders: true
        }
    );

})();
