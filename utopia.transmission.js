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
