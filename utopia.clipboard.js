(function () {
    'use strict';

    if (window.UTOPIA_CLIPBOARD) return;
    window.UTOPIA_CLIPBOARD = true;

    var VERSION = '0.1.0';

    function readClipboard() {

        if (
            navigator.clipboard &&
            typeof navigator.clipboard.readText === 'function'
        ) {

            navigator.clipboard.readText()
                .then(function (text) {

                    if (!text) {
                        Lampa.Noty.show('📋 Буфер порожній');
                        return;
                    }

                    console.log(
                        '[UTOPIA CLIPBOARD]',
                        text
                    );

                    Lampa.Noty.show(
                        '📋 Буфер:\n' +
                        text.substring(0, 500)
                    );

                })
                .catch(function (error) {

                    console.error(
                        '[UTOPIA CLIPBOARD]',
                        error
                    );

                    Lampa.Noty.show(
                        '❌ Не вдалося прочитати буфер'
                    );
                });

            return;
        }

        Lampa.Noty.show(
            '❌ У цьому Android WebView відсутній clipboard.readText()'
        );
    }


    function initSettings() {

        Lampa.SettingsApi.addComponent({
            component: 'utopia_clipboard',
            name: 'Буфер',
            icon:
                '<svg width="26" height="26" viewBox="0 0 26 26" xmlns="http://www.w3.org/2000/svg">' +
                '<rect x="7" y="5" width="13" height="17" rx="2" stroke="currentColor" stroke-width="2" fill="none"/>' +
                '<path d="M10 5V3h6v2" stroke="currentColor" stroke-width="2" fill="none"/>' +
                '<path d="M10 10h7M10 14h7M10 18h5" stroke="currentColor" stroke-width="1.5"/>' +
                '</svg>'
        });


        Lampa.SettingsApi.addParam({
            component: 'utopia_clipboard',

            param: {
                name: 'clipboard_read',
                type: 'button',
                values: '',
                default: ''
            },

            field: {
                name: 'Прочитати буфер',
                description:
                    'Перевірити вміст буфера обміну. Версія плагіна: ' +
                    VERSION
            },

            onChange: function () {
                readClipboard();
            }
        });
    }


    function start() {

        if (
            typeof Lampa === 'undefined' ||
            !Lampa.SettingsApi
        ) {
            console.error(
                '[UTOPIA CLIPBOARD] Lampa.SettingsApi недоступний'
            );
            return;
        }

        initSettings();

        console.log(
            '[UTOPIA CLIPBOARD] loaded v' + VERSION
        );
    }


    if (window.appready) {
        start();
    } else if (
        window.Lampa &&
        Lampa.Listener &&
        typeof Lampa.Listener.follow === 'function'
    ) {

        Lampa.Listener.follow('app', function (e) {

            if (e.type === 'ready') {
                start();
            }

        });

    } else {

        setTimeout(start, 2000);

    }

})();
