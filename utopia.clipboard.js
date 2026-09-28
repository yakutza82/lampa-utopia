(function () {
    'use strict';

    if (window.UTOPIA_CLIPBOARD) return;
    window.UTOPIA_CLIPBOARD = true;

    function getUrl() {
        return Lampa.Storage.get('utopia_last_torrent_url', '');
    }

    function downloadTorrent() {
        var url = getUrl();

        if (!url) {
            Lampa.Noty.show('❌ Немає вибраного торента UTOPIA');
            return;
        }

        if (
            typeof AndroidJS === 'undefined' ||
            typeof AndroidJS.openBrowser !== 'function'
        ) {
            Lampa.Noty.show('❌ Завантаження недоступне');
            return;
        }

        try {
            AndroidJS.openBrowser(url);
        } catch (e) {
            console.error('[UTOPIA DOWNLOAD]', e);
            Lampa.Noty.show(
                '❌ Помилка завантаження: ' + (e.message || e)
            );
        }
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
                name: 'download_torrent',
                type: 'button'
            },

            field: {
                name: 'Завантажити .torrent',
                description: 'Завантажити останній вибраний торрент UTOPIA'
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
