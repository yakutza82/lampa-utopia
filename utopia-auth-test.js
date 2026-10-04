(function () {
    'use strict';

    if (window.UTOPIA_AUTH_TEST) return;
    window.UTOPIA_AUTH_TEST = true;

    var TEST_URL = 'https://utp.to/users/yakutza/apikeys';

    function testAuth() {
        Lampa.Noty.show('Перевіряю авторизацію UTOPIA...');

        var network = new Lampa.Reguest();

        network.timeout(20000);

        network.silent(
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

                var active = html.indexOf('Активний') !== -1;

                console.log('[UTOPIA AUTH TEST] HTTP: success');
                console.log('[UTOPIA AUTH TEST] HTML length:', html.length);
                console.log('[UTOPIA AUTH TEST] Active key:', active);

                if (active) {
                    Lampa.Noty.show('UTOPIA: авторизація знайдена');
                } else {
                    Lampa.Noty.show('UTOPIA: сторінка отримана, але авторизація не знайдена');
                }
            },
            function (error) {
                console.log('[UTOPIA AUTH TEST] ERROR:', error);
                Lampa.Noty.show('UTOPIA: помилка запиту');
            },
            false,
            {
                dataType: 'text'
            }
        );
    }

    function addMenu() {
        Lampa.Listener.follow('app', function (e) {
            if (e.type !== 'ready') return;

            Lampa.SettingsApi.addComponent({
                component: 'utopia_auth_test',
                name: 'UTOPIA — тест авторизації',
                icon: '🔐',
                onRender: function () {
                    var item = $('<div class="settings-param selector">' +
                        '<div class="settings-param__name">Перевірити авторизацію UTOPIA</div>' +
                        '<div class="settings-param__descr">Тест сесії utp.to без зміни ключа</div>' +
                        '</div>');

                    item.on('hover:enter', function () {
                        testAuth();
                    });

                    return item;
                }
            });
        });
    }

    addMenu();

})();
