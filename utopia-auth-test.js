(function () {
    'use strict';

    if (window.UTOPIA_BROWSER_TEST) return;
    window.UTOPIA_BROWSER_TEST = true;

    var url = 'https://utp.to/users/yakutza/apikeys';

    try {
        if (Lampa.Browser && typeof Lampa.Browser.open === 'function') {
            Lampa.Browser.open(url);
            return;
        }

        if (Lampa.Browser && typeof Lampa.Browser.url === 'function') {
            Lampa.Browser.url(url);
            return;
        }

        if (window.browser && typeof window.browser.open === 'function') {
            window.browser.open(url);
            return;
        }

        alert('Browser API не знайдено');
    } catch (e) {
        alert('Помилка: ' + e.message);
    }
})();
