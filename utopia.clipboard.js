(function () {
    'use strict';

    if (window.UTOPIA_CLIPBOARD_TEST) return;
    window.UTOPIA_CLIPBOARD_TEST = true;

    function readClipboard() {

        Lampa.Noty.show('Читаю буфер...');

        /*
         * Спочатку перевіряємо стандартний Clipboard API.
         */
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

                    Lampa.Noty.show(
                        '📋 ' + text.substring(0, 500)
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

        /*
         * Для Android WebView readText() відсутній.
         * Поки просто повідомляємо це.
         */
        Lampa.Noty.show(
            '❌ Android WebView не має clipboard.readText()'
        );
    }


    function addButton() {

        if (
            !window.Lampa ||
            !Lampa.Menu ||
            typeof Lampa.Menu.addButton !== 'function'
        ) {
            console.error(
                '[UTOPIA CLIPBOARD] Lampa.Menu.addButton недоступний'
            );
            return;
        }

        var icon =
            '<svg viewBox="0 0 24 24">' +
            '<path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>' +
            '</svg>';

        Lampa.Menu.addButton(
            icon,
            'Буфер',
            readClipboard
        );

        console.log(
            '[UTOPIA CLIPBOARD] Кнопка Буфер додана'
        );
    }


    function init() {

        if (window.appready) {
            addButton();
            return;
        }

        if (
            window.Lampa &&
            Lampa.Listener &&
            typeof Lampa.Listener.follow === 'function'
        ) {
            Lampa.Listener.follow('app', function (event) {

                if (event.type === 'ready') {
                    addButton();
                }

            });
        }
    }


    init();

})();
