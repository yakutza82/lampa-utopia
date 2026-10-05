(function () {
    'use strict';

    console.log('UTOPIA TEST START');

    if (!window.Lampa) {
        console.log('UTOPIA ERROR: Lampa not found');
        return;
    }

    if (!Lampa.Reguest) {
        console.log('UTOPIA ERROR: Lampa.Reguest not found');
        return;
    }

    console.log('UTOPIA: Lampa OK');

    var request = new Lampa.Reguest();

    request.silent(
        'https://utp.to/login',

        function (html) {
            console.log('UTOPIA GET SUCCESS');
            console.log('HTML LENGTH:', html ? html.length : 0);

            if (!html) {
                console.log('UTOPIA ERROR: empty response');
                return;
            }

            console.log('HTML:', html.substring(0, 1000));

            var tokenStart = html.indexOf('name="_token"');

            if (tokenStart === -1) {
                console.log('UTOPIA: _token not found');
                return;
            }

            console.log('UTOPIA: _token found');

            Lampa.Noty.show('UTOPIA: GET працює, _token знайдено');
        },

        function (error) {
            console.log('UTOPIA GET ERROR');
            console.log(error);

            Lampa.Noty.show('UTOPIA: GET /login не працює');
        }
    );
})();
