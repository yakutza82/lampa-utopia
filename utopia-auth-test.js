(function () {
    'use strict';

    if (!window.Lampa || !Lampa.Reguest) {
        Lampa.Noty.show('UTOPIA: Reguest не знайдений');
        return;
    }

    var cookie = Lampa.Storage.get(
        'utopia_test_cookies',
        ''
    );

    if (!cookie) {
        Lampa.Noty.show(
            'UTOPIA: cookies немає. Спочатку LOGIN TEST'
        );
        return;
    }

    var network = new Lampa.Reguest();

    network.clear();
    network.timeout(10000);

    network["native"](
        'https://utp.to/',
        function (response) {

            var json = response;

            if (typeof response === 'string') {
                try {
                    json = Lampa.Arrays.decodeJson(
                        response,
                        {}
                    );
                } catch (e) {
                    json = {};
                }
            }

            var body = json && json.body
                ? String(json.body)
                : '';

            var status = json && json.status
                ? json.status
                : 'unknown';

            var result =
                'UTOPIA SESSION TEST\n\n' +
                'STATUS: ' + status + '\n' +
                'BODY: ' + body.length + ' символів\n\n' +

                'yakutza: ' +
                (body.toLowerCase().indexOf('yakutza') !== -1
                    ? 'YES'
                    : 'NO') + '\n' +

                'login: ' +
                (body.toLowerCase().indexOf('login') !== -1
                    ? 'YES'
                    : 'NO') + '\n' +

                'logout: ' +
                (body.toLowerCase().indexOf('logout') !== -1
                    ? 'YES'
                    : 'NO') + '\n' +

                'profile: ' +
                (body.toLowerCase().indexOf('profile') !== -1
                    ? 'YES'
                    : 'NO') + '\n' +

                'dashboard: ' +
                (body.toLowerCase().indexOf('dashboard') !== -1
                    ? 'YES'
                    : 'NO');

            console.log(result);

            Lampa.Noty.show(result);

        },

        function (a, c) {

            var error = '';

            try {
                error = JSON.stringify(a);
            } catch (e) {
                error = String(a);
            }

            Lampa.Noty.show(
                'UTOPIA SESSION ERROR\n\n' +
                error
            );
        },

        false,

        {
            dataType: 'text',
            headers: {
                'Cookie': cookie
            },
            returnHeaders: true
        }
    );

})();
