(function () {
    'use strict';

    if (!window.Lampa || !Lampa.Reguest) {
        Lampa.Noty.show('UTOPIA: Reguest не знайдений');
        return;
    }

    var USERNAME = 'yakutza';
    var PASSWORD = '5159001276yakut';

    var network = new Lampa.Reguest();
    var loginUrl = 'https://utp.to/login';

    // ------------------------------------------------------------
    // GET /login
    // ------------------------------------------------------------

    network.clear();
    network.timeout(10000);

    network["native"](
        loginUrl,

        function (response) {

            var json = response;

            if (typeof response === 'string') {
                try {
                    json = Lampa.Arrays.decodeJson(
                        response,
                        {}
                    );
                } catch (e) {
                    Lampa.Noty.show(
                        'UTOPIA: GET response error'
                    );
                    return;
                }
            }

            var html = json && json.body || '';

            var tokenMatch = html.match(
                /name=["']_token["'][^>]*value=["']([^"']+)["']/
            );

            if (!tokenMatch) {
                tokenMatch = html.match(
                    /value=["']([^"']+)["'][^>]*name=["']_token["']/
                );
            }

            if (!tokenMatch) {
                Lampa.Noty.show(
                    'UTOPIA: CSRF не знайдений'
                );
                return;
            }

            var csrfToken = tokenMatch[1];

            // ----------------------------------------------------
            // Cookies після GET
            // ----------------------------------------------------

            var getHeaders =
                json &&
                json.headers &&
                json.headers['set-cookie'];

            var cookies = {};

            if (getHeaders && getHeaders.forEach) {

                getHeaders.forEach(function (item) {

                    var first = item.split(';')[0];
                    var pos = first.indexOf('=');

                    if (pos > 0) {

                        var name =
                            first.substring(0, pos);

                        var value =
                            first.substring(pos + 1);

                        cookies[name] = value;
                    }
                });
            }

            // ----------------------------------------------------
            // POST /login
            // ----------------------------------------------------

            var postdata =
                '_token=' +
                encodeURIComponent(csrfToken) +
                '&username=' +
                encodeURIComponent(USERNAME) +
                '&password=' +
                encodeURIComponent(PASSWORD);

            var headers = {
    'Content-Type':
        'application/x-www-form-urlencoded',
    'Accept':
        'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
};

var getCookie = [];

for (var name in cookies) {
    getCookie.push(
        name + '=' + cookies[name]
    );
}

if (getCookie.length) {
    headers['Cookie'] =
        getCookie.join('; ');
}

if (cookies['XSRF-TOKEN']) {
    headers['X-XSRF-TOKEN'] =
        decodeURIComponent(cookies['XSRF-TOKEN']);
}

            network.clear();
            network.timeout(10000);

            network["native"](
                loginUrl,

                function (response) {

                  console.log('UTOPIA POST RAW RESPONSE:', response);

var debugJson = response;

if (typeof response === 'string') {
    try {
        debugJson = Lampa.Arrays.decodeJson(response, {});
    } catch (e) {
        debugJson = {};
    }
}

var debugStatus =
    debugJson && debugJson.status
        ? debugJson.status
        : 'unknown';

var debugHeaders =
    debugJson && debugJson.headers
        ? debugJson.headers
        : {};

var safeHeaders = {};

for (var h in debugHeaders) {
    if (
        h.toLowerCase() !== 'set-cookie' &&
        h.toLowerCase() !== 'cookie'
    ) {
        safeHeaders[h] = debugHeaders[h];
    }
}

console.log(
    'UTOPIA POST STATUS:',
    debugStatus
);

console.log(
    'UTOPIA POST SAFE HEADERS:',
    safeHeaders
);

Lampa.Noty.show(
    'UTOPIA POST STATUS: ' +
    debugStatus +
    '\nHeaders: ' +
    JSON.stringify(safeHeaders)
);

                    var loginJson = response;

                    if (typeof response === 'string') {
                        try {
                            loginJson =
                                Lampa.Arrays.decodeJson(
                                    response,
                                    {}
                                );
                        } catch (e) {
                            loginJson = {};
                        }
                    }

                    var setCookies =
                        loginJson &&
                        loginJson.headers &&
                        loginJson.headers['set-cookie'];

                    if (
                        !setCookies ||
                        !setCookies.forEach
                    ) {
                        Lampa.Noty.show(
                            'UTOPIA: POST OK, але Set-Cookie немає'
                        );
                        return;
                    }

                    // ------------------------------------------------
                    // Обробляємо cookies
                    // ------------------------------------------------

                    setCookies.forEach(function (item) {

                        var first =
                            item.split(';')[0];

                        var pos =
                            first.indexOf('=');

                        if (pos > 0) {

                            var name =
                                first.substring(0, pos);

                            var value =
                                first.substring(pos + 1);

                            if (value === 'deleted') {
                                delete cookies[name];
                            } else {
                                cookies[name] = value;
                            }
                        }
                    });

                    // ------------------------------------------------
                    // Формуємо Cookie header
                    // ------------------------------------------------

                    var finalCookieParts = [];
                    var cookieNames = [];

                    for (var cookieName in cookies) {

                        cookieNames.push(cookieName);

                        finalCookieParts.push(
                            cookieName +
                            '=' +
                            cookies[cookieName]
                        );
                    }

                    var finalCookie =
                        finalCookieParts.join('; ');

                    // Зберігаємо сесію
                    Lampa.Storage.set(
                        'utopia_test_cookies',
                        finalCookie
                    );

                    // Показуємо ТІЛЬКИ назви
                    Lampa.Noty.show(
                        'UTOPIA COOKIES: ' +
                        cookieNames.join(', ')
                    );

                    console.log(
                        'UTOPIA COOKIE NAMES:',
                        cookieNames
                    );

                    console.log(
                        'UTOPIA: COOKIE SAVED'
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
        'UTOPIA POST ERROR:\n' + details
    );

}

                postdata,

                {
                    dataType: 'text',
                    headers: headers,
                    returnHeaders: true
                }
            );
        },

        function (error) {

            var details = '';

            try {
                details =
                    JSON.stringify(error);
            } catch (e) {
                details =
                    String(error);
            }

            Lampa.Noty.show(
                'UTOPIA GET ERROR: ' +
                details
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
