(function () {
    'use strict';

    if (window.UTOPIA_PLUGIN) return;
    window.UTOPIA_PLUGIN = true;

    var API = 'https://utp.to/api/torrents/filter?name=Avatar&perPage=5';

    function getKey() {
        return Lampa.Storage.get('utopia_api_key', '');
    }

    function test() {
        var key = getKey();

        if (!key) {
            Lampa.Noty.show('UTOPIA: ключ не знайдений');
            return;
        }

        var xhr = new XMLHttpRequest();

        xhr.open('GET', API, true);

        xhr.setRequestHeader(
            'Authorization',
            'Bearer ' + key
        );

        xhr.setRequestHeader(
            'Accept',
            'application/json'
        );

        xhr.onreadystatechange = function () {
            if (xhr.readyState !== 4) return;

            console.log('[UTOPIA] HTTP:', xhr.status);
            console.log('[UTOPIA] RESPONSE:', xhr.responseText);

            if (xhr.status >= 200 && xhr.status < 300) {

                try {
                    var data = JSON.parse(xhr.responseText);
                    var count = data.data ? data.data.length : 0;

                    Lampa.Noty.show(
                        'UTOPIA: API OK, знайдено ' + count
                    );

                } catch (e) {
                    Lampa.Noty.show(
                        'UTOPIA: відповідь отримана, але JSON помилка'
                    );
                }

            } else if (xhr.status === 401) {

                Lampa.Noty.show(
                    'UTOPIA: HTTP 401 — неправильний API Key'
                );

            } else if (xhr.status === 403) {

                Lampa.Noty.show(
                    'UTOPIA: HTTP 403 — доступ заборонено'
                );

            } else {

                Lampa.Noty.show(
                    'UTOPIA: HTTP ' + xhr.status
                );
            }
        };

        xhr.onerror = function () {
            console.log('[UTOPIA] XHR ERROR');

            Lampa.Noty.show(
                'UTOPIA: XHR network/CORS error'
            );
        };

        xhr.ontimeout = function () {
            Lampa.Noty.show(
                'UTOPIA: timeout'
            );
        };

        xhr.timeout = 15000;

        xhr.send();
    }

    setTimeout(test, 1500);

})();
