// Конфигурация Firebase
const firebaseConfig = {
    apiKey: "AIzaSyCpqM2Mbz_0l1hB5BLgQ80F8GYFKdSw3PA",
    authDomain: "kirmelcript.firebaseapp.com",
    projectId: "kirmelcript",
    storageBucket: "kirmelcript.firebasestorage.app",
    messagingSenderId: "668992683850",
    appId: "1:668992683850:web:c2f76667fafac7cd714bb3",
    measurementId: "G-MD938Z2WX6"
};

// Инициализация Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

// Глобальные переменные
let currentUser = null;
let peer = null;
let activeConnection = null;
let activeChat = null;
let myKeyPair = null;
let sharedSecretKey = null;
let isReconnecting = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;

// DOM Элементы
const authScreen = document.getElementById('auth-screen');
const appScreen = document.getElementById('app-screen');
const btnLogin = document.getElementById('btn-login');
const errorMessage = document.getElementById('error-message');

const myAvatar = document.getElementById('my-avatar');
const myName = document.getElementById('my-name');
const myIdDisplay = document.getElementById('my-id-display');
const peerIdInput = document.getElementById('peer-id-input');
const btnConnect = document.getElementById('btn-connect');
const chatsList = document.getElementById('chats-list');

const activeChatHeader = document.getElementById('active-chat-header');
const chatAvatar = document.getElementById('chat-avatar');
const chatName = document.getElementById('chat-name');
const messagesContainer = document.getElementById('messages-container');
const systemPlaceholder = document.getElementById('system-placeholder');
const inputArea = document.getElementById('input-area');
const messageInput = document.getElementById('message-input');
const btnSend = document.getElementById('btn-send');

// --- АВТОРИЗАЦИЯ ---

btnLogin.addEventListener('click', () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(error => {
        errorMessage.innerText = error.message;
        errorMessage.style.display = 'block';
    });
});

auth.onAuthStateChanged((user) => {
    if (user) {
        currentUser = user;
        authScreen.style.display = 'none';
        appScreen.style.display = 'block';
        initUserMetadata();
        initPeer();
    } else {
        authScreen.style.display = 'flex';
        appScreen.style.display = 'none';
    }
});

function initUserMetadata() {
    myAvatar.src = currentUser.photoURL || '';
    myName.innerText = currentUser.displayName || 'Аноним';
}

// --- КРИПТОГРАФИЯ ---

async function generateKeyPair() {
    return await window.crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        false,
        ["deriveKey", "deriveBits"]
    );
}

async function exportPublicKey(key) {
    return await window.crypto.subtle.exportKey("raw", key);
}

async function importPublicKey(rawKey) {
    return await window.crypto.subtle.importKey(
        "raw",
        rawKey,
        { name: "ECDH", namedCurve: "P-256" },
        true,
        []
    );
}

async function deriveSharedKey(privateKey, publicKey) {
    return await window.crypto.subtle.deriveKey(
        { name: "ECDH", public: publicKey },
        privateKey,
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
}

async function encryptMessage(text, key) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    const encrypted = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        key,
        data
    );

    return {
        iv: Array.from(iv),
        ciphertext: Array.from(new Uint8Array(encrypted))
    };
}

async function decryptMessage(encryptedObj, key) {
    try {
        const iv = new Uint8Array(encryptedObj.iv);
        const ciphertext = new Uint8Array(encryptedObj.ciphertext);

        const decrypted = await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv: iv },
            key,
            ciphertext
        );

        const decoder = new TextDecoder();
        return decoder.decode(decrypted);
    } catch (e) {
        console.error("Ошибка расшифровки:", e);
        return "[Ошибка расшифровки]";
    }
}

// --- P2P СОЕДИНЕНИЕ (ПОЛНОСТЬЮ ПЕРЕПИСАНО) ---

async function initPeer() {
    try {
        myKeyPair = await generateKeyPair();
        
        // Создаем новый Peer
        peer = new Peer(undefined, {
            host: '0.peerjs.com',
            port: 443,
            path: '/',
            secure: true,
            debug: 0, // Отключаем отладку чтобы не спамило
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ]
            }
        });

        peer.on('open', (id) => {
            console.log('✅ PeerJS подключен! ID:', id);
            isReconnecting = false;
            reconnectAttempts = 0;
            myIdDisplay.innerText = `Ваш ID: ${id} (клик для копирования)`;
            myIdDisplay.onclick = () => {
                navigator.clipboard.writeText(id);
                alert('ID скопирован!');
            };
        });

        peer.on('connection', (conn) => {
            console.log('📥 Входящее соединение от:', conn.peer);
            if (activeConnection) {
                conn.close();
                return;
            }
            setupConnection(conn);
        });

        peer.on('error', (err) => {
            console.log('PeerJS ошибка:', err.type, err.message);
            
            if (err.type === 'unavailable-id') {
                alert('Ошибка: ID уже используется. Перезагрузите страницу.');
            } else if (err.type === 'peer-unavailable') {
                alert('❌ Собеседник не найден. Проверьте ID.');
            } else if (err.type === 'network') {
                // Пробуем переподключиться
                if (!isReconnecting && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                    isReconnecting = true;
                    reconnectAttempts++;
                    console.log(`🔄 Попытка переподключения ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);
                    setTimeout(() => {
                        if (peer && !peer.destroyed) {
                            peer.reconnect();
                        } else {
                            // Если peer уничтожен, создаем новый
                            destroyPeer();
                            initPeer();
                        }
                    }, 3000);
                } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                    alert('⚠️ Не удалось подключиться к серверу. Перезагрузите страницу.');
                }
            }
        });

        peer.on('disconnected', () => {
            console.log('⚠️ PeerJS отключен');
            if (!isReconnecting && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                isReconnecting = true;
                reconnectAttempts++;
                console.log(`🔄 Попытка переподключения ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);
                setTimeout(() => {
                    if (peer && !peer.destroyed) {
                        peer.reconnect();
                    } else {
                        destroyPeer();
                        initPeer();
                    }
                }, 3000);
            }
        });

        peer.on('close', () => {
            console.log('🔌 PeerJS закрыт');
            destroyPeer();
        });

    } catch (error) {
        console.error('Ошибка инициализации Peer:', error);
        alert('Ошибка подключения к серверу. Перезагрузите страницу.');
    }
}

function destroyPeer() {
    if (peer) {
        try {
            peer.destroy();
        } catch (e) {
            console.log('Ошибка при уничтожении peer:', e);
        }
        peer = null;
    }
}

btnConnect.addEventListener('click', () => {
    const peerId = peerIdInput.value.trim();
    if (!peerId) {
        alert('Введите ID собеседника');
        return;
    }
    if (peerId === peer?.id) {
        alert('Нельзя подключиться к самому себе');
        return;
    }
    if (!peer || peer.destroyed) {
        alert('Соединение не установлено. Перезагрузите страницу.');
        return;
    }

    console.log('🔗 Подключаемся к:', peerId);
    const conn = peer.connect(peerId, {
        reliable: true
    });
    setupConnection(conn);
});

async function setupConnection(conn) {
    activeConnection = conn;

    conn.on('open', async () => {
        console.log('✅ Соединение открыто с:', conn.peer);
        try {
            const rawPubKey = await exportPublicKey(myKeyPair.publicKey);
            conn.send({
                type: 'HANDSHAKE',
                name: currentUser.displayName,
                avatar: currentUser.photoURL,
                publicKey: rawPubKey
            });
        } catch (e) {
            console.error('Ошибка при отправке handshake:', e);
        }
    });

    conn.on('data', async (data) => {
        try {
            if (data.type === 'HANDSHAKE') {
                activeChat = {
                    id: conn.peer,
                    name: data.name,
                    avatar: data.avatar
                };

                const peerPublicKey = await importPublicKey(data.publicKey);
                sharedSecretKey = await deriveSharedKey(myKeyPair.privateKey, peerPublicKey);
                renderChatLayout();
            } else if (data.type === 'MESSAGE') {
                if (!sharedSecretKey) {
                    console.warn('Ключ шифрования не установлен');
                    return;
                }
                const decryptedText = await decryptMessage(data.encrypted, sharedSecretKey);
                appendMessage(decryptedText, 'in');
            }
        } catch (e) {
            console.error('Ошибка обработки данных:', e);
        }
    });

    conn.on('close', () => {
        console.log('🔌 Соединение закрыто');
        alert("Соединение закрыто");
        resetChat();
    });

    conn.on('error', (err) => {
        console.error('❌ Ошибка соединения:', err);
        if (err.type !== 'peer-unavailable') {
            alert('Ошибка соединения: ' + err.message);
        }
        resetChat();
    });
}

// --- ИНТЕРФЕЙС ---

function renderChatLayout() {
    systemPlaceholder.style.display = 'none';
    activeChatHeader.style.display = 'flex';
    inputArea.style.display = 'flex';

    chatAvatar.src = activeChat.avatar || '';
    chatName.innerText = activeChat.name;

    chatsList.innerHTML = `
        <div class="chat-item active">
            <img class="avatar" src="${activeChat.avatar || ''}">
            <div class="user-info">
                <div class="user-name">${activeChat.name}</div>
                <div class="chat-status">в сети</div>
            </div>
        </div>
    `;
}

async function handleSendMessage() {
    const text = messageInput.value.trim();
    if (!text) {
        alert('Введите сообщение');
        return;
    }
    if (!activeConnection) {
        alert('Нет активного соединения');
        return;
    }
    if (!sharedSecretKey) {
        alert('Ключ шифрования не установлен');
        return;
    }

    try {
        const encryptedData = await encryptMessage(text, sharedSecretKey);
        activeConnection.send({
            type: 'MESSAGE',
            encrypted: encryptedData
        });
        appendMessage(text, 'out');
        messageInput.value = '';
    } catch (e) {
        console.error('Ошибка отправки:', e);
        alert('Ошибка отправки сообщения');
    }
}

btnSend.addEventListener('click', handleSendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSendMessage();
});

function appendMessage(text, direction) {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message', direction);

    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    msgDiv.innerHTML = `
        <div>${escapeHTML(text)}</div>
        <div class="message-time">${time}</div>
    `;

    messagesContainer.appendChild(msgDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function resetChat() {
    activeConnection = null;
    activeChat = null;
    sharedSecretKey = null;
    chatsList.innerHTML = '';
    activeChatHeader.style.display = 'none';
    inputArea.style.display = 'none';
    messagesContainer.innerHTML = `<div class="system-info" id="system-placeholder">Соединение разорвано</div>`;
}

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

console.log('✅ App.js загружен!');
