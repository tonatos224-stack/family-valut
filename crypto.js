/**
 * Family Vault Crypto Module
 * Использование Web Crypto API для AES-GCM шифрования
 */

const CryptoModule = {
    // Настройки безопасности
    ITERATIONS: 100000,
    SALT_SIZE: 16,
    IV_SIZE: 12,

    /**
     * Генерация ключа из мастер-пароля
     */
    async deriveKey(password, salt) {
        const encoder = new TextEncoder();
        const passwordKey = await crypto.subtle.importKey(
            'raw',
            encoder.encode(password),
            'PBKDF2',
            false,
            ['deriveKey']
        );

        return await crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: this.ITERATIONS,
                hash: 'SHA-256'
            },
            passwordKey,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    },

    /**
     * Шифрование данных
     */
    async encrypt(data, password) {
        const encoder = new TextEncoder();
        const salt = crypto.getRandomValues(new Uint8Array(this.SALT_SIZE));
        const iv = crypto.getRandomValues(new Uint8Array(this.IV_SIZE));

        const key = await this.deriveKey(password, salt);
        const encryptedContent = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv },
            key,
            encoder.encode(JSON.stringify(data))
        );

        // Объединяем Salt + IV + EncryptedData для удобного хранения
        const result = new Uint8Array(salt.byteLength + iv.byteLength + encryptedContent.byteLength);
        result.set(salt, 0);
        result.set(iv, salt.byteLength);
        result.set(new Uint8Array(encryptedContent), salt.byteLength + iv.byteLength);

        return btoa(String.fromCharCode(...result));
    },

    /**
     * Дешифрование данных
     */
    async decrypt(encryptedBase64, password) {
        const data = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));

        const salt = data.slice(0, this.SALT_SIZE);
        const iv = data.slice(this.SALT_SIZE, this.SALT_SIZE + this.IV_SIZE);
        const encryptedContent = data.slice(this.SALT_SIZE + this.IV_SIZE);

        const key = await this.deriveKey(password, salt);

        try {
            const decryptedContent = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                encryptedContent
            );
            return JSON.parse(new TextDecoder().decode(decryptedContent));
        } catch (e) {
            throw new Error('Неверный пароль или поврежденные данные');
        }
    }
};
