// ============ КОНФИГУРАЦИЯ FIREBASE (ПЕРВЫМ!) ============
const firebaseConfig = {
    apiKey: "AIzaSyCpqM2Mbz_0l1hB5BLgQ80F8GYFKdSw3PA",
    authDomain: "kirmelcript.firebaseapp.com",
    databaseURL: "https://kirmelcript-default-rtdb.firebaseio.com",
    projectId: "kirmelcript",
    storageBucket: "kirmelcript.firebasestorage.app",
    messagingSenderId: "668992683850",
    appId: "1:668992683850:web:c2f76667fafac7cd714bb3",
    measurementId: "G-MD938Z2WX6"
};

// ============ ИНИЦИАЛИЗАЦИЯ FIREBASE ============
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();
const storage = firebase.storage();

console.log("✅ Firebase инициализирован (Realtime Database)");

// ============ ГЛОБАЛЬНОЕ СОСТОЯНИЕ ============
let currentUser = null;
let userKeyPair = null;
let currentChatId = null;

// ============ ФУНКЦИИ КРИПТОГРАФИИ ============

// Генерация пары ключей ECDH
async function generateKeyPair() {
    const keyPair = await window.crypto.subtle.generateKey(
        {
            name: "ECDH",
            namedCurve: "P-256",
        },
        true,
        ["deriveKey", "deriveBits"]
    );
    return keyPair;
}

// Экспорт открытого ключа в JWK
async function exportPublicKey(publicKey) {
    const jwk = await window.crypto.subtle.exportKey("jwk", publicKey);
    return JSON.stringify(jwk);
}

// Экспорт приватного ключа в JWK (для хранения в IndexedDB)
async function exportPrivateKey(privateKey) {
    const jwk = await window.crypto.subtle.exportKey("jwk", privateKey);
    return JSON.stringify(jwk);
}

// Импорт открытого ключа из JWK
async function importPublicKey(jwkString) {
    const jwk = JSON.parse(jwkString);
    return window.crypto.subtle.importKey("jwk", jwk, "ECDH", false, []);
}

// Импорт приватного ключа из JWK
async function importPrivateKey(jwkString) {
    const jwk = JSON.parse(jwkString);
    return window.crypto.subtle.importKey("jwk", jwk, "ECDH", true, ["deriveKey", "deriveBits"]);
}

// Получение общего секрета
async function deriveSharedSecret(privateKey, publicKey) {
    return window.crypto.subtle.deriveBits(
        {
            name: "ECDH",
            public: publicKey,
        },
        privateKey,
        256
    );
}

// Производство AES ключа из общего секрета
async function deriveAESKey(sharedSecret) {
    return window.crypto.subtle.importKey(
        "raw",
        sharedSecret,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

// Шифрование сообщения
async function encryptMessage(message, aesKey) {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    
    const ciphertext = await window.crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv: iv,
        },
        aesKey,
        data
    );
    
    return {
        ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
        iv: btoa(String.fromCharCode(...iv))
    };
}

// Расшифровка сообщения
async function decryptMessage(encrypted, aesKey) {
    const ciphertext = Uint8Array.from(atob(encrypted.ciphertext), c => c.charCodeAt(0));
    const iv = Uint8Array.from(atob(encrypted.iv), c => c.charCodeAt(0));
    
    const plaintext = await window.crypto.subtle.decrypt(
        {
            name: "AES-GCM",
            iv: iv,
        },
        aesKey,
        ciphertext
    );
    
    const decoder = new TextDecoder();
    return decoder.decode(plaintext);
}

// ============ ХРАНИЛИЩЕ IndexedDB ============

const dbName = "КирмельКрипт_БД";
const storeName = "ключи";

function initIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(storeName)) {
                db.createObjectStore(storeName);
            }
        };
    });
}

async function savePrivateKeyToIndexedDB(userId, privateKeyJwk) {
    const db = await initIndexedDB();
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    
    return new Promise((resolve, reject) => {
        const request = store.put(privateKeyJwk, `${userId}_private`);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}

async function getPrivateKeyFromIndexedDB(userId) {
    const db = await initIndexedDB();
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    
    return new Promise((resolve, reject) => {
        const request = store.get(`${userId}_private`);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
}

// ============ АУТЕНТИФИКАЦИЯ ПОЛЬЗОВАТЕЛЯ ============

async function signUp(email, password) {
    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        // Генерируем и сохраняем пару ключей
        const keyPair = await generateKeyPair();
        userKeyPair = keyPair;
        
        const privateKeyJwk = await exportPrivateKey(keyPair.privateKey);
        const publicKeyJwk = await exportPublicKey(keyPair.publicKey);
        
        // Сохраняем приватный ключ в IndexedDB
        await savePrivateKeyToIndexedDB(user.uid, privateKeyJwk);
        
        // Сохраняем открытый ключ в Realtime Database
        await db.ref('user_keys/' + user.uid).set({
            publicKey: publicKeyJwk,
            algorithm: "ECDH",
            createdAt: firebase.database.ServerValue.TIMESTAMP,
        });
        
        // Создаём профиль пользователя
        await db.ref('users/' + user.uid).set({
            uid: user.uid,
            email: user.email,
            nickname: "Пользователь_" + Math.random().toString(36).substr(2, 9),
            bio: "",
            avatar: null,
            createdAt: firebase.database.ServerValue.TIMESTAMP,
        });
        
        currentUser = user;
        console.log("✅ Пользователь успешно зарегистрирован:", user.email);
        return user;
    } catch (error) {
        throw new Error(`Ошибка регистрации: ${error.message}`);
    }
}

async function signIn(email, password) {
    try {
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        // Загружаем приватный ключ из IndexedDB
        const privateKeyJwk = await getPrivateKeyFromIndexedDB(user.uid);
        if (!privateKeyJwk) {
            throw new Error("Приватный ключ не найден. Требуется повторная регистрация.");
        }
        const privateKey = await importPrivateKey(privateKeyJwk);
        
        // Загружаем открытый ключ из Realtime Database
        const keySnapshot = await db.ref('user_keys/' + user.uid).once('value');
        if (!keySnapshot.exists()) {
            throw new Error("Публичный ключ не найден.");
        }
        const publicKey = await importPublicKey(keySnapshot.val().publicKey);
        
        userKeyPair = { privateKey, publicKey };
        currentUser = user;
        
        console.log("✅ Вход выполнен:", user.email);
        return user;
    } catch (error) {
        throw new Error(`Ошибка входа: ${error.message}`);
    }
}

async function logOut() {
    try {
        await auth.signOut();
        currentUser = null;
        userKeyPair = null;
        currentChatId = null;
        console.log("✅ Выход выполнен");
    } catch (error) {
        throw new Error(`Ош��бка выхода: ${error.message}`);
    }
}

// ============ УПРАВЛЕНИЕ ПРОФИЛЕМ ============

async function updateUserProfile(nickname, bio) {
    try {
        await db.ref('users/' + currentUser.uid).update({
            nickname,
            bio,
            updatedAt: firebase.database.ServerValue.TIMESTAMP,
        });
        console.log("✅ Профиль обновлён");
    } catch (error) {
        throw new Error(`Ошибка обновления профиля: ${error.message}`);
    }
}

async function uploadAvatar(file) {
    try {
        const storageRef = storage.ref(`avatars/${currentUser.uid}`);
        await storageRef.put(file);
        const downloadURL = await storageRef.getDownloadURL();
        
        await db.ref('users/' + currentUser.uid).update({
            avatar: downloadURL,
        });
        
        console.log("✅ Аватар загружен");
        return downloadURL;
    } catch (error) {
        throw new Error(`Ошибка загрузки аватара: ${error.message}`);
    }
}

// ============ СООБЩЕНИЯ ============

async function sendMessage(recipientUid, messageText) {
    try {
        // Получаем открытый ключ получателя
        const recipientKeySnapshot = await db.ref('user_keys/' + recipientUid).once('value');
        if (!recipientKeySnapshot.exists()) {
            throw new Error("Получатель не найден");
        }
        const recipientPublicKey = await importPublicKey(recipientKeySnapshot.val().publicKey);
        
        // Получаем общий секрет
        const sharedSecret = await deriveSharedSecret(userKeyPair.privateKey, recipientPublicKey);
        const aesKey = await deriveAESKey(sharedSecret);
        
        // Шифруем сообщение
        const encrypted = await encryptMessage(messageText, aesKey);
        
        // Сохраняем в Realtime Database
        // Структура: messages/myUid/recipientUid/messageId
        const ts = firebase.database.ServerValue.TIMESTAMP;
        
        // Сохраняем для отправителя
        await db.ref('messages/' + currentUser.uid + '/' + recipientUid).push().set({
            from: currentUser.uid,
            to: recipientUid,
            text: encrypted,
            timestamp: ts,
        });
        
        // Сохраняем для получателя
        await db.ref('messages/' + recipientUid + '/' + currentUser.uid).push().set({
            from: currentUser.uid,
            to: recipientUid,
            text: encrypted,
            timestamp: ts,
        });
        
        console.log("✅ Сообщение отправлено");
    } catch (error) {
        throw new Error(`Ошибка отправки: ${error.message}`);
    }
}

async function getMessages(myUid, recipientUid) {
    try {
        const snapshot = await db.ref('messages/' + myUid + '/' + recipientUid).once('value');
        const messages = [];
        snapshot.forEach(childSnapshot => {
            messages.push({
                id: childSnapshot.key,
                ...childSnapshot.val()
            });
        });
        return messages.sort((a, b) => a.timestamp - b.timestamp);
    } catch (error) {
        throw new Error(`Ошибка загрузки сообщений: ${error.message}`);
    }
}

// ============ АДМИН-ФУНКЦИИ ============

async function isUserAdmin() {
    try {
        const roleSnapshot = await db.ref('system_roles/' + currentUser.uid).once('value');
        return roleSnapshot.exists() && roleSnapshot.val().role === "admin";
    } catch (error) {
        return false;
    }
}

async function isOwner() {
    // ЗАМЕНИ НА СВОЙ Firebase UID
    const OWNER_UID = "YOUR_PERSONAL_UID_HERE";
    return currentUser && currentUser.uid === OWNER_UID;
}

async function banUser(userId, reason, banType, penalty) {
    try {
        await db.ref('banned_users/' + userId).set({
            userId,
            reason,
            banType,
            penalty,
            bannedBy: currentUser.uid,
            timestamp: firebase.database.ServerValue.TIMESTAMP,
        });
        console.log("✅ Пользователь заблокирован");
    } catch (error) {
        throw new Error(`Ошибка блокировки: ${error.message}`);
    }
}

async function getUsers() {
    try {
        const snapshot = await db.ref('users').limitToFirst(100).once('value');
        const users = [];
        snapshot.forEach(childSnapshot => {
            users.push({
                id: childSnapshot.key,
                ...childSnapshot.val()
            });
        });
        return users;
    } catch (error) {
        throw new Error(`Ошибка загрузки пользователей: ${error.message}`);
    }
}

async function getBannedUsers() {
    try {
        const snapshot = await db.ref('banned_users').once('value');
        const banned = [];
        snapshot.forEach(childSnapshot => {
            banned.push({
                id: childSnapshot.key,
                ...childSnapshot.val()
            });
        });
        return banned;
    } catch (error) {
        throw new Error(`Ошибка загрузки забанённых: ${error.message}`);
    }
}

// ============ СЛУШАТЕЛЬ СОСТОЯНИЯ АУТЕНТИФИКАЦИИ ============

auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        // Показываем мессенджер
        const landing = document.getElementById("landing");
        const authPage = document.getElementById("authPage");
        const messenger = document.getElementById("messenger");
        
        if (landing) landing.classList.add("hidden");
        if (authPage) authPage.classList.add("hidden");
        if (messenger) messenger.classList.remove("hidden");
        
        // Показываем кнопку админа если пользователь админ
        const adminPanelBtn = document.getElementById("adminPanelBtn");
        if (adminPanelBtn) {
            const isAdmin = await isUserAdmin();
            if (isAdmin || await isOwner()) {
                adminPanelBtn.classList.remove("hidden");
            }
        }
    } else {
        currentUser = null;
        // Показываем главную страницу
        const landing = document.getElementById("landing");
        const messenger = document.getElementById("messenger");
        const profilePage = document.getElementById("profilePage");
        
        if (messenger) messenger.classList.add("hidden");
        if (profilePage) profilePage.classList.add("hidden");
        if (landing) landing.classList.remove("hidden");
    }
});

console.log("✅ index.js загружен!");