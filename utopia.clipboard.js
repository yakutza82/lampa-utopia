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

        Lampa.Noty.show('URL знайдено:\n' + url.substring(0, 300));
        console.log('[UTOPIA BUFFER]', url);
    }

    function downloadTorrent() {
    var url = getUrl();

    if (!url) {
        Lampa.Noty.show('❌ Немає URL торента');
        return;
    }

    Lampa.Noty.show('⏳ Отримую .torrent...');

    fetch(url)
        .then(function (response) {
            if (!response.ok) {
                throw new Error('HTTP ' + response.status);
            }

            return response.blob();
        })
        .then(function (blob) {
            console.log('[UTOPIA TORRENT] blob:', blob);

            var blobUrl = URL.createObjectURL(blob);
            var a = document.createElement('a');

            a.href = blobUrl;
            a.download = 'torrent.torrent';
            document.body.appendChild(a);
            a.click();
            a.remove();

            setTimeout(function () {
                URL.revokeObjectURL(blobUrl);
            }, 5000);

            Lampa.Noty.show('✅ Файл підготовлено до завантаження');
        })
        .catch(function (error) {
            console.error('[UTOPIA TORRENT]', error);
            Lampa.Noty.show('❌ Помилка завантаження: ' + error.message);
        });
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
                description: 'Завантажити останній вибраний торрент'
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
