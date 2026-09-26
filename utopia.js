(function () {
    'use strict';

    if (window.UTOPIA_PLUGIN) return;
    window.UTOPIA_PLUGIN = true;

    var API = 'https://utp.to/api/torrents/filter';

    function getKey() {
        return Lampa.Storage.get('utopia_api_key', '');
    }

    function testApi() {
        var key = getKey();

        if (!key) {
            Lampa.Noty.show('UTOPIA: API ключ не знайдений');
            return;
        }

        var network = new Lampa.Reguest();

        network.silent(
            API + '?name=Avatar&perPage=5',

            function (data) {
                console.log('[UTOPIA] RESPONSE:', data);

                var count = 0;

                try {
                    if (typeof data === 'string') {
                        data = JSON.parse(data);
                    }

                    if (data && data.data) {
                        count = data.data.length;
                    }
                } catch (e) {
                    console.log('[UTOPIA] JSON error:', e);
                }

                Lampa.Noty.show(
                    'UTOPIA: знайдено релізів — ' + count
                );
            },

            function (error) {
                console.log('[UTOPIA] ERROR:', error);

                Lampa.Noty.show(
                    'UTOPIA: помилка API'
                );
            },

            false,

            {
                dataType: 'json',
                headers: {
                    'Authorization': 'Bearer ' + key,
                    'Accept': 'application/json'
                }
            }
        );
    }

    setTimeout(function () {
        testApi();
    }, 1500);

    console.log('[UTOPIA] API test loaded');

})();
