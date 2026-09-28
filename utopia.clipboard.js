(function () {
    'use strict';

    if (window.UTOPIA_CLIPBOARD_TEST) return;
    window.UTOPIA_CLIPBOARD_TEST = true;

    function readTorrentUrl() {
        var url = Lampa.Storage.get('utopia_last_torrent_url', '');

        if (!url) {
            Lampa.Noty.show('Буфер UTOPIA порожній');
            return;
        }

        Lampa.Noty.show('URL знайдено:\n' + url.substring(0, 300));
        console.log('[UTOPIA BUFFER]', url);
    }

    function init() {
        if (!window.Lampa || !Lampa.SettingsApi) return;

        Lampa.SettingsApi.addComponent({
            component: 'utopia_clipboard',
            name: 'Буфер UTOPIA',
            icon: '⧉'
        });

        Lampa.SettingsApi.addParam({
            component: 'utopia_clipboard',
            param: {
                name: 'read_buffer',
                type: 'button'
            },
            field: {
                name: 'Прочитати URL',
                description: 'Перевірка останнього торента UTOPIA'
            },
            onChange: readTorrentUrl
        });
    }

    if (window.Lampa && Lampa.Listener) {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') {
                init();
            }
        });
    }
})();
