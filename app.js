// Основная логика интерфейса
console.log("App UI module ready");

document.addEventListener('DOMContentLoaded', () => {
    const masterPassInput = document.getElementById('master-password');
    const authScreen = document.getElementById('auth-screen');
    const dashboard = document.getElementById('dashboard');

    let CURRENT_FAMILY = 'All';

    const SyncModule = {
        getConfig: () => ({
            url: localStorage.getItem('supabase_url'),
            key: localStorage.getItem('supabase_key'),
            familyId: localStorage.getItem('family_id')
        }),
        saveConfig: (url, key, id) => {
            localStorage.setItem('supabase_url', url);
            localStorage.setItem('supabase_key', key);
            localStorage.setItem('family_id', id);
        },
        request: async (method, path, body = null) => {
            const config = SyncModule.getConfig();
            if (!config.url || !config.key) return null;

            const headers = {
                'apikey': config.key,
                'Authorization': `Bearer ${config.key}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation,resolution=merge-duplicates'
            };

            try {
                const response = await fetch(`${config.url}/rest/v1/${path}`, {
                    method,
                    headers,
                    body: body ? JSON.stringify(body) : null
                });
                return await response.json();
            } catch (e) {
                console.error("Sync error:", e);
                return null;
            }
        },
        pull: async () => {
            const config = SyncModule.getConfig();
            if (!config.familyId) return null;
            const data = await SyncModule.request('GET', `vault?id=eq.${config.familyId}&select=data`);
            return data && data.length > 0 ? data[0].data : null;
        },
        push: async (encryptedData) => {
            const config = SyncModule.getConfig();
            if (!config.familyId) return;
            return await SyncModule.request('POST', 'vault', {
                id: config.familyId,
                data: encryptedData,
                updated_at: new Date().toISOString()
            });
        },
        syncNow: async () => {
            window.showToast('Синхронизация...');
            await loadVault(); // loadVault now handles merging
            await renderVault();
            window.showToast('Готово!');
        },
        merge: (local, remote) => {
            const map = new Map();
            local.forEach(en => map.set(en.id, en));
            remote.forEach(en => {
                if (!map.has(en.id) || en.updated_at > (map.get(en.id).updated_at || 0)) {
                    map.set(en.id, en);
                }
            });
            return Array.from(map.values());
        }
    };

    // Авто-синхронизация каждые 5 минут
    setInterval(() => {
        if (window.SESSION_PASSWORD) SyncModule.syncNow();
    }, 5 * 60 * 1000);

    // Синхронизация при возврате в приложение
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && window.SESSION_PASSWORD) {
            SyncModule.syncNow();
        }
    });

    // Работа с зашифрованным хранилищем
    async function saveVault(entries) {
        if (!window.SESSION_PASSWORD) return;
        const encrypted = await CryptoModule.encrypt(entries, window.SESSION_PASSWORD);
        localStorage.setItem('family_vault_data', encrypted);

        // Синхронизация с облаком
        const config = SyncModule.getConfig();
        if (config.url && config.key && config.familyId) {
            await SyncModule.push(encrypted);
            console.log("Synced to cloud");
        }
    }

    async function loadVault() {
        let localEncrypted = localStorage.getItem('family_vault_data');
        let localEntries = [];

        if (localEncrypted && window.SESSION_PASSWORD) {
            try {
                localEntries = await CryptoModule.decrypt(localEncrypted, window.SESSION_PASSWORD);
            } catch (e) { console.error("Local decrypt failed", e); }
        }

        const config = SyncModule.getConfig();
        if (config.url && config.key && config.familyId && window.SESSION_PASSWORD) {
            try {
                const remoteEncrypted = await SyncModule.pull();
                if (remoteEncrypted) {
                    const remoteEntries = await CryptoModule.decrypt(remoteEncrypted, window.SESSION_PASSWORD);
                    const merged = SyncModule.merge(localEntries, remoteEntries);

                    // Если данные изменились после слияния - сохраняем везде
                    if (JSON.stringify(merged) !== JSON.stringify(localEntries)) {
                        console.log("Data merged from cloud");
                        const newEncrypted = await CryptoModule.encrypt(merged, window.SESSION_PASSWORD);
                        localStorage.setItem('family_vault_data', newEncrypted);
                        await SyncModule.push(newEncrypted);
                        return merged;
                    }
                }
            } catch (e) {
                console.warn("Cloud sync failed, using local", e);
            }
        }

        return localEntries;
    }

    // Обработка входа
    window.unlockVault = async () => {
        const password = masterPassInput.value;
        if (password.length < 4) {
            window.showToast('Кодовое слово слишком короткое!');
            return;
        }

        try {
            window.SESSION_PASSWORD = password;
            const entries = await loadVault();

            authScreen.style.display = 'none';
            dashboard.style.display = 'block';
            document.getElementById('sidebar').style.display = 'flex';

            renderVault();
        } catch (e) {
            window.showToast('Неверное кодовое слово!');
            window.SESSION_PASSWORD = null;
        }
    };

    // Рендеринг с учетом фильтров
    async function renderVault() {
        const term = document.getElementById('search-input').value.toLowerCase();
        let entries = await loadVault();

        // Фильтр по семье
        if (CURRENT_FAMILY !== 'All') {
            entries = entries.filter(en => en.member === CURRENT_FAMILY);
        }

        // Фильтр по поиску
        const filtered = entries.filter(en =>
            en.title.toLowerCase().includes(term) ||
            (en.login && en.login.toLowerCase().includes(term))
        );

        list.innerHTML = '';
        filtered.sort((a, b) => b.id - a.id).forEach(addCardToUI);
    }

    // Смена активного члена семьи
    window.filterFamily = (member) => {
        CURRENT_FAMILY = member;

        // UI Update
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        event.currentTarget.classList.add('active');

        document.getElementById('current-view-title').innerText =
            member === 'All' ? 'Все пароли' : `Пароли: ${member}`;

        renderVault();
    };

    // UI Хендлеры
    const modal = document.getElementById('modal-overlay');
    const list = document.getElementById('password-list');

    window.showModal = () => modal.style.display = 'flex';
    window.hideModal = () => modal.style.display = 'none';

    window.saveEntry = async () => {
        const title = document.getElementById('vault-title').value;
        const login = document.getElementById('vault-login').value;
        const pass = document.getElementById('vault-pass').value;
        const member = document.getElementById('vault-member').value;
        const editId = document.getElementById('vault-edit-id').value;

        if (!title || !pass) return window.showToast('Заполните название и пароль');

        try {
            let entries = await loadVault();

            if (editId) {
                // Редактирование
                entries = entries.map(en => en.id === parseInt(editId) ? { ...en, title, login, pass, member } : en);
            } else {
                // Новая запись
                const newEntry = {
                    title,
                    login,
                    pass,
                    member,
                    id: Date.now(),
                    updated_at: Date.now()
                };
                entries.push(newEntry);
            }

            await saveVault(entries);
            renderVault();
            hideModal();

            // Очистка
            document.getElementById('vault-title').value = '';
            document.getElementById('vault-login').value = '';
            document.getElementById('vault-pass').value = '';
            document.getElementById('vault-edit-id').value = '';
        } catch (e) {
            alert('Ошибка при сохранении: ' + e.message);
        }
    };

    window.editEntry = async (id) => {
        const entries = await loadVault();
        const entry = entries.find(en => en.id === id);
        if (!entry) return;

        document.getElementById('modal-title').innerText = 'Редактировать запись';
        document.getElementById('vault-title').value = entry.title;
        document.getElementById('vault-login').value = entry.login || '';
        document.getElementById('vault-pass').value = entry.pass;
        document.getElementById('vault-member').value = entry.member || 'All';
        document.getElementById('vault-edit-id').value = entry.id;

        window.showModal();
    };

    window.showAddModal = () => {
        document.getElementById('modal-title').innerText = 'Новая запись';
        document.getElementById('vault-title').value = '';
        document.getElementById('vault-login').value = '';
        document.getElementById('vault-pass').value = '';
        document.getElementById('vault-edit-id').value = '';
        window.showModal();
    };

    // Генератор паролей
    window.generatePass = () => {
        const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+";
        let retVal = "";
        for (let i = 0; i < 16; ++i) {
            retVal += charset.charAt(Math.floor(Math.random() * charset.length));
        }
        document.getElementById('vault-pass').value = retVal;
        document.getElementById('vault-pass').type = 'text';
    };

    // Функция просмотра пароля + Обновление плеера
    window.toggleVisibility = (btn, entry) => {
        if (!btn) return;
        const card = btn.closest('.card');
        const codeEl = card.querySelector('code');
        const iconEl = btn.querySelector('span');
        const isHidden = codeEl.innerText === '••••••••';

        // Обновляем плеер
        updatePlayer(entry);

        if (isHidden) {
            codeEl.innerText = entry.pass;
            codeEl.style.color = 'var(--spotify-green)';
            iconEl.innerText = '⏸';

            // Анимация прогресс-бара в плеере
            startProgressBar(10000);

            // Прячем обратно через 10 сек
            setTimeout(() => {
                if (codeEl.innerText === entry.pass) {
                    codeEl.innerText = '••••••••';
                    codeEl.style.color = 'var(--text-subdued)';
                    iconEl.innerText = '▶';
                }
            }, 10000);
        } else {
            codeEl.innerText = '••••••••';
            codeEl.style.color = 'var(--text-subdued)';
            iconEl.innerText = '▶';
            resetProgressBar();
        }
    };

    // Плеер и Уведомления
    function updatePlayer(entry) {
        const bar = document.getElementById('player-bar');
        bar.style.display = 'flex';
        document.getElementById('player-title').innerText = entry.title;
        document.getElementById('player-subtitle').innerText = entry.login || 'Без логина';
        document.getElementById('player-member').innerText = entry.member || 'Общее';
    }

    let progressInterval;
    function startProgressBar(duration) {
        const bar = document.getElementById('progress-bar');
        let start = Date.now();
        resetProgressBar();

        progressInterval = setInterval(() => {
            let elapsed = Date.now() - start;
            let percent = (elapsed / duration) * 100;
            if (percent >= 100) {
                percent = 100;
                clearInterval(progressInterval);
            }
            bar.style.width = percent + '%';
        }, 100);
    }

    function resetProgressBar() {
        clearInterval(progressInterval);
        document.getElementById('progress-bar').style.width = '0%';
    }

    window.showToast = (text) => {
        const toast = document.getElementById('toast');
        toast.innerText = text;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2000);
    };

    window.copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        window.showToast('Скопировано в буфер обмена');
    };


    // --- SECURITY: AUTO-LOCK & IDLE TIMER ---
    const IDLE_TIMEOUT = 5 * 60 * 1000; // 5 минут
    let idleTimer;

    function resetIdleTimer() {
        clearTimeout(idleTimer);
        if (window.SESSION_PASSWORD) {
            idleTimer = setTimeout(window.lockVaultManually, IDLE_TIMEOUT);
        }
    }

    // Слушатели активности
    ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'].forEach(name => {
        document.addEventListener(name, resetIdleTimer, true);
    });

    window.lockVaultManually = () => {
        console.log("Vault Locked");
        window.SESSION_PASSWORD = null;
        authScreen.style.display = 'flex';
        dashboard.style.display = 'none';
        document.getElementById('sidebar').style.display = 'none';
        document.getElementById('master-password').value = '';
        window.showToast('Сейф заперт!');
        clearTimeout(idleTimer);
    };

    // --- PASSWORD STRENGTH METER ---
    const strengthBar = document.querySelector('.strength-bar');
    const strengthText = document.querySelector('.strength-text');

    function checkStrength(pass) {
        let score = 0;
        if (!pass) return updateBar(0, 'Введите пароль', '#3e3e3e');

        if (pass.length > 8) score++;
        if (pass.length > 12) score++;
        if (/[A-Z]/.test(pass)) score++;
        if (/[0-9]/.test(pass)) score++;
        if (/[^A-Za-z0-9]/.test(pass)) score++;

        if (score <= 2) updateBar(33, 'Слабый', '#ff4444');
        else if (score <= 4) updateBar(66, 'Средний', '#ffbb33');
        else updateBar(100, 'Сверхнадежный', 'var(--spotify-green)');
    }

    function updateBar(width, text, color) {
        strengthBar.style.width = width + '%';
        strengthBar.style.background = color;
        strengthText.innerText = text;
        strengthText.style.color = color;
    }

    document.getElementById('vault-pass').addEventListener('input', (e) => checkStrength(e.target.value));


    // --- FAVORITES / PINNING ---
    window.toggleFavorite = async (id) => {
        let entries = await loadVault();
        entries = entries.map(en => en.id === id ? { ...en, favorite: !en.favorite } : en);
        await saveVault(entries);
        renderVault();
        window.showToast('Обновлено');
    };

    // Обновляем рендеринг: избранное вверху
    async function renderVault() {
        const term = document.getElementById('search-input').value.toLowerCase();
        let entries = await loadVault();

        if (CURRENT_FAMILY !== 'All') {
            entries = entries.filter(en => en.member === CURRENT_FAMILY);
        }

        const filtered = entries.filter(en =>
            en.title.toLowerCase().includes(term) ||
            (en.login && en.login.toLowerCase().includes(term))
        );

        // Сортировка: сначала Избранное, потом по ID (времени)
        filtered.sort((a, b) => {
            if (a.favorite === b.favorite) return b.id - a.id;
            return a.favorite ? -1 : 1;
        });

        list.innerHTML = '';
        filtered.forEach((entry, index) => {
            addCardToUI(entry, index);
        });
    }


    function addCardToUI(entry, index = 0) {
        const card = document.createElement('div');
        card.className = `card ${entry.favorite ? 'is-favorite' : ''}`;
        card.style.animationDelay = `${index * 0.05}s`;
        card.onclick = (e) => {
            if (!e.target.closest('button')) {
                window.toggleVisibility(card.querySelector('.play-btn'), entry);
            }
        };

        card.innerHTML = `
            <div class="card-play-container">
                <div class="play-btn-static">
                    <span>${entry.favorite ? '♥' : '▶'}</span>
                </div>
                <div class="play-btn">
                    <span>▶</span>
                </div>
            </div>
            <div class="card-main-content">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
                     <span style="font-size: 0.6rem; color: var(--text-subdued); text-transform: uppercase; font-weight: 700; letter-spacing: 1px;">
                        ${entry.member === 'All' ? 'ОБЩЕЕ' : (entry.member || 'ОБЩЕЕ').toUpperCase()}
                    </span>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn-icon heart-btn" onclick="event.stopPropagation(); window.toggleFavorite(${entry.id})" style="color: ${entry.favorite ? 'var(--spotify-green)' : 'var(--text-subdued)'}">${entry.favorite ? '♥' : '♡'}</button>
                        <button class="btn-icon" onclick="event.stopPropagation(); window.editEntry(${entry.id})">✎</button>
                        <button class="btn-icon" onclick="event.stopPropagation(); window.deleteEntry(${entry.id})">×</button>
                    </div>
                </div>
                <h3 style="font-size: 1rem; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${entry.title}</h3>
                <div class="user-info" style="margin-bottom: 12px; font-size: 0.75rem; color: var(--text-subdued);">${entry.login || 'Без логина'}</div>
                
                <div class="card-actions">
                    <div class="action-row">
                        <code class="password-mask">••••••••</code>
                        <button class="btn btn-tiny" onclick="event.stopPropagation(); window.copyToClipboard('${entry.pass}')">PASS</button>
                    </div>
                </div>
            </div>
        `;
        list.appendChild(card);
    }

    window.showDownloadInfo = () => {
        window.showToast('Инструкция по сборке EXE/APK в файле walkthrough.md');
    };

    // Настройки синхронизации
    const syncModal = document.getElementById('sync-modal-overlay');
    window.showSyncModal = () => {
        const config = SyncModule.getConfig();
        document.getElementById('supabase-url').value = config.url || '';
        document.getElementById('supabase-key').value = config.key || '';
        document.getElementById('family-id').value = config.familyId || '';
        syncModal.style.display = 'flex';
    };
    window.hideSyncModal = () => syncModal.style.display = 'none';
    window.saveSyncSettings = () => {
        const url = document.getElementById('supabase-url').value;
        const key = document.getElementById('supabase-key').value;
        const id = document.getElementById('family-id').value;

        SyncModule.saveConfig(url, key, id);
        window.showToast('Настройки сохранены!');
        window.hideSyncModal();
        renderVault();
    };

    // Динамические цитаты (мемасы)
    const quotes = [
        "«Я внутри». — Каждый хакер в истории.",
        "«Пароль — 'password'.» — Эксперт по безопасности.",
        "«Сейф зашифрован. Мыши не проскочат». 🐭",
        "«Взломай планету!» — Хай-тек, низкий уровень жизни. 🌎",
        "«Твои данные в большей безопасности, чем кот в коробке». 🐱",
        "«Ультагениальный алгоритм активен». 🧠",
        "«Матрица владеет тобой... но у нас твои пароли». 💊",
        "«Я сделаю ему предложение, от которого он не сможет отказаться». — Крестный отец. 🌹",
        "«Нужно больше золота!» — Warcraft III. 🪙",
        "«Потрачено». — GTA: San Andreas. 💀",
        "«Война... война никогда не меняется». — Fallout. ☢️",
        "«Ты не готов!» — Иллидан. 😈",
        "«Акела промахнулся!» — Маугли. 🐺",
        "«Ничто не истинно, всё дозволено». — Assassin's Creed. 🦅",
        "«Hasta la vista, baby». — Терминатор. 🦾",
        "«Да пребудет с тобой Сила». — Звездные войны. ✨"
    ];

    function rotateQuote() {
        const quoteEl = document.getElementById('hacker-quote');
        if (quoteEl) {
            quoteEl.innerText = quotes[Math.floor(Math.random() * quotes.length)];
        }
    }

    if (document.getElementById('hacker-quote')) {
        rotateQuote();
        setInterval(rotateQuote, 10000); // Смена каждые 10 секунд
    }
});
