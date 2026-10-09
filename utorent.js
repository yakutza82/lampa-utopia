(function () {
    'use strict';

    // ============================================================
    // Універсальний реєстр торент-приймачів
    // ============================================================
    if (!window.LampaTorrentReceivers) {
        window.LampaTorrentReceivers = {
            receivers: {},

            register: function (receiver) {
                if (!receiver || !receiver.id || !receiver.title) {
                    return;
                }

                if (typeof receiver.send !== 'function') {
                    return;
                }

                this.receivers[receiver.id] = receiver;
            },

            unregister: function (id) {
                if (!id) return;

                delete this.receivers[id];
            },

            getAvailable: function () {
                var result = [];
                var receivers = this.receivers;

                Object.keys(receivers).forEach(function (id) {
                    var receiver = receivers[id];

                    try {
                        if (
                            typeof receiver.isReady !== 'function' ||
                            receiver.isReady()
                        ) {
                            result.push(receiver);
                        }
                    } catch (e) {
                        console.error(
                            '[TORRENT RECEIVER]',
                            receiver.id,
                            e
                        );
                    }
                });

                return result;
            }
        };
    }

    if (window.UTOPIA_PLUGIN) return;
    window.UTOPIA_PLUGIN = true;

    var API_BASE = 'https://utp.to/api';
    var PER_PAGE = 99;
    var VERSION = 'v1.0.3 build 1753';

    var TRACKERS = [
        'udp://tracker.opentrackr.org:1337/announce',
        'udp://open.demonii.com:1337/announce',
        'udp://tracker.openbittorrent.com:80',
        'udp://open.stealth.si:80/announce',
        'udp://exodus.desync.com:6969',
        'udp://tracker.torrent.eu.org:451/announce'
    ];

    // =========================================================
    // -1. Побудова робочого magnet з .torrent-файлу
    // =========================================================
    function findInfoDictRange(buffer) {
        var buf = new Uint8Array(buffer);
        var pos = 0;

        function readString() {
            var start = pos;
            while (buf[pos] !== 0x3a) pos++; // ':'
            var lenStr = '';
            for (var i = start; i < pos; i++) lenStr += String.fromCharCode(buf[i]);
            var len = parseInt(lenStr, 10);
            pos++; // skip ':'
            var text = '';
            for (var j = 0; j < len; j++) text += String.fromCharCode(buf[pos + j]);
            pos += len;
            return text;
        }

        function skipValue() {
            var c = buf[pos];
            if (c === 0x69) { // 'i' - integer
                pos++;
                while (buf[pos] !== 0x65) pos++;
                pos++;
            } else if (c === 0x6c) { // 'l' - list
                pos++;
                while (buf[pos] !== 0x65) skipValue();
                pos++;
            } else if (c === 0x64) { // 'd' - dict
                pos++;
                while (buf[pos] !== 0x65) {
                    readString();
                    skipValue();
                }
                pos++;
            } else if (c >= 0x30 && c <= 0x39) { // string
                readString();
            } else {
                throw new Error('bad bencode byte at ' + pos);
            }
        }

        if (buf[pos] !== 0x64) throw new Error('.torrent файл має починатись зі словника');
        pos++; // skip top-level 'd'

        var infoRange = null;
        while (buf[pos] !== 0x65) {
            var key = readString();
            if (key === 'info') {
                var infoStart = pos;
                skipValue();
                infoRange = { start: infoStart, end: pos };
            } else {
                skipValue();
            }
        }

        return infoRange;
    }

    function sha1Hex(bytes) {
        function rotl(n, s) { return (n << s) | (n >>> (32 - s)); }

        var ml = bytes.length * 8;
        var withOne = new Uint8Array(((bytes.length + 9 + 63) >> 6) << 6);
        withOne.set(bytes);
        withOne[bytes.length] = 0x80;
        var view = new DataView(withOne.buffer);
        view.setUint32(withOne.length - 4, ml >>> 0, false);

        var h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE, h3 = 0x10325476, h4 = 0xC3D2E1F0;

        for (var chunkStart = 0; chunkStart < withOne.length; chunkStart += 64) {
            var w = new Array(80);
            for (var i = 0; i < 16; i++) w[i] = view.getUint32(chunkStart + i * 4, false);
            for (i = 16; i < 80; i++) w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);

            var a = h0, b = h1, c = h2, d = h3, e = h4;

            for (i = 0; i < 80; i++) {
                var f, k;
                if (i < 20) { f = (b & c) | ((~b) & d); k = 0x5A827999; }
                else if (i < 40) { f = b ^ c ^ d; k = 0x6ED9EBA1; }
                else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; }
                else { f = b ^ c ^ d; k = 0xCA62C1D6; }

                var temp = (rotl(a, 5) + f + e + k + w[i]) >>> 0;
                e = d; d = c; c = rotl(b, 30); b = a; a = temp;
            }

            h0 = (h0 + a) >>> 0;
            h1 = (h1 + b) >>> 0;
            h2 = (h2 + c) >>> 0;
            h3 = (h3 + d) >>> 0;
            h4 = (h4 + e) >>> 0;
        }

        function toHex(n) { return ('00000000' + (n >>> 0).toString(16)).slice(-8); }
        return toHex(h0) + toHex(h1) + toHex(h2) + toHex(h3) + toHex(h4);
    }

    function fetchTorrentFileBytes(url, headers, onSuccess, onError) {
        var network = new Lampa.Reguest();
        network.timeout(20000);

        network.native(url, function (response) {
            if (typeof response !== 'string' || !response.length) {
                onError('parse_error');
                return;
            }
            var bytes = new Uint8Array(response.length);
            for (var i = 0; i < response.length; i++) {
                bytes[i] = response.charCodeAt(i) & 0xFF;
            }
            onSuccess(bytes.buffer, response);
        }, function (xhr) {
            var status = xhr ? xhr.status : 0;
            if (status === 401) onError('unauthorized');
            else if (status === 403) onError('forbidden');
            else onError(status === 0 ? 'network' : 'http_' + status);
        }, false, { headers: headers });
    }

    function buildMagnetFromHash(hashHex, name) {
        var trParams = TRACKERS.map(function (t) { return '&tr=' + encodeURIComponent(t); }).join('');
        return 'magnet:?xt=urn:btih:' + hashHex + '&dn=' + encodeURIComponent(name || 'torrent') + trParams;
    }

    // =========================================================
    // 0. Стилі
    // =========================================================
    function injectStyles() {
        if (document.getElementById('utopia-styles')) return;

        var css = '' +
            '.utopia-wrap{' +
                'display:flex;' +
                'flex-direction:column;' +
                'gap:1em;' +
                'padding:1em 1.2em 0;' +
                'box-sizing:border-box;' +
            '}' +

            '.utopia-header{' +
                'display:flex;' +
                'align-items:flex-start;' +
                'justify-content:center;' +
                'gap:1em;' +
                'flex-wrap:wrap;' +
                'padding-bottom:1em;' +
            '}' +

            '.utopia-header__info{' +
                'display:none;' +
            '}' +

            '.utopia-header__title{' +
                'font-size:1.2em;' +
                'font-weight:600;' +
                'line-height:1.3;' +
                'overflow:hidden;' +
                'text-overflow:ellipsis;' +
                'white-space:nowrap;' +
            '}' +

            '.utopia-header__original{' +
                'font-size:.85em;' +
                'opacity:.55;' +
                'margin-top:.25em;' +
                'overflow:hidden;' +
                'text-overflow:ellipsis;' +
                'white-space:nowrap;' +
            '}' +

            '.utopia-header__meta{' +
                'font-size:.82em;' +
                'opacity:.55;' +
                'margin-top:.35em;' +
            '}' +

            '.utopia-header__actions{' +
                'display:flex;' +
                'align-items:center;' +
                'gap:.55em;' +
                'flex-wrap:wrap;' +
                'flex-shrink:0;' +
            '}' +

            '.utopia-action{' +
                'display:flex;' +
                'align-items:center;' +
                'justify-content:center;' +
                'padding:.55em .9em;' +
                'border-radius:.6em;' +
                'background:rgba(255,255,255,.08);' +
                'border:1px solid rgba(255,255,255,.12);' +
                'font-size:1.6em;' +
                'white-space:nowrap;' +
                'box-sizing:border-box;' +
            '}' +

            '.utopia-sort-btn,' +
            '.utopia-portrait-back{' +
                'background:#3a3a3a;' +
                'border-color:#5a5a5a;' +
            '}' +

            '.utopia-sort-btn.focus,' +
            '.utopia-portrait-back.focus{' +
                'background:#565656;' +
                'border-color:rgba(255,255,255,.75);' +
            '}' +

            '.utopia-movie{' +
                'display:flex;' +
                'flex-direction:column;' +
                'box-sizing:border-box;' +
                'min-width:0;' +
                'height:100%;' +
                'overflow-y:auto;' +
                'overflow-x:hidden;' +
                'padding:.3em .8em .8em 0;' +
                'touch-action: pan-y;' +
                'overscroll-behavior: contain;' +
            '}' +

            '.utopia-movie__top{' +
                'display:flex;' +
                'align-items:flex-start;' +
                'gap:.8em;' +
                'width:100%;' +
                'box-sizing:border-box;' +
            '}' +

            '.utopia-movie__poster{' +
                'flex:0 0 8em;' +
                'width:8em;' +
                'height:12em;' +
                'overflow:hidden;' +
                'border-radius:.25em;' +
                'background:rgba(255,255,255,.05);' +
            '}' +

            '.utopia-movie__poster.focus{' +
                'outline:.2em solid rgba(255,255,255,.85);' +
                'outline-offset:-.2em;' +
            '}' +

            '.utopia-movie__poster-img{' +
                'display:block;' +
                'width:100%;' +
                'height:100%;' +
                'object-fit:cover;' +
            '}' +

            '.utopia-movie__details{' +
                'flex:1;' +
                'min-width:0;' +
                'padding-top:.1em;' +
            '}' +

            '.utopia-movie__year,' +
            '.utopia-movie__country,' +
            '.utopia-movie__rating,' +
            '.utopia-movie__imdb,' +
            '.utopia-movie__pg{' +
                'font-size:1.22em;' +
                'color:#FFFFFF;' +
                'line-height:1.45;' +
                'opacity:1;' +
            '}' +

            '.utopia-movie__rating,' +
            '.utopia-movie__imdb{' +
                'margin-top:.35em;' +
            '}' +

            '.utopia-movie__pg{' +
                'margin-top:.35em;' +
            '}' +

            '.utopia-movie__title{' +
                'font-size:2.25em;' +
                'color:#FFFFFF;' +
                'font-weight:700;' +
                'line-height:1.25;' +
                'margin-top:1em;' +
            '}' +

            '.utopia-movie__genres{' +
                'font-size:1.22em;' +
                'color:#FFFFFF;' +
                'line-height:1.4;' +
                'opacity:.65;' +
                'margin-top:.45em;' +
            '}' +

            '.utopia-movie__overview{' +
                'font-size:1.22em;' +
                'color:#FFFFFF;' +
                'line-height:1.45;' +
                'opacity:1;' +
                'margin-top:1.2em;' +
                'padding-bottom:1em;' +
            '}' +

            '.utopia-list{' +
                'display:flex;' +
                'flex-direction:column;' +
                'gap:.7em;' +
            '}' +

            '.utopia-item{' +
                'position:relative;' +
                'display:flex;' +
                'align-items:center;' +
                'justify-content:space-between;' +
                'gap:1em;' +
                'padding:1em 1.15em;' +
                'border-radius:.7em;' +
                'background:rgba(255,255,255,.015);' +
                'border:1px solid rgba(255,255,255,.07);' +
                'box-sizing:border-box;' +
                'user-select:none;' +
                'width:98%;' +
                'align-self:center;' +
            '}' +

            '@keyframes utopia-bounce{' +
                '0%{transform:translateY(0) scale(1);}' +
                '30%{transform:translateY(-.45em) scale(1.02);}' +
                '55%{transform:translateY(.12em) scale(.995);}' +
                '80%{transform:translateY(-.08em) scale(1.005);}' +
                '100%{transform:translateY(0) scale(1);}' +
            '}' +

            '.utopia-item.focus{' +
                'background:rgba(255,255,255,.065);' +
                'border-color:rgba(255,255,255,.75);' +
                'animation:utopia-bounce .35s ease-out;' +
            '}' +

            '.utopia-item__left{' +
                'flex:1;' +
                'min-width:0;' +
            '}' +

            '.utopia-item__movie{' +
                'font-weight:600;' +
                'font-size:1.85em;' +
                'line-height:1.3;' +
                'margin-bottom:.2em;' +
                'overflow:hidden;' +
                'text-overflow:ellipsis;' +
                'white-space:nowrap;' +
            '}' +

            '.utopia-item__title{' +
                'font-size:1.27em;' +
                'opacity:.58;' +
                'line-height:1.3;' +
                'margin-bottom:.3em;' +
                'overflow:hidden;' +
                'text-overflow:ellipsis;' +
                'white-space:nowrap;' +
            '}' +

            '.utopia-item__meta{' +
                'font-size:1.16em;' +
                'opacity:.45;' +
            '}' +

            '.utopia-item__badges{' +
                'display:flex;' +
                'align-items:center;' +
                'gap:.7em;' +
                'white-space:nowrap;' +
                'flex-shrink:0;' +
                'font-size:1.2em;' +
                'font-weight:600;' +
            '}' +

            '.utopia-badge{' +
                'display:inline-flex;' +
                'align-items:center;' +
                'gap:.2em;' +
            '}' +

            '.utopia-badge--good{color:#7fcf8a;}' +
            '.utopia-badge--mid{color:#d6b85c;}' +
            '.utopia-badge--bad{color:#c96b6b;}' +

            '.utopia-more{' +
                'display:flex;' +
                'align-items:center;' +
                'justify-content:center;' +
                'padding:1em;' +
                'margin:.3em 0 1em;' +
                'border-radius:.7em;' +
                'background:rgba(255,255,255,.05);' +
                'border:1px solid rgba(255,255,255,.07);' +
                'font-size:.9em;' +
                'font-weight:600;' +
            '}' +

            '.utopia-more.focus{' +
                'background:rgba(255,255,255,.08);' +
                'border-color:rgba(255,255,255,.75);' +
            '}' +

            '.utopia-state{' +
                'display:flex;' +
                'flex-direction:column;' +
                'align-items:center;' +
                'justify-content:center;' +
                'text-align:center;' +
                'padding:4em 1.5em;' +
                'opacity:.9;' +
            '}' +

            '.utopia-state__icon{' +
                'font-size:2.2em;' +
                'line-height:1;' +
                'margin-bottom:.55em;' +
                'opacity:.8;' +
            '}' +

            '.utopia-state__title{' +
                'font-size:1.1em;' +
                'font-weight:600;' +
                'margin-bottom:.35em;' +
            '}' +

            '.utopia-state__text{' +
                'max-width:42em;' +
                'font-size:.88em;' +
                'line-height:1.45;' +
                'opacity:.55;' +
                'margin-bottom:1.1em;' +
            '}' +

            '@media screen and (orientation:portrait){' +
                '.utopia-movie{' +
                    'display:none;' +
                '}' +

                '.utopia-portrait-back,' +
                '.utopia-sort-btn{' +
                    'font-size:1.5em;' +
                '}' +

                '.utopia-wrap{' +
                    'height:100%;' +
                    'min-height:0;' +
                    'overflow-y:auto;' +
                    'overflow-x:hidden;' +
                    'touch-action:pan-y;' +
                    'overscroll-behavior:contain;' +
                    '-webkit-mask-image:linear-gradient(to bottom,rgba(0,0,0,0) 0,rgba(0,0,0,.5) .4em,#000 .8em);' +
                    'mask-image:linear-gradient(to bottom,rgba(0,0,0,0) 0,rgba(0,0,0,.5) .4em,#000 .8em);' +
                '}' +

                '.utopia-header{' +
                    'flex-shrink:0;' +
                    'margin-top:0;' +
                    'justify-content:flex-start;' +
                    'padding-left:1%;' +
                    'padding-bottom:1em;' +
                '}' +

                '.utopia-list{' +
                    'flex-shrink:0;' +
                '}' +
            '}' +

            '@media screen and (orientation:landscape){' +
                '.utopia-wrap{' +
                    'display:grid;' +
                    'grid-template-columns:minmax(0,30%) minmax(0,1fr);' +
                    'grid-template-rows:auto minmax(0,1fr);' +
                    'column-gap:1.2em;' +
                    'height:100%;' +
                    'min-height:0;' +
                    'box-sizing:border-box;' +
                    'align-items:stretch;' +
                '}' +

                '.utopia-header{' +
                    'grid-column:2;' +
                    'grid-row:1;' +
                    'min-width:0;' +
                    'justify-content:flex-start;' +
                    'padding-left:1%;' +
                    'padding-top:0;' +
                    'padding-bottom:1em;' +
                    'position:relative;' +
                    'z-index:2;' +
                    'top:-.5em;' +
                '}' +

                '.utopia-header__info{' +
                    'display:none;' +
                '}' +

                '.utopia-movie{' +
                    'grid-column:1;' +
                    'grid-row:1 / span 2;' +
                    'display:flex;' +
                    'height:100%;' +
                    'min-height:0;' +
                    'overflow-y:auto;' +
                    'overflow-x:hidden;' +
                '}' +

                '.utopia-movie__top{' +
                    'width:100%;' +
                '}' +

                '.utopia-movie__poster{' +
                    'flex:0 0 7.5em;' +
                    'width:7.5em;' +
                    'height:11.25em;' +
                '}' +

                '.utopia-list{' +
                    'grid-column:2;' +
                    'grid-row:2;' +
                    'min-width:0;' +
                    'min-height:0;' +
                    'height:auto;' +
                    'overflow-y:auto;' +
                    'overflow-x:hidden;' +
                    'touch-action: pan-y;' +
                    'overscroll-behavior: contain;' +
                    'margin-top:-3em;' +
                    'padding-top:3em;' +
                    'padding-bottom:1.8em;' +
                    '-webkit-mask-image:linear-gradient(to bottom,rgba(0,0,0,0) 0,rgba(0,0,0,.25) 1em,rgba(0,0,0,.55) 2em,#000 3em,#000 calc(100% - 1.8em),rgba(0,0,0,.55) calc(100% - 1.2em),rgba(0,0,0,.35) calc(100% - .6em),rgba(0,0,0,0) 100%);' +
                    'mask-image:linear-gradient(to bottom,rgba(0,0,0,0) 0,rgba(0,0,0,.25) 1em,rgba(0,0,0,.55) 2em,#000 3em,#000 calc(100% - 1.8em),rgba(0,0,0,.55) calc(100% - 1.2em),rgba(0,0,0,.35) calc(100% - .6em),rgba(0,0,0,0) 100%);' +
                '}' +

                '.utopia-portrait-back{' +
                    'display:none !important;' +
                '}' +
            '}' +
            
            '@media screen and (max-width:600px){' +
                '.utopia-wrap{' +
                    'padding:.8em .8em 0;' +
                '}' +

                '.utopia-item{' +
                    'padding:.9em 1em;' +
                '}' +

                '.utopia-item__badges{' +
                    'font-size:1.1em;' +
                    'gap:.45em;' +
                '}' +
            '}';

        var style = document.createElement('style');
        style.id = 'utopia-styles';
        style.type = 'text/css';
        style.appendChild(document.createTextNode(css));
        document.head.appendChild(style);
    }

    // =========================================================
    // 1. Сховище
    // =========================================================
    function getKey() {
        return Lampa.Storage.get('utopia_api_key', '');
    }
    function hasKey() {
        return !!getKey();
    }

    var keyField = {
        name: 'API ключ UTOPIA',
        description: ''
    };

    function maskKey(key) {
        key = String(key || '');
        if (!key) return 'не вказано';
        if (key.length <= 8) return '••••';
        return key.slice(0, 4) + '…' + key.slice(-4);
    }

    function escapeText(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function keyDescription() {
        return 'Ключ: ' + escapeText(maskKey(getKey())) + '<br>Версія плагіна: ' + VERSION;
    }

    function updateKeyDisplay() {
        keyField.description = keyDescription();

        try {
            var $el =$('[data-name="utopia_api_key_btn"], [data-param="utopia_api_key_btn"]');
            if ($el.length) {
                var $descr =$el.find('.settings-param__descr, .settings-param__descr-text');
                if ($descr.length)$descr.html(keyField.description);
            }
        } catch (e) {}
    }

    function backToSettings() {
        try { Lampa.Controller.toggle('settings_component'); } catch (e) {}
    }

    function applyApiKey(key) {
        Lampa.Storage.set('utopia_api_key', key);
        updateKeyDisplay();
        if (key) verifyKey(key);
        backToSettings();
    }

    function askApply(key) {
        setTimeout(function () {
            Lampa.Select.show({
                title: 'API ключ UTOPIA',
                items: [
                    { title: key ? '✅ Застосувати: ' + maskKey(key) : '✅ Видалити ключ', action: 'apply' },
                    { title: '✖ Скасувати', action: 'cancel' }
                ],
                onSelect: function (item) {
                    if (item.action === 'apply') applyApiKey(key);
                    else backToSettings();
                },
                onBack: function ()
