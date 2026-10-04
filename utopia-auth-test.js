(function () {
    'use strict';

    if (window.UTOPIA_ANDROID_TEST) return;
    window.UTOPIA_ANDROID_TEST = true;

    function showResult(title, text) {
        Lampa.Modal.open({
            title: title,
            html: '<div style="padding:1em;word-break:break-all;">' +
                $('<div>').text(text).html() +
                '</div>',
            onBack: function () {
                Lampa.Modal.close();
            }
        });
    }

    function testAndroidJS() {
        var result = [];

        result.push('AndroidJS: ' + (
            typeof window.AndroidJS === 'undefined'
                ? 'НІ'
                : 'ТАК'
        ));

        if (typeof window.AndroidJS !== 'undefined') {
            try {
                result.push(
                    'Тип: ' + typeof window.AndroidJS
                );

                result.push(
                    'Методи: ' +
                    Object.keys(window.AndroidJS).join(', ')
                );
            } catch (e) {
                result.push(
                    'Помилка читання: ' + e.message
                );
            }
        }

        showResult(
            'UTOPIA — Android тест',
            result.join('\n')
        );
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
            if (e.type === 'ready') init();
        });
    }

})();
