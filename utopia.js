(function () {
    'use strict';

    if (!window.Lampa) {
        console.log('[UTOPIA] Lampa not found');
        return;
    }

    console.log('[UTOPIA] Plugin loaded');

    if (Lampa.Noty) {
        Lampa.Noty.show('UTOPIA plugin loaded');
    }
})();
