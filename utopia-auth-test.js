(function () {
    'use strict';

    console.log('================================');
    console.log('UTOPIA AUTH TEST START');
    console.log('================================');

    if (!window.Lampa || !Lampa.Reguest) {
        console.error('UTOPIA: Lampa.Reguest не знайдений');
        return;
    }

    // Тимчасово тільки для тесту.
    // Після перевірки винесемо їх у налаштування Lampa.
    var USERNAME = 'yakutza';
    var PASSWORD = '5159001276yakut';

    var network = new Lampa.Reguest();
    var loginUrl = 'https://utp.to/login';

    network.clear();
    network.timeout(10000);

    console.log('UTOPIA: GET', loginUrl);

    // ------------------------------------------------------------
    // 1. GET /login
    // ------------------------------------------------------------

    network["native"](
        loginUrl,
        function (response) {

            console.log('UTOPIA: GET SUCCESS');
            console.log('RAW GET RESPONSE:', response);

            var json = response;

            if (typeof response === 'string') {
                try {
                    json = Lampa.Arrays.decodeJson(response, {});
                } catch (e) {
                    console.error('UTOPIA: GET response не JSON');
                    console.error(response);
                    Lampa.Noty.show('UTOPIA: помилка GET response');
                    return;
                }
            }

            var html = json && json.body ? json.body : '';

            console.log('UTOPIA: BODY LENGTH:', html.length);

            // ----------------------------------------------------
            // CSRF
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
                console.error('UTOPIA: CSRF TOKEN NOT FOUND');
                Lampa.Noty.show('UTOPIA: CSRF не знайдений');
                return;
            }

            var csrfToken = tokenMatch[1];

            console.log('UTOPIA: CSRF FOUND');
            console.log('TOKEN:', csrfToken);

            // ----------------------------------------------------
            // Cookies після GET
            // ----------------------------------------------------

            var getCookieHeaders =
                json &&
                json.headers &&
                json.headers['set-cookie'];

            var getCookies = [];

            if (getCookieHeaders && getCookieHeaders.forEach) {

                getCookieHeaders.forEach(function (item) {

                    console.log(
                        'UTOPIA GET SET-COOKIE:',
                        item
                    );

                    var firstPart = item.split(';')[0];

                    if (firstPart) {
                        getCookies.push(firstPart);
                    }
                });
            }

            var cookieString = getCookies.join('; ');

            console.log(
                'UTOPIA GET COOKIES:',
                cookieString || '(немає)'
            );

            // ----------------------------------------------------
            // 2. POST /login
            // ----------------------------------------------------

            var postdata =
                '_token=' + encodeURIComponent(csrfToken) +
                '&username=' + encodeURIComponent(USERNAME) +
                '&password=' + encodeURIComponent(PASSWORD) +
                '&remember=1';

            var headers = {
                'Content-Type':
                    'application/x-www-form-urlencoded',
                'X-Requested-With':
                    'XMLHttpRequest'
            };

            if (cookieString) {
                headers['Cookie'] = cookieString;
            }

            console.log('================================');
            console.log('UTOPIA: POST /login');
            console.log('USERNAME:', USERNAME);
            console.log('PASSWORD: [hidden]');
            console.log('POST DATA:', postdata);
            console.log('COOKIE:', cookieString || '(немає)');
            console.log('================================');

            network.clear();
            network.timeout(10000);

            network["native"](
                loginUrl,

                function (response) {

                    console.log('================================');
                    console.log('UTOPIA: LOGIN SUCCESS CALLBACK');
                    console.log('LOGIN RESPONSE:', response);
                    console.log('================================');

                    var loginJson = response;

                    if (typeof response === 'string') {
                        try {
                            loginJson =
                                Lampa.Arrays.decodeJson(
                                    response,
                                    {}
                                );
                        } catch (e) {
                            console.log(
                                'UTOPIA: LOGIN response не JSON'
                            );
                        }
                    }

                    // ------------------------------------------------
                    // Статус
                    // ------------------------------------------------

                    console.log(
                        'UTOPIA LOGIN STATUS:',
                        loginJson && loginJson.status
                    );

                    // ------------------------------------------------
                    // Response headers
                    // ------------------------------------------------

                    var loginHeaders =
                        loginJson &&
                        loginJson.headers
                            ? loginJson.headers
                            : {};

                    console.log(
                        'UTOPIA LOGIN HEADERS:',
                        loginHeaders
                    );

                    // ------------------------------------------------
                    // Set-Cookie
                    // ------------------------------------------------

                    var cookieHeaders =
                        loginHeaders['set-cookie'];

                    console.log(
                        'UTOPIA LOGIN SET-COOKIE:',
                        cookieHeaders
                    );

                    var authCookies = [];

                    if (
                        cookieHeaders &&
                        cookieHeaders.forEach
                    ) {

                        cookieHeaders.forEach(function (item) {

                            console.log(
                                'UTOPIA LOGIN COOKIE:',
                                item
                            );

                            var firstPart =
                                item.split(';')[0];

                            if (firstPart) {
                                authCookies.push(firstPart);
                            }
                        });
                    }

                    var finalCookies =
                        authCookies.join('; ');

                    console.log('================================');
                    console.log(
                        'UTOPIA FINAL COOKIES:',
                        finalCookies || '(немає)'
                    );
                    console.log('================================');

                    if (finalCookies) {

                        Lampa.Storage.set(
                            'utopia_test_cookies',
                            finalCookies
                        );

                        Lampa.Noty.show(
                            'UTOPIA: LOGIN OK, cookies отримані'
                        );

                    } else {

                        Lampa.Noty.show(
                            'UTOPIA: LOGIN відповів, але cookies немає'
                        );
                    }
                },

                function (error, code) {

    console.error('================================');
    console.error('UTOPIA LOGIN ERROR');
    console.error('ERROR TYPE:', typeof error);
    console.error('ERROR:', error);
    console.error('ERROR JSON:', JSON.stringify(error));
    console.error('CODE TYPE:', typeof code);
    console.error('CODE:', code);
    console.error('NETWORK ERROR:', network.errorDecode(error, code));
    console.error('================================');

    Lampa.Noty.show(
        'UTOPIA POST ERROR: ' +
        network.errorDecode(error, code)
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

        function (error, code) {

            console.error('================================');
            console.error('UTOPIA GET ERROR');
            console.error('ERROR:', error);
            console.error('CODE:', code);
            console.error('================================');

            Lampa.Noty.show(
                'UTOPIA: помилка GET /login'
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
