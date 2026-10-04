(function () {
    'use strict';

    if (window.UTOPIA_AUTH_TEST) return;
    window.UTOPIA_AUTH_TEST = true;

    var COMPONENT = 'utopia_auth_test';
    var TEST_URL = 'https://utp.to/users/yakutza/apikeys';

    function testAuth() {
        Lampa.Noty.show('UTOPIA: перевіряю авторизацію...');

        var request = new Lampa.Reguest();

        request.native(
            TEST_URL,
            function (response) {
                var html = '';

                if (typeof response === 'string') {
                    html = response;
                } else {
                    try {
                        html = JSON.stringify(response);
                    } catch (e) {
                        html = '';
                    }
                }

                var hasActive = html.indexOf('Активний') !== -1;
                var hasApiKeyPage = html.indexOf('API') !== -1 &&
                                    html.indexOf('apikey') !== -1;

                console.log('[UTOPIA AUTH TEST]');
                console.log('Response length:', html.length);
                console.log('Active:', hasActive);
                console.log('API key page:', hasApiKeyPage);

                if (hasActive) {
                    Lampa.Noty.show(
                        'UTOPIA: авторизована сесія знайдена!'
                    );
                } else {
                    Lampa.Noty.show(
                        'UTOPIA: сторінка отримана, але сесія не знайдена'
                    );
                }
            },
            function (error) {
                console.log('[UTOPIA AUTH TEST] ERROR:', error);

                Lampa.Noty.show(
                    'UTOPIA: помилка запиту'
                );
            },
            false,
            {
                dataType: 'text'
            }
        );
    }

    function addSettings() {
        Lampa.SettingsApi.addComponent({
            component: COMPONENT,
            name: 'UTOPIA — авторизація',
            icon: '🔐'
        });

        Lampa.SettingsApi.addParam({
            component: COMPONENT,
            param: {
                name: 'utopia_auth_test',
                type: 'trigger'
            },
            field: {
                name: 'Перевірити авторизацію',
                description: 'Перевірити сесію utp.to'
            },
            onChange: function () {
                testAuth();

                setTimeout(function () {
                    Lampa.Settings.update();
                }, 100);
            }
        });
    }

    function start() {
        if (!window.Lampa) return;

        if (Lampa.SettingsApi) {
            addSettings();
        }
    }

    if (window.appready) {
        start();
    } else {
        Lampa.Listener.follow('app', function (event) {
            if (event.type === 'ready') {
                start();
            }
        });
    }

})();
