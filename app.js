// Основная логика интерфейса
console.log("App UI module ready");

document.addEventListener('DOMContentLoaded', () => {
    const masterPassInput = document.getElementById('master-password');
    const authScreen = document.getElementById('auth-screen');
    const dashboard = document.getElementById('dashboard');

    let CURRENT_FAMILY = 'All';

    // Работа с зашифрованным хранилищем
    async function saveVault(entries) {
        if (!window.SESSION_PASSWORD) return;
        const encrypted = await CryptoModule.encrypt(entries, window.SESSION_PASSWORD);
        localStorage.setItem('family_vault_data', encrypted);
    }

    async function loadVault() {
        const encrypted = localStorage.getItem('family_vault_data');
        if (!encrypted) return [];
        try {
            return await CryptoModule.decrypt(encrypted, window.SESSION_PASSWORD);
        } catch (e) {
            console.error("Ошибка загрузки данных:", e);
            throw e;
        }
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

        if (!title || !pass) return window.showToast('Заполните название и пароль');

        try {
            const entries = await loadVault();
            const newEntry = { title, login, pass, member, id: Date.now() };
            entries.push(newEntry);

            await saveVault(entries);
            renderVault();
            hideModal();

            // Очистка
            document.getElementById('vault-title').value = '';
            document.getElementById('vault-login').value = '';
            document.getElementById('vault-pass').value = '';
        } catch (e) {
            alert('Ошибка при сохранении: ' + e.message);
        }
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


    // Поиск
    document.getElementById('search-input').addEventListener('input', renderVault);

    // Удаление
    window.deleteEntry = async (id) => {
        if (!confirm('Удалить эту запись?')) return;
        const entries = await loadVault();
        const filtered = entries.filter(en => en.id !== id);
        await saveVault(filtered);
        renderVault();
        window.showToast('Запись удалена');
    };


    function addCardToUI(entry) {
        const card = document.createElement('div');
        card.className = 'card';
        card.onclick = (e) => {
            // Если кликнули не на кнопку удаления или копирования
            if (!e.target.closest('button')) {
                window.toggleVisibility(card.querySelector('.play-btn'), entry);
            }
        };

        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                 <span style="font-size: 0.7rem; color: var(--text-subdued); text-transform: uppercase; font-weight: 700; letter-spacing: 1px;">
                    ${entry.member === 'All' ? 'ОБЩЕЕ' : (entry.member || 'ОБЩЕЕ').toUpperCase()}
                </span>
                <button class="btn" style="background:none; border:none; color:var(--text-subdued); padding:0; cursor:pointer; font-size: 1.2rem;" onclick="event.stopPropagation(); window.deleteEntry(${entry.id})">×</button>
            </div>
            <h3 style="font-size: 1.1rem; margin-bottom: 4px;">${entry.title}</h3>
            <div class="user-info" style="margin-bottom: 20px;">${entry.login || 'Без логина'}</div>
            
            <div style="display: flex; align-items: center; gap: 8px; margin-top: 12px;">
                <code style="color: var(--text-subdued); font-size: 0.8rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">••••••••</code>
                <button class="btn" style="background: var(--bg-highlight); padding: 4px 12px; font-size: 0.7rem; color: white;" onclick="event.stopPropagation(); window.copyToClipboard('${entry.pass}')">COPY</button>
            </div>

            <div class="play-btn">
                <span style="color: black; font-size: 1.2rem;">▶</span>
            </div>
        `;
        list.appendChild(card);
    }

    window.showDownloadInfo = () => {
        window.showToast('Инструкция по сборке EXE/APK в файле walkthrough.md');
    };
});
