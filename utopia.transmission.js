(function () {
    'use strict';

    if (window.UTOPIA_TRANSMISSION) return;

    var STORAGE_KEY = 'utopia_transmission_profiles';
    var ACTIVE_KEY = 'utopia_transmission_active';

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

    function getRpcUrl(profile) {
        var base = normalizeUrl(profile);

        if (!base) return '';

        var path = String(profile.rpc_path || '/transmission/rpc').trim();

        if (path.charAt(0) !== '/') {
            path = '/' + path;
        }

        return base + path;
    }

    function basicAuth(profile) {
        var text = String(profile.username || '') + ':' + String(profile.password || '');

        try {
            return 'Basic ' + btoa(unescape(encodeURIComponent(text)));
        } catch (e) {
            return 'Basic ' + btoa(text);
        }
    }

    function request(profile, body, callback) {
        var url = getRpcUrl(profile);

        if (!url) {
            callback(false, null, 'Не вказана адреса Transmission');
            return;
        }

        var headers = {
            'Content-Type': 'application/json',
            'Authorization': basicAuth(profile)
        };

        var options = {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body)
        };

        fetch(url, options)
            .then(function (response) {
                if (response.status === 409) {
                    var sid = response.headers.get(
                        'X-Transmission-Session-Id'
                    );

                    if (!sid) {
                        throw new Error('Transmission не повернув Session ID');
                    }

                    headers['X-Transmission-Session-Id'] = sid;

                    return fetch(url, {
                        method: 'POST',
                        headers: headers,
                        body: JSON.stringify(body)
                    });
                }

                return response;
            })
            .then(function (response) {
                if (!response.ok) {
                    return response.text().then(function (text) {
                        throw new Error(
                            'HTTP ' +
                            response.status +
                            (text ? ': ' + text : '')
                        );
                    });
                }

                return response.json();
            })
            .then(function (data) {
                callback(true, data, null);
            })
            .catch(function (error) {
                console.error('[UTOPIA TRANSMISSION]', error);

                callback(
                    false,
                    null,
                    error && error.message
                        ? error.message
                        : String(error)
                );
            });
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
                        data.error.message || 'Помилка додавання торента'
                    );
                    return;
                }

                callback(true, data);
            }
        );
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
                    editProfile(getActiveProfile());
                    return;
                }

                if (item.action === 'delete') {
                    deleteProfile(getActiveProfile());
                    return;
                }

                if (item.action === 'select' && item.profile) {
                    setActiveId(item.profile.id);

                    Lampa.Noty.show(
                        'Transmission: ' +
                        (item.profile.name || 'профіль') +
                        ' вибрано'
                    );
                }

                Lampa.Controller.toggle('content');
            },

            onBack: function () {
                Lampa.Controller.toggle('content');
            }
        });
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

        var component = 'utopia_transmission_edit';

        Lampa.SettingsApi.addComponent({
            component: component,
            name: profile.name || 'Transmission'
        });

        var fields = [
            {
                name: 'name',
                title: 'Назва профілю',
                value: profile.name,
                type: 'input'
            },
            {
                name: 'protocol',
                title: 'Протокол',
                value: profile.protocol,
                type: 'select',
                values: {
                    http: 'HTTP',
                    https: 'HTTPS'
                }
            },
            {
                name: 'host',
                title: 'Адреса сервера',
                value: profile.host,
                type: 'input'
            },
            {
                name: 'port',
                title: 'Порт',
                value: profile.port,
                type: 'input'
            },
            {
                name: 'rpc_path',
                title: 'RPC шлях',
                value: profile.rpc_path,
                type: 'input'
            },
            {
                name: 'username',
                title: 'Логін',
                value: profile.username,
                type: 'input'
            },
            {
                name: 'password',
                title: 'Пароль',
                value: profile.password,
                type: 'input'
            },
            {
                name: 'movies',
                title: 'Movies',
                value: profile.movies,
                type: 'input'
            },
            {
                name: 'shows',
                title: 'Shows',
                value: profile.shows,
                type: 'input'
            },
            {
                name: 'cartoons',
                title: 'Cartoons',
                value: profile.cartoons,
                type: 'input'
            }
        ];

        var values = {};

        fields.forEach(function (field) {
            values[field.name] = field.value;
        });

        function save() {
            fields.forEach(function (field) {
                var value = values[field.name];

                if (value !== undefined) {
                    profile[field.name] = value;
                }
            });

            var profiles = getProfiles();
            var found = false;

            for (var i = 0; i < profiles.length; i++) {
                if (profiles[i].id === profile.id) {
                    profiles[i] = profile;
                    found = true;
                    break;
                }
            }

            if (!found) {
                profiles.push(profile);
            }

            saveProfiles(profiles);
            setActiveId(profile.id);

            Lampa.Noty.show('Профіль Transmission збережено');
        }

        /*
         * Поки це базова форма.
         * Після перевірки підключення доробимо її
         * під нормальний Lampa Settings UI.
         */

        Lampa.Noty.show(
            'Профіль створено. Налаштування UI доробимо наступним кроком.'
        );

        if (isNew) {
            saveProfiles(getProfiles().concat([profile]));
            setActiveId(profile.id);
        }
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
                Lampa.Noty.show(
                    '❌ Transmission: ' + result
                );
                return;
            }

            var args = result && result.result === 'success'
                ? result.arguments || {}
                : {};

            var version =
                args.version ||
                args.rpc_version_semver ||
                'невідома версія';

            Lampa.Noty.show(
                '✅ Transmission підключено: ' + version
            );
        });
    }

    /*
     * Публічний API модуля.
     * Інші плагіни працюватимуть через нього,
     * не знаючи нічого про RPC.
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
            var profile = getActiveProfile();

            if (!profile) {
                callback(false, 'Немає активного профілю');
                return;
            }

            testConnection(profile, callback);
        },

        addTorrent: function (url, downloadDir, callback) {
            var profile = getActiveProfile();

            if (!profile) {
                if (callback) {
                    callback(false, 'Немає активного профілю');
                }
                return;
            }

            addTorrent(
                profile,
                url,
                downloadDir,
                callback || function () {}
            );
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
            param: {
                name: 'profiles',
                type: 'button'
            },
            field: {
                name: 'Профілі Transmission',
                description: 'Сервери, логін, пароль і папки'
            },
            onChange: showProfiles
        });

        Lampa.SettingsApi.addParam({
            component: 'utopia_transmission',
            param: {
                name: 'test',
                type: 'button'
            },
            field: {
                name: 'Перевірити підключення'
            },
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
