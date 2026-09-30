(function () {
    'use strict';

    if (window.UTOPIA_TRANSMISSION) return;

    var STORAGE_KEY = 'utopia_transmission_profiles';
    var ACTIVE_KEY = 'utopia_transmission_active';

    var EDIT_COMPONENT = 'utopia_transmission_edit';

    function uuid() {
        return 'tr_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
    }

    function getProfiles() {
        var profiles = Lampa.Storage.get(STORAGE_KEY, []);

        if (!Array.isArray(profiles)) {
            profiles = [];
        }

        return profiles;
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
            if (profiles[i].id === active) {
                return profiles[i];
            }
        }

        return profiles.length ? profiles[0] : null;
    }

    function normalizeUrl(profile) {
        var protocol = profile.protocol || 'https';
        var host = String(profile.host || '').trim();
        var port = String(profile.port || '').trim();

        if (!host) return '';

        host = host.replace(/^https?:\/\//i, '');
        host = host.replace(/\/+$/, '');

        var url = protocol + '://' + host;

        if (port) {
            url += ':' + port;
        }

        return url;
    }

    /*
     * RPC шлях користувачеві не показуємо.
     * За замовчуванням використовуємо стандартний шлях Transmission.
     */
    function getRpcUrl(profile) {
        var base = normalizeUrl(profile);

        if (!base) return '';

        var path = String(
            profile.rpc_path || '/transmission/rpc'
        ).trim();

        if (path.charAt(0) !== '/') {
            path = '/' + path;
        }

        return base + path;
    }

    function basicAuth(profile) {
        var text =
            String(profile.username || '') +
            ':' +
            String(profile.password || '');

        try {
            return 'Basic ' +
                btoa(unescape(encodeURIComponent(text)));
        } catch (e) {
            return 'Basic ' + btoa(text);
        }
    }

    function request(profile, body, callback) {
    var url = getRpcUrl(profile);

    if (!url) {
        callback(
            false,
            null,
            'Не вказана адреса Transmission'
        );
        return;
    }

    var auth = '';

    try {
        auth = btoa(
            String(profile.username || '') +
            ':' +
            String(profile.password || '')
        );
    } catch (e) {
        callback(
            false,
            null,
            'Не вдалося сформувати авторизацію'
        );
        return;
    }

    var headers = {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + auth
    };

    function send(sessionId) {

        if (
            !Lampa.Reguest ||
            typeof Lampa.Reguest !== 'function'
        ) {
            callback(
                false,
                null,
                'Lampa.Reguest недоступний'
            );
            return;
        }

        var req = new Lampa.Reguest();

        var options = {
            method: 'POST',
            headers: headers,
            data: JSON.stringify(body),
            dataType: 'json'
        };

        if (sessionId) {
            options.headers[
                'X-Transmission-Session-Id'
            ] = sessionId;
        }

        req.native(
            url,
            function (data, response) {

                try {
                    var json =
                        typeof data === 'string'
                            ? JSON.parse(data)
                            : data;

                    callback(
                        true,
                        json,
                        null
                    );

                } catch (e) {

                    callback(
                        false,
                        null,
                        'Некоректна відповідь Transmission'
                    );
                }
            },
            function (error) {

                console.error(
                    '[UTOPIA TRANSMISSION]',
                    error
                );

                callback(
                    false,
                    null,
                    error && error.message
                        ? error.message
                        : String(
                            error ||
                            'Помилка запиту'
                        )
                );
            },
            options
        );
    }

    send();
}

    function testConnection(profile, callback) {
        request(
            profile,
            {
                jsonrpc: '2.0',
                method: 'session_get',
                id: 1,
                params: {
                    fields: [
                        'version',
                        'rpc_version',
                        'rpc_version_semver',
                        'download_dir'
                    ]
                }
            },
            function (ok, data, error) {
                if (!ok) {
                    callback(false, error);
                    return;
                }

                if (data && data.error) {
                    callback(
                        false,
                        data.error.message || 'RPC помилка'
                    );
                    return;
                }

                callback(true, data);
            }
        );
    }

    function addTorrent(profile, url, downloadDir, callback) {
        var params = {
            filename: url
        };

        if (downloadDir) {
            params.download_dir = downloadDir;
        }

        request(
            profile,
            {
                jsonrpc: '2.0',
                method: 'torrent_add',
                id: 1,
                params: params
            },
            function (ok, data, error) {
                if (!ok) {
                    callback(false, error);
                    return;
                }

                if (data && data.error) {
                    callback(
                        false,
                        data.error.message ||
                        'Помилка додавання торента'
                    );
                    return;
                }

                callback(true, data);
            }
        );
    }

    /*
     * ---------------------------------------------------------
     * РЕДАГУВАННЯ ПРОФІЛЮ
     * ---------------------------------------------------------
     */

    function inputDialog(title, value, callback) {
    if (
        Lampa.Input &&
        typeof Lampa.Input.edit === 'function'
    ) {
        Lampa.Input.edit({
            title: title,
            value: value || '',
            free: true,
            nosave: true
        }, function (newValue) {
            callback(newValue);
        });
    } else {
        var result = prompt(
            title,
            value || ''
        );

        if (result !== null) {
            callback(result);
        }
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
            port: '9091',
            rpc_path: '/transmission/rpc',
            username: '',
            password: '',
            movies: '',
            shows: '',
            cartoons: ''
        };
    }

    /*
     * Меню редагування одного профілю.
     * Ніяких Settings.open().
     */

    function openEditor() {

        var items = [
            {
                title: 'Назва профілю',
                subtitle: profile.name || 'Transmission',
                action: 'name'
            },
            {
                title: 'Протокол',
                subtitle:
                    profile.protocol === 'http'
                        ? 'HTTP'
                        : 'HTTPS',
                action: 'protocol'
            },
            {
                title: 'Адреса сервера',
                subtitle:
                    profile.host ||
                    'Не вказана',
                action: 'host'
            },
            {
                title: 'Порт',
                subtitle:
                    profile.port ||
                    'Не вказаний',
                action: 'port'
            },
            {
                title: 'Логін',
                subtitle:
                    profile.username ||
                    'Не вказаний',
                action: 'username'
            },
            {
                title: 'Пароль',
                subtitle:
                    profile.password
                        ? '••••••••'
                        : 'Не вказаний',
                action: 'password'
            },
            {
                title: 'Папка Movies',
                subtitle:
                    profile.movies ||
                    'Не вказана',
                action: 'movies'
            },
            {
                title: 'Папка Shows',
                subtitle:
                    profile.shows ||
                    'Не вказана',
                action: 'shows'
            },
            {
                title: 'Папка Cartoons',
                subtitle:
                    profile.cartoons ||
                    'Не вказана',
                action: 'cartoons'
            },
            {
                title: '🔌 Перевірити підключення',
                action: 'test'
            },
            {
                title: '💾 Зберегти профіль',
                action: 'save'
            }
        ];

        Lampa.Select.show({

            title:
                isNew
                    ? 'Новий профіль Transmission'
                    : 'Редагування: ' +
                      (
                          profile.name ||
                          'Transmission'
                      ),

            items: items,

            onSelect: function (item) {

                /*
                 * Назва
                 */
                if (item.action === 'name') {

                    inputDialog(
                        'Назва профілю',
                        profile.name,
                        function (value) {

                            if (
                                value !== undefined &&
                                value !== null
                            ) {
                                profile.name =
                                    String(value).trim() ||
                                    'Transmission';
                            }

                            setTimeout(
                                openEditor,
                                200
                            );
                        }
                    );

                    return;
                }

                /*
                 * Протокол
                 */
                if (item.action === 'protocol') {

                    Lampa.Select.show({

                        title: 'Протокол',

                        items: [
                            {
                                title: 'HTTPS',
                                value: 'https',
                                selected:
                                    profile.protocol !== 'http'
                            },
                            {
                                title: 'HTTP',
                                value: 'http',
                                selected:
                                    profile.protocol === 'http'
                            }
                        ],

                        onSelect: function (protocol) {

                            profile.protocol =
                                protocol.value;

                            setTimeout(
                                openEditor,
                                200
                            );
                        },

                        onBack: function () {
                            setTimeout(
                                openEditor,
                                200
                            );
                        }

                    });

                    return;
                }

                /*
                 * Адреса
                 */
                if (item.action === 'host') {

                    inputDialog(
                        'Адреса Transmission',
                        profile.host,
                        function (value) {

                            if (
                                value !== undefined &&
                                value !== null
                            ) {
                                profile.host =
                                    String(value)
                                        .trim()
                                        .replace(
                                            /^https?:\/\//i,
                                            ''
                                        )
                                        .replace(
                                            /\/+$/,
                                            ''
                                        );
                            }

                            setTimeout(
                                openEditor,
                                200
                            );
                        }
                    );

                    return;
                }

                /*
                 * Порт
                 */
                if (item.action === 'port') {

                    inputDialog(
                        'Порт Transmission',
                        profile.port,
                        function (value) {

                            if (
                                value !== undefined &&
                                value !== null
                            ) {
                                profile.port =
                                    String(value)
                                        .trim();
                            }

                            setTimeout(
                                openEditor,
                                200
                            );
                        }
                    );

                    return;
                }

                /*
                 * Логін
                 */
                if (item.action === 'username') {

                    inputDialog(
                        'Логін',
                        profile.username,
                        function (value) {

                            if (
                                value !== undefined &&
                                value !== null
                            ) {
                                profile.username =
                                    String(value);
                            }

                            setTimeout(
                                openEditor,
                                200
                            );
                        }
                    );

                    return;
                }

                /*
                 * Пароль
                 */
                if (item.action === 'password') {

                    inputDialog(
                        'Пароль',
                        profile.password,
                        function (value) {

                            if (
                                value !== undefined &&
                                value !== null
                            ) {
                                profile.password =
                                    String(value);
                            }

                            setTimeout(
                                openEditor,
                                200
                            );
                        }
                    );

                    return;
                }

                /*
                 * Movies
                 */
                if (item.action === 'movies') {

                    inputDialog(
                        'Папка Movies',
                        profile.movies,
                        function (value) {

                            if (
                                value !== undefined &&
                                value !== null
                            ) {
                                profile.movies =
                                    String(value).trim();
                            }

                            setTimeout(
                                openEditor,
                                200
                            );
                        }
                    );

                    return;
                }

                /*
                 * Shows
                 */
                if (item.action === 'shows') {

                    inputDialog(
                        'Папка Shows',
                        profile.shows,
                        function (value) {

                            if (
                                value !== undefined &&
                                value !== null
                            ) {
                                profile.shows =
                                    String(value).trim();
                            }

                            setTimeout(
                                openEditor,
                                200
                            );
                        }
                    );

                    return;
                }

                /*
                 * Cartoons
                 */
                if (item.action === 'cartoons') {

                    inputDialog(
                        'Папка Cartoons',
                        profile.cartoons,
                        function (value) {

                            if (
                                value !== undefined &&
                                value !== null
                            ) {
                                profile.cartoons =
                                    String(value).trim();
                            }

                            setTimeout(
                                openEditor,
                                200
                            );
                        }
                    );

                    return;
                }

                /*
                 * Перевірка підключення
                 */
                if (item.action === 'test') {

                    if (!profile.host) {
                        Lampa.Noty.show(
                            '❌ Спочатку вкажи адресу Transmission'
                        );

                        setTimeout(
                            openEditor,
                            500
                        );

                        return;
                    }

                    Lampa.Noty.show(
                        'Перевіряємо Transmission...'
                    );

                    testConnection(
                        profile,
                        function (ok, result) {

                            if (!ok) {

                                Lampa.Noty.show(
                                    '❌ Transmission: ' +
                                    result
                                );

                            } else {

                                var args =
                                    result &&
                                    result.result === 'success'
                                        ? result.arguments || {}
                                        : {};

                                var version =
                                    args.version ||
                                    args.rpc_version_semver ||
                                    'версія невідома';

                                Lampa.Noty.show(
                                    '✅ Transmission підключено: ' +
                                    version
                                );
                            }

                            setTimeout(
                                openEditor,
                                700
                            );
                        }
                    );

                    return;
                }

                /*
                 * Зберегти
                 */
                if (item.action === 'save') {

                    profile.name =
                        String(
                            profile.name || ''
                        ).trim() ||
                        'Transmission';

                    profile.protocol =
                        profile.protocol === 'http'
                            ? 'http'
                            : 'https';

                    profile.host =
                        String(
                            profile.host || ''
                        )
                        .trim()
                        .replace(
                            /^https?:\/\//i,
                            ''
                        )
                        .replace(
                            /\/+$/,
                            ''
                        );

                    profile.port =
                        String(
                            profile.port || ''
                        ).trim();

                    profile.username =
                        String(
                            profile.username || ''
                        );

                    profile.password =
                        String(
                            profile.password || ''
                        );

                    profile.movies =
                        String(
                            profile.movies || ''
                        ).trim();

                    profile.shows =
                        String(
                            profile.shows || ''
                        ).trim();

                    profile.cartoons =
                        String(
                            profile.cartoons || ''
                        ).trim();

                    profile.rpc_path =
                        profile.rpc_path ||
                        '/transmission/rpc';

                    var profiles =
                        getProfiles();

                    var found = false;

                    for (
                        var i = 0;
                        i < profiles.length;
                        i++
                    ) {
                        if (
                            profiles[i].id ===
                            profile.id
                        ) {
                            profiles[i] =
                                profile;

                            found = true;
                            break;
                        }
                    }

                    if (!found) {
                        profiles.push(
                            profile
                        );
                    }

                    saveProfiles(
                        profiles
                    );

                    setActiveId(
                        profile.id
                    );

                    Lampa.Noty.show(
                        '✅ Профіль Transmission збережено'
                    );

                    Lampa.Controller.toggle(
                        'content'
                    );

                    return;
                }
            },

            onBack: function () {

                /*
                 * Якщо це новий профіль і
                 * користувач натиснув назад —
                 * нічого не створюємо.
                 */

                Lampa.Controller.toggle(
                    'content'
                );
            }

        });
    }

    openEditor();
}

    /*
     * ---------------------------------------------------------
     * СПИСОК ПРОФІЛІВ
     * ---------------------------------------------------------
     */

    function showProfiles() {
        var profiles = getProfiles();

        if (!profiles.length) {
            editProfile(null);
            return;
        }

        var items = [];

        profiles.forEach(function (profile) {
            items.push({
                title:
                    profile.name ||
                    'Без назви',

                subtitle:
                    normalizeUrl(profile) ||
                    'Адреса не вказана',

                profile: profile,
                action: 'select'
            });
        });

        items.push({
            title: '➕ Додати профіль',
            action: 'add'
        });

        items.push({
            title: '✏️ Редагувати профіль',
            action: 'edit'
        });

        items.push({
            title: '🗑 Видалити профіль',
            action: 'delete'
        });

        Lampa.Select.show({
            title: 'Transmission',
            items: items,

            onSelect: function (item) {
                if (item.action === 'add') {
                    editProfile(null);
                    return;
                }

                if (item.action === 'edit') {
                    editProfile(
                        getActiveProfile()
                    );
                    return;
                }

                if (item.action === 'delete') {
                    deleteProfile(
                        getActiveProfile()
                    );
                    return;
                }

                if (
                    item.action === 'select' &&
                    item.profile
                ) {
                    setActiveId(
                        item.profile.id
                    );

                    Lampa.Noty.show(
                        'Transmission: ' +
                        (
                            item.profile.name ||
                            'профіль'
                        ) +
                        ' вибрано'
                    );
                }

                Lampa.Controller.toggle(
                    'content'
                );
            },

            onBack: function () {
                Lampa.Controller.toggle(
                    'content'
                );
            }
        });
    }

    /*
     * ---------------------------------------------------------
     * ВИДАЛЕННЯ
     * ---------------------------------------------------------
     */

    function deleteProfile(profile) {
        if (!profile) return;

        var profiles =
            getProfiles().filter(function (item) {
                return item.id !== profile.id;
            });

        saveProfiles(profiles);

        if (getActiveId() === profile.id) {
            setActiveId(
                profiles.length
                    ? profiles[0].id
                    : ''
            );
        }

        Lampa.Noty.show(
            'Профіль видалено'
        );
    }

    /*
     * ---------------------------------------------------------
     * ПЕРЕВІРКА АКТИВНОГО
     * ---------------------------------------------------------
     */

    function showTest() {
        var profile =
            getActiveProfile();

        if (!profile) {
            Lampa.Noty.show(
                'Спочатку додай профіль Transmission'
            );
            return;
        }

        Lampa.Noty.show(
            'Перевіряємо Transmission...'
        );

        testConnection(
            profile,
            function (ok, result) {
                if (!ok) {
                    Lampa.Noty.show(
                        '❌ Transmission: ' +
                        result
                    );
                    return;
                }

                var args =
                    result &&
                    result.result === 'success'
                        ? result.arguments || {}
                        : {};

                var version =
                    args.version ||
                    args.rpc_version_semver ||
                    'невідома версія';

                Lampa.Noty.show(
                    '✅ Transmission підключено: ' +
                    version
                );
            }
        );
    }

    /*
     * ---------------------------------------------------------
     * ПУБЛІЧНИЙ API
     * ---------------------------------------------------------
     */

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
            var profile =
                getActiveProfile();

            if (!profile) {
                callback(
                    false,
                    'Немає активного профілю'
                );
                return;
            }

            testConnection(
                profile,
                callback
            );
        },

        addTorrent: function (
            url,
            downloadDir,
            callback
        ) {
            var profile =
                getActiveProfile();

            if (!profile) {
                if (callback) {
                    callback(
                        false,
                        'Немає активного профілю'
                    );
                }
                return;
            }

            addTorrent(
                profile,
                url,
                downloadDir,
                callback ||
                function () {}
            );
        },

        showProfiles:
            showProfiles
    };

    /*
     * ---------------------------------------------------------
     * LAMPA SETTINGS
     * ---------------------------------------------------------
     */

    function initSettings() {
        if (
            !window.Lampa ||
            !Lampa.SettingsApi
        ) {
            return;
        }

        Lampa.SettingsApi.addComponent({
            component:
                'utopia_transmission',

            name:
                'Transmission',

            icon:
                '📡'
        });

        Lampa.SettingsApi.addParam({
            component:
                'utopia_transmission',

            param: {
                name: 'profiles',
                type: 'button'
            },

            field: {
                name:
                    'Профілі Transmission',

                description:
                    'Сервери, логін, пароль і папки'
            },

            onChange:
                showProfiles
        });

        Lampa.SettingsApi.addParam({
            component:
                'utopia_transmission',

            param: {
                name: 'test',
                type: 'button'
            },

            field: {
                name:
                    'Перевірити підключення'
            },

            onChange:
                showTest
        });
    }

    if (
        window.Lampa &&
        Lampa.Listener
    ) {
        Lampa.Listener.follow(
            'app',
            function (e) {
                if (e.type === 'ready') {
                    initSettings();
                }
            }
        );
    }

})();
