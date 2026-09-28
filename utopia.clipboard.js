(function () {
    'use strict';

    if (window.UTOPIA_CLIPBOARD_TEST) return;
    window.UTOPIA_CLIPBOARD_TEST = true;

    function testClipboard() {

        console.log('[UTOPIA CLIPBOARD] test started');

        if (!navigator.clipboard) {
            Lampa.Noty.show('❌ navigator.clipboard недоступний');
            return;
        }

        if (!navigator.clipboard.readText) {
            Lampa.Noty.show('❌ clipboard.readText недоступний');
            return;
        }

        navigator.clipboard.readText()
            .then(function (text) {

                console.log('[UTOPIA CLIPBOARD] TEXT:', text);

                if (!text) {
                    Lampa.Noty.show('📋 Буфер порожній');
                    return;
                }

                Lampa.Noty.show(
                    '📋 Буфер:\n' + text.substring(0, 500)
                );
            })
            .catch(function (error) {

                console.error(
                    '[UTOPIA CLIPBOARD] ERROR:',
                    error
                );

                Lampa.Noty.show(
                    '❌ Clipboard error:\n' +
                    (error.message || error)
                );
            });
    }

    function start() {

        console.log('[UTOPIA CLIPBOARD] plugin loaded');

        /*
         * Чекаємо, поки Lampa повністю запуститься.
         */
        setTimeout(function () {
            testClipboard();
        }, 3000);
    }

    if (window.appready) {
        start();
    } else if (window.Lampa && Lampa.Listener) {

        Lampa.Listener.follow('app', function (e) {

            if (e.type === 'ready') {
                start();
            }

        });

    } else {

        setTimeout(start, 5000);

    }

})();
