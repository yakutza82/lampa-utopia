(function () {
    'use strict';

    if (window.UTOPIA_CLIPBOARD) return;
    window.UTOPIA_CLIPBOARD = true;

    function getUrl() {
        return Lampa.Storage.get('utopia_last_torrent_url', '');
    }

    function readTorrentUrl() {
        var url = getUrl();

        if (!url) {
            Lampa.Noty.show('Буфер UTOPIA порожній');
            return;
        }

        Lampa.Noty.show(
            'URL знайдено:\n' + url.substring(0, 300)
        );

        console.log('[UTOPIA BUFFER]', url);
    }

    function downloadTorrent() {
        var url = getUrl();

        if (!url) {
            Lampa.Noty.show('❌ Немає URL торента');
            return;
        }

        console.log('[UTOPIA DOWNLOAD] URL:', url);
        console.log('[UTOPIA DOWNLOAD] AndroidJS:', window.AndroidJS);
        console.log(
            '[UTOPIA DOWNLOAD] AndroidJS methods:',
            Object.keys(window.AndroidJS || {})
        );

        Lampa.Noty.show(
            'AndroidJS: ' +
            (window.AndroidJS ? 'Є' : 'Немає')
        );
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
                description: 'Показати останній URL торента'
            },

            onChange: readTorrentUrl
        });

        Lampa.SettingsApi.addParam({
            component: 'utopia_clipboard',

            param: {
                name: 'download_torrent',
                type: 'button'
            },

            field: {
                name: 'Завантажити .torrent',
                description: 'Перевірити AndroidJS'
            },

            onChange: downloadTorrent
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
