(function () {
    'use strict';

    if (window.UTOPIA_PLUGIN) return;
    window.UTOPIA_PLUGIN = true;

    var API_BASE = 'https://utp.to/api';
    var PER_PAGE = 99;
    var VERSION = 'v0.9.30 build 1329';

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
    //
    // UTOPIA не завжди дає готовий magnet - часто натомість дає
    // посилання на завантаження самого .torrent-файлу. Щоб все одно
    // відкрити його одним кліком (без ручного скачування), тут:
    // 1) вручну розбираємо bencode-структуру .torrent файлу,
    //    щоб знайти РІВНО ті байти, де лежить секція "info";
    // 2) рахуємо SHA-1 від цих байтів - це і є справжній BTIH-хеш;
    // 3) збираємо з нього робочий magnet-рядок.
    // SHA-1 порахований власноруч (не через Web Crypto), бо
    // crypto.subtle іноді недоступний у не-https/file:// оточенні.
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

    // Качаємо .torrent-файл ЧЕРЕЗ ТОЙ САМИЙ механізм, що вже успішно
    // обходить CORS для звичайних JSON-запитів (Lampa.Reguest().native()) -
    // звичайний XMLHttpRequest, як з'ясувалось, CORS не обходить.
    // native() віддає відповідь як звичайний РЯДОК (як і для JSON), тому
    // переводимо кожен символ назад у байт (код символу як є, без UTF-8).
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

        /* Картка фільму */

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

        /* Торренти */
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

        /* Portrait */
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

        /* Landscape */
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

    // =========================================================
    // 2. Налаштування
    // =========================================================
    function initSettings() {
        Lampa.SettingsApi.addComponent({
            component: 'utopia',
            name: 'UTOPIA',
            icon:
        '<svg width="1.5em" height="1.5em" viewBox="0 0 64 64" ' +
        'xmlns="http://www.w3.org/2000/svg" ' +
        'style="display:block;flex-shrink:0;">' +
            '<image href="https://raw.githubusercontent.com/yakutza82/lampa-utopia/refs/heads/main/pngegg2wh.png" ' +
            'x="0" y="0" width="64" height="64" />' +
        '</svg>'
        });

        Lampa.SettingsApi.addParam({
            component: 'utopia',
            param: { name: 'utopia_api_key', type: 'input', values: '', default: '' },
            field: {
                name: 'API ключ UTOPIA',
                description: 'Вставте ключ доступу до utp.to. Версія плагіна: ' + VERSION
            },
            onChange: function (value) {
                var key = (value || '').trim();
                Lampa.Storage.set('utopia_api_key', key);
                if (key) verifyKey(key);
            }
        });
    }

    function verifyKey(key) {
        Lampa.Noty.show('UTOPIA: перевіряю ключ...');
        request('test', 1, function () {
            Lampa.Noty.show(String.fromCharCode(0x2705) + ' UTOPIA: ключ робочий, звязок є');
        }, function (code) {
            Lampa.Noty.show(String.fromCharCode(0x26A0) + ' UTOPIA: ' + errorMessage(code));
        });
    }

    // =========================================================
    // 3. Кеш
    // =========================================================
    var CACHE = {};
    var CACHE_TTL = 10 * 60 * 1000;

    function cacheKey(query, page) {
        return String(query).toLowerCase() + '::' + page;
    }

    function getFromCache(query, page) {
        var entry = CACHE[cacheKey(query, page)];
        if (!entry) return null;
        if (Date.now() - entry.time > CACHE_TTL) return null;
        return entry.data;
    }

    function saveToCache(query, page, data) {
        CACHE[cacheKey(query, page)] = { data: data, time: Date.now() };
    }

    // =========================================================
    // 4. Глибокий пошук та збірка Magnet
    // =========================================================
    function parseArrayFromData(data) {
        if (!data) return [];
        if (Array.isArray(data)) return data;
        if (Array.isArray(data.data)) return data.data;
        if (Array.isArray(data.results)) return data.results;
        if (Array.isArray(data.torrents)) return data.torrents;
        if (Array.isArray(data.items)) return data.items;
        if (data.data && Array.isArray(data.data.data)) return data.data.data;
        return [];
    }

    function deepFind(obj, keys) {
        if (!obj || typeof obj !== 'object') return null;
        for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') {
                return obj[k];
            }
        }
        for (var p in obj) {
            if (obj.hasOwnProperty(p) && typeof obj[p] === 'object' && obj[p] !== null) {
                var res = deepFind(obj[p], keys);
                if (res !== null) return res;
            }
        }
        return null;
    }

    function normalizeItem(raw) {
        if (!raw || typeof raw !== 'object') return {};

        // Реальна структура відповіді UTOPIA: { type: "torrent", id: "...", attributes: {...} }
        var attrs = (raw.attributes && typeof raw.attributes === 'object') ? raw.attributes : raw;

        var name = attrs.name || deepFind(raw, ['name', 'title', 'filename']) || 'Без назви';
        var size = attrs.size != null ? attrs.size : (deepFind(raw, ['size']) || 0);
        var seeds = attrs.seeders != null ? attrs.seeders : (deepFind(raw, ['seeders', 'seeds']) || 0);
        var peers = attrs.leechers != null ? attrs.leechers : (deepFind(raw, ['leechers', 'peers']) || 0);
        var releaseYear = attrs.release_year || null;

        var magnet = '';
        var isDirect = false;

        if (typeof attrs.magnet_link === 'string' && attrs.magnet_link.indexOf('magnet:') === 0) {
            magnet = attrs.magnet_link;
        } else if (attrs.download_link) {
            magnet = attrs.download_link;
            isDirect = true;
        } else {
            // Запасний варіант: будь-яке поле з "download"/"magnet" у назві,
            // значення якого схоже на посилання.
            for (var key in attrs) {
                if (!attrs.hasOwnProperty(key) || !/download|magnet/i.test(key)) continue;
                var v = attrs[key];
                if (typeof v === 'string' && v.indexOf('magnet:') === 0) { magnet = v; break; }
                if (typeof v === 'string' && /^https?:\/\//.test(v)) { magnet = v; isDirect = true; break; }
            }
        }

        return {
            name: String(name),
            size: parseFloat(size) || 0,
            seeds: parseInt(seeds, 10) || 0,
            peers: parseInt(peers, 10) || 0,
            magnet: magnet || '',
            isDirect: isDirect,
            releaseYear: releaseYear,
            tmdbId: attrs.tmdb_id || null,
            category: attrs.category || '',
            tmdbName: '',
            __raw: raw
        };
    }

    function sendRequest(url, headers, onSuccess, onError) {
        var network = new Lampa.Reguest();
        network.timeout(15000);

        network.native(url, function (response) {
            var data = response;
            if (typeof response === 'string') {
                try { data = JSON.parse(response); } catch (e) {}
            }
            if (data) {
                onSuccess(data);
            } else {
                if (onError) onError('parse_error');
            }
        }, function (xhr) {
            var status = xhr ? xhr.status : 0;
            if (status === 401) onError('unauthorized');
            else if (status === 403) onError('forbidden');
            else onError(status === 0 ? 'network' : 'http_' + status);
        }, false, { headers: headers });
    }

    function request(query, page, onSuccess, onError) {
        page = page || 1;
        var cached = getFromCache(query, page);
        if (cached) {
            onSuccess(cached, true);
            return;
        }

        var key = getKey();
        if (!key) {
            if (onError) onError('no_key');
            return;
        }

        var cleanKey = encodeURIComponent(key);
        var targetUrl = API_BASE + '/torrents/filter' +
                        '?name=' + encodeURIComponent(query) +
                        '&perPage=' + PER_PAGE +
                        '&page=' + page +
                        '&api_key=' + cleanKey +
                        '&token=' + cleanKey;

        var headers = {
            'Authorization': 'Bearer ' + key,
            'Accept': 'application/json'
        };

        sendRequest(targetUrl, headers, function (data) {
            var items = parseArrayFromData(data).map(normalizeItem);
            saveToCache(query, page, items);
            onSuccess(items, false);
        }, function (errCode) {
            if (errCode === 'network' || errCode === 'forbidden') {
                var proxy1 = 'https://corsproxy.io/?' + encodeURIComponent(targetUrl);
                sendRequest(proxy1, {}, function (data) {
                    var items = parseArrayFromData(data).map(normalizeItem);
                    saveToCache(query, page, items);
                    onSuccess(items, false);
                }, function () {
                    var proxy2 = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(targetUrl);
                    sendRequest(proxy2, {}, function (data) {
                        var items = parseArrayFromData(data).map(normalizeItem);
                        saveToCache(query, page, items);
                        onSuccess(items, false);
                    }, onError);
                });
            } else {
                if (onError) onError(errCode);
            }
        });
    }

    // =========================================================
    // 5. Допоміжні функції
    // =========================================================
    function formatSize(bytes) {
        if (!bytes) return '';
        var units = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'];
        var i = 0;
        var n = parseFloat(bytes);
        while (n >= 1024 && i < units.length - 1) {
            n /= 1024;
            i++;
        }
        return n.toFixed(1) + ' ' + units[i];
    }

    function badge(value, icon) {
    var n = parseInt(value, 10);

    if (isNaN(n)) {
        return '<span class="utopia-badge" style="opacity:.4;">' +
            icon + ' ?' +
        '</span>';
    }

    var cls = n >= 10
        ? 'utopia-badge--good'
        : (n >= 1 ? 'utopia-badge--mid' : 'utopia-badge--bad');

    return '<span class="utopia-badge ' + cls + '">' +
        icon + ' ' + n +
    '</span>';
}

    function errorMessage(code) {
        var map = {
            no_key: 'Спочатку вкажіть API ключ у налаштуваннях плагіна UTOPIA.',
            unauthorized: 'Неправильний API ключ (401). Перевірте його в налаштуваннях.',
            forbidden: 'Заблоковано сервером/браузером (403 або CORS).',
            parse_error: 'Сервер повернув некоректну відповідь.',
            network: 'Помилка мережі або CORS (заблоковано сервером/браузером).',
            timeout: 'Сервер не відповів вчасно.'
        };
        return map[code] || ('Сталася помилка (' + code + ').');
    }

    function sortItems(items, mode) {
        var arr = items.slice();
        if (mode === 'seeds') {
            arr.sort(function (a, b) { return b.seeds - a.seeds; });
        } else if (mode === 'size_desc') {
            arr.sort(function (a, b) { return (parseFloat(b.size) || 0) - (parseFloat(a.size) || 0); });
        } else if (mode === 'size_asc') {
            arr.sort(function (a, b) { return (parseFloat(a.size) || 0) - (parseFloat(b.size) || 0); });
        }
        return arr;
    }

    var SORT_LABELS = {
        default: 'За релевантністю',
        seeds: 'Спочатку більше сідів',
        size_desc: 'Спочатку більший розмір',
        size_asc: 'Спочатку менший розмір'
    };

    // Компактний опис торента для дебагу: список полів + усе, що схоже
    // на посилання. Вміщається на екран і не залежить від розміру опису.
    function summarizeItem(item) {
        var attrs = (item.__raw && item.__raw.attributes) || {};
        var links = {};
        for (var k in attrs) {
            if (attrs.hasOwnProperty(k) && /link|magnet|hash|download|url/i.test(k)) links[k] = attrs[k];
        }
        return { id: item.__raw && item.__raw.id, name: item.name, attributeKeys: Object.keys(attrs), linkFields: links };
    }

    // =========================================================
    // 6. Компонент екрана
    // =========================================================
    function TorrentsComponent(object) {
        var scroll = new Lampa.Scroll({ mask: true, over: true, step: 200 });
        var wrap = $('<div class="utopia-wrap"></div>');
       var header = $(
    '<div class="utopia-header">' +

        '<div class="utopia-header__info">' +
            '<div class="utopia-header__title"></div>' +
            '<div class="utopia-header__original"></div>' +
            '<div class="utopia-header__meta"></div>' +
        '</div>' +

        '<div class="utopia-header__actions">' +

            '<div class="utopia-action selector utopia-portrait-back">' +
                '\ud83d\udcc4' +
            '</div>' +

            '<div class="utopia-action selector utopia-sort-btn">' +
                '\u2195 Сортування' +
            '</div>' +

            '<div class="utopia-action selector utopia-debug-btn" style="display:none;">' +
                '\ud83d\udc1e Діагностика' +
            '</div>' +

        '</div>' +

    '</div>'
);
var moviePanel = $(
    '<div class="utopia-movie">' +

        '<div class="utopia-movie__top">' +

            '<div class="utopia-movie__poster selector">' +
                '<img class="utopia-movie__poster-img" />' +
            '</div>' +

            '<div class="utopia-movie__details">' +
                '<div class="utopia-movie__year"></div>' +
                '<div class="utopia-movie__country"></div>' +
                '<div class="utopia-movie__rating"></div>' +
                '<div class="utopia-movie__imdb"></div>' +
                '<div class="utopia-movie__pg"></div>' +
            '</div>' +

        '</div>' +

        '<div class="utopia-movie__title"></div>' +
        '<div class="utopia-movie__genres"></div>' +
        '<div class="utopia-movie__overview"></div>' +

    '</div>'
);

        var listBox = $('<div class="utopia-list"></div>');
        var page = 1;
        var items = [];
        var sortMode = 'default';
        var loading = false;
        var moreButtonEl = null;
        function renderMoviePanel() {
    var movie = object.movie || {};

    var title = movie.title || movie.name || '';

    var year = '';
    if (movie.release_date) {
        year = String(movie.release_date).slice(0, 4);
    } else if (movie.first_air_date) {
        year = String(movie.first_air_date).slice(0, 4);
    }

        var countries = '';
    try {
        var tmdbApi = Lampa.Api && Lampa.Api.sources && Lampa.Api.sources.tmdb;
        if (tmdbApi && typeof tmdbApi.parseCountries === 'function') {
            countries = tmdbApi.parseCountries(movie).join(', ');
        }
    } catch (e) {}

    if (!countries && Array.isArray(movie.production_countries)) {
        countries = movie.production_countries
            .map(function (c) { return c && c.name ? c.name : ''; })
            .filter(Boolean)
            .join(', ');
    }

    var rating = '';
    if (movie.vote_average) {
        rating = Math.round(Number(movie.vote_average) * 10) + '%';
    }

    var imdb = '';
    var imdbValue = parseFloat(movie.imdb_rating);
    if (imdbValue) {
        imdb = imdbValue.toFixed(1);
    }

        var pg = '';
    try {
        var tmdbApi2 = Lampa.Api && Lampa.Api.sources && Lampa.Api.sources.tmdb;
        if (tmdbApi2 && typeof tmdbApi2.parsePG === 'function') {
            pg = tmdbApi2.parsePG(movie) || '';
        }
    } catch (e) {}

    var genres = '';
    if (Array.isArray(movie.genres)) {
        genres = movie.genres
            .slice(0, 5)
            .map(function (genre) {
                return genre && genre.name
                    ? genre.name
                    : String(genre || '');
            })
            .filter(Boolean)
            .join(', ');
    }

    moviePanel.find('.utopia-movie__title').text(title);
    moviePanel.find('.utopia-movie__year').text(year);
    moviePanel.find('.utopia-movie__country').text(countries);
    moviePanel.find('.utopia-movie__rating').text(
        rating ? 'TMDb ' + rating : ''
    );
    moviePanel.find('.utopia-movie__imdb').text(
        imdb ? 'IMDb ★ ' + imdb : ''
    );
    moviePanel.find('.utopia-movie__pg').text(pg);
    moviePanel.find('.utopia-movie__genres').text(genres);
    moviePanel.find('.utopia-movie__overview').text(
        movie.overview || ''
    );

    /*
     * Lampa у повній картці вже формує готове поле img.
     * Використовуємо його в першу чергу.
     */
    var posterUrl = movie.img || movie.poster || movie.poster_path || '';

    if (posterUrl) {
        moviePanel
            .find('.utopia-movie__poster-img')
            .attr('src', posterUrl)
            .show();
    } else {
        moviePanel
            .find('.utopia-movie__poster-img')
            .hide();
    }
}

            var primaryQuery = object.search;
        var altQuery = (object.search_original &&
            String(object.search_original).toLowerCase() !== String(primaryQuery).toLowerCase())
            ? object.search_original
            : '';
        var query = altQuery || primaryQuery;
        var usedAlt = false;

        injectStyles();

        function bindScrollFollow(el) {
            el.on('hover:focus', function (e) {
                var node = $(e.target);
                var box = node.parent();

                while (box.length && box[0] !== document.body) {
                    var overflowY = box.css('overflow-y');
                    if ((overflowY === 'auto' || overflowY === 'scroll') &&
                        box[0].scrollHeight > box[0].clientHeight + 1) break;
                    box = box.parent();
                }

                if (!box.length || box[0] === document.body) return;

                var fontSize = parseFloat(box.css('font-size')) || 16;
                var padTop = fontSize * 5;
                var padBottom = fontSize * 3.8;
                var boxRect = box[0].getBoundingClientRect();
                var nodeRect = node[0].getBoundingClientRect();
                var target = box.scrollTop();

                if (nodeRect.top < boxRect.top + padTop) {
                    target += nodeRect.top - (boxRect.top + padTop);
                } else if (nodeRect.bottom > boxRect.bottom - padBottom) {
                    target += nodeRect.bottom - (boxRect.bottom - padBottom);
                } else {
                    return;
                }

                box.stop(true).animate({ scrollTop: target }, 350);
            });
            return el;
        }

        // Готує дані для показу в дебаг-екрані: обрізає задовгі текстові
        // поля (типу media_info/description, які бувають на кілька тисяч
        // символів), щоб textarea не гальмувала й не "вішала" WebView.
        function truncateForDebug(value, depth) {
            depth = depth || 0;
            if (depth > 6) return '(...)';
            if (typeof value === 'string') {
                return value.length > 1500 ? value.slice(0, 1500) + '... (обрізано, всього ' + value.length + ' символів)' : value;
            }
            if (Array.isArray(value)) {
                return value.slice(0, 20).map(function (v) { return truncateForDebug(v, depth + 1); });
            }
            if (value && typeof value === 'object') {
                var out = {};
                for (var k in value) {
                    if (value.hasOwnProperty(k)) out[k] = truncateForDebug(value[k], depth + 1);
                }
                return out;
            }
            return value;
        }

        function showDebugModal(title, data) {
    var jsonText;

    try {
        jsonText = typeof data === 'string'
            ? data
            : JSON.stringify(data, null, 2);
    } catch (e) {
        jsonText = String(data);
    }

    var modal = $(
        '<div class="utopia-debug-modal">' +
            '<textarea class="utopia-debug-textarea" readonly></textarea>' +
            '<div class="utopia-debug-actions">' +
                '<div class="utopia-action selector utopia-debug-copy">📋 Скопіювати</div>' +
                '<div class="utopia-action selector utopia-debug-close">Закрити</div>' +
            '</div>' +
        '</div>'
    );

    modal.find('.utopia-debug-textarea').val(jsonText);

    var copyButton = modal.find('.utopia-debug-copy');
    var closeButton = modal.find('.utopia-debug-close');

    function copyText() {
        function success() {
            Lampa.Noty.show('UTOPIA: скопійовано');
        }

        function fallback() {
            try {
                var textarea = modal.find('.utopia-debug-textarea')[0];

                textarea.focus();
                textarea.select();
                textarea.setSelectionRange(0, textarea.value.length);

                var ok = document.execCommand('copy');

                if (ok) {
                    success();
                } else {
                    Lampa.Noty.show('UTOPIA: не вдалося скопіювати');
                }
            } catch (e) {
                Lampa.Noty.show('UTOPIA: не вдалося скопіювати');
            }
        }

        try {
            if (
                Lampa.Utils &&
                typeof Lampa.Utils.copyTextToClipboard === 'function'
            ) {
                Lampa.Utils.copyTextToClipboard(
                    jsonText,
                    success,
                    fallback
                );
                return;
            }
        } catch (e) {}

        fallback();
    }

    copyButton.on('click hover:enter', copyText);

    closeButton.on('click hover:enter', function () {
        Lampa.Modal.close();
        Lampa.Controller.toggle('content');
    });

    Lampa.Modal.open({
        title: title + ' [' + VERSION + ']',
        html: modal,
        size: 'medium',
        scroll_to_center: true,
        select: copyButton,
        onBack: function () {
            Lampa.Modal.close();
            Lampa.Controller.toggle('content');
        }
    });
}

        this.create = function () {
            header.find('.utopia-header__title')
                .text(primaryQuery)
                .css({ 'font-size': '1.3em', 'font-weight': '700', 'opacity': '1', 'display': 'block' });

            if (altQuery) {
                header.find('.utopia-header__original')
                    .text(altQuery)
                    .css({ 'font-size': '0.85em', 'opacity': '0.6', 'margin-top': '0.2em', 'display': 'block' });
            } else {
                header.find('.utopia-header__original').hide();
            }

            bindScrollFollow(header.find('.utopia-sort-btn')).on('click hover:enter', showSortMenu);
                        var backBusy = false;
            bindScrollFollow(header.find('.utopia-portrait-back')).on('click hover:enter', function () {
                if (backBusy) return;
                backBusy = true;
                setTimeout(function () { backBusy = false; }, 600);

                Lampa.Activity.backward();
            });
            bindScrollFollow(header.find('.utopia-debug-btn')).on('click hover:enter', function () {
                showDebugModal('Дані картки фільму (object)', {
                    search: object.search,
                    search_original: object.search_original,
                    movie: object.movie
                });
            });

            wrap.on('touchstart touchmove touchend wheel mousewheel', function (e) {
                e.stopPropagation();
            });

                        var posterBusy = false;
            moviePanel.find('.utopia-movie__poster').on('click hover:enter', function () {
                if (posterBusy) return;
                posterBusy = true;
                setTimeout(function () { posterBusy = false; }, 600);

                Lampa.Activity.backward();
            });

            wrap.append(header);
            wrap.append(moviePanel);
            listBox.appendTo(wrap);

            renderMoviePanel();

            scroll.append(wrap);

            scroll.render().addClass('layer--wheight');
            return this.render();
        };

        this.render = function () { return scroll.render(); };

        this.start = function () {
            if (Lampa.Activity.active().activity !== this.activity) return;
            if (!hasKey()) {
                renderNoKeyState();
                return;
            }
            if (!items.length) loadPage(1);

            Lampa.Controller.add('content', {
                    toggle: function () {
                    Lampa.Controller.collectionSet(scroll.render());
                    var firstVisible = scroll.render().find('.selector').filter(':visible').first();
                    Lampa.Controller.collectionFocus(firstVisible.length ? firstVisible[0] : false, scroll.render());
                },
                                up: function () {
                    var focused = listBox.find('.selector.focus');
                    var prev = focused.length ? focused.prev('.selector') : $();
                    if (prev.length) {
                        Lampa.Controller.collectionFocus(prev[0], scroll.render());
                        return;
                    }
                    if (Navigator.canmove('up')) { Navigator.move('up'); return; }
                    try { Lampa.Controller.toggle('head'); } catch (e) {}
                },
                down: function () { Navigator.move('down'); },
                left: function () {
                    if (Navigator.canmove('left')) Navigator.move('left');
                    else Lampa.Controller.toggle('menu');
                },
                right: function () { Navigator.move('right'); },
                back: function () { Lampa.Activity.backward(); }
            });
            Lampa.Controller.toggle('content');
        };

        function setMeta(text) {
            header.find('.utopia-header__meta').text(text);
        }

        function renderNoKeyState() {
            listBox.empty();
            listBox.append(
                $('<div class="utopia-state">' +
                '<div class="utopia-state__icon">\ud83d\udd11</div>' +
                '<div class="utopia-state__title">Ключ не вказано</div>' +
                '<div class="utopia-state__text">Щоб шукати торренти на UTOPIA, спочатку додайте API ключ у налаштуваннях плагіна.</div>' +
                '</div>')
            );
        }

        function renderErrorState(code) {
            listBox.empty();
            var box = $(
                '<div class="utopia-state">' +
                '<div class="utopia-state__icon">\u26a0\ufe0f</div>' +
                '<div class="utopia-state__title">Не вдалося завантажити результати</div>' +
                '<div class="utopia-state__text"></div>' +
                '<div class="utopia-btn selector utopia-retry">Спробувати ще раз</div>' +
                '</div>'
            );
            box.find('.utopia-state__text').text(errorMessage(code));
            bindScrollFollow(box.find('.utopia-retry')).on('click hover:enter', function () {
                loadPage(page || 1);
            });
            listBox.append(box);
            Lampa.Controller.enable('content');
        }

        function renderEmptyState() {
            listBox.empty();
            listBox.append(
                $('<div class="utopia-state">' +
                '<div class="utopia-state__icon">\ud83d\udd0d</div>' +
                '<div class="utopia-state__title">Нічого не знайдено</div>' +
                '<div class="utopia-state__text">Спробуй перевірити пізніше - можливо, підходящих роздач поки немає.</div>' +
                '</div>')
            );
        }

        function getFullMovieTitle(item) {
            var name = String(item.name || '').trim();
            var year = item.releaseYear ? String(item.releaseYear) : '';

            name = name.replace(/^[\s._-]+|[\s._-]+$/g, '');

            var match = name.match(
                /(?:^|[.\s_-])(?:19|20)\d{2}(?=[.\s_-]|$)|(?:^|[.\s_-])S\d{1,2}(?=[.\s_-]|$)|(?:^|[.\s_-])(?:2160p|1080p|720p|WEB-DL|WEBRip|BluRay|BDRip|HDRip)(?=[.\s_-]|$)/i
            );

            if (match && match.index !== undefined) {
                name = name.substring(0, match.index);
            }

            name = name.replace(/[._]+/g, ' ');
            name = name.replace(/\s+/g, ' ').trim();

            if (year) {
                name += ' (' + year + ')';
            }

            return name;
        }

        function showSortMenu() {
            var options = ['default', 'seeds', 'size_desc', 'size_asc'].map(function (mode) {
                return {
                    title: (mode === sortMode ? '\u2713 ' : '') + SORT_LABELS[mode],
                    mode: mode
                };
            });
            Lampa.Select.show({
                title: 'Сортування результатів',
                items: options,
                onSelect: function (selected) {
                    sortMode = selected.mode;
                    renderList();
                    Lampa.Controller.toggle('content');
                },
                onBack: function () {
                    Lampa.Controller.toggle('content');
                }
            });
        }

        function buildRow(item) {
            var row = $(
                '<div class="utopia-item selector">' +
                '<div class="utopia-item__left">' +
                '<div class="utopia-item__movie"></div>' +
                '<div class="utopia-item__title"></div>' +
                '<div class="utopia-item__meta"></div>' +
                '</div>' +
                '<div class="utopia-item__badges"></div>' +
                '</div>'
            );

            if (item.tmdbId && !item.tmdbName) {
                var tmdbType = item.category === 'TV' ? 'tv/' : 'movie/';

                Lampa.Api.sources.tmdb.get(tmdbType + item.tmdbId, { language: 'uk-UA' }, function (data) {
                    if (data && (data.title || data.name)) {
                        item.tmdbName = (data.title || data.name) + (item.releaseYear ? ' (' + item.releaseYear + ')' : '');
                        row.find('.utopia-item__movie').text(item.tmdbName);
                    }
                });
            }

            row.find('.utopia-item__movie').text(item.tmdbName || getFullMovieTitle(item));
            row.find('.utopia-item__title').text(item.name);
            row.find('.utopia-item__meta').text(item.size ? formatSize(item.size) : 'Розмір невідомий');
            row.find('.utopia-item__badges').html(badge(item.seeds, '\u25b2') + '&nbsp;&nbsp;' + badge(item.peers, '\u25bc'));

            // ВАЖЛИВО: клік має запускати відтворення, а не дебаг-екран -
            // дебаг лишається тільки як fallback усередині playTorrent,
            // коли справді нема ні magnet, ні download_link.
            row.on('click hover:enter', function () { chooseAction(item); });

            bindScrollFollow(row);
            return row;
        }

        // Копіює посилання на .torrent у буфер обміну одним натисканням.
        // Далі його вставляють у Transmission/Transdroid ("Add by URL"),
        // і клієнт сам завантажує файл. Якщо копіювання не вдалось -
        // показуємо вікно з посиланням, щоб скопіювати вручну.
        function copyLink(item) {
            var text = item.magnet;

            Lampa.Storage.set('utopia_last_torrent_url', text);

            function ok() {
                Lampa.Noty.show('UTOPIA: посилання скопійовано. Вставте його у додаток для торрентів (Add by URL)');
            }
            function fail() {
                showDebugModal('Скопіюй посилання вручну', text);
            }
            function fallbackCopy() {
                try {
                    var ta = document.createElement('textarea');
                    ta.value = text;
                    ta.style.position = 'fixed';
                    ta.style.opacity = '0';
                    document.body.appendChild(ta);
                    ta.focus();
                    ta.select();
                    var done = document.execCommand('copy');
                    document.body.removeChild(ta);
                    if (done) ok(); else fail();
                } catch (e) { fail(); }
            }

            try {
                if (Lampa.Utils && typeof Lampa.Utils.copyTextToClipboard === 'function') {
                    Lampa.Utils.copyTextToClipboard(text, ok, fail);
                    return;
                }
            } catch (e) {}
            fallbackCopy();
        }

function downloadTorrent(item) {
    var url = item && item.magnet
        ? item.magnet
        : Lampa.Storage.get('utopia_last_torrent_url', '');

    if (!url) {
        Lampa.Noty.show('UTOPIA: немає URL торента');
        return;
    }

    Lampa.Storage.set('utopia_last_torrent_url', url);

    if (
        typeof AndroidJS === 'undefined' ||
        typeof AndroidJS.openBrowser !== 'function'
    ) {
        Lampa.Noty.show('UTOPIA: завантаження недоступне');
        return;
    }

    try {
        AndroidJS.openBrowser(url);
    } catch (e) {
        console.error('[UTOPIA DOWNLOAD]', e);
        Lampa.Noty.show('UTOPIA: помилка завантаження');
    }
}

function showTorrentActionMenu(item) {
    var items = [
        {
            title: '📥 Завантажити .torrent',
            action: 'download'
        }
    ];

    // Transmission додаємо тільки якщо модуль існує
    // і має хоча б один налаштований профіль.
    if (
        window.UTOPIA_TRANSMISSION &&
        typeof window.UTOPIA_TRANSMISSION.isReady === 'function' &&
        window.UTOPIA_TRANSMISSION.isReady()
    ) {
        items.push({
            title: '📡 Відправити в Transmission',
            action: 'transmission'
        });
    }

    items.push(
        {
            title: '📋 Скопіювати посилання',
            action: 'copy'
        },
        {
            title: '❌ Скасувати',
            action: 'cancel'
        }
    );

    Lampa.Select.show({
        title: 'Торрент',
        items: items,

        onSelect: function (selected) {
            if (selected.action === 'download') {
                downloadTorrent(item);

            } else if (selected.action === 'transmission') {
    var url = item && item.magnet
        ? item.magnet
        : Lampa.Storage.get('utopia_last_torrent_url', '');

    if (
        window.UTOPIA_TRANSMISSION &&
        typeof window.UTOPIA_TRANSMISSION.showAddTorrent === 'function'
    ) {
        window.UTOPIA_TRANSMISSION.showAddTorrent(url);
    } else {
        Lampa.Noty.show(
            'UTOPIA: Transmission недоступний'
        );
    }

    return;

} else if (selected.action === 'copy') {
                copyLink(item);
            }

            Lampa.Controller.toggle('content');
        },

        onBack: function () {
            Lampa.Controller.toggle('content');
        }
    });
}

        function chooseAction(item) {
    if (item.isDirect && item.magnet) {
        showTorrentActionMenu(item);
    } else {
        playTorrent(item);
    }
}

        function playTorrent(item) {
            if (typeof item.magnet === 'string' && item.magnet.indexOf('magnet:') === 0) {
                Lampa.Torrent.play({ url: item.magnet, name: item.name });
                return;
            }

            if (!item.isDirect || !item.magnet) {
                showDebugModal('Немає magnet/download', summarizeItem(item));
                return;
            }

            Lampa.Loading.start('utopia_prepare', 'UTOPIA: готуємо торент...');

            var headers = { 'Authorization': 'Bearer ' + getKey() };

            fetchTorrentFileBytes(item.magnet, headers, function (buffer, rawText) {
                Lampa.Loading.stop('utopia_prepare');
                try {
                    var infoRange = findInfoDictRange(buffer);
                    if (!infoRange) throw new Error('не знайдено секцію info у .torrent файлі');

                    var infoBytes = new Uint8Array(buffer, infoRange.start, infoRange.end - infoRange.start);
                    var hashHex = sha1Hex(infoBytes);
                    var realMagnet = buildMagnetFromHash(hashHex, item.name);

                    Lampa.Torrent.play({ url: realMagnet, name: item.name });
                } catch (e) {
                    showDebugModal('Помилка розбору .torrent файлу', {
                        error: String(e),
                        byteLength: buffer ? buffer.byteLength : 0,
                        rawPreview: rawText ? rawText.slice(0, 300) : '',
                        download_link: item.magnet
                    });
                }
            }, function (code) {
                Lampa.Loading.stop('utopia_prepare');
                Lampa.Noty.show('UTOPIA: не вдалося завантажити .torrent файл - ' + errorMessage(code));
            });
        }

        function ensureMoreButton() {
            if (!moreButtonEl) {
                moreButtonEl = $('<div class="utopia-more selector">Показати ще \u2193</div>');
                bindScrollFollow(moreButtonEl).on('click hover:enter', function () {
                    if (!loading) loadPage(page + 1);
                });
            }
            return moreButtonEl;
        }

        function addMoreButtonIfNeeded() {
            if (items.length >= page * PER_PAGE) {
                listBox.append(ensureMoreButton());
            } else if (moreButtonEl) {
                moreButtonEl.remove();
                moreButtonEl = null;
            }
        }

        function updateMetaText(fromCache) {
            var metaSuffix = '';
            if (fromCache) metaSuffix = ' \u00b7 дані з кешу';
            else if (usedAlt) metaSuffix = ' \u00b7 за оригінальною назвою';
            if (sortMode !== 'default') metaSuffix += ' \u00b7 ' + SORT_LABELS[sortMode];
            setMeta('Знайдено: ' + items.length + metaSuffix);
        }

        function renderList() {
            listBox.empty();
            moreButtonEl = null;
            var sorted = sortItems(items, sortMode);
            sorted.forEach(function (item) {
                listBox.append(buildRow(item));
            });
            addMoreButtonIfNeeded();
            updateMetaText(false);
            Lampa.Controller.enable('content');
        }

        function appendRows(newItems) {
            newItems.forEach(function (item) {
                var row = buildRow(item);
                if (moreButtonEl) row.insertBefore(moreButtonEl);
                else listBox.append(row);
            });
            addMoreButtonIfNeeded();
            updateMetaText(false);
            Lampa.Controller.enable('content');
        }

        function loadPage(targetPage) {
            if (loading) return;
            loading = true;
            var isFirst = targetPage === 1;
            var previousCount = isFirst ? 0 : items.length;

            if (isFirst) {
                listBox.empty();
                setMeta('Пошук триває...');
                Lampa.Loading.start('utopia_search', 'UTOPIA: пошук...');
            } else {
                setMeta('Завантажую ще результати...');
                Lampa.Loading.start('utopia_search_more', 'UTOPIA: завантаження...');
            }

            request(query, targetPage, function (pageItems, fromCache) {
                loading = false;
                Lampa.Loading.stop('utopia_search');
                Lampa.Loading.stop('utopia_search_more');

                page = targetPage;
                if (isFirst) items = [];
                items = items.concat(pageItems);

                if (!items.length) {
                    if (isFirst && altQuery && !usedAlt) {
                        usedAlt = true;
                        query = altQuery;
                        loadPage(1);
                        return;
                    }
                    renderEmptyState();
                    return;
                }

                if (!isFirst && sortMode === 'default') {
                    appendRows(items.slice(previousCount));
                    if (fromCache) updateMetaText(true);
                } else {
                    renderList();
                    if (fromCache) updateMetaText(true);
                }
            }, function (code) {
                loading = false;
                Lampa.Loading.stop('utopia_search');
                Lampa.Loading.stop('utopia_search_more');

                if (isFirst) {
                    renderErrorState(code);
                } else {
                    Lampa.Noty.show('UTOPIA: ' + errorMessage(code));
                    if (sortMode === 'default') addMoreButtonIfNeeded();
                    else renderList();
                    Lampa.Controller.enable('content');
                }
            });
        }

        this.back = function () { Lampa.Activity.backward(); };
        this.pause = function () {};
        this.stop = function () {};
        this.destroy = function () {
            scroll.destroy();
            wrap.remove();
        };
    }

    Lampa.Component.add('utopia_torrents', TorrentsComponent);

    // =========================================================
    // 7. Кнопка на картці
    // =========================================================
    function addButtonToCard(root, object) {
        if (root.find('.utopia-search-btn').length) return;

        var movie = object.movie || {};
        var title = movie.title || movie.name || '';
        var originalTitle = movie.original_title || '';
        if (!title) return;

        var button = $(
    '<div class="full-start__button selector utopia-search-btn">' +
        '<span style="display:flex;align-items:center;gap:.45em;">' +
            '<svg width="1.5em" height="1.5em" viewBox="0 0 64 64" ' +
                'xmlns="http://www.w3.org/2000/svg" ' +
                'style="flex-shrink:0;display:block;">' +
                '<image href="https://raw.githubusercontent.com/yakutza82/lampa-utopia/refs/heads/main/pngegg2wh.png" ' +
                    'x="0" y="0" width="64" height="64" />' +
            '</svg>' +
            'UTOPIA - Торрент' +
        '</span>' +
    '</div>'
);

        button.on('click hover:enter', function () {
            if (!hasKey()) {
                Lampa.Noty.show('UTOPIA: спочатку вкажіть API ключ у налаштуваннях плагіна');
                return;
            }
            Lampa.Activity.push({
                url: '',
                title: 'UTOPIA: ' + title,
                component: 'utopia_torrents',
                movie: movie,
                search: title,
                search_original: originalTitle,
                page: 1
            });
        });

        var anchor = root.find('.view--torrent');
        if (anchor.length) {
            anchor.after(button);
            return;
        }

        var target = root.find('.full-start-new__buttons');
        if (!target.length) target = root.find('.full-start__buttons');
        if (target.length) target.append(button);
    }

    function initCardButton() {
        Lampa.Listener.follow('full', function (e) {
            if (e.type === 'complite') {
                addButtonToCard(e.object.activity.render(), e.data);
            }
        });
    }

    // =========================================================
    // 8. Ініціалізація
    // =========================================================
    function init() {
        injectStyles();
        initSettings();
        initCardButton();
    }

    if (window.appready) {
        init();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') init();
        });
    }

})();
