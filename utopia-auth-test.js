(function () {
    'use strict';

    if (window.UTOPIA_ANDROID_TEST) return;
    window.UTOPIA_ANDROID_TEST = true;

    function testAndroidJS() {
        var result = [];

        result.push(
            'AndroidJS: ' +
            (typeof window.AndroidJS === 'undefined' ? 'НІ' : 'ТАК')
        );

        if (typeof window.AndroidJS !== 'undefined') {
            try {
                result.push(
                    'Тип: ' + typeof window.AndroidJS
                );

                var keys = Object.keys(window.AndroidJS);

                result.push(
                    'Кількість методів: ' + keys.length
                );

                console.log(
                    '[UTOPIA ANDROID TEST] AndroidJS:',
                    window.AndroidJS
                );

                console.log(
                    '[UTOPIA ANDROID TEST] Методи:',
                    keys
                );

                Lampa.Noty.show(
                    'AndroidJS: ТАК\nМетодів: ' + keys.length
                );

                setTimeout(function () {
                    if (keys.length) {
                        Lampa.Noty.show(
                            keys.join(', ')
                        );
                    } else {
                        Lampa.Noty.show(
                            'AndroidJS є, але Object.keys порожній'
                        );
                    }
                }, 1500);

                return;
            } catch (e) {
                result.push(
                    'Помилка: ' + e.message
                );
            }
        }

        Lampa.Noty.show(result.join('\n'));
    }

    function init() {
        if (!Lampa.SettingsApi) {
            Lampa.Noty.show('SettingsApi недоступний');
            return;
        }

        Lampa.SettingsApi.addComponent({
            component: 'utopia_android_test',
            name: 'UTOPIA — Android тест',
            icon: '🔐'
        });

        Lampa.SettingsApi.addParam({
            component: 'utopia_android_test',
            param: {
                name: 'android_test',
                type: 'trigger'
            },
            field: {
                name: 'Перевірити AndroidJS',
                description: 'Перевірка native bridge Lampa'
            },
            onChange: function () {
                testAndroidJS();
            }
        });
    }

    if (window.appready) {
        init();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') {
                init();
            }
        });
    }

})();
