(function () {
    'use strict';

    if (window.UTOPIA_PLUGIN) return;
    window.UTOPIA_PLUGIN = true;

    var API_BASE = 'https://utp.to/api';
    var PER_PAGE = 30;

    // Публічні трекери для формування magnet з BTIH hash
    var TRACKERS = [
        'udp://tracker.opentrackr.org:1337/announce',
        'udp://open.demonii.com:1337/announce',
        'udp://tracker.openbittorrent.com:80',
        'udp://open.stealth.si:80/announce',
        'udp://exodus.desync.com:6969',
        'udp://tracker.torrent.eu.org:451/announce'
    ];

    // =========================================================
    // 0. Стилі
    // =========================================================
    // Власний torrent-UI тут НЕ малюємо.
    // Для результатів використовуємо штатний Lampa.Template('torrent'),
    // тому Lampa сама застосовує свої CSS/розмітку.
    function injectStyles() {}

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
            icon: '<svg width="26" height="26" viewBox="0 0 26 26" xmlns="http://www.w3.org/2000/svg"><circle cx="13" cy="13" r="10" stroke="currentColor" stroke-width="2" fill="none"/></svg>'
        });

        Lampa.SettingsApi.addParam({
            component: 'utopia',
            param: { name: 'utopia_api_key', type: 'input', values: '', default: '' },
            field: {
                name: 'API ключ UTOPIA',
                description: 'Встав ключ доступу до utp.to.'
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
            if (obj.hasOwnProperty(p) &&
                typeof obj[p] === 'object' &&
                obj[p] !== null) {

                var res = deepFind(obj[p], keys);

                if (res !== null) return res;
            }
        }

        return null;
    }

    function isHexHash(str) {
        if (typeof str !== 'string') return false;

        var clean = str.replace(/[^a-fA-F0-9]/g, '');

        return clean.length === 40 || clean.length === 32;
    }

    function findMagnetOrHash(obj, found, depth) {
        if (!found) found = {};
        if (depth === undefined) depth = 0;

        if (!obj || typeof obj !== 'object' || depth > 6) {
            return found;
        }

        for (var p in obj) {
            if (!obj.hasOwnProperty(p)) continue;

            var val = obj[p];

            if (typeof val === 'string') {
                if (!found.magnet && val.indexOf('magnet:') === 0) {
                    found.magnet = val;
                } else if (!found.hash && isHexHash(val)) {
                    found.hash = val;
                }
            } else if (typeof val === 'object' && val !== null) {
                findMagnetOrHash(val, found, depth + 1);
            }
        }

        return found;
    }

    function buildMagnetUrl(hash, name) {
        if (!hash) return '';

        var cleanHash = String(hash).replace(/[^a-fA-F0-9]/g, '');

        if (cleanHash.length !== 40 && cleanHash.length !== 32) {
            return '';
        }

        var trParams = TRACKERS.map(function (t) {
            return '&tr=' + encodeURIComponent(t);
        }).join('');

        return 'magnet:?xt=urn:btih:' +
            cleanHash +
            '&dn=' +
            encodeURIComponent(name || 'torrent') +
            trParams;
    }

    /*
     * Перетворюємо відповідь UTOPIA у два формати:
     *
     * 1. Наш внутрішній:
     *    name / size / seeds / peers / magnet
     *
     * 2. Штатний Lampa torrent result:
     *    Title / Tracker / Size / Seeders / Peers / MagnetUri
     *
     * Саме другий формат використовує стандартний torrent template Lampa.
     */
    function normalizeItem(raw) {
        if (!raw || typeof raw !== 'object') return {};

        var name = deepFind(raw, [
            'name',
            'title',
            'filename',
            'torrent_name',
            'display_name',
            'raw_title'
        ]) || 'Без назви';

        var size = deepFind(raw, [
            'size',
            'size_bytes',
            'length',
            'bytes'
        ]) || 0;

        var seeds = deepFind(raw, [
            'seeders',
            'seeds',
            'seed'
        ]) || 0;

        var peers = deepFind(raw, [
            'leechers',
            'peers',
            'leech'
        ]) || 0;

        var found = findMagnetOrHash(raw);

        var magnet = found.magnet || buildMagnetUrl(found.hash, name);

        if (!magnet && window.console) {
            console.log(
                '[UTOPIA] Не знайдено magnet/hash у елементі:',
                raw
            );
        }

        var item = {
            name: String(name),
            size: parseFloat(size) || 0,
            seeds: parseInt(seeds, 10) || 0,
            peers: parseInt(peers, 10) || 0,
            magnet: magnet || '',
            hash: found.hash || '',
            __raw: raw
        };

        /*
         * Формат штатного Lampa torrent template.
         * Нічого глобального не змінюємо.
         */
        item.Title = item.name;
        item.Tracker = 'UTOPIA';
        item.Size = item.size;
        item.Seeders = item.seeds;
        item.Peers = item.peers;
        item.MagnetUri = item.magnet;
        item.Link = item.magnet;

        return item;
    }

    function sendRequest(url, headers, onSuccess, onError) {
        var network = new Lampa.Reguest();

        network.timeout(15000);

        network.native(
            url,
            function (response) {
                var data = response;

                if (typeof response === 'string') {
                    try {
                        data = JSON.parse(response);
                    } catch (e) {}
                }

                if (data) {
                    onSuccess(data);
                } else if (onError) {
                    onError('parse_error');
                }
            },
            function (xhr) {
                var status = xhr ? xhr.status : 0;

                if (status === 401) {
                    onError('unauthorized');
                } else if (status === 403) {
                    onError('forbidden');
                } else {
                    onError(status === 0 ? 'network' : 'http_' + status);
                }
            },
            false,
            { headers: headers }
        );
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

        var targetUrl =
            API_BASE +
            '/torrents/filter' +
            '?name=' + encodeURIComponent(query) +
            '&perPage=' + PER_PAGE +
            '&page=' + page +
            '&api_key=' + cleanKey +
            '&token=' + cleanKey;

        var headers = {
            'Authorization': 'Bearer ' + key,
            'Accept': 'application/json'
        };

        // 1. Прямий нативний запит для Android/TV
        sendRequest(
            targetUrl,
            headers,
            function (data) {
                var items = parseArrayFromData(data).map(normalizeItem);

                saveToCache(query, page, items);

                onSuccess(items, false);
            },
            function (errCode) {

                // 2. Web/CORS fallback
                if (
                    errCode === 'network' ||
                    errCode === 'forbidden'
                ) {
                    var proxy1 =
                        'https://corsproxy.io/?' +
                        encodeURIComponent(targetUrl);

                    sendRequest(
                        proxy1,
                        {},
                        function (data) {
                            var items =
                                parseArrayFromData(data).map(normalizeItem);

                            saveToCache(query, page, items);

                            onSuccess(items, false);
                        },
                        function () {
                            var proxy2 =
                                'https://api.allorigins.win/raw?url=' +
                                encodeURIComponent(targetUrl);

                            sendRequest(
                                proxy2,
                                {},
                                function (data) {
                                    var items =
                                        parseArrayFromData(data).map(normalizeItem);

                                    saveToCache(query, page, items);

                                    onSuccess(items, false);
                                },
                                onError
                            );
                        }
                    );
                } else if (onError) {
                    onError(errCode);
                }
            }
        );
    }

    // =========================================================
    // 5. Допоміжні функції
    // =========================================================
    function errorMessage(code) {
        var map = {
            no_key:
                'Спочатку вкажи API ключ у налаштуваннях плагіна UTOPIA.',
            unauthorized:
                'Неправильний API ключ (401). Перевір його в налаштуваннях.',
            forbidden:
                'Заблоковано сервером/браузером (403 або CORS).',
            parse_error:
                'Сервер повернув некоректну відповідь.',
            network:
                'Помилка мережі або CORS (заблоковано сервером/браузером).',
            timeout:
                'Сервер не відповів вчасно.'
        };

        return map[code] || ('Сталася помилка (' + code + ').');
    }

    function itemForLampa(item) {
        /*
         * Окремий клон не потрібен: normalizeItem вже містить
         * поля, які очікує стандартний torrent template.
         */
        return item;
    }

    // =========================================================
    // 6. UTOPIA -> стандартний Lampa torrent UI
    // =========================================================
    function TorrentsComponent(object) {
        var scroll = new Lampa.Scroll({
            mask: true,
            over: true,
            step: 200
        });

        var wrap = $('<div class="torrent-list"></div>');

        var page = 1;
        var items = [];
        var loading = false;

        var primaryQuery = object.search;

        var altQuery =
            object.search_original &&
            String(object.search_original).toLowerCase() !==
                String(primaryQuery).toLowerCase()
                ? object.search_original
                : '';

        var query = primaryQuery;
        var usedAlt = false;

        function appendItems(list) {
            list.forEach(function (item) {
                var torrent = itemForLampa(item);

                /*
                 * Саме тут Lampa малює СВІЙ стандартний torrent item.
                 * Ніяких .utopia-item, .utopia-item__... та власного CSS.
                 */
                var row = Lampa.Template.get(
                    'torrent',
                    torrent
                );

                if (!row || !row.length) {
                    return;
                }

                row.addClass('selector');

                row.on(
                    'click hover:enter',
                    function () {
                        if (!torrent.MagnetUri) {
                            Lampa.Noty.show(
                                'UTOPIA: у цього торента немає magnet-посилання'
                            );
                            return;
                        }

                        /*
                         * Залишаємо робочий виклик з твого оригінального
                         * плагіна. Глобальний Lampa.Torrent не підміняємо.
                         */
                        Lampa.Torrent.play({
                            url: torrent.MagnetUri,
                            name: torrent.Title
                        });
                    }
                );

                row.on(
                    'hover:focus',
                    function (e) {
                        scroll.update($(e.target), true);
                    }
                );

                wrap.append(row);
            });
        }

        function showEmpty() {
            wrap.empty();

            Lampa.Noty.show(
                'UTOPIA: нічого не знайдено'
            );
        }

        function loadPage(targetPage) {
            if (loading) return;

            loading = true;

            Lampa.Loading.start(
                targetPage === 1
                    ? 'utopia_search'
                    : 'utopia_search_more',
                targetPage === 1
                    ? 'UTOPIA: пошук...'
                    : 'UTOPIA: завантаження...'
            );

            request(
                query,
                targetPage,
                function (pageItems, fromCache) {
                    loading = false;

                    Lampa.Loading.stop('utopia_search');
                    Lampa.Loading.stop('utopia_search_more');

                    page = targetPage;

                    if (targetPage === 1) {
                        items = [];
                        wrap.empty();
                    }

                    items = items.concat(pageItems);

                    if (!items.length) {
                        /*
                         * Якщо українська/локалізована назва не дала
                         * результатів — один раз пробуємо original_title.
                         */
                        if (
                            targetPage === 1 &&
                            altQuery &&
                            !usedAlt
                        ) {
                            usedAlt = true;
                            query = altQuery;
                            loadPage(1);
                            return;
                        }

                        showEmpty();
                        return;
                    }

                    appendItems(pageItems);

                    /*
                     * Кнопка "ще" також використовує стандартний
                     * Lampa template 'torrent', але як звичайний selector.
                     */
                    if (
                        pageItems.length >= PER_PAGE
                    ) {
                        var more =
                            Lampa.Template.get(
                                'torrent',
                                {
                                    Title:
                                        'Показати ще',
                                    Tracker:
                                        'UTOPIA',
                                    Size: 0,
                                    Seeders: 0,
                                    Peers: 0,
                                    MagnetUri: ''
                                }
                            );

                        if (more && more.length) {
                            more.addClass('selector');

                            more.on(
                                'click hover:enter',
                                function () {
                                    if (!loading) {
                                        more.remove();
                                        loadPage(page + 1);
                                    }
                                }
                            );

                            wrap.append(more);
                        }
                    }

                    if (fromCache) {
                        Lampa.Noty.show(
                            'UTOPIA: результати з кешу'
                        );
                    }

                    Lampa.Controller.enable('content');
                },
                function (code) {
                    loading = false;

                    Lampa.Loading.stop('utopia_search');
                    Lampa.Loading.stop('utopia_search_more');

                    Lampa.Noty.show(
                        'UTOPIA: ' +
                        errorMessage(code)
                    );

                    Lampa.Controller.enable('content');
                }
            );
        }

        this.create = function () {
            scroll.append(wrap);

            scroll
                .render()
                .addClass('layer--wheight');

            return this.render();
        };

        this.render = function () {
            return scroll.render();
        };

        this.start = function () {
            if (
                Lampa.Activity.active().activity !==
                this.activity
            ) {
                return;
            }

            if (!hasKey()) {
                Lampa.Noty.show(
                    'UTOPIA: спочатку вкажи API ключ у налаштуваннях плагіна'
                );

                return;
            }

            if (!items.length) {
                loadPage(1);
            }

            Lampa.Controller.add(
                'content',
                {
                    toggle: function () {
                        Lampa.Controller.collectionSet(
                            scroll.render()
                        );

                        Lampa.Controller.collectionFocus(
                            false,
                            scroll.render()
                        );
                    },

                    up: function () {
                        Navigator.move('up');
                    },

                    down: function () {
                        Navigator.move('down');
                    },

                    left: function () {
                        if (
                            Navigator.canmove('left')
                        ) {
                            Navigator.move('left');
                        } else {
                            Lampa.Controller.toggle(
                                'menu'
                            );
                        }
                    },

                    right: function () {
                        Navigator.move('right');
                    },

                    back: function () {
                        Lampa.Activity.backward();
                    }
                }
            );

            Lampa.Controller.toggle('content');
        };

        this.back = function () {
            Lampa.Activity.backward();
        };

        this.pause = function () {};

        this.stop = function () {};

        this.destroy = function () {
            scroll.destroy();
            wrap.remove();
        };
    }

    Lampa.Component.add(
        'utopia_torrents',
        TorrentsComponent
    );

    // =========================================================
    // 7. Кнопка на картці
    // =========================================================
    function addButtonToCard(root, object) {
        if (
            root.find('.utopia-search-btn').length
        ) {
            return;
        }

        var movie = object.movie || {};

        var title =
            movie.title ||
            movie.name ||
            '';

        var originalTitle =
            movie.original_title ||
            '';

        if (!title) return;

        var button = $(
            '<div class="full-start__button selector utopia-search-btn" data-subtitle="UTOPIA">' +
                '<span>🧲 UTOPIA - торенти</span>' +
            '</div>'
        );

        button.on(
            'click hover:enter',
            function () {
                if (!hasKey()) {
                    Lampa.Noty.show(
                        'UTOPIA: спочатку вкажи API ключ у налаштуваннях плагіна'
                    );
                    return;
                }

                Lampa.Activity.push({
                    url: '',
                    title: 'UTOPIA: ' + title,
                    component: 'utopia_torrents',
                    search: title,
                    search_original: originalTitle,
                    page: 1,
                    movie: movie
                });
            }
        );

        var anchor =
            root.find('.view--torrent');

        if (anchor.length) {
            anchor.after(button);
            return;
        }

        var target =
            root.find('.full-start-new__buttons');

        if (!target.length) {
            target =
                root.find('.full-start__buttons');
        }

        if (target.length) {
            target.append(button);
        }
    }

    function initCardButton() {
        Lampa.Listener.follow(
            'full',
            function (e) {
                if (e.type === 'complite') {
                    addButtonToCard(
                        e.object.activity.render(),
                        e.data
                    );
                }
            }
        );
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
        Lampa.Listener.follow(
            'app',
            function (e) {
                if (e.type === 'ready') {
                    init();
                }
            }
        );
    }

})();
