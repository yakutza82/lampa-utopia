(function () {
    'use strict';

    if (window.UTOPIA_PLUGIN) return;
    window.UTOPIA_PLUGIN = true;

    var API_BASE = 'https://utp.to/api';
    var PER_PAGE = 30;

    // =========================================================
    // 0. Стилі
    // =========================================================
    function injectStyles() {
        if (document.getElementById('utopia-styles')) return;
        var css = '' +
            '.utopia-wrap{padding:1.2em 1.5em;}' +
            '.utopia-header{display:flex;justify-content:space-between;align-items:flex-start;' +
            'flex-wrap:wrap;gap:1em;margin-bottom:1.2em;padding-bottom:1em;' +
            'border-bottom:1px solid rgba(255,255,255,0.1);}' +
            '.utopia-header__title{font-size:1.4em;font-weight:700;line-height:1.3;}' +
            '.utopia-header__meta{opacity:0.6;font-size:0.9em;margin-top:0.3em;}' +
            '.utopia-header__actions{display:flex;gap:0.6em;flex-wrap:wrap;}' +
            '.utopia-btn{padding:0.6em 1.1em;border-radius:0.6em;background:rgba(255,255,255,0.08);' +
            'cursor:pointer;font-size:0.9em;white-space:nowrap;transition:background .15s,transform .15s;}' +
            '.utopia-btn.focus{background:rgba(255,255,255,0.22);transform:scale(1.05);' +
            'box-shadow:0 0 0 2px rgba(255,255,255,0.35) inset;}' +
            '.utopia-item{display:flex;justify-content:space-between;align-items:center;gap:1em;' +
            'padding:1em 1.1em;margin-bottom:0.5em;border-radius:0.7em;background:rgba(255,255,255,0.04);' +
            'transition:background .15s,transform .15s;}' +
            '.utopia-item.focus{background:rgba(255,255,255,0.16);transform:scale(1.015);' +
            'box-shadow:0 0 0 2px rgba(255,255,255,0.35) inset;}' +
            '.utopia-item__left{flex:1;min-width:0;}' +
            '.utopia-item__title{font-weight:600;margin-bottom:0.35em;overflow:hidden;' +
            'text-overflow:ellipsis;white-space:nowrap;}' +
            '.utopia-item__meta{opacity:0.6;font-size:0.85em;}' +
            '.utopia-item__badges{display:flex;gap:0.9em;white-space:nowrap;flex-shrink:0;' +
            'font-size:0.95em;font-weight:700;}' +
            '.utopia-more{text-align:center;padding:1em;margin:0.6em 0 1em;border-radius:0.7em;' +
            'background:rgba(255,255,255,0.05);cursor:pointer;font-weight:600;transition:background .15s;}' +
            '.utopia-more.focus{background:rgba(255,255,255,0.18);}' +
            '.utopia-state{text-align:center;padding:3.5em 1.5em;opacity:0.85;}' +
            '.utopia-state__icon{font-size:2.4em;margin-bottom:0.4em;}' +
            '.utopia-state__title{font-size:1.15em;font-weight:600;margin-bottom:0.4em;}' +
            '.utopia-state__text{opacity:0.65;font-size:0.9em;margin-bottom:1.2em;}' +
            '.utopia-state .utopia-btn{display:inline-block;}';
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
        request('test', 1, function() {
            Lampa.Noty.show('✅ UTOPIA: ключ робочий, зв\'язок є');
        }, function(code) {
            Lampa.Noty.show('⚠️ UTOPIA: ' + errorMessage(code));
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
    // 4. Мережевий шар (Lampa.Reguest)
    // =========================================================
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

        var url = API_BASE + '/torrents/filter?name=' + encodeURIComponent(query) + '&perPage=' + PER_PAGE + '&page=' + page;

        var network = new Lampa.Reguest();
        network.timeout(15000);

        var headers = {
            'Authorization': 'Bearer ' + key,
            'Accept': 'application/json'
        };

        network.native(url, function (data) {
            if (typeof data === 'string') {
                try { data = JSON.parse(data); } catch (e) {}
            }
            if (data) {
                saveToCache(query, page, data);
                onSuccess(data, false);
            } else {
                if (onError) onError('parse_error');
            }
        }, function (xhr) {
            var status = xhr ? xhr.status : 0;
            if (status === 401) {
                if (onError) onError('unauthorized');
            } else if (status === 403) {
                if (onError) onError('forbidden');
            } else if (status === 0) {
                if (onError) onError('network');
            } else {
                if (onError) onError('http_' + status);
            }
        }, false, {
            headers: headers
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
            forbidden: 'Доступ заборонено (403).',
            parse_error: 'Сервер повернув некоректну відповідь.',
            network: 'Помилка мережі або CORS (заблоковано сервером/браузером).',
            timeout: 'Сервер не відповів вчасно.'
        };
        return map[code] || ('Сталася помилка (' + code + ').');
    }

    function sortItems(items, mode) {
        var arr = items.slice();
        if (mode === 'seeds') {
            arr.sort(function (a, b) {
                return (parseInt(b.seeders != null ? b.seeders : b.seeds, 10) || 0) - (parseInt(a.seeders != null ? a.seeders : a.seeds, 10) || 0);
            });
        } else if (mode === 'size_desc') {
            arr.sort(function (a, b) {
                return (parseFloat(b.size) || 0) - (parseFloat(a.size) || 0);
            });
        } else if (mode === 'size_asc') {
            arr.sort(function (a, b) {
                return (parseFloat(a.size) || 0) - (parseFloat(b.size) || 0);
            });
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
            '<div class="utopia-header__meta"></div>' +
            '</div>' +
            '<div class="utopia-header__actions">' +
            '<div class="utopia-btn selector utopia-sort-btn">↕ Сортування</div>' +
            '</div>' +
            '</div>'
        );
        var listBox = $('<div class="utopia-list"></div>');
        var moreButton = null;
        var page = 1;
        var items = [];
        var sortMode = 'default';
        var loading = false;
        var query = object.search;

        injectStyles();

        this.create = function () {
            header.find('.utopia-header__title').text(query);
            header.find('.utopia-sort-btn').on('hover:enter', showSortMenu);
            wrap.append(header);
            listBox.appendTo(wrap);
            scroll.append(wrap);
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
                up: function () { Lampa.Navigator.move('up'); },
                down: function () { Lampa.Navigator.move('down'); },
                left: function () { Lampa.Navigator.move('left'); },
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
                '<div class="utopia-state__icon">🔑</div>' +
                '<div class="utopia-state__title">Ключ не вказано</div>' +
                '<div class="utopia-state__text">Щоб шукати торренти на UTOPIA, спочатку додай API ключ у налаштуваннях плагіна.</div>' +
                '</div>')
            );
        }

        function renderErrorState(code) {
            listBox.empty();
            var box = $(
                '<div class="utopia-state">' +
                '<div class="utopia-state__icon">⚠️</div>' +
                '<div class="utopia-state__title">Не вдалося завантажити результати</div>' +
                '<div class="utopia-state__text"></div>' +
                '<div class="utopia-btn selector utopia-retry">Спробувати ще раз</div>' +
                '</div>'
            );
            box.find('.utopia-state__text').text(errorMessage(code));
            box.find('.utopia-retry').on('hover:enter', function () {
                loadPage(page || 1);
            });
            listBox.append(box);
            Lampa.Controller.enable('content');
        }

        function renderEmptyState() {
            listBox.empty();
            listBox.append(
                $('<div class="utopia-state">' +
                '<div class="utopia-state__icon">🔍</div>' +
                '<div class="utopia-state__title">Нічого не знайдено</div>' +
                '<div class="utopia-state__text">Спробуй перевірити пізніше — можливо, підходящих роздач поки немає.</div>' +
                '</div>')
            );
        }

        function showSortMenu() {
            var options = ['default', 'seeds', 'size_desc', 'size_asc'].map(function (mode) {
                return {
                    title: (mode === sortMode ? '✓ ' : '') + SORT_LABELS[mode],
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

        function renderList() {
            listBox.empty();
            var sorted = sortItems(items, sortMode);
            sorted.forEach(function (item) {
                var name = item.name || 'Без назви';
                var size = item.size ? formatSize(item.size) : '';
                var seeds = item.seeders != null ? item.seeders : item.seeds;
                var peers = item.leechers != null ? item.leechers : item.peers;
                var magnet = item.magnet || item.magnet_uri || '';

                var row = $(
                    '<div class="utopia-item selector">' +
                    '<div class="utopia-item__left">' +
                    '<div class="utopia-item__title"></div>' +
                    '<div class="utopia-item__meta"></div>' +
                    '</div>' +
                    '<div class="utopia-item__badges"></div>' +
                    '</div>'
                );
                row.find('.utopia-item__title').text(name);
                row.find('.utopia-item__meta').text(size || 'Розмір невідомий');
                row.find('.utopia-item__badges').html(badge(seeds, '▲') + '&nbsp;&nbsp;' + badge(peers, '▼'));

                row.on('hover:enter', function () {
                    if (!magnet) {
                        Lampa.Noty.show('UTOPIA: немає magnet-посилання для цього торента');
                        return;
                    }
                    Lampa.Torrent.play({ url: magnet, name: name });
                });

                listBox.append(row);
            });

            if (moreButton) listBox.append(moreButton);
            setMeta('Знайдено: ' + items.length + (sortMode !== 'default' ? ' · ' + SORT_LABELS[sortMode] : ''));
            Lampa.Controller.enable('content');
        }

        function addMoreButton() {
            moreButton = $('<div class="utopia-more selector">Показати ще ↓</div>');
            moreButton.on('hover:enter', function () {
                if (!loading) loadPage(page + 1);
            });
            listBox.append(moreButton);
        }

        function removeMoreButton() {
            if (moreButton) {
                moreButton.remove();
                moreButton = null;
            }
        }

        function loadPage(targetPage) {
            if (loading) return;
            loading = true;
            var isFirst = targetPage === 1;

            if (isFirst) {
                listBox.empty();
                setMeta('Пошук триває...');
                Lampa.Loading.start('utopia_search', 'UTOPIA: пошук...');
            } else {
                removeMoreButton();
                setMeta('Завантажую ще результати...');
                Lampa.Loading.start('utopia_search_more', 'UTOPIA: завантаження...');
            }

            request(query, targetPage, function (data, fromCache) {
                loading = false;
                Lampa.Loading.stop('utopia_search');
                Lampa.Loading.stop('utopia_search_more');

                var pageItems = (data && data.data) || [];
                page = targetPage;

                if (isFirst) items = [];
                items = items.concat(pageItems);

                if (!items.length) {
                    renderEmptyState();
                    return;
                }

                removeMoreButton();
                if (pageItems.length >= PER_PAGE) addMoreButton();

                renderList();
                if (fromCache) setMeta('Знайдено: ' + items.length + ' · дані з кешу');
            }, function (code) {
                loading = false;
                Lampa.Loading.stop('utopia_search');
                Lampa.Loading.stop('utopia_search_more');

                if (isFirst) {
                    renderErrorState(code);
                } else {
                    Lampa.Noty.show('UTOPIA: ' + errorMessage(code));
                    addMoreButton();
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
        var title = (object.movie && (object.movie.title || object.movie.name)) || '';
        if (!title) return;

        var button = $(
            '<div class="full-start__button selector utopia-search-btn" data-subtitle="UTOPIA">' +
            '<span>🧲 UTOPIA — торенти</span>' +
            '</div>'
        );

        button.on('hover:enter', function () {
            if (!hasKey()) {
                Lampa.Noty.show('UTOPIA: спочатку вкажи API ключ у налаштуваннях плагіна');
                return;
            }
            Lampa.Activity.push({
                url: '',
                title: 'UTOPIA: ' + title,
                component: 'utopia_torrents',
                search: title,
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
