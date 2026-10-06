// ----- Отримання ключа з сайту: вхід логіном і паролем (ЕКСПЕРИМЕНТ) -----
    // Працює лише в застосунку Lampa для Android: тільки він віддає заголовки відповіді
    // (Set-Cookie) і дозволяє передавати Cookie. Запити йдуть прямо на utp.to, БЕЗ сторонніх
    // проксі. Пароль нікуди не зберігається і не потрапляє у звіт.
    var SITE_ORIGIN = 'https://utp.to';
    var SITE_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36';

    function siteUserName() {
        return String(Lampa.Storage.get('utopia_username', '') || '');
    }

    function siteNative(url, postdata, headers, callback) {
        var net = new Lampa.Reguest();
        net.timeout(20000);
        net.native(url, function (res) {
            callback(null, res);
        }, function (xhr) {
            callback(xhr || {}, null);
        }, postdata || false, {
            dataType: 'text',
            headers: headers,
            returnHeaders: true
        });
    }

    // Відповідь застосунку: або { headers, body }, або (без підтримки заголовків) просто текст
    function siteParse(res) {
        var obj = res;

        if (typeof obj === 'string') {
            try {
                var parsed = JSON.parse(obj);
                if (parsed && typeof parsed === 'object' && (parsed.body !== undefined || parsed.headers !== undefined)) obj = parsed;
            } catch (e) {}
        }

        if (obj && typeof obj === 'object' && (obj.body !== undefined || obj.headers !== undefined)) {
            var body = obj.body;

            if (body && typeof body === 'object') {
                try { body = JSON.stringify(body); } catch (e) { body = ''; }
            }

            return { headers: obj.headers || {}, body: String(body || ''), hasHeaders: !!obj.headers };
        }

        return { headers: {}, body: typeof res === 'string' ? res : '', hasHeaders: false };
    }

    function siteCollectCookies(jar, headers) {
        var list = headers && (headers['set-cookie'] || headers['Set-Cookie']);
        var added = [];

        if (!list) return added;
        if (typeof list === 'string') list = list.split('\n');

        list.forEach(function (line) {
            var part = String(line).split(';')[0];
            var eq = part.indexOf('=');
            if (eq <= 0) return;

            var name = part.slice(0, eq).trim();
            var value = part.slice(eq + 1).trim();

            if (!value || value === 'deleted') delete jar[name];
            else jar[name] = value;

            if (added.indexOf(name) === -1) added.push(name);
        });

        return added;
    }

    function siteCookieHeader(jar) {
        return Object.keys(jar).map(function (name) {
            return name + '=' + jar[name];
        }).join('; ');
    }

    function siteAttr(tag, name) {
        var m = tag.match(new RegExp('\\b' + name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\')', 'i'));
        return m ? (m[2] !== undefined ? m[2] : m[3]) : '';
    }

    function siteDecode(text) {
        return String(text).replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&');
    }

    function siteHasLoginForm(html) {
        return /<input[^>]*type\s*=\s*["']password["']/i.test(html) && /name\s*=\s*["']_token["']/i.test(html);
    }

    // Поля форми входу: ім'я поля логіна й пароля та всі приховані поля (_token та інші)
    function siteLoginFields(html) {
        var fields = { user: '', pass: '', hidden: [] };
        var tags = html.match(/<input\b[^>]*>/gi) || [];
        var firstText = '';

        tags.forEach(function (tag) {
            var type = (siteAttr(tag, 'type') || 'text').toLowerCase();
            var name = siteAttr(tag, 'name');
            if (!name) return;

            if (type === 'password') {
                if (!fields.pass) fields.pass = name;
            } else if (type === 'hidden') {
                fields.hidden.push({ name: name, value: siteDecode(siteAttr(tag, 'value')) });
            } else if (type === 'text' || type === 'email') {
                if (!firstText) firstText = name;
                if (!fields.user && /user|login|email/i.test(name)) fields.user = name;
            }
        });

        if (!fields.user) fields.user = firstText;

        if (!fields.hidden.some(function (h) { return h.name === '_token'; })) {
            var meta = html.match(/<meta[^>]*name\s*=\s*["']csrf-token["'][^>]*>/i);
            var token = meta ? siteAttr(meta[0], 'content') : '';
            if (token) fields.hidden.push({ name: '_token', value: token });
        }

        return fields;
    }

    function siteMask(token) {
        return token.slice(0, 4) + '…' + token.slice(-4) + ' (' + token.length + ' симв.)';
    }

    // Шукає схожі на ключ рядки на сторінці. primary - поля вводу й елементи з кодом,
    // broad - будь-який довгий рядок у тексті (запасний варіант).
    function siteCandidates(html, exclude) {
        var cleaned = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
        var primary = [];
        var broad = [];

        function add(list, value, where) {
            if (!value || exclude[value]) return;
            if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) return;
            for (var i = 0; i < list.length; i++) if (list[i].value === value) return;
            list.push({ value: value, where: where });
        }

        (cleaned.match(/<(input|textarea)\b[^>]*>/gi) || []).forEach(function (tag) {
            if (siteAttr(tag, 'name') === '_token') return;
            var value = siteDecode(siteAttr(tag, 'value'));
            if (/^[A-Za-z0-9_\-|]{32,200}$/.test(value)) add(primary, value, 'поле вводу');
        });

        var re = /<(code|pre|kbd|samp|td|th|span|p|div|li|dd|b|strong)\b[^>]*>\s*([A-Za-z0-9_\-|]{32,200})\s*<\//gi;
        var m;
        while ((m = re.exec(cleaned)) !== null) add(primary, m[2], 'елемент <' + m[1].toLowerCase() + '>');

        var text = cleaned.replace(/<[^>]*>/g, ' ');
        (text.match(/[A-Za-z0-9_\-|]{32,200}/g) || []).forEach(function (value) {
            add(broad, value, 'текст сторінки');
        });

        return primary.length ? primary : broad;
    }

    function siteDescribeError(err) {
        var parts = [];
        if (err.status !== undefined && err.status !== null) parts.push('код ' + err.status);
        if (err.statusText) parts.push(String(err.statusText));

        var text = String(err.responseText || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
        if (text) parts.push(text);

        return parts.join(', ') || 'невідома помилка';
    }

    // Вхід на сайт і пошук ключа. finish({ ok, candidates, report }).
    // У звіт потрапляють лише назви кукі та замасковані ключі - ні пароля, ні значень кукі.
    function siteFetchKey(username, password, finish) {
        var report = [];
        var jar = { laravel_cookie_consent: '1' };
        var exclude = {};

        function note(line) { report.push(line); }

        function fail(message) {
            note('✖ ' + message);
            finish({ ok: false, candidates: [], report: report.join('\n') });
        }

        function headers(extra) {
            var h = {
                'User-Agent': SITE_UA,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'uk,ru;q=0.9,en;q=0.8',
                'Cookie': siteCookieHeader(jar)
            };

            for (var k in extra) h[k] = extra[k];
            return h;
        }

        var loginUrl = SITE_ORIGIN + '/login';
        var keysUrl = SITE_ORIGIN + '/users/' + encodeURIComponent(username) + '/apikeys';

        // 1. Сторінка входу: токен форми і початкові кукі
        siteNative(loginUrl, null, headers({ 'Referer': SITE_ORIGIN + '/' }), function (err, res) {
            if (err) {
                fail('1) GET /login: ' + siteDescribeError(err));
                return;
            }

            var r = siteParse(res);
            siteCollectCookies(jar, r.headers);
            note('1) GET /login: заголовки ' + (r.hasHeaders ? 'є' : 'НЕМАЄ') + ', кукі: ' + Object.keys(jar).join(', '));

            if (!r.hasHeaders) {
                fail('Застосунок не віддає заголовки відповіді. Потрібна свіжа версія Lampa для Android.');
                return;
            }

            var form = siteLoginFields(r.body);

            if (!form.pass || !form.user) {
                fail('На сторінці входу не знайдено поля логіна/пароля (поля: ' + (form.user || '-') + ' / ' + (form.pass || '-') + ')');
                return;
            }

            if (!form.hidden.some(function (h) { return h.name === '_token'; })) {
                fail('На сторінці входу не знайдено захисний токен _token');
                return;
            }

            form.hidden.forEach(function (h) { if (h.value) exclude[h.value] = true; });
            note('   поля форми: ' + form.hidden.map(function (h) { return h.name; }).join(', ') + ', ' + form.user + ', ' + form.pass);

            // 2. Вхід
            var pairs = form.hidden.map(function (h) {
                return encodeURIComponent(h.name) + '=' + encodeURIComponent(h.value);
            });
            pairs.push(encodeURIComponent(form.user) + '=' + encodeURIComponent(username));
            pairs.push(encodeURIComponent(form.pass) + '=' + encodeURIComponent(password));

            siteNative(loginUrl, pairs.join('&'), headers({
                'Origin': SITE_ORIGIN,
                'Referer': loginUrl,
                'Content-Type': 'application/x-www-form-urlencoded'
            }), function (err2, res2) {
                if (err2) {
                    if (err2.status === 429) fail('2) POST /login: забагато спроб входу. Зачекай хвилину і спробуй ще раз');
                    else if (err2.status === 419) fail('2) POST /login: сторінка входу застаріла (419)');
                    else fail('2) POST /login: ' + siteDescribeError(err2) + ' [поля відповіді: ' + Object.keys(err2).join(', ') + ']');
                    return;
                }

                var r2 = siteParse(res2);
                var added = siteCollectCookies(jar, r2.headers);
                var location = r2.headers && (r2.headers.location || r2.headers.Location) || '';
                note('2) POST /login: заголовки ' + (r2.hasHeaders ? 'є' : 'НЕМАЄ') + ', нові кукі: ' + (added.join(', ') || 'немає') + (location ? ', Location: ' + location : ''));

                if (siteHasLoginForm(r2.body)) {
                    fail('Вхід не вдався: сайт знову показав форму входу (перевір логін і пароль)');
                    return;
                }

                // 3. Сторінка ключів
                siteNative(keysUrl, null, headers({ 'Referer': SITE_ORIGIN + '/' }), function (err3, res3) {
                    if (err3) {
                        fail('3) GET apikeys: ' + siteDescribeError(err3));
                        return;
                    }

                    var r3 = siteParse(res3);
                    siteCollectCookies(jar, r3.headers);

                    if (siteHasLoginForm(r3.body)) {
                        fail('3) GET apikeys: не авторизовано (сайт показав форму входу). Найімовірніше, сесійні кукі після входу не збереглися');
                        return;
                    }

                    var csrf = r3.body.match(/<meta[^>]*name\s*=\s*["']csrf-token["'][^>]*>/i);
                    if (csrf) exclude[siteAttr(csrf[0], 'content')] = true;

                    var found = siteCandidates(r3.body, exclude);
                    note('3) GET apikeys: сторінку отримано (' + r3.body.length + ' симв.), схожих на ключ рядків: ' + found.length);

                    found.forEach(function (c, i) {
                        note('   ' + (i + 1) + ') ' + siteMask(c.value) + ' - ' + c.where);
                    });

                    if (!found.length) {
                        fail('Ключ на сторінці не знайдено (він може бути прихований або показуватись лише після натискання кнопки)');
                        return;
                    }

                    note('✔ Готово');
                    finish({ ok: true, candidates: found, report: report.join('\n') });
                });
            });
        });
    }

    function showSiteReport(text) {
        var modal = $(
            '<div>' +
                '<textarea readonly style="width:100%;height:16em;box-sizing:border-box;"></textarea>' +
                '<div style="display:flex;gap:.6em;margin-top:.8em;">' +
                    '<div class="utopia-action selector utopia-rep-copy">📋 Скопіювати</div>' +
                    '<div class="utopia-action selector utopia-rep-close">Закрити</div>' +
                '</div>' +
            '</div>'
        );

        modal.find('textarea').val(text);

        function close() {
            Lampa.Modal.close();
            backToSettings();
        }

        modal.find('.utopia-rep-copy').on('click hover:enter', function () {
            try {
                Lampa.Utils.copyTextToClipboard(text, function () {
                    Lampa.Noty.show('UTOPIA: звіт скопійовано');
                }, function () {
                    Lampa.Noty.show('UTOPIA: не вдалося скопіювати');
                });
            } catch (e) {
                Lampa.Noty.show('UTOPIA: не вдалося скопіювати');
            }
        });

        modal.find('.utopia-rep-close').on('click hover:enter', close);

        Lampa.Modal.open({
            title: 'UTOPIA: звіт входу',
            html: modal,
            size: 'medium',
            scroll_to_center: true,
            select: modal.find('.utopia-rep-copy'),
            onBack: close
        });
    }

    function siteAskUserName(done) {
        function finish(value) {
            var name = String(value || '').trim().replace(/^@/, '');
            var found = name.match(/\/users\/([^\/?#\s]+)/i);
            if (found) name = found[1];

            if (!name) {
                backToSettings();
                return;
            }

            Lampa.Storage.set('utopia_username', name);
            done();
        }

        Lampa.Input.edit({
            title: "Ім'я користувача на utp.to",
            value: siteUserName(),
            free: true,
            nosave: true
        }, finish);
    }

    function siteRun(username, password) {
        Lampa.Noty.show('UTOPIA: входжу на utp.to...');

        try { Lampa.Loading.start('utopia_site_login', 'UTOPIA: вхід...'); } catch (e) {}

        siteFetchKey(username, password, function (result) {
            try { Lampa.Loading.stop('utopia_site_login'); } catch (e) {}

            if (!result.ok) {
                showSiteReport(result.report);
                return;
            }

            if (result.candidates.length === 1) {
                Lampa.Noty.show('UTOPIA: ключ знайдено');
                askApply(result.candidates[0].value);
                return;
            }

            var items = result.candidates.slice(0, 8).map(function (c) {
                return { title: siteMask(c.value), subtitle: c.where, value: c.value, action: 'pick' };
            });

            items.push({ title: '📄 Показати звіт', action: 'report' });

            Lampa.Select.show({
                title: 'Знайдено кілька рядків. Який із них ключ?',
                items: items,
                onSelect: function (item) {
                    if (item.action === 'pick') askApply(item.value);
                    else setTimeout(function () { showSiteReport(result.report); }, 200);
                },
                onBack: function () {
                    backToSettings();
                }
            });
        });
    }

    function siteAskPassword(name) {
        function got(value) {
            var password = String(value === null || value === undefined ? '' : value);

            // Кнопка "Скасувати" в клавіатурі віддає порожній рядок
            if (!password) {
                backToSettings();
                return;
            }

            // "Назад" повертає те, що набрано, тому перед входом питаємо підтвердження:
            // кожна невдала спроба рахується в ліміті сайту (5 спроб).
            setTimeout(function () {
                Lampa.Select.show({
                    title: 'Вхід на utp.to',
                    items: [
                        { title: '🔐 Увійти як ' + escapeText(name), subtitle: 'довжина пароля: ' + password.length, action: 'go' },
                        { title: '✖ Скасувати', action: 'cancel' }
                    ],
                    onSelect: function (item) {
                        if (item.action === 'go') siteRun(name, password);
                        else backToSettings();
                    },
                    onBack: function () {
                        backToSettings();
                    }
                });
            }, 200);
        }

        Lampa.Input.edit({
            title: 'Пароль utp.to для ' + name,
            value: '',
            free: true,
            nosave: true
        }, got);
    }

    function onSiteLogin() {
        if (typeof AndroidJS === 'undefined') {
            Lampa.Noty.show('UTOPIA: вхід із плагіна працює лише в застосунку Lampa для Android');
            backToSettings();
            return;
        }

        var name = siteUserName();

        if (!name) {
            siteAskUserName(function () {
                setTimeout(onSiteLogin, 200);
            });
            return;
        }

        siteAskPassword(name);
    }
