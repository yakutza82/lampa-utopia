(function () {
    'use strict';

    if (window.LAMPA_CLIPBOARD_TEST) return;
    window.LAMPA_CLIPBOARD_TEST = true;

    function init() {

        if (!Lampa.Menu || !Lampa.Menu.addButton) {
            console.log('[Clipboard Test] Lampa.Menu недоступний');
            return;
        }

        var icon =
            '<svg viewBox="0 0 24 24">' +
            '<path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>' +
            '</svg>';

        Lampa.Menu.addButton(
            icon,
            'Буфер',
            function () {

                console.log('[Clipboard Test] Кнопка натиснута');

                if (!navigator.clipboard || !navigator.clipboard.readText) {
                    Lampa.Noty.show(
                        'Lampa не має доступу до Clipboard API'
                    );
                    return;
                }

                navigator.clipboard.readText()
                    .then(function (text) {

                        console.log(
                            '[Clipboard Test] Clipboard:',
                            text
                        );

                        if (!text) {
                            Lampa.Noty.show(
                                'Буфер порожній'
                            );
                            return;
                        }

                        Lampa.Noty.show(
                            'БУФЕР:\n' +
                            text.substring(0, 500)
                        );
                    })
                    .catch(function (error) {

                        console.error(
                            '[Clipboard Test] Error:',
                            error
                        );

                        Lampa.Noty.show(
                            'Не вдалося прочитати буфер: ' +
                            error.message
                        );
                    });
            }
        );

        console.log('[Clipboard Test] Plugin loaded');
    }

    if (window.appready) {
        init();
    } else {
        Lampa.Listener.follow('app', function (event) {
            if (event.type === 'ready') {
                init();
            }
        });
    }

})();
