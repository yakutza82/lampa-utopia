(function () {
    'use strict';

    var cookie = Lampa.Storage.get('utopia_test_cookies', '');

    if (!cookie) {
        Lampa.Noty.show('UTOPIA: cookie немає');
        return;
    }

    var network = new Lampa.Reguest();

    var headers = {
        'Cookie': cookie
    };

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

            var body = json && json.body || '';

            var result = [];

            result.push(
                'BODY: ' + body.length + ' символів'
            );

            result.push(
                'yakutza: ' +
                (body.indexOf('yakutza') !== -1 ? 'YES' : 'NO')
            );

            result.push(
                'login: ' +
                (body.indexOf('login') !== -1 ? 'YES' : 'NO')
            );

            result.push(
                'logout: ' +
                (body.indexOf('logout') !== -1 ? 'YES' : 'NO')
            );

            result.push(
                'profile: ' +
                (body.indexOf('profile') !== -1 ? 'YES' : 'NO')
            );

            result.push(
                'dashboard: ' +
                (body.indexOf('dashboard') !== -1 ? 'YES' : 'NO')
            );

            Lampa.Noty.show(
                'UTOPIA SESSION\n' +
                result.join('\n')
            );

            console.log(
                'UTOPIA SESSION BODY:',
                body
            );
        },

        function (error) {

            var details = '';

            try {
                details = JSON.stringify(error);
            } catch (e) {
                details = String(error);
            }

            Lampa.Noty.show(
                'UTOPIA SESSION ERROR: ' +
                details
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
