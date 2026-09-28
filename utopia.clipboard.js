(function () {
    'use strict';

    if (window.UTOPIA_CLIPBOARD) return;
    window.UTOPIA_CLIPBOARD = true;

    var VERSION = '0.2.0';

    function readClipboard() {

        Lampa.Noty.show('📋 Спроба отримати буфер...');

        var textarea = document.createElement('textarea');

        textarea.style.position = 'fixed';
        textarea.style.left = '-10000px';
        textarea.style.top = '0';
        textarea.style.width = '1px';
        textarea.style.height = '1px';
        textarea.style.opacity = '0';

        document.body.appendChild(textarea);

        textarea.focus();

        var success = false;

        try {
            success = document.execCommand('paste');
        } catch (e) {
            console.error(
                '[UTOPIA CLIPBOARD] paste error:',
                e
            );
        }

        var text = textarea.value || '';

        document.body.removeChild(textarea);

        console.log(
            '[UTOPIA CLIPBOARD] execCommand:',
            success
        );

        console.log(
            '[UTOPIA CLIPBOARD] text:',
            text
        );

        if (text) {

            Lampa.Noty.show(
                '📋 Буфер:\n' +
                text.substring(0, 500)
            );

        } else {

            Lampa.Noty.show(
                '❌ Paste не повернув дані\n' +
                'execCommand: ' +
                success
            );
        }
    }


    function initSettings() {

        Lampa.SettingsApi.addComponent({
            component: 'utopia_clipboard',
            name: 'Буфер',

            icon:
                '<svg width="26" height="26" viewBox="0 0 26 26" xmlns="http://www.w3.org/2000/svg">' +
                '<rect x="7" y="5" width="13" height="17" rx="2" stroke="currentColor" stroke-width="2" fill="none"/>' +
                '<path d="M10 5V3h6v2" stroke="currentColor" stroke-width="2" fill="none"/>' +
                '<path d="M10 10h7M10 14h7M10 18h5" stroke="currentColor" stroke-width="1.5"/>' +
                '</svg>'
        });


        Lampa.SettingsApi.addParam({

            component: 'utopia_clipboard',

            param: {
                name: 'clipboard_read',
                type: 'button',
                values: '',
                default: ''
            },

            field: {
                name: 'Прочитати буфер',

                description:
                    'Тест отримання буфера через Android WebView. Версія: ' +
                    VERSION
            },

            onChange: function () {
                readClipboard();
            }
        });
    }


    function start() {

        if (
            typeof Lampa === 'undefined' ||
            !Lampa.SettingsApi
        ) {
            console.error(
                '[UTOPIA CLIPBOARD] SettingsApi недоступний'
            );
            return;
        }

        initSettings();

        console.log(
            '[UTOPIA CLIPBOARD] loaded v' +
            VERSION
        );
    }


    if (window.appready) {

        start();

    } else if (
        window.Lampa &&
        Lampa.Listener &&
        typeof Lampa.Listener.follow === 'function'
    ) {

        Lampa.Listener.follow('app', function (e) {

            if (e.type === 'ready') {
                start();
            }

        });

    } else {

        setTimeout(start, 2000);

    }

})();
