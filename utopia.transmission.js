(function () {
    'use strict';

    if (window.UTOPIA_TRANSMISSION) return;

    var STORAGE_KEY = 'utopia_transmission_profiles';
    var ACTIVE_KEY = 'utopia_transmission_active';
    var sessionCache = {};

    function uuid() {
        return 'tr_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
    }

    function getProfiles() {
        var profiles = Lampa.Storage.get(STORAGE_KEY, []);
        return Array.isArray(profiles) ? profiles : [];
    }

    function saveProfiles(profiles) {
        Lampa.Storage.set(STORAGE_KEY, profiles);
    }

    function getActiveId() {
        return Lampa.Storage.get(ACTIVE_KEY, '');
    }

    function setActiveId(id) {
        Lampa.Storage.set(ACTIVE_KEY, id);
    }

    function getActiveProfile() {
        var profiles = getProfiles();
        var active = getActiveId();

        for (var i = 0; i < profiles.length; i++) {
            if (profiles[i].id === active) return profiles[i];
        }

        return profiles.length ? profiles[0] : null;
    }

    function normalizeUrl(profile) {
        var protocol = profile.protocol || 'https';
        var host = String(profile.host || '').trim();
        var port = String(profile.port || '').trim();

        if (!host) return '';

        host = host.replace(/^https?:\/\//i, '').replace(/\/+$/, '');

        var url = protocol + '://' + host;
        
        // Додаємо порт тільки якщо він не є стандартним для протоколу
        if (port && !(protocol === 'https' && port === '443') && !(protocol === 'http' && port === '80')) {
            url += ':' + port;
        }

        return url;
    }

    function getRpcUrl(profile, customPath) {
        var base = normalizeUrl(profile);
        if (!base) return '';

        var path = customPath || profile.rpc_path || '/transmission/rpc';
        path = String(path).trim();
        if (path.charAt(0) !== '/') path = '/' + path;

        return base + path;
    }

    function getSessionHeader(response) {
        if (!response) return '';
        try {
            if (typeof response.getResponseHeader === 'function') {
                return response.getResponseHeader('X-Transmission-Session-Id') ||
                       response.getResponseHeader('x-transmission-session-id') || '';
            }
            if (response.headers) {
                if (typeof response.headers.get === 'function') {
                    return response.headers.get('X-Transmission-Session-Id') ||
                           response.headers.get('x-transmission-session-id') || '';
                }
                return response.headers['X-Transmission-Session-Id'] ||
                       response.headers['x-transmission-session-id'] || '';
            }
        } catch (e) {}
        return '';
    }

    function request(profile, body, callback, pathOverride, isRetry) {
        var url = getRpcUrl(profile, pathOverride);

        if (!url) {
            callback(false, null, 'Не вказана адреса Transmission');
            return;
        }

        var auth = '';
        try {
            if (profile.username || profile.password) {
                auth = btoa(String(profile.username || '') + ':' + String(profile.password || ''));
            }
        } catch (e) {}

        var RequestClass = Lampa.Reguest || Lampa.Request;
        if (!RequestClass || typeof RequestClass !== 'function') {
            callback(false, null, 'Lampa Request недоступний');
            return;
        }

        var req = new RequestClass();
        var requestHeaders = {
            'Content-Type': 'application/json'
        };

        if (auth) {
            requestHeaders['Authorization'] = 'Basic ' + auth;
        }

        var profileKey = profile.id || url;
        if (sessionCache[profileKey]) {
            requestHeaders['X-Transmission-Session-Id'] = sessionCache[profileKey];
        }

        var options = {
            dataType: 'text',
            headers: requestHeaders
        };

        req.native(
            url,
            function (data, response) {
                try {
                    var json = typeof data === 'string' ? JSON.parse(data) : data;
                    callback(true, json, null);
                } catch (e) {
                    callback(false, null, 'Некоректний JSON від Transmission');
                }
            },
            function (error, response) {
                var status = response ? (response.status || response.statusCode || 0) : 0;
                var newSession = getSessionHeader(response);

                if (newSession) {
                    sessionCache[profileKey] = newSession;
                }

                // 1. Автоматична обробка 409 Conflict (Отримання Session ID і повтор)
                if (status === 409 && newSession && !isRetry) {
                    request(profile, body, callback, pathOverride, true);
                    return;
                }

                // 2. Автоматичний фолбек для 404 (Якщо Nginx відпроксований без /transmission/)
                if (status === 404 && !pathOverride) {
                    var fallbackPath = (profile.rpc_path === '/rpc') ? '/transmission/rpc' : '/rpc';
                    request(profile, body, callback, fallbackPath, false);
                    return;
                }

                callback(
                    false,
                    null,
                    (status ? 'HTTP ' + status + ': ' : '') +
                    (error && error.message ? error.message : String(error || 'Помилка мережі'))
                );
            },
            JSON.stringify(body),
            options
        );
    }

    function testConnection(profile, callback) {
        request(
            profile,
            {
                method: 'session-get',
                arguments: {
                    fields: ['version', 'rpc-version', 'download-dir']
                }
            },
            function (ok, data, error) {
                if (!ok) {
                    callback(false, error);
                    return;
                }

                if (data && data.result && data.result !== 'success') {
                    callback(false, data.result || 'RPC Помилка');
                    return;
                }

                callback(true, data);
            }
        );
    }

    function addTorrent(profile, url, downloadDir, callback) {
        var args = { filename: url };
        if (downloadDir) {
            args['download-dir'] = downloadDir;
        }

        request(
            profile,
            {
                method: 'torrent-add',
                arguments: args
            },
            function (ok, data, error) {
                if (!ok) {
                    callback(false, error);
                    return;
                }

                if (data && data.result && data.result !== 'success') {
                    callback(false, data.result || 'Помилка додавання торента');
                    return;
                }

                callback(true, data);
            }
        );
    }

    function inputDialog(title, value, callback) {
        if (Lampa.Input && typeof Lampa.Input.edit === 'function') {
            Lampa.Input.edit({
                title: title,
                value: value || '',
                free: true,
                nosave: true
            }, function (newValue) {
                callback(newValue);
            });
        } else {
            var result = prompt(title, value || '');
            if (result !== null) callback(result);
        }
    }

    function editProfile(profile) {
        var isNew = !profile;

        if (!profile) {
            profile = {
                id: uuid(),
                name: 'Transmission',
                protocol: 'https',
                host: '',
                port: '443',
                rpc_path: '/transmission/rpc',
                username: '',
                password: '',
                movies: '',
                shows: '',
                cartoons: ''
            };
        }

        function openEditor() {
            var items = [
                { title: 'Назва профілю', subtitle: profile.name || 'Transmission', action: 'name' },
                { title: 'Протокол', subtitle: profile.protocol === 'http' ? 'HTTP' : 'HTTPS', action: 'protocol' },
                { title: 'Адреса сервера', subtitle: profile.host || 'Не вказана', action: 'host' },
                { title: 'Порт', subtitle: profile.port || 'За замовчуванням', action: 'port' },
                { title: 'Логін', subtitle: profile.username || 'Не вказаний', action: 'username' },
                { title: 'Пароль', subtitle: profile.password ? '••••••••' : 'Не вказаний', action: 'password' },
                { title: 'Папка Movies', subtitle: profile.movies || 'Не вказана', action: 'movies' },
                { title: 'Папка Shows', subtitle: profile.shows || 'Не вказана', action: 'shows' },
                { title: 'Папка Cartoons', subtitle: profile.cartoons || 'Не вказана', action: 'cartoons' },
                { title: '🔌 Перевірити підключення', action: 'test' },
                { title: '💾 Зберегти профіль', action: 'save' }
            ];

            Lampa.Select.show({
                title: isNew ? 'Новий профіль Transmission' : 'Редагування: ' + (profile.name || 'Transmission'),
                items: items,
                onSelect: function (item) {
                    if (item.action === 'name') {
                        inputDialog('Назва профілю', profile.name, function (v) {
                            if (v !== null) profile.name = String(v).trim() || 'Transmission';
                            setTimeout(openEditor, 200);
                        });
                        return;
                    }

                    if (item.action === 'protocol') {
                        Lampa.Select.show({
                            title: 'Протокол',
                            items: [
                                { title: 'HTTPS', value: 'https', selected: profile.protocol !== 'http' },
                                { title: 'HTTP', value: 'http', selected: profile.protocol === 'http' }
                            ],
                            onSelect: function (p) {
                                profile.protocol = p.value;
                                if (profile.protocol === 'https' && profile.port === '9091') profile.port = '443';
                                if (profile.protocol === 'http' && profile.port === '443') profile.port = '9091';
                                setTimeout(openEditor, 200);
                            },
                            onBack: function () { setTimeout(openEditor, 200); }
                        });
                        return;
                    }

                    if (item.action === 'host') {
                        inputDialog('Адреса Transmission', profile.host, function (v) {
                            if (v !== null) profile.host = String(v).trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
                            setTimeout(openEditor, 200);
                        });
                        return;
                    }

                    if (item.action === 'port') {
                        inputDialog('Порт Transmission', profile.port, function (v) {
                            if (v !== null) profile.port = String(v).trim();
                            setTimeout(openEditor, 200);
                        });
                        return;
                    }

                    if (item.action === 'username') {
                        inputDialog('Логін', profile.username, function (v) {
                            if (v !== null) profile.username = String(v);
                            setTimeout(openEditor, 200);
                        });
                        return;
                    }

                    if (item.action === 'password') {
                        inputDialog('Пароль', profile.password, function (v) {
                            if (v !== null) profile.password = String(v);
                            setTimeout(openEditor, 200);
                        });
                        return;
                    }

                    if (item.action === 'movies') {
                        inputDialog('Папка Movies', profile.movies, function (v) {
                            if (v !== null) profile.movies = String(v).trim();
                            setTimeout(openEditor, 200);
                        });
                        return;
                    }

                    if (item.action === 'shows') {
                        inputDialog('Папка Shows', profile.shows, function (v) {
                            if (v !== null) profile.shows = String(v).trim();
                            setTimeout(openEditor, 200);
                        });
                        return;
                    }

                    if (item.action === 'cartoons') {
                        inputDialog('Папка Cartoons', profile.cartoons, function (v) {
                            if (v !== null) profile.cartoons = String(v).trim();
                            setTimeout(openEditor, 200);
                        });
                        return;
                    }

                    if (item.action === 'test') {
                        if (!profile.host) {
                            Lampa.Noty.show('❌ Спочатку вкажи адресу Transmission');
                            setTimeout(openEditor, 500);
                            return;
                        }

                        Lampa.Noty.show('Перевіряємо Transmission...');
                        testConnection(profile, function (ok, result) {
                            if (!ok) {
                                Lampa.Noty.show('❌ Transmission: ' + result);
                            } else {
                                var args = (result && result.result === 'success') ? (result.arguments || {}) : {};
                                var ver = args.version || args['rpc-version'] || 'версія підтверджена';
                                Lampa.Noty.show('✅ Transmission підключено: ' + ver);
                            }
                            setTimeout(openEditor, 700);
                        });
                        return;
                    }

                    if (item.action === 'save') {
                        profile.name = String(profile.name || '').trim() || 'Transmission';
                        profile.protocol = profile.protocol === 'http' ? 'http' : 'https';
                        profile.host = String(profile.host || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
                        profile.port = String(profile.port || '').trim();
                        profile.username = String(profile.username || '');
                        profile.password = String(profile.password || '');
                        profile.movies = String(profile.movies || '').trim();
                        profile.shows = String(profile.shows || '').trim();
                        profile.cartoons = String(profile.cartoons || '').trim();
                        profile.rpc_path = profile.rpc_path || '/transmission/rpc';

                        var profiles = getProfiles();
                        var found = false;

                        for (var i = 0; i < profiles.length; i++) {
                            if (profiles[i].id === profile.id) {
                                profiles[i] = profile;
                                found = true;
                                break;
                            }
                        }

                        if (!found) profiles.push(profile);

                        saveProfiles(profiles);
                        setActiveId(profile.id);

                        Lampa.Noty.show('✅ Профіль Transmission збережено');
                        Lampa.Controller.toggle('content');
                        return;
                    }
                },
                onBack: function () {
                    Lampa.Controller.toggle('content');
                }
            });
        }

        openEditor();
    }

    function showProfiles() {
        var profiles = getProfiles();

        if (!profiles.length) {
            editProfile(null);
            return;
        }

        var items = [];

        profiles.forEach(function (profile) {
            items.push({
                title: profile.name || 'Без назви',
                subtitle: normalizeUrl(profile) || 'Адреса не вказана',
                profile: profile,
                action: 'select'
            });
        });

        items.push({ title: '➕ Додати профіль', action: 'add' });
        items.push({ title: '✏️ Редагувати профіль', action: 'edit' });
        items.push({ title: '🗑 Видалити профіль', action: 'delete' });

        Lampa.Select.show({
            title: 'Transmission',
            items: items,
            onSelect: function (item) {
                if (item.action === 'add') {
                    editProfile(null);
                    return;
                }

                if (item.action === 'edit') {
                    editProfile(getActiveProfile());
                    return;
                }

                if (item.action === 'delete') {
                    deleteProfile(getActiveProfile());
                    return;
                }

                if (item.action === 'select' && item.profile) {
                    setActiveId(item.profile.id);
                    Lampa.Noty.show('Transmission: ' + (item.profile.name || 'профіль') + ' вибрано');
                }

                Lampa.Controller.toggle('content');
            },
            onBack: function () {
                Lampa.Controller.toggle('content');
            }
        });
    }

    function deleteProfile(profile) {
        if (!profile) return;

        var profiles = getProfiles().filter(function (item) {
            return item.id !== profile.id;
        });

        saveProfiles(profiles);

        if (getActiveId() === profile.id) {
            setActiveId(profiles.length ? profiles[0].id : '');
        }

        Lampa.Noty.show('Профіль видалено');
    }

    function showTest() {
        var profile = getActiveProfile();

        if (!profile) {
            Lampa.Noty.show('Спочатку додай профіль Transmission');
            return;
        }

        Lampa.Noty.show('Перевіряємо Transmission...');

        testConnection(profile, function (ok, result) {
            if (!ok) {
                Lampa.Noty.show('❌ Transmission: ' + result);
                return;
            }

            var args = (result && result.result === 'success') ? (result.arguments || {}) : {};
            var ver = args.version || args['rpc-version'] || 'підключено успішно';

            Lampa.Noty.show('✅ Transmission підключено: ' + ver);
        });
    }

    window.UTOPIA_TRANSMISSION = {
        isReady: function () {
            return getProfiles().length > 0;
        },
        getProfiles: function () {
            return getProfiles();
        },
        getActiveProfile: function () {
            return getActiveProfile();
        },
        testConnection: function (callback) {
            var profile = getActiveProfile();
            if (!profile) {
                if (callback) callback(false, 'Немає активного профілю');
                return;
            }
            testConnection(profile, callback);
        },
        addTorrent: function (url, downloadDir, callback) {
            var profile = getActiveProfile();
            if (!profile) {
                if (callback) callback(false, 'Немає активного профілю');
                return;
            }
            addTorrent(profile, url, downloadDir, callback || function () {});
        },
        showProfiles: showProfiles
    };

    function initSettings() {
        if (!window.Lampa || !Lampa.SettingsApi) return;

        Lampa.SettingsApi.addComponent({
            component: 'utopia_transmission',
            name: 'Transmission',
            icon: '📡'
        });

        Lampa.SettingsApi.addParam({
            component: 'utopia_transmission',
            param: { name: 'profiles', type: 'button' },
            field: {
                name: 'Профілі Transmission',
                description: 'Сервери, логін, пароль і папки'
            },
            onChange: showProfiles
        });

        Lampa.SettingsApi.addParam({
            component: 'utopia_transmission',
            param: { name: 'test', type: 'button' },
            field: { name: 'Перевірити підключення' },
            onChange: showTest
        });
    }

    if (window.Lampa && Lampa.Listener) {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') {
                initSettings();
            }
        });
    }
})();
