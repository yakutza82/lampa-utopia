(function () {
    'use strict';

    console.log('================================');
    console.log('UTOPIA AUTH TEST START');
    console.log('================================');

    if (!window.Lampa || !Lampa.Reguest) {
        console.error('UTOPIA: Lampa.Reguest не знайдений');
        return;
    }

    // ТІЛЬКИ ДЛЯ ТЕСТУ
    var USERNAME = 'yakutza';
    var PASSWORD = '5159001276yakut';

    var network = new Lampa.Reguest();

    var loginUrl = 'https://utp.to/login';

    // ------------------------------------------------------------
    // GET /login
    // ------------------------------------------------------------

    console.log('UTOPIA: GET', loginUrl);

    network.clear();
    network.timeout(10000);

    network["native"](
        loginUrl,

        function (response) {

            console.log('================================');
            console.log('UTOPIA: GET SUCCESS');
            console.log('================================');

            var json = response;

            if (typeof response === 'string') {
                json = Lampa.Arrays.decodeJson(response, {});
            }

            var html = json && json.body || '';

            console.log(
                'UTOPIA: BODY LENGTH:',
                html.length
            );

            // ----------------------------------------------------
            // CSRF TOKEN
            // ----------------------------------------------------

            var tokenMatch = html.match(
                /name=["']_token["'][^>]*value=["']([^"']+)["']/
            );

            if (!tokenMatch) {
                tokenMatch = html.match(
                    /value=["']([^"']+)["'][^>]*name=["']_token["']/
                );
            }

            if (!tokenMatch) {
                console.error(
                    'UTOPIA: CSRF TOKEN NOT FOUND'
                );

                Lampa.Noty.show(
                    'UTOPIA: CSRF не знайдений'
                );

                return;
            }

            var csrfToken = tokenMatch[1];

            console.log(
                'UTOPIA: CSRF FOUND:',
                csrfToken
            );

            // ----------------------------------------------------
            // GET cookies
            // ----------------------------------------------------

            var getCookieHeaders =
                json &&
                json.headers &&
                json.headers['set-cookie'];

            var cookies = [];

            if (
                getCookieHeaders &&
                getCookieHeaders.forEach
            ) {

                getCookieHeaders.forEach(function (param) {

                    console.log(
                        'UTOPIA GET SET-COOKIE:',
                        param
                    );

                    var parts =
                        param.split(';')[0].split('=');

                    if (parts[0]) {
                        cookies.push(
                            parts[0] +
                            '=' +
                            (parts[1] || '')
                        );
                    }
                });
            }

            var cookie = cookies.join('; ');

            console.log(
                'UTOPIA GET COOKIE:',
                cookie || '(немає)'
            );

            // ----------------------------------------------------
            // POST DATA
            // ----------------------------------------------------

            var postdata =
    '_token=' +
    encodeURIComponent(csrfToken);

postdata +=
    '&username=' +
    encodeURIComponent(USERNAME);

postdata +=
    '&password=' +
    encodeURIComponent(PASSWORD);

            console.log('================================');
            console.log('UTOPIA: POST /login');
            console.log('USERNAME:', USERNAME);
            console.log('PASSWORD: [hidden]');
            console.log('POST DATA:', postdata);
            console.log('================================');

            // ----------------------------------------------------
            // HEADERS
            // ----------------------------------------------------

            var headers = {
    'Content-Type':
        'application/x-www-form-urlencoded'
};

            if (cookie) {
                headers['Cookie'] = cookie;
            }

            // ----------------------------------------------------
            // POST /login
            // ----------------------------------------------------

            network.clear();
            network.timeout(10000);

            network["native"](
                loginUrl,

                function (response) {

                    console.log('================================');
                    console.log('UTOPIA: POST SUCCESS CALLBACK');
                    console.log('================================');

                    console.log(
                        'RAW RESPONSE:',
                        response
                    );

                    var json = response;

                    if (typeof response === 'string') {

                        try {
                            json =
                                Lampa.Arrays.decodeJson(
                                    response,
                                    {}
                                );
                        } catch (e) {

                            console.error(
                                'UTOPIA: response не JSON'
                            );

                            console.error(response);
                        }
                    }

                    console.log(
                        'POST JSON:',
                        json
                    );

                    console.log(
                        'POST STATUS:',
                        json && json.status
                    );

                    console.log(
                        'POST BODY:',
                        json && json.body
                    );

                    console.log(
                        'POST HEADERS:',
                        json && json.headers
                    );

                    // ------------------------------------------------
                    // Cookies
                    // ------------------------------------------------

                    var cookieHeaders =
                        json &&
                        json.headers &&
                        json.headers['set-cookie'];

                    console.log(
                        'UTOPIA POST SET-COOKIE:',
                        cookieHeaders
                    );

                    var values = {};

                    if (
                        cookieHeaders &&
                        cookieHeaders.forEach
                    ) {

                        cookieHeaders.forEach(
                            function (param) {

                                console.log(
                                    'UTOPIA COOKIE HEADER:',
                                    param
                                );

                                var parts =
                                    param
                                        .split(';')[0]
                                        .split('=');

                                if (parts[0]) {

                                    if (
                                        parts[1] ===
                                        'deleted'
                                    ) {
                                        delete values[
                                            parts[0]
                                        ];
                                    } else {
                                        values[
                                            parts[0]
                                        ] =
                                            parts[1] || '';
                                    }
                                }
                            }
                        );
                    }

                    var finalCookies = [];

                    for (var name in values) {

                        finalCookies.push(
                            name +
                            '=' +
                            values[name]
                        );
                    }

                    var authCookie =
                        finalCookies.join('; ');

                    console.log('================================');
                    console.log(
                        'UTOPIA AUTH COOKIE:',
                        authCookie || '(немає)'
                    );
                    console.log('================================');

                    if (authCookie) {

                        Lampa.Storage.set(
                            'utopia_test_cookies',
                            authCookie
                        );

                        Lampa.Noty.show(
                            'UTOPIA: COOKIE ОТРИМАНО'
                        );

                    } else {

                        Lampa.Noty.show(
                            'UTOPIA: POST відповів, але Cookie немає'
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

    console.log('UTOPIA POST NATIVE ERROR OBJECT:', a);
    console.log('UTOPIA POST NATIVE ERROR JSON:', details);

    Lampa.Noty.show(
        'UTOPIA ERROR: ' + details
    );

},

                postdata,

                {
                    dataType: 'text',
                    headers: headers,
                    returnHeaders: true
                }
            );
        },

        function (a, c) {

            console.error('================================');
            console.error(
                'UTOPIA: GET NATIVE ERROR'
            );
            console.error('A:', a);
            console.error('C:', c);
            console.error('================================');

            Lampa.Noty.show(
                'UTOPIA: GET native error'
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
