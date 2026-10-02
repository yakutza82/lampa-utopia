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
        var profiles = getProfiles();
        var activeId = getActiveId();

        var mainProfile = null;
        var additionalProfiles = [];

        if (profiles.length > 0) {
            for (var i = 0; i < profiles.length; i++) {
                if (profiles[i].id === activeId) {
                    mainProfile = profiles[i];
                    break;
                }
            }
            if (!mainProfile) {
                mainProfile = profiles[0];
            }

            for (var j = 0; j < profiles.length; j++) {
                if (profiles[j].id !== mainProfile.id) {
                    additionalProfiles.push(profiles[j]);
                }
            }
        }

        var line1 = 'Сервери, логін, пароль і папки';
        var line2 = 'Основний: ';

        if (mainProfile) {
            var mainUrl = normalizeUrl(mainProfile);
            line2 += (mainProfile.name || 'Transmission') + (mainUrl ? ' (' + mainUrl + ')' : '');
        } else {
            line2 += 'відсутній';
        }

        var fullDescr = line1 + '\n' + line2;
        var htmlDescr = line1 + '<br><span style="opacity: 0.8;">' + line2 + '</span>';

        if (additionalProfiles.length > 0) {
            var addTexts = additionalProfiles.map(function (p) {
                var u = normalizeUrl(p);
                return (p.name || 'Transmission') + (u ? ' (' + u + ')' : '');
            });
            var line3 = 'Додатковий: ' + addTexts.join(', ');
            fullDescr += '\n' + line3;
            htmlDescr += '<br><span style="opacity: 0.8;">' + line3 + '</span>';
        }

        profilesField.description = fullDescr;

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
                auth = btoa(
                    String(profile.username || '') +
                    ':' +
                    String(profile.password || '')
                );
            }
        } catch (e) {}

        var profileKey = profile.id || url;

        var xhr = new XMLHttpRequest();

        var headers = {
            'Content-Type': 'application/json'
        };

        if (auth) {
            headers['Authorization'] = 'Basic ' + auth;
        }

        if (sessionCache[profileKey]) {
            headers['X-Transmission-Session-Id'] = sessionCache[profileKey];
        }

        xhr.open('POST', url, true);

        for (var headerName in headers) {
            try {
                xhr.setRequestHeader(headerName, headers[headerName]);
            } catch (e) {}
        }

        xhr.onreadystatechange = function () {
            if (xhr.readyState !== 4) return;

            var status = xhr.status || 0;
            var newSession = '';

            try {
                newSession = xhr.getResponseHeader('X-Transmission-Session-Id') || '';
            } catch (e) {}

            if (newSession) {
                sessionCache[profileKey] = newSession;
            }

            if (status === 409 && newSession && !isRetry) {
                request(profile, body, callback, idx, true);
                return;
            }

            if (status === 404 && idx + 1 < uniquePaths.length) {
                request(profile, body, callback, idx + 1, false);
                return;
            }

            var responseText = xhr.responseText || '';

            if (status >= 200 && status < 300) {
                try {
                    var json = JSON.parse(responseText);
                    if (currentPath !== profile.rpc_path) {
                        profile.rpc_path = currentPath;
                    }
                    callback(true, json, null);
                } catch (e) {
                    callback(
                        false,
                        null,
                        'Некоректний JSON від Transmission [' + currentPath + ']'
                    );
                }
                return;
            }

            var bodyText = '';

            try {
                bodyText = String(responseText)
                    .replace(/<[^>]*>/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim()
                    .slice(0, 180);
            } catch (e) {}

            var debug = '';

            try {
                debug =
                    ' {xhr:' + typeof xhr +
                    ' hdr:' + typeof xhr.getResponseHeader +
                    ' body:' + responseText.length +
                    ' st:' + status +
                    '}';
            } catch (e) {}

            callback(
                false,
                null,
                (status ? 'HTTP ' + status + ': ' : '') +
                (xhr.statusText || 'Помилка мережі') +
                (bodyText ? ' | ' + bodyText : '') +
                ' [' + currentPath + ']' +
                debug
            );
        };

        xhr.onerror = function () {
            callback(
                false,
                null,
                'Помилка мережі [' +
                currentPath +
                '] {xhr:' +
                typeof xhr +
                ' st:' +
                (xhr.status || 0) +
                '}'
            );
        };

        xhr.ontimeout = function () {
            callback(
                false,
                null,
                'Таймаут Transmission [' + currentPath + ']'
            );
        };

        xhr.timeout = 15000;

        try {
            xhr.send(JSON.stringify(body));
        } catch (e) {
            callback(
                false,
                null,
                'Помилка відправки: ' +
                (e && e.message ? e.message : String(e))
            );
        }
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

    function inputDialog(title, value, onSave, onCancel) {
        if (Lampa.Input && typeof Lampa.Input.edit === 'function') {
            Lampa.Input.edit(
                {
                    title: title,
                    value: value || '',
                    free: true,
                    nosave: true
                },
                function (newValue) {
                    if (typeof onSave === 'function') onSave(newValue);
                },
                function () {
                    if (typeof onCancel === 'function') onCancel();
                }
            );
        } else {
            var result = prompt(title, value || '');
            if (result !== null) {
                if (typeof onSave === 'function') onSave(result);
            } else {
                if (typeof onCancel === 'function') onCancel();
            }
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
                { title: 'Шлях RPC', subtitle: profile.rpc_path || '/transmission/rpc', action: 'rpc_path' },
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
                        inputDialog(
                            'Назва профілю',
                            profile.name,
                            function (v) {
                                if (v !== null && v !== undefined && String(v).trim() !== '') {
                                    profile.name = String(v).trim();
                                }
                                setTimeout(function () { openEditor('name'); }, 200);
                            },
                            function () {
                                setTimeout(function () { openEditor('name'); }, 200);
                            }
                        );
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
                        inputDialog(
                            'Адреса Transmission',
                            profile.host,
                            function (v) {
                                if (v !== null && v !== undefined && String(v).trim() !== '') {
                                    profile.host = String(v).trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
                                }
                                setTimeout(function () { openEditor('host'); }, 200);
                            },
                            function () {
                                setTimeout(function () { openEditor('host'); }, 200);
                            }
                        );
                        return;
                    }

                    if (item.action === 'port') {
                        inputDialog(
                            'Порт Transmission',
                            profile.port,
                            function (v) {
                                if (v !== null && v !== undefined && String(v).trim() !== '') {
                                    profile.port = String(v).trim();
                                }
                                setTimeout(function () { openEditor('port'); }, 200);
                            },
                            function () {
                                setTimeout(function () { openEditor('port'); }, 200);
                            }
                        );
                        return;
                    }

                    if (item.action === 'rpc_path') {
                        inputDialog(
                            'Шлях RPC',
                            profile.rpc_path,
                            function (v) {
                                if (v !== null && v !== undefined && String(v).trim() !== '') {
                                    var p = String(v).trim();
                                    if (p.charAt(0) !== '/') p = '/' + p;
                                    profile.rpc_path = p;
                                }
                                setTimeout(function () { openEditor('rpc_path'); }, 200);
                            },
                            function () {
                                setTimeout(function () { openEditor('rpc_path'); }, 200);
                            }
                        );
                        return;
                    }

                    if (item.action === 'username') {
                        inputDialog(
                            'Логін',
                            profile.username,
                            function (v) {
                                if (v !== null && v !== undefined) {
                                    profile.username = String(v).trim();
                                }
                                setTimeout(function () { openEditor('username'); }, 200);
                            },
                            function () {
                                setTimeout(function () { openEditor('username'); }, 200);
                            }
                        );
                        return;
                    }

                    if (item.action === 'password') {
                        inputDialog(
                            'Пароль',
                            profile.password,
                            function (v) {
                                if (v !== null && v !== undefined) {
                                    profile.password = String(v).trim();
                                }
                                setTimeout(function () { openEditor('password'); }, 200);
                            },
                            function () {
                                setTimeout(function () { openEditor('password'); }, 200);
                            }
                        );
                        return;
                    }

                    if (item.action === 'movies') {
                        inputDialog(
                            'Папка Movies',
                            profile.movies,
                            function (v) {
                                if (v !== null && v !== undefined && String(v).trim() !== '') {
                                    profile.movies = String(v).trim();
                                }
                                setTimeout(function () { openEditor('movies'); }, 200);
                            },
                            function () {
                                setTimeout(function () { openEditor('movies'); }, 200);
                            }
                        );
                        return;
                    }

                    if (item.action === 'shows') {
                        inputDialog(
                            'Папка Shows',
                            profile.shows,
                            function (v) {
                                if (v !== null && v !== undefined && String(v).trim() !== '') {
                                    profile.shows = String(v).trim();
                                }
                                setTimeout(function () { openEditor('shows'); }, 200);
                            },
                            function () {
                                setTimeout(function () { openEditor('shows'); }, 200);
                            }
                        );
                        return;
                    }

                    if (item.action === 'cartoons') {
                        inputDialog(
                            'Папка Cartoons',
                            profile.cartoons,
                            function (v) {
                                if (v !== null && v !== undefined && String(v).trim() !== '') {
                                    profile.cartoons = String(v).trim();
                                }
                                setTimeout(function () { openEditor('cartoons'); }, 200);
                            },
                            function () {
                                setTimeout(function () { openEditor('cartoons'); }, 200);
                            }
                        );
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
                        profile.rpc_path = String(profile.rpc_path || '/transmission/rpc').trim();
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

    function showProfiles() {
        injectCustomStyles();
        var profiles = getProfiles();

        if (!profiles.length) {
            editProfile(null);
            return;
        }

        var activeId = getActiveId();
        if (!activeId && profiles.length > 0) {
            activeId = profiles[0].id;
        }

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
                action: 'select_profile'
            });
        });

        items.push({ title: '✏️ Редагувати вибраний профіль', action: 'edit' });
        items.push({ title: '➕ Додати профіль', action: 'add' });
        items.push({ title: '🗑 Видалити вибраний профіль', action: 'delete' });
        items.push({ title: '💾 Зберегти', action: 'save_active' });

        Lampa.Select.show({
            title: 'Transmission',
            items: items,
            active: activeIndex,
            onSelect: function (item) {
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

        setTimeout(function () {
            try {
                var $selectItems = $('.select-item');
                profiles.forEach(function (p, idx) {
                    var $el = $selectItems.eq(idx);
                    if ($el.length) {
                        $el.off('click.utopia_sel').on('click.utopia_sel', function (e) {
                            e.preventDefault();
                            e.stopPropagation();
                            e.stopImmediatePropagation();

                            activeId = p.id;

                            profiles.forEach(function (p2, idx2) {
                                var isAct = (p2.id === activeId);
                                var icon = isAct ? '◉ ' : '○ ';
                                $selectItems.eq(idx2).find('.select-item__title').text(icon + (p2.name || 'Без назви'));
                            });

                            return false;
                        });
                    }
                });
            } catch (e) {}
        }, 50);
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
        showAddTorrent: function (url) {
            if (!url) {
                Lampa.Noty.show('❌ Не вказано посилання на торент');
                return;
            }

            var profiles = getProfiles();
            if (!profiles.length) {
                Lampa.Noty.show('❌ Немає збережених профілів Transmission');
                return;
            }

            function selectFolder(profile) {
                var items = [];

                if (profile.movies) {
                    items.push({
                        title: '🎬 Movies',
                        value: profile.movies
                    });
                }

                if (profile.shows) {
                    items.push({
                        title: '📺 Shows',
                        value: profile.shows
                    });
                }

                if (profile.cartoons) {
                    items.push({
                        title: '🐱 Cartoons',
                        value: profile.cartoons
                    });
                }

                if (!items.length) {
                    Lampa.Noty.show('❌ У профілі не налаштовані папки');
                    return;
                }

                Lampa.Select.show({
                    title: 'Куди завантажити?',
                    items: items,
                    onSelect: function (item) {
                        Lampa.Noty.show('📡 Відправляємо в Transmission...');

                        addTorrent(
                            profile,
                            url,
                            item.value,
                            function (ok, data, error) {
                                if (ok) {
                                    Lampa.Noty.show('✅ Торент додано в Transmission');
                                } else {
                                    Lampa.Noty.show(
                                        '❌ Transmission: ' +
                                        (error || 'Помилка додавання')
                                    );
                                }
                            }
                        );
                    },
                    onBack: function () {
                        setTimeout(function () {
                            selectProfile();
                        }, 200);
                    }
                });
            }

            function selectProfile() {
                var items = [];

                profiles.forEach(function (profile) {
                    items.push({
                        title: profile.name || 'Transmission',
                        subtitle: normalizeUrl(profile),
                        profile: profile
                    });
                });

                Lampa.Select.show({
                    title: 'Виберіть Transmission',
                    items: items,
                    active: Math.max(
                        0,
                        profiles.findIndex(function (p) {
                            return p.id === getActiveId();
                        })
                    ),
                    onSelect: function (item) {
                        if (!item.profile) return;

                        setActiveId(item.profile.id);

                        setTimeout(function () {
                            selectFolder(item.profile);
                        }, 200);
                    },
                    onBack: function () {
                        closeSelect();
                    }
                });
            }

            selectProfile();
        },
        showProfiles: showProfiles
    };

    function registerTorrentReceiver() {
        if (
            !window.LampaTorrentReceivers ||
            typeof window.LampaTorrentReceivers.register !== 'function'
        ) {
            return false;
        }

        window.LampaTorrentReceivers.register({
            id: 'transmission',
            type: 'torrent_receiver',
            title: 'Transmission',

            isReady: function () {
                return getProfiles().length > 0;
            },

            send: function (url) {
                if (
                    window.UTOPIA_TRANSMISSION &&
                    typeof window.UTOPIA_TRANSMISSION.showAddTorrent === 'function'
                ) {
                    window.UTOPIA_TRANSMISSION.showAddTorrent(url);
                }
            }
        });

        return true;
    }

    registerTorrentReceiver();

    if (window.Lampa && Lampa.Listener) {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') {
                registerTorrentReceiver();
            }
        });
    }

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
                    '<image href="https://raw.githubusercontent.com/yakutza82/lampa-utopia/c070bee0bd6b8029b2f9d4ff14f8afa3f5c3b02a/transdroneWH2.png" ' +
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
