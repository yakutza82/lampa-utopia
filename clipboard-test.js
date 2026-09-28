(function () {
    'use strict';

    if (window.CLIPBOARD_TEST_PLUGIN) return;
    window.CLIPBOARD_TEST_PLUGIN = true;

    function startPlugin() {
        try {
            console.log('[CLIPBOARD TEST] start');

            var icon =
                '<svg viewBox="0 0 24 24">' +
                '<path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>' +
                '</svg>';

            var button = Lampa.Menu.addButton(
                icon,
                'БУФЕР',
                function () {
                    console.log('[CLIPBOARD TEST] button click');

                    if (Lampa.Noty) {
                        Lampa.Noty.show('КНОПКА БУФЕР ПРАЦЮЄ');
                    }
                }
            );

            if (button && button.addClass) {
                button.addClass('clipboard_test_button');
            }

            console.log('[CLIPBOARD TEST] button added');

        } catch (e) {
            console.error('[CLIPBOARD TEST] ERROR', e);

            if (Lampa.Noty) {
                Lampa.Noty.show(
                    'Clipboard Test: ' +
                    (e.message || e)
                );
            }
        }
    }

    function bootstrap() {

        if (typeof Lampa === 'undefined') {
            setTimeout(bootstrap, 300);
            return;
        }

        if (window.appready) {
            startPlugin();
            return;
        }

        if (Lampa.Listener && Lampa.Listener.follow) {
            Lampa.Listener.follow('app', function (e) {
                if (e.type === 'ready') {
                    startPlugin();
                }
            });
        }

        setTimeout(function () {
            if (window.appready &&
                !document.querySelector('.clipboard_test_button')) {
                startPlugin();
            }
        }, 1500);
    }

    bootstrap();

})();
