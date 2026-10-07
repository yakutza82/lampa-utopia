function initSettings() {

    Lampa.SettingsApi.addComponent({
        component: 'utopia_auth',
        name: 'Утопія - авторизація',
        icon:
        '<svg width="1.5em" height="1.5em" viewBox="0 0 64 64" ' +
        'xmlns="http://www.w3.org/2000/svg" ' +
        'style="display:block;flex-shrink:0;">' +
            '<image href="https://raw.githubusercontent.com/yakutza82/lampa-utopia/refs/heads/main/pngegg2wh.png" ' +
            'x="0" y="0" width="64" height="64" />' +
        '</svg>'
    });

    Lampa.SettingsApi.addParam({
        component: 'utopia_auth',
        param: {
            name: 'utopia_auth_username',
            type: 'button'
        },
        field: {
            name: 'Логін',
            description: Lampa.Storage.get('utopia_auth_username', '') || 'Не вказано'
        },
        onChange: function () {
            Lampa.Input.edit(
                Lampa.Storage.get('utopia_auth_username', ''),
                function (value) {
                    Lampa.Storage.set('utopia_auth_username', value);
                    Lampa.Noty.show('UTOPIA: логін збережено');
                }
            );
        }
    });

    Lampa.SettingsApi.addParam({
        component: 'utopia_auth',
        param: {
            name: 'utopia_auth_password',
            type: 'button'
        },
        field: {
            name: 'Пароль',
            description: 'Не зберігається'
        },
        onChange: function () {
            Lampa.Input.edit(
                '',
                function (value) {
                    Lampa.Storage.set('utopia_auth_password', value);
                    Lampa.Noty.show('UTOPIA: пароль введено');
                },
                true
            );
        }
    });

    Lampa.SettingsApi.addParam({
        component: 'utopia_auth',
        param: {
            name: 'utopia_auth_cookie_btn',
            type: 'button'
        },
        field: {
            name: 'Отримати cookie',
            description: 'Увійти на utp.to та отримати сесійні cookie'
        },
        onChange: function () {
            getUtopiaCookie();
        }
    });

    Lampa.SettingsApi.addParam({
        component: 'utopia_auth',
        param: {
            name: 'utopia_auth_test_btn',
            type: 'button'
        },
        field: {
            name: 'Перевірити авторизацію',
            description: 'Перевірити поточну сесію UTOPIA'
        },
        onChange: function () {
            testUtopiaSession();
        }
    });
}
