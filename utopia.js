(function () {
    'use strict';

    // ---- Захист від повторного підключення плагіна ----
    if (window.UTOPIA_PLUGIN) return;
    window.UTOPIA_PLUGIN = true;

    // ---- Базові налаштування ----
    var API_BASE = 'https://utp.to/api';
    var PER_PAGE = 30;

    // =========================================================
    // 1. Робота зі сховищем (API-ключ)
    // =========================================================
    function getKey() {
        return Lampa.Storage.get('utopia_api_key', '');
    }

    function hasKey() {
        return !!getKey();
    }

    // =========================================================
    // 2. Реєстрація поля вводу ключа в налаштуваннях Lampa
    //    (з'явиться в Налаштування -> Плагіни, за замовчуванням)
    // =========================================================
    function initSettings() {
        Lampa.SettingsApi.addComponent({
            component: 'utopia',
            name: 'UTOPIA',
            icon: '<svg width="26" height="26" viewBox="0 0 26 26" xmlns="http://www.w3.org/2000/svg"><circle cx="13" cy="13" r="10" stroke="currentColor" stroke-width="2" fill="none"/></svg>'
        });

        Lampa.SettingsApi.addParam({
            component: 'utopia',
            param: {
                name: 'utopia_api_key',
                type: 'input',
                values: '',
                default: ''
            },
            field: {
                name: 'API ключ UTOPIA',
                description: 'Встав свій ключ доступу до utp.to. Без нього пошук торентів працювати не буде.'
            },
            onChange: function (value) {
                Lampa.Storage.set('utopia_api_key', value.trim());
            }
        });
    }

    // =========================================================
    // 3. Запит до API
    // =========================================================
    function request(query, page, onSuccess, onError) {
        var key = getKey();

        if (!key) {
            Lampa.Noty.show('UTOPIA: спочатку вкажи API ключ у налаштуваннях плагіна');
            if (onError) onError('no_key');
            return;
        }

        var url = API_BASE + '/torrents/filter'
            + '?name=' + encodeURIComponent(query)
            + '&perPage=' + PER_PAGE
            + '&page=' + (page || 1);

        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.setRequestHeader('Authorization', 'Bearer ' + key);
        xhr.setRequestHeader('Accept', 'application/json');
        xhr.timeout = 15000;

        xhr.onreadystatechange = function () {
            if (xhr.readyState !== 4) return;

            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    var data = JSON.parse(xhr.responseText);
                    onSuccess(data);
                } catch (e) {
                    Lampa.Noty.show('UTOPIA: помилка розбору відповіді (JSON)');
                    if (onError) onError('parse_error');
                }
            } else if (xhr.status === 401) {
                Lampa.Noty.show('UTOPIA: HTTP 401 — неправильний API ключ');
                if (onError) onError('unauthorized');
            } else if (xhr.status === 403) {
                Lampa.Noty.show('UTOPIA: HTTP 403 — доступ заборонено');
                if (onError) onError('forbidden');
            } else {
                Lampa.Noty.show('UTOPIA: HTTP ' + xhr.status);
                if (onError) onError('http_' + xhr.status);
            }
        };

        xhr.onerror = function () {
            Lampa.Noty.show('UTOPIA: помилка мережі / CORS');
            if (onError) onError('network');
        };

        xhr.ontimeout = function () {
            Lampa.Noty.show('UTOPIA: перевищено час очікування');
            if (onError) onError('timeout');
        };

        xhr.send();
    }

    // =========================================================
    // 4. Компонент — екран зі списком знайдених торентів
    // =========================================================
    function TorrentsComponent(object) {
        var scroll = new Lampa.Scroll({ mask: true, over: true, step: 200 });
        var html = $('<div class="torrent-list"></div>');
        var last;

        this.create = function () {
            return this.render();
        };

        this.render = function () {
            return scroll.render();
        };

        this.start = function () {
            if (Lampa.Activity.active().activity !== this.activity) return;
            this.buildList();
        };

        this.buildList = function () {
            Lampa.Loading.start('utopia_search', 'UTOPIA: пошук...');

            request(object.search, 1, function (data) {
                Lampa.Loading.stop('utopia_search');

                var items = (data && data.data) || [];

                if (!items.length) {
                    html.append(
                        $('<div style="padding:2em; text-align:center; opacity:0.6;">Нічого не знайдено</div>')
                    );
                    scroll.append(html);
                    return;
                }

                items.forEach(function (item) {
                    var name = item.name || 'Без назви';
                    var size = item.size ? formatSize(item.size) : '';
                    var seeds = (item.seeders != null) ? item.seeders : (item.seeds != null ? item.seeds : '?');
                    var peers = (item.leechers != null) ? item.leechers : (item.peers != null ? item.peers : '?');
                    var magnet = item.magnet || item.magnet_uri || '';

                    var row = $(
                        '<div class="torrent-item selector" style="padding:1em; border-bottom:1px solid rgba(255,255,255,0.1);">' +
                            '<div class="torrent-item__title" style="font-weight:600; margin-bottom:0.3em;"></div>' +
                            '<div class="torrent-item__info" style="opacity:0.7; font-size:0.85em;"></div>' +
                        '</div>'
                    );

                    row.find('.torrent-item__title').text(name);
                    row.find('.torrent-item__info').text(
                        (size ? size + ' | ' : '') + 'Сіди: ' + seeds + ' / Піри: ' + peers
                    );

                    row.on('hover:enter', function () {
                        if (!magnet) {
                            Lampa.Noty.show('UTOPIA: немає magnet-посилання для цього торента');
                            return;
                        }
                        Lampa.Torrent.play({ url: magnet, name: name });
                    });

                    html.append(row);
                });

                scroll.append(html);
                scroll.append = function () {}; // не додавати вдруге при повторному start()

                Lampa.Controller.enable('content');
            }, function () {
                Lampa.Loading.stop('utopia_search');
            });
        };

        this.back = function () {
            Lampa.Activity.backward();
        };

        this.pause = function () {};
        this.stop = function () {};

        this.destroy = function () {
            scroll.destroy();
            html.remove();
        };
    }

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

    // Реєструємо компонент під ім'ям, яке викликатиме Lampa.Activity.push
    Lampa.Component.add('utopia_torrents', TorrentsComponent);

    // =========================================================
    // 5. Кнопка на картці фільму/серіалу ("Повна інформація")
    // =========================================================
    function addButtonToCard(root, object) {
        if (root.find('.utopia-search-btn').length) return; // не дублювати кнопку

        var title = (object.movie && (object.movie.title || object.movie.name)) || '';
        if (!title) return;

        var button = $(
            '<div class="full-start__button selector utopia-search-btn" data-subtitle="UTOPIA">' +
                '<span>UTOPIA — торенти</span>' +
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

        // Пробуємо додати кнопку поруч зі стандартними кнопками картки
        var target = root.find('.full-start__buttons');
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
    // 6. Ініціалізація плагіна
    // =========================================================
    function init() {
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
