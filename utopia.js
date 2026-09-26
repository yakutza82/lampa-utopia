(function () {
    'use strict';

    if (window.UTOPIA_PLUGIN) return;
    window.UTOPIA_PLUGIN = true;

    function getKey() {
        return Lampa.Storage.get('utopia_api_key', '');
    }

    function saveKey() {
        var key = prompt('UTOPIA API Key');

        if (!key) {
            Lampa.Noty.show('Ключ не введено');
            return;
        }

        try {
            Lampa.Storage.set('utopia_api_key', key.trim());
            Lampa.Noty.show('UTOPIA: ключ збережено');
        } catch (e) {
            console.log('[UTOPIA] Storage error', e);
            Lampa.Noty.show('UTOPIA: помилка збереження');
        }
    }

    setTimeout(function () {
        if (!getKey()) {
            saveKey();
        } else {
            Lampa.Noty.show('UTOPIA: ключ вже збережений');
        }
    }, 1500);

    console.log('[UTOPIA] loaded');
})();
