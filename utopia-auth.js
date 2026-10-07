(function () {
    'use strict';

    if (!window.Lampa || !Lampa.Reguest) {
        Lampa.Noty.show('UTOPIA AUTH: Reguest не знайдений');
        return;
    }

    if (window.UTOPIA_AUTH) return;
    window.UTOPIA_AUTH = true;

    var SITE_ORIGIN = 'https://utp.to';
    var LOGIN_URL = SITE_ORIGIN + '/login';

    var COOKIE_KEY = 'utopia_auth_cookie';
    var USER_KEY = 'utopia_auth_username';
    var PASS_KEY = 'utopia_auth_password';

    var network = new Lampa.Reguest();

    // ------------------------------------------------------------
    // Отримати збережений cookie
    // ------------------------------------------------------------

    function getCookie() {
        return Lampa.Storage.get(COOKIE_KEY, '');
    }

    // ------------------------------------------------------------
    // Зберегти cookies
    // ------------------------------------------------------------

    function saveCookies(cookies) {
        var parts = [];

        for (var name in cookies) {
            parts.push(
                name + '=' + cookies[name]
            );
        }

        var cookie = parts.join('; ');

        if (cookie) {
            Lampa.Storage.set(
                COOKIE_KEY,
                cookie
            );
        }

        return cookie;
    }

    // ------------------------------------------------------------
    // Розбір Set-Cookie
    // ------------------------------------------------------------

    function collectCookies(target, headers) {

        if (!headers) return;

        var setCookies =
            headers['set-cookie'] ||
            headers['Set-Cookie'];

        if (!setCookies) return;

        if (!Array.isArray(setCookies)) {
            setCookies = [setCookies];
        }

        setCookies.forEach(function (item) {

            var first =
                String(item).split(';')[0];

            var pos =
                first.indexOf('=');

            if (pos <= 0) return;

            var name =
                first.substring(0, pos);

            var value =
                first.substring(pos + 1);

            if (value === 'deleted') {
                delete target[name];
            } else {
                target[name] = value;
            }
        });
    }

    // ------------------------------------------------------------
    // Cookie -> header
    // ------------------------------------------------------------

    function cookieHeader(cookies) {

        var parts = [];

        for (var name in cookies) {
            parts.push(
                name + '=' + cookies[name]
            );
        }

        return parts.join('; ');
    }

    // ------------------------------------------------------------
    // Отримання CSRF token
    // ------------------------------------------------------------

    function getToken(html) {

        var match = html.match(
            /name=["']_token["'][^>]*value=["']([^"']+)["']/
        );

        if (!match) {
            match = html.match(
                /value=["']([^"']+)["'][^>]*name=["']_token["']/
            );
        }

        return match ? match[1] : '';
    }

    // ------------------------------------------------------------
    // Авторизація
    // ------------------------------------------------------------

    function authorize() {

        var username =
            Lampa.Storage.get(USER_KEY, '');

        var password =
            Lampa.Storage.get(PASS_KEY, '');

        if (!username) {
            Lampa.Noty.show(
                'UTOPIA: введи логін'
            );
            return;
        }

        if (!password) {
            Lampa.Noty.show(
                'UTOPIA: введи пароль'
            );
            return;
        }

        Lampa.Noty.show(
            'UTOPIA: отримую cookie...'
        );

        var cookies = {};

        // --------------------------------------------------------
        // GET /login
        // --------------------------------------------------------

        network.clear();
        network.timeout(10000);

        network["native"](
            LOGIN_URL,

            function (response) {

                var json = response;

                if (typeof response === 'string') {
                    try {
                        json =
                            Lampa.Arrays.decodeJson(
                                response,
                                {}
                            );
                    } catch (e) {
                        Lampa.Noty.show(
                            'UTOPIA: помилка відповіді GET /login'
                        );
                        return;
                    }
                }

                var html =
                    json &&
                    json.body ||
                    '';

                collectCookies(
                    cookies,
                    json && json.headers
                );

                var csrfToken =
                    getToken(html);

                if (!csrfToken) {
                    Lampa.Noty.show(
                        'UTOPIA: CSRF token не знайдений'
                    );
                    return;
                }

                // ------------------------------------------------
                // POST /login
                // ------------------------------------------------

                var postdata =
                    '_token=' +
                    encodeURIComponent(csrfToken) +
                    '&username=' +
                    encodeURIComponent(username) +
                    '&password=' +
                    encodeURIComponent(password);

                var headers = {
                    'Content-Type':
                        'application/x-www-form-urlencoded',
                    'Accept':
                        'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                };

                var existingCookie =
                    cookieHeader(cookies);

                if (existingCookie) {
                    headers['Cookie'] =
                        existingCookie;
                }

                network.clear();
                network.timeout(10000);

                network["native"](
                    LOGIN_URL,

                    function (response2) {

                        var json2 = response2;

                        if (typeof response2 === 'string') {
                            try {
                                json2 =
                                    Lampa.Arrays.decodeJson(
                                        response2,
                                        {}
                                    );
                            } catch (e) {
                                json2 = {};
                            }
                        }

                        collectCookies(
                            cookies,
                            json2 && json2.headers
                        );

                        var finalCookie =
                            saveCookies(cookies);

                        if (!finalCookie) {
                            Lampa.Noty.show(
                                'UTOPIA: cookie не отримано'
                            );
                            return;
                        }

                        var names = [];

                        for (var name in cookies) {
                            names.push(name);
                        }

                        Lampa.Noty.show(
                            'UTOPIA: cookie отримано\n' +
                            names.join(', ')
                        );

                        console.log(
                            'UTOPIA AUTH COOKIE NAMES:',
                            names
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
                            'UTOPIA POST ERROR: ' +
                            details
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
    }

    // ------------------------------------------------------------
    // Меню
    // ------------------------------------------------------------

    function showMenu() {

        var username =
            Lampa.Storage.get(USER_KEY, '');

        var password =
            Lampa.Storage.get(PASS_KEY, '');

        var cookie =
            getCookie();

        var items = [
            {
                title: 'Логін',
                subtitle: username || 'Не задано',
                action: 'username'
            },
            {
                title: 'Пароль',
                subtitle: password ? '••••••••' : 'Не задано',
                action: 'password'
            },
            {
                title: 'Отримати cookie',
                subtitle: cookie
                    ? 'Cookie збережено'
                    : 'Cookie немає',
                action: 'cookie'
            }
        ];

        Lampa.Select.show({
            title: 'UTOPIA — авторизація',
            items: items,

            onSelect: function (item) {

                if (item.action === 'username') {

                    Lampa.Input.edit({
                        title: 'UTOPIA — логін',
                        value: username,

                        onBack: function (value) {
                            Lampa.Storage.set(
                                USER_KEY,
                                value || ''
                            );
                        }
                    });

                    return;
                }

                if (item.action === 'password') {

                    Lampa.Input.edit({
                        title: 'UTOPIA — пароль',
                        value: password,

                        onBack: function (value) {
                            Lampa.Storage.set(
                                PASS_KEY,
                                value || ''
                            );
                        }
                    });

                    return;
                }

                if (item.action === 'cookie') {
                    authorize();
                }
            }
        });
    }

    // ------------------------------------------------------------
    // Реєстрація в налаштуваннях Lampa
    // ------------------------------------------------------------

    function register() {

        if (
            !Lampa.SettingsApi ||
            !Lampa.SettingsApi.addComponent
        ) {
            Lampa.Noty.show(
                'UTOPIA AUTH: SettingsApi не знайдений'
            );
            return;
        }

        Lampa.SettingsApi.addComponent({
    component: 'utopia_auth',
    name: 'Утопія - авторизація',
    icon:
    '<svg width="1.5em" height="1.5em" viewBox="0 0 64 64" ' +
    'xmlns="http://www.w3.org/2000/svg" ' +
    'style="display:block;flex-shrink:0;">' +
        '<image href="https://raw.githubusercontent.com/yakutza82/lampa-utopia/refs/heads/main/pngegg2wh.png" ' +
        'x="0" y="0" width="64" height="64" />' +
    '</svg>'
});
    }

    register();

    Lampa.SettingsApi.addParam({
    component: 'utopia_auth',
    param: {
        name: 'utopia_auth_username',
        type: 'input',
        values: '',
        default: ''
    },
    field: {
        name: 'Логін UTOPIA',
        description: 'Введіть логін'
    },
    onChange: function (value) {
        Lampa.Storage.set('utopia_auth_username', value || '');
    }
});

Lampa.SettingsApi.addParam({
    component: 'utopia_auth',
    param: {
        name: 'utopia_auth_password',
        type: 'input',
        values: '',
        default: ''
    },
    field: {
        name: 'Пароль UTOPIA',
        description: 'Введіть пароль'
    },
    onChange: function (value) {
        Lampa.Storage.set('utopia_auth_password', value || '');
    }
});

Lampa.SettingsApi.addParam({
    component: 'utopia_auth',
    param: {
        name: 'utopia_auth_cookie_btn',
        type: 'button'
    },
    field: {
        name: 'Отримати cookie',
        description: 'Увійти на utp.to та отримати сесійні cookie'
    },
    onChange: function () {
    authorize();
}
});

function getUtopiaCookie() {

    var USERNAME = Lampa.Storage.get('utopia_auth_username', '');
    var PASSWORD = Lampa.Storage.get('utopia_auth_password', '');

    if (!USERNAME || !PASSWORD) {
        Lampa.Noty.show('UTOPIA: введіть логін і пароль');
        return;
    }

    Lampa.Noty.show('UTOPIA: отримую CSRF...');

    var network = new Lampa.Reguest();

    network.clear();
    network.timeout(10000);

    network.native(
        'https://utp.to/login',
        function (response) {

            var html = response && response.body
                ? String(response.body)
                : String(response || '');

            console.log('UTOPIA LOGIN RESPONSE:', response);
console.log('UTOPIA LOGIN HTML:', html);

var csrfToken = '';

try {
    var tokenBox = $('<div>').html(html);

    csrfToken =
        tokenBox.find('input[name="_token"]').attr('value') ||
        '';

} catch (e) {
    console.log('UTOPIA CSRF PARSE ERROR:', e);
}

console.log('UTOPIA CSRF TOKEN:', csrfToken);

if (!csrfToken) {
    Lampa.Noty.show('UTOPIA: CSRF токен не знайдено');
    return;
}

            Lampa.Noty.show('UTOPIA: виконую вхід...');

            var postdata =
                '_token=' + encodeURIComponent(csrfToken) +
                '&username=' + encodeURIComponent(USERNAME) +
                '&password=' + encodeURIComponent(PASSWORD);

            var headers = {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'text/html,application/xhtml+xml'
            };

            network.clear();
            network.timeout(10000);

            network.native(
                'https://utp.to/login',
                function (loginResponse) {

                    var responseHeaders =
                        loginResponse &&
                        loginResponse.headers
                            ? loginResponse.headers
                            : {};

                    var setCookie =
                        responseHeaders['set-cookie'] ||
                        responseHeaders['Set-Cookie'] ||
                        [];

                    if (!Array.isArray(setCookie)) {
                        setCookie = [setCookie];
                    }

                    var cookies = {};

                    setCookie.forEach(function (item) {

                        if (!item) return;

                        var first = String(item).split(';')[0];
                        var pos = first.indexOf('=');

                        if (pos < 1) return;

                        var name = first.substring(0, pos);
                        var value = first.substring(pos + 1);

                        if (value === 'deleted') {
                            delete cookies[name];
                        } else {
                            cookies[name] = value;
                        }
                    });

                    var cookieList = [];

                    for (var name in cookies) {
                        cookieList.push(
                            name + '=' + cookies[name]
                        );
                    }

                    var cookie = cookieList.join('; ');

                    if (!cookie) {
                        Lampa.Noty.show(
                            'UTOPIA: cookie не отримані'
                        );
                        return;
                    }

                    Lampa.Storage.set(
                        'utopia_auth_cookie',
                        cookie
                    );

                    Lampa.Storage.set(
                        'utopia_auth_xsrf',
                        cookies['XSRF-TOKEN'] || ''
                    );

                    Lampa.Noty.show(
                        'UTOPIA: cookie отримані і збережені'
                    );

                    console.log(
                        'UTOPIA AUTH COOKIE:',
                        cookie
                    );

                },
                function (a, c) {

                    Lampa.Noty.show(
                        'UTOPIA: помилка входу'
                    );

                    console.log(
                        'UTOPIA LOGIN ERROR:',
                        a,
                        c
                    );
                },
                postdata,
                {
                    headers: headers,
                    returnHeaders: true
                }
            );
        },
        function (a, c) {

            Lampa.Noty.show(
                'UTOPIA: помилка GET /login'
            );

            console.log(
                'UTOPIA CSRF ERROR:',
                a,
                c
            );
        },
        false,
        {
            dataType: 'text',
            returnHeaders: true
        }
    );
}

})();
