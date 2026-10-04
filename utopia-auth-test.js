(function () {
    'use strict';

    if (window.UTOPIA_HTTP_TEST) return;
    window.UTOPIA_HTTP_TEST = true;

    var request_id = 'utopia_test_' + Date.now();

    // Перехоплюємо callback Android після завершення запиту
    var old_httpCall = Lampa.Android.httpCall;

    Lampa.Android.httpCall = function (id, status) {
        try {
            if (id === request_id) {
                var response = AndroidJS.getResp(id);

                Lampa.Noty.show(
                    'UTOPIA HTTP TEST<br><br>' +
                    'status: ' + status + '<br><br>' +
                    'response:<br>' +
                    String(response || 'ПУСТО').slice(0, 3000)
                );

                return;
            }
        } catch (e) {
            Lampa.Noty.show('Помилка: ' + e.message);
            return;
        }

        if (typeof old_httpCall === 'function') {
            old_httpCall.apply(this, arguments);
        }
    };

    var request = {
        url: 'https://utp.to/users/yakutza/apikeys',
        headers: {
            'Accept': 'text/html'
        },
        timeout: 15000,
        returnHeaders: true
    };

    AndroidJS.httpReq(JSON.stringify(request), request_id);

})();
