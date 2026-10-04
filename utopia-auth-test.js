(function () {
    'use strict';

    if (window.UTOPIA_HTTP_TEST) return;
    window.UTOPIA_HTTP_TEST = true;

    var url = 'https://utp.to/users/yakutza/apikeys';

    try {
        var id = Date.now();

        var request = {
            url: url,
            type: 'GET',
            headers: {
                'Accept': 'text/html'
            }
        };

        AndroidJS.httpReq(JSON.stringify(request), id);

        setTimeout(function () {
            try {
                var response = AndroidJS.getResp(id);

                Lampa.Noty.show(
                    'UTOPIA HTTP TEST<br><br>' +
                    'getResp:<br>' +
                    String(response).slice(0, 1000)
                );
            } catch (e) {
                Lampa.Noty.show(
                    'Помилка getResp:<br>' + e.message
                );
            }
        }, 3000);

    } catch (e) {
        Lampa.Noty.show(
            'Помилка httpReq:<br>' + e.message
        );
    }
})();
