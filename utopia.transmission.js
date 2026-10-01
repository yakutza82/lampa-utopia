(function () {
    'use strict';

    if (window.UTOPIA_TRANSMISSION) return;

    var STORAGE_KEY = 'utopia_transmission_profiles';
    var ACTIVE_KEY = 'utopia_transmission_active';
    var sessionCache = {};

    var profilesField = {
        name: 'Профілі Transmission',
        description: 'Сервери, логін, пароль і папки'
    };

    function injectCustomStyles() {
        try {
            if (!$('#utopia-transmission-style').length) {
                $('head').append(
                    '<style id="utopia-transmission-style">' +
                        '.select-item svg, .select-item__icon, .select-item__checkbox, .select-item__marker, .select-item__svg { display: none !important; }' +
                        '.settings-param__descr, .settings-param__descr-text, [data-name="profiles"] .settings-param__descr { white-space: pre-line !important; }' +
                    '</style>'
                );
            }
        } catch (e) {}
    }

    function uuid() {
        return 'tr_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
    }

    function getProfiles() {
        var raw = Lampa.Storage.get(STORAGE_KEY, '[]');
        if (typeof raw === 'object' && raw !== null) {
            return Array.isArray(raw) ? raw : [];
        }
        try {
            var parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            return [];
        }
    }

    function saveProfiles(profiles) {
        var data = JSON.stringify(profiles || []);
        Lampa.Storage.set(STORAGE_KEY, data);
        updateActiveProfileDisplay();
    }

    function getActiveId() {
        return String(Lampa.Storage.get(ACTIVE_KEY, '') || '');
    }

    function setActiveId(id) {
        Lampa.Storage.set(ACTIVE_KEY, String(id || ''));
        updateActiveProfileDisplay();
    }

    function getActiveProfile() {
        var profiles = getProfiles();
        var active = getActiveId();

        for (var i = 0; i < profiles.length; i++) {
            if (profiles[i].id === active) return profiles[i];
        }

        return profiles.length ? profiles[0] : null;
    }

    function updateActiveProfileDisplay() {
        var profile = getActiveProfile();
        var activeText = 'Не вибрано';

        if (profile) {
            var url = normalizeUrl(profile);
            activeText = (profile.name || 'Transmission') + (url ? ' (' + url + ')' : '');
        }

        var line1 = 'Сервери, логін, пароль і папки';
        var line2 = 'Активний: ' + activeText;

        profilesField.description = line1 + '\n' + line2;

        var htmlDescr = line1 + '<br><span style="opacity: 0.8;">' + line2 + '</span>';

        try {
            var $el = $('[data-name="profiles"], [data-param="profiles"]');
            if ($el.length) {
                var $descr = $el.find('.settings-param__descr, .settings-param__descr-text, .settings-param__value');
                if ($descr.length) {
                    $descr.html(htmlDescr);
                } else {
                    $el.children().last().html(htmlDescr);
                }
            }
        } catch (e) {}
    }

    function normalizeUrl(profile) {
        var protocol = profile.protocol || 'https';
        var host = String(profile.host || '').trim();
        var port = String(profile.port || '').trim();

        if (!host) return '';

        host = host.replace(/^https?:\/\//i, '').replace(/\/+$/, '');

        var url = protocol + '://' + host;
        
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

    function closeSelect() {
        if (Lampa.Select && typeof Lampa.Select.hide === 'function') {
            Lampa.Select.hide();
        }
        try {
            Lampa.Controller.toggle('settings_component');
        } catch (e) {}
    }

    function getSessionFromResponse(reqObj) {
        if (!reqObj) return '';
        var session = '';

        try {
            if (typeof reqObj.getResponseHeader === 'function') {
                session = reqObj.getResponseHeader('X-Transmission-Session-Id') ||
                          reqObj.getResponseHeader('x-transmission-session-id') || '';
            }
        } catch (e) {}

        if (!session && reqObj.headers) {
            try {
                if (typeof reqObj.headers.get === 'function') {
                    session = reqObj.headers.get('X-Transmission-Session-Id') ||
                              reqObj.headers.get('x-transmission-session-id') || '';
                } else {
                    session = reqObj.headers['X-Transmission-Session-Id'] ||
                              reqObj.headers['x-transmission-session-id'] || '';
                }
            } catch (e) {}
        }

        if (!session) {
            var bodyText = reqObj.responseText || reqObj.response || '';
            if (typeof bodyText === 'string' && bodyText) {
                var match = bodyText.match(/X-Transmission-Session-Id:\s*([a-zA-Z0-9]+)/i);
                if (match && match[1]) {
                    session = match[1];
                } else {
                    var codeMatch = bodyText.match(/<code>\s*([a-zA-Z0-9]+)\s*<\/code>/i);
                    if (codeMatch && codeMatch[1]) {
                        session = codeMatch[1];
                    }
                }
            }
        }

        return session;
    }

    function request(profile, body, callback, pathIndex, isRetry) {
        var paths = [
            profile.rpc_path || '/transmission/rpc',
            '/transmission/rpc',
            '/rpc',
            '/'
        ];

        var uniquePaths = [];
        for (var p = 0; p < paths.length; p++) {
            if (paths[p] && uniquePaths.indexOf(paths[p]) === -1) {
                uniquePaths.push(paths[p]);
            }
        }

        var idx = pathIndex || 0;
        var currentPath = uniquePaths[idx] || uniquePaths[0];
        var url = getRpcUrl(profile, currentPath);

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
            method: 'POST',
            type: 'POST',
            dataType: 'text',
            headers: requestHeaders
        };

        req.native(
            url,
            function (data) {
                if (typeof data === 'string' && (data.trim().indexOf('<') === 0 || data.indexOf('<!DOCTYPE') !== -1)) {
                    callback(false, null, 'Сервер повернув HTML замість JSON (перевірте Nginx/шлях)');
                    return;
                }
                try {
                    var json = typeof data === 'string' ? JSON.parse(data) : data;
                    if (currentPath !== profile.rpc_path) {
                        profile.rpc_path = currentPath;
                    }
                    callback(true, json, null);
                } catch (e) {
                    callback(false, null, 'Некоректний JSON від Transmission');
                }
            },
            function (reqObj, statusText) {
                var status = reqObj ? (reqObj.status || reqObj.statusCode || 0) : 0;
                var newSession = getSessionFromResponse(reqObj);

                if (newSession) {
                    sessionCache[profileKey] = newSession;
                }

                if ((status === 409 || newSession) && !isRetry) {
                    request(profile, body, callback, idx, true);
                    return;
                }

                if (status === 404 && idx + 1 < uniquePaths.length) {
                    request(profile, body, callback, idx + 1, false);
                    return;
                }

                callback(
                    false,
                    null,
                    (status ? 'HTTP ' + status + ': ' : '') +
                    (reqObj && reqObj.statusText ? reqObj.statusText : (statusText || 'Помилка мережі'))
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

    function editProfile(profile, initialAction) {
        injectCustomStyles();
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

        function openEditor(activeAction) {
            var currentActive = activeAction || initialAction || 'name';

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

            var activeIndex = 0;
            for (var a = 0; a < items.length; a++) {
                if (items[a].action === currentActive) {
                    activeIndex = a;
                    break;
                }
            }

            Lampa.Select.show({
                title: isNew ? 'Новий профіль Transmission' : 'Редагування: ' + (profile.name || 'Transmission'),
                items: items,
                active: activeIndex,
                onSelect: function (item) {
                    if (item.action === 'name') {
                        inputDialog('Назва профілю', profile.name, function (v) {
                            if (v !== null && v !== undefined && String(v).trim() !== '') {
                                profile.name = String(v).trim();
                            }
                            setTimeout(function () { openEditor('name'); }, 200);
                        });
                        return;
                    }

                    if (item.action === 'protocol') {
                        Lampa.Select.show({
                            title: 'Протокол',
                            items: [
                                { title: 'HTTPS', value: 'https' },
                                { title: 'HTTP', value: 'http' }
                            ],
                            active: profile.protocol === 'http' ? 1 : 0,
                            onSelect: function (p) {
                                profile.protocol = p.value;
                                if (profile.protocol === 'https' && profile.port === '9091') profile.port = '443';
                                if (profile.protocol === 'http' && profile.port === '443') profile.port = '9091';
                                setTimeout(function () { openEditor('protocol'); }, 200);
                            },
                            onBack: function () { setTimeout(function () { openEditor('protocol'); }, 200); }
                        });
                        return;
                    }

                    if (item.action === 'host') {
                        inputDialog('Адреса Transmission', profile.host, function (v) {
                            if (v !== null && v !== undefined && String(v).trim() !== '') {
                                profile.host = String(v).trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
                            }
                            setTimeout(function () { openEditor('host'); }, 200);
                        });
                        return;
                    }

                    if (item.action === 'port') {
                        inputDialog('Порт Transmission', profile.port, function (v) {
                            if (v !== null && v !== undefined && String(v).trim() !== '') {
                                profile.port = String(v).trim();
                            }
                            setTimeout(function () { openEditor('port'); }, 200);
                        });
                        return;
                    }

                    if (item.action === 'username') {
                        inputDialog('Логін', profile.username, function (v) {
                            if (v !== null && v !== undefined && String(v).trim() !== '') {
                                profile.username = String(v).trim();
                            }
                            setTimeout(function () { openEditor('username'); }, 200);
                        });
                        return;
                    }

                    if (item.action === 'password') {
                        inputDialog('Пароль', profile.password, function (v) {
                            if (v !== null && v !== undefined && String(v).trim() !== '') {
                                profile.password = String(v).trim();
                            }
                            setTimeout(function () { openEditor('password'); }, 200);
                        });
                        return;
                    }

                    if (item.action === 'movies') {
                        inputDialog('Папка Movies', profile.movies, function (v) {
                            if (v !== null && v !== undefined && String(v).trim() !== '') {
                                profile.movies = String(v).trim();
                            }
                            setTimeout(function () { openEditor('movies'); }, 200);
                        });
                        return;
                    }

                    if (item.action === 'shows') {
                        inputDialog('Папка Shows', profile.shows, function (v) {
                            if (v !== null && v !== undefined && String(v).trim() !== '') {
                                profile.shows = String(v).trim();
                            }
                            setTimeout(function () { openEditor('shows'); }, 200);
                        });
                        return;
                    }

                    if (item.action === 'cartoons') {
                        inputDialog('Папка Cartoons', profile.cartoons, function (v) {
                            if (v !== null && v !== undefined && String(v).trim() !== '') {
                                profile.cartoons = String(v).trim();
                            }
                            setTimeout(function () { openEditor('cartoons'); }, 200);
                        });
                        return;
                    }

                    if (item.action === 'test') {
                        if (!profile.host) {
                            Lampa.Noty.show('❌ Спочатку вкажи адресу Transmission');
                            setTimeout(function () { openEditor('host'); }, 500);
                            return;
                        }

                        Lampa.Noty.show('Перевіряємо Transmission...');
                        testConnection(profile, function (ok, result) {
                            if (!ok) {
                                Lampa.Noty.show('❌ Transmission: ' + result);
                            } else {
                                var args = (result && result.result === 'success') ? (result.arguments || {}) : {};
                                var ver = args.version || args['rpc-version'] || 'підключено успішно';
                                Lampa.Noty.show('✅ Transmission підключено: ' + ver);
                            }
                            setTimeout(function () { openEditor('test'); }, 700);
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
                        setTimeout(function () {
                            showProfiles();
                        }, 200);
                        return;
                    }
                },
                onBack: function () {
                    if (getProfiles().length > 0) {
                        setTimeout(function () {
                            showProfiles();
                        }, 200);
                    } else {
                        closeSelect();
                    }
                }
            });
        }

        openEditor();
    }

    function showProfiles(pendingActiveId) {
        injectCustomStyles();
        var profiles = getProfiles();

        if (!profiles.length) {
            editProfile(null);
            return;
        }

        var activeId = (pendingActiveId !== undefined) ? pendingActiveId : getActiveId();
        var items = [];
        var activeIndex = 0;

        profiles.forEach(function (profile, index) {
            var isActive = (profile.id === activeId);
            if (isActive) activeIndex = index;
            var icon = isActive ? '◉ ' : '○ ';
            items.push({
                title: icon + (profile.name || 'Без назви'),
                subtitle: normalizeUrl(profile) || 'Адреса не вказана',
                profile: profile,
                action: 'select_temp'
            });
        });

        items.push({ title: '💾 Зберегти', action: 'save_active' });
        items.push({ title: '➕ Додати профіль', action: 'add' });
        items.push({ title: '✏️ Редагувати вибраний профіль', action: 'edit' });
        items.push({ title: '🗑 Видалити вибраний профіль', action: 'delete' });

        Lampa.Select.show({
            title: 'Transmission',
            items: items,
            active: activeIndex,
            onSelect: function (item) {
                if (item.action === 'select_temp' && item.profile) {
                    setTimeout(function () {
                    showProfiles(item.profile.id);
                    }, 200); // 200ms замість 50ms
                    return;
            }

                if (item.action === 'save_active') {
                    setActiveId(activeId);
                    var selectedProf = getActiveProfile();
                    var name = selectedProf ? (selectedProf.name || 'профіль') : '';
                    Lampa.Noty.show('✅ Transmission: ' + name + ' збережено');
                    closeSelect();
                    return;
                }

                if (item.action === 'add') {
                    editProfile(null);
                    return;
                }

                if (item.action === 'edit') {
                    var profToEdit = null;
                    for (var i = 0; i < profiles.length; i++) {
                        if (profiles[i].id === activeId) {
                            profToEdit = profiles[i];
                            break;
                        }
                    }
                    editProfile(profToEdit || getActiveProfile());
                    return;
                }

                if (item.action === 'delete') {
                    var profToDelete = null;
                    for (var d = 0; d < profiles.length; d++) {
                        if (profiles[d].id === activeId) {
                            profToDelete = profiles[d];
                            break;
                        }
                    }
                    deleteProfile(profToDelete || getActiveProfile());
                    setTimeout(function () {
                        showProfiles();
                    }, 200);
                    return;
                }

                closeSelect();
            },
            onBack: function () {
                closeSelect();
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

        injectCustomStyles();
        updateActiveProfileDisplay();

        Lampa.SettingsApi.addComponent({
            component: 'utopia_transmission',
            name: 'Transmission',
            icon:
                '<svg width="1.5em" height="1.5em" viewBox="0 0 64 64" ' +
                'xmlns="http://www.w3.org/2000/svg" ' +
                'style="display:block;flex-shrink:0;">' +
                    '<image href="https://raw.githubusercontent.com/yakutza82/lampa-utopia/c1ba69b9bcb19acd39e3c7b9704352c46e38a725/transdroneWH.png" ' +
                    'x="0" y="0" width="68" height="68" />' +
                '</svg>'
        });

        Lampa.SettingsApi.addParam({
            component: 'utopia_transmission',
            param: { name: 'profiles', type: 'button' },
            field: profilesField,
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

        Lampa.Listener.follow('settings', function (e) {
            if (e.type === 'open' || e.name === 'utopia_transmission') {
                setTimeout(updateActiveProfileDisplay, 100);
            }
        });
    }
})();
