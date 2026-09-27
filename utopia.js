(function () {
    'use strict';

    if (window.UTOPIA_PLUGIN) return;
    window.UTOPIA_PLUGIN = true;

    var API_BASE = 'https://utp.to/api';
    var PER_PAGE = 30;

    var TRACKERS = [
        'udp://tracker.opentrackr.org:1337/announce',
        'udp://open.demonii.com:1337/announce',
        'udp://tracker.openbittorrent.com:80',
        'udp://open.stealth.si:80/announce',
        'udp://exodus.desync.com:6969'
    ];

    // =========================================================
    // 0. Стилі
    // =========================================================
    function injectStyles() {
        if (document.getElementById('utopia-styles')) return;
        var css = '' +
            '.utopia-wrap{padding:1.2em 1.5em; padding-bottom:5em; touch-action: pan-y;}' +
            '.utopia-header{display:flex;justify-content:space-between;align-items:flex-start;' +
            'flex-wrap:wrap;gap:1em;margin-bottom:1.2em;padding-bottom:1em;' +
            'border-bottom:1px solid rgba(255,255,255,0.1);}' +
            '.utopia-header__title{font-size:1.4em;font-weight:700;line-height:1.3;}' +
            '.utopia-header__original{opacity:0.55;font-size:0.9em;margin-top:0.2em;}' +
            '.utopia-header__meta{opacity:0.6;font-size:0.9em;margin-top:0.3em;}' +
            '.utopia-header__actions{display:flex;gap:0.6em;flex-wrap:wrap;}' +
            '.utopia-btn{padding:0.6em 1.1em;border-radius:0.6em;background:rgba(255,255,255,0.08);' +
            'cursor:pointer;font-size:0.9em;white-space:nowrap;transition:background .15s,transform .15s;}' +
            '.utopia-btn.focus{background:rgba(255,255,255,0.22);transform:scale(1.05);' +
            'box-shadow:0 0 0 2px rgba(255,255,255,0.35) inset;}' +
            '.utopia-item{display:flex;justify-content:space-between;align-items:center;gap:1em;' +
            'padding:1em 1.1em;margin-bottom:0.5em;border-radius:0.7em;background:rgba(255,255,255,0.04);' +
            'transition:background .15s,transform .15s; user-select:none; cursor:pointer;}' +
            '.utopia-item.focus{background:rgba(255,255,255,0.16);transform:scale(1.015);' +
            'box-shadow:0 0 0 2px rgba(255,255,255,0.35) inset;}' +
            '.utopia-item__left{flex:1;min-width:0;}' +
            '.utopia-item__title{font-weight:700;font-size:1em;margin-bottom:0.2em;color:#fff;overflow:hidden;' +
            'text-overflow:ellipsis;white-space:nowrap;}' +
            '.utopia-item__sub{font-size:0.85em;opacity:0.7;margin-bottom:0.35em;overflow:hidden;' +
            'text-overflow:ellipsis;white-space:nowrap;}' +
            '.utopia-item__meta{opacity:0.5;font-size:0.8em;}' +
            '.utopia-item__badges{display:flex;gap:0.9em;white-space:nowrap;flex-shrink:0;' +
            'font-size:0.95em;font-weight:700;}' +
            '.utopia-more{text-align:center;padding:1.2em;margin:1em 0 2em;border-radius:0.7em;' +
            'background:rgba(255,255,255,0.08);cursor:pointer;font-weight:700;transition:background .15s;}' +
            '.utopia-more.focus{background:rgba(255,255,255,0.22);}' +
            '.utopia-state{text-align:center;padding:3.5em 1.5em;opacity:0.85;}' +
            '.utopia-state__icon{font-size:2.4em;margin-bottom:0.4em;}' +
            '.utopia-state__title{font-size:1.15em;font-weight:600;margin-bottom:0.4em;}' +
            '.utopia-state__text{opacity:0.65;font-size:0.9em;margin-bottom:1.2em;}' +
            '.utopia-state .utopia-btn{display:inline-block;}' +
            '.utopia-debug-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.88);z-index:99999;' +
            'display:flex;align-items:center;justify-content:center;padding:2em;}' +
            '.utopia-debug-box{background:#161616;border-radius:1em;padding:1.5em;max-width:96%;' +
            'width:640px;max-height:88%;display:flex;flex-direction:column;gap:1em;}' +
            '.utopia-debug-title{font-weight:700;font-size:1.1em;}' +
            '.utopia-debug-textarea{white-space:pre-wrap;word-break:break-word;font-size:0.75em;' +
            'color:#fff;opacity:0.9;overflow:auto;max-height:55vh;min-height:35vh;' +
            'background:rgba(255,255,255,0.05);padding:1em;border-radius:0.6em;margin:0;' +
            'border:none;resize:none;width:100%;box-sizing:border-box;font-family:monospace;}';
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
            Lampa.Noty.show(String.fromCharCode(0x2705) + ' UTOPIA: ключ робочий, зв\'язок є');
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
    // 4. Парсинг та обробка посилань
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

    function buildMagnetFromHash(hash, name) {
        if (!hash) return '';
        var cleanHash = String(hash).replace(/[^a-fA-F0-9]/g, '');
        if (cleanHash.length < 32) return '';
        var tr = TRACKERS.map(function (t) { return '&tr=' + encodeURIComponent(t); }).join('');
        return 'magnet:?xt=urn:btih:' + cleanHash + '&dn=' + encodeURIComponent(name || 'torrent') + tr;
    }

    function normalizeItem(raw) {
        if (!raw || typeof raw !== 'object') return {};

        var attrs = (raw.attributes && typeof raw.attributes === 'object') ? raw.attributes : raw;

        var releaseName = attrs.name || deepFind(raw, ['name', 'title', 'filename']) || 'Без назви';
        var size = attrs.size != null ? attrs.size : (deepFind(raw, ['size']) || 0);
        var seeds = attrs.seeders != null ? attrs.seeders : (deepFind(raw, ['seeders', 'seeds']) || 0);
        var peers = attrs.leechers != null ? attrs.leechers : (deepFind(raw, ['leechers', 'peers']) || 0);

        var magnet = '';
        var hash = attrs.info_hash || deepFind(raw, ['info_hash', 'hash', 'btih']);

        if (typeof attrs.magnet_link === 'string' && attrs.magnet_link.indexOf('magnet:') === 0) {
            magnet = attrs.magnet_link;
        } else if (hash) {
            magnet = buildMagnetFromHash(hash, releaseName);
        } else if (attrs.download_link) {
            magnet = attrs.download_link;
        }

        return {
            releaseName: String(releaseName),
            size: parseFloat(size) || 0,
            seeds: parseInt(seeds, 10) || 0,
            peers: parseInt(peers, 10) || 0,
            magnet: magnet || '',
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
        if (isNaN(n)) return '<span style="opacity:0.4;">' + icon + ' ?</span>';
        var color = n >= 10 ? '#4CAF50' : (n >= 1 ? '#FFC107' : '#F44336');
        return '<span style="color:' + color + ';">' + icon + ' ' + n + '</span>';
    }

    function errorMessage(code) {
        var map = {
            no_key: 'Спочатку вкажи API ключ у налаштуваннях плагіна UTOPIA.',
            unauthorized: 'Неправильний API ключ (401). Перевір його в налаштуваннях.',
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

    // =========================================================
    // 6. Компонент екрана
    // =========================================================
    function TorrentsComponent(object) {
        var scroll = new Lampa.Scroll({ mask: true, over: true, step: 200 });
        var wrap = $('<div class="utopia-wrap"></div>');
        var header = $(
            '<div class="utopia-header">' +
            '<div>' +
            '<div class="utopia-header__title"></div>' +
            '<div class="utopia-header__original"></div>' +
            '<div class="utopia-header__meta"></div>' +
            '</div>' +
            '<div class="utopia-header__actions">' +
            '<div class="utopia-btn selector utopia-sort-btn">\u2195 Сортування</div>' +
            '<div class="utopia-btn selector utopia-debug-btn">\ud83d\udc1e Діагностика</div>' +
            '</div>' +
            '</div>'
        );
        var listBox = $('<div class="utopia-list"></div>');
        var page = 1;
        var items = [];
        var sortMode = 'default';
        var loading = false;

        var primaryQuery = object.search;
        var altQuery = (object.search_original &&
            String(object.search_original).toLowerCase() !== String(primaryQuery).toLowerCase())
            ? object.search_original
            : '';
        var query = primaryQuery;
        var usedAlt = false;

        injectStyles();

        function bindScrollFollow(el) {
            el.on('hover:focus', function (e) {
                scroll.update($(e.target), true);
            });
            return el;
        }

        function showDebugOverlay(title, data) {
            var jsonText = (function () {
                try { return JSON.stringify(data, null, 2); }
                catch (e) { return String(data); }
            })();

            var overlay = $('<div class="utopia-debug-overlay"></div>');
            var box = $('<div class="utopia-debug-box"></div>');
            var titleEl = $('<div class="utopia-debug-title"></div>').text(title);
            var textarea = $('<textarea class="utopia-debug-textarea" readonly></textarea>').val(jsonText);
            var copyBtn = $('<div class="utopia-btn selector utopia-debug-copy">\ud83d\udccb Скопіювати</div>');
            var closeBtn = $('<div class="utopia-btn selector utopia-debug-close">Закрити</div>');
            var actions = $('<div style="display:flex; gap:0.6em; flex-wrap:wrap;"></div>').append(copyBtn).append(closeBtn);

            bindScrollFollow(copyBtn);
            bindScrollFollow(closeBtn);

            box.append(titleEl).append(textarea).append(actions);
            overlay.append(box);
            wrap.append(overlay);

            function close() {
                overlay.remove();
                Lampa.Controller.toggle('content');
            }

            function doCopy() {
                var el = textarea[0];
                try {
                    el.focus();
                    el.select();
                    el.setSelectionRange(0, jsonText.length);
                    var ok = document.execCommand('copy');
                    Lampa.Noty.show(ok ? 'UTOPIA: скопійовано в буфер' : 'UTOPIA: виділи текст вручну');
                } catch (e) {
                    Lampa.Noty.show('UTOPIA: виділи текст вручну');
                }
            }

            copyBtn.on('click hover:enter', doCopy);
            closeBtn.on('click hover:enter', close);

            Lampa.Controller.add('utopia_debug', {
                toggle: function () {
                    Lampa.Controller.collectionSet(overlay);
                    Lampa.Controller.collectionFocus(copyBtn[0], overlay);
                },
                up: function () { Lampa.Navigator.move('up'); },
                down: function () { Lampa.Navigator.move('down'); },
                left: function () { Lampa.Navigator.move('left'); },
                right: function () { Lampa.Navigator.move('right'); },
                back: close
            });
            Lampa.Controller.toggle('utopia_debug');
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
            bindScrollFollow(header.find('.utopia-debug-btn')).on('click hover:enter', function () {
                showDebugOverlay('Дані картки фільму (object)', {
                    search: object.search,
                    search_original: object.search_original,
                    movie: object.movie
                });
            });

            wrap.append(header);
            listBox.appendTo(wrap);
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
                    Lampa.Controller.collectionFocus(false, scroll.render());
                },
                up: function () {
                    if (Lampa.Navigator.canmove('up')) { Lampa.Navigator.move('up'); return; }
                    try { Lampa.Controller.toggle('head'); } catch (e) {}
                },
                down: function () { Lampa.Navigator.move('down'); },
                left: function () {
                    if (Lampa.Navigator.canmove('left')) Lampa.Navigator.move('left');
                    else Lampa.Controller.toggle('menu');
                },
                right: function () { Lampa.Navigator.move('right'); },
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
                '<div class="utopia-state__text">Щоб шукати торренти на UTOPIA, спочатку додай API ключ у налаштуваннях плагіна.</div>' +
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
                '<div class="utopia-item__title"></div>' +
                '<div class="utopia-item__sub"></div>' +
                '<div class="utopia-item__meta"></div>' +
                '</div>' +
                '<div class="utopia-item__badges"></div>' +
                '</div>'
            );

            // Основна назва — українська назва фільму
            row.find('.utopia-item__title').text(primaryQuery);
            // Підзаголовок — назва торрент-файлу/релізу
            row.find('.utopia-item__sub').text(item.releaseName);
            row.find('.utopia-item__meta').text(item.size ? formatSize(item.size) : 'Розмір невідомий');
            row.find('.utopia-item__badges').html(badge(item.seeds, '\u25b2') + '&nbsp;&nbsp;' + badge(item.peers, '\u25bc'));

            row.on('click hover:enter', function () {
                if (!item.magnet) {
                    showDebugOverlay('Немає magnet/download - дані цього торента', item.__raw || item);
                    return;
                }
                
                // Передаємо валідний об'єкт для плеєра Lampa
                Lampa.Torrent.play({
                    url: item.magnet,
                    title: item.releaseName,
                    name: item.releaseName
                });
            });

            bindScrollFollow(row);
            return row;
        }

        function removeMoreButtonEl() {
            listBox.find('.utopia-more').remove();
        }

        function addMoreButtonIfNeeded() {
            removeMoreButtonEl();
            if (items.length >= page * PER_PAGE) {
                var moreButton = $('<div class="utopia-more selector">Показати ще \u2193</div>');
                bindScrollFollow(moreButton).on('click hover:enter', function () {
                    if (!loading) loadPage(page + 1);
                });
                listBox.append(moreButton);
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
            var sorted = sortItems(items, sortMode);
            sorted.forEach(function (item) {
                listBox.append(buildRow(item));
            });
            addMoreButtonIfNeeded();
            updateMetaText(false);
            Lampa.Controller.enable('content');
        }

        function appendRows(newItems) {
            removeMoreButtonEl();
            newItems.forEach(function (item) {
                listBox.append(buildRow(item));
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
            '<div class="full-start__button selector utopia-search-btn" data-subtitle="8:07 27.09.2026 Gemini">' +
            '<span>\ud83e\uddf2 UTOPIA - торенти</span>' +
            '</div>'
        );

        button.on('click hover:enter', function () {
            if (!hasKey()) {
                Lampa.Noty.show('UTOPIA: спочатку вкажи API ключ у налаштуваннях плагіна');
                return;
            }
            Lampa.Activity.push({
                url: '',
                title: 'UTOPIA: ' + title,
                component: 'utopia_torrents',
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
