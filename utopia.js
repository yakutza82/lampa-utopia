(function () {
    'use strict';

    if (!window.Lampa) return;
    if (window.UTOPIA_PLUGIN) return;

    window.UTOPIA_PLUGIN = true;

    var API = 'https://utp.to/api/torrents/filter';

    function getKey() {
        return Lampa.Storage.get('utopia_api_key', '');
    }

    function setKey() {
        var key = prompt('Введіть UTOPIA API Key');

        if (!key) return;

        key = key.trim();

        Lampa.Storage.set('utopia_api_key', key);

        Lampa.Notifier.show({
            title: 'UTOPIA',
            text: 'API ключ збережено',
            time: 3000
        });
    }

    function test() {
        var key = getKey();

        if (!key) {
            setKey();
            return;
        }

        var request = new Lampa.Reguest();

        request.silent(
            API + '?name=Avatar&perPage=5',
            function (data) {
                console.log('[UTOPIA] API response:', data);

                var count = data &&
                    data.data ?
                    data.data.length :
                    0;

                Lampa.Notifier.show({
                    title: 'UTOPIA',
                    text: 'Знайдено релізів: ' + count,
                    time: 5000
                });
            },
            function (error) {
                console.error('[UTOPIA] API error:', error);

                Lampa.Notifier.show({
                    title: 'UTOPIA',
                    text: 'Помилка API',
                    time: 5000
                });
            },
            {
                headers: {
                    'Authorization': 'Bearer ' + key,
                    'Accept': 'application/json'
                }
            }
        );
    }

    setTimeout(function () {
        if (getKey()) {
            test();
        } else {
            setKey();
        }
    }, 1000);

    console.log('[UTOPIA] Plugin initialized');
})();
