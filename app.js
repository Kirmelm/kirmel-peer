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

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const database = firebase.database();

let currentUser = null;
let myId = null;
let remoteId = null;
let peer = null;
let conn = null;
let sharedSecretKey = null;
let myKeyPair = null;
let isConnected = false;

// DOM
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
const messagesContainer = document.getElementById('messages-container');
const messageInput = document.getElementById('message-input');
const btnSend = document.getElementById('btn-send');
const chatName = document.getElementById('chat-name');
const chatAvatar = document.getElementById('chat-avatar');
const activeChatHeader = document.getElementById('active-chat-header');
const inputArea = document.getElementById('input-area');
const systemPlaceholder = document.getElementById('system-placeholder');
const chatStatusText = document.getElementById('chat-status-text');
const statusDot = document.querySelector('.status-dot');

// ============================================
// ВХОД
// ============================================

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
        
        myAvatar.src = user.photoURL || '';
        myName.textContent = user.displayName || 'Аноним';
        
        database.ref('users/' + user.uid).set({
            name: user.displayName,
            avatar: user.photoURL,
            online: true
        });
        
        initPeerJS(user.uid);
        loadChats(user.uid);
        
    } else {
        authScreen.style.display = 'flex';
        appScreen.style.display = 'none';
    }
});

// ============================================
// УВЕДОМЛЕНИЯ
// ============================================

function showNotification(text) {
    const notif = document.createElement('div');
    notif.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #2b5278;
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        z-index: 9999;
        font-size: 14px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        animation: slideIn 0.3s ease;
        max-width: 300px;
    `;
    notif.textContent = text;
    document.body.appendChild(notif);
    
    setTimeout(() => {
        notif.style.opacity = '0';
        notif.style.transition = 'opacity 0.3s';
        setTimeout(() => notif.remove(), 300);
    }, 3000);
}

const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
`;
document.head.appendChild(style);

// ============================================
// PEERJS (БЕЗ ТВОЕГО СЕРВЕРА!)
// ============================================

function initPeerJS(uid) {
    // Используем uid как ID в PeerJS
    const peerId = uid.substring(0, 12);
    
    peer = new Peer(peerId, {
        host: '0.peerjs.com',
        port: 443,
        path: '/',
        secure: true,
        debug: 0
    });
    
    peer.on('open', (id) => {
        console.log('✅ PeerJS подключен! ID:', id);
        myId = id;
        myIdDisplay.textContent = `ID: ${id} (клик)`;
        myIdDisplay.onclick = () => {
            navigator.clipboard.writeText(id);
            showNotification('✅ ID скопирован!');
        };
    });
    
    peer.on('connection', (incomingConn) => {
        console.log('📞 Входящее соединение от:', incomingConn.peer);
        if (conn) {
            incomingConn.close();
            return;
        }
        setupConnection(incomingConn);
    });
    
    peer.on('error', (err) => {
        console.log('PeerJS ошибка:', err.type);
        if (err.type === 'peer-unavailable') {
            showNotification('❌ Собеседник не найден');
        } else if (err.type === 'network') {
            showNotification('⚠️ Проблема с сетью');
        }
    });
}

// ============================================
// КРИПТОГРАФИЯ
// ============================================

async function generateKeys() {
    return await window.crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        false,
        ["deriveKey", "deriveBits"]
    );
}

async function encrypt(text, key) {
    const enc = new TextEncoder();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        key,
        enc.encode(text)
    );
    return { iv: Array.from(iv), data: Array.from(new Uint8Array(encrypted)) };
}

async function decrypt(obj, key) {
    try {
        const decrypted = await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv: new Uint8Array(obj.iv) },
            key,
            new Uint8Array(obj.data)
        );
        return new TextDecoder().decode(decrypted);
    } catch(e) { 
        return '[Ошибка]'; 
    }
}

// ============================================
// СОЕДИНЕНИЕ
// ============================================

btnConnect.addEventListener('click', async () => {
    const targetId = peerIdInput.value.trim();
    if (!targetId) {
        showNotification('❌ Введите ID');
        return;
    }
    if (targetId === myId) {
        showNotification('❌ Нельзя к себе');
        return;
    }
    if (isConnected) {
        showNotification('❌ Уже есть соединение');
        return;
    }
    
    // Проверяем пользователя в Firebase
    const snap = await database.ref('users/' + targetId).once('value');
    if (!snap.exists()) {
        showNotification('❌ Пользователь не найден');
        return;
    }
    
    remoteId = targetId;
    showNotification(`📞 Подключение...`);
    
    const newConn = peer.connect(targetId, { reliable: true });
    setupConnection(newConn);
    
    const user = snap.val();
    saveChat(targetId, user.name, user.avatar);
});

function setupConnection(incomingConn) {
    conn = incomingConn;
    
    conn.on('open', async () => {
        console.log('✅ Соединение открыто!');
        isConnected = true;
        remoteId = conn.peer;
        showNotification('✅ Соединение установлено!');
        if (chatStatusText) chatStatusText.textContent = 'Подключено ✅';
        if (statusDot) statusDot.className = 'status-dot online';
        
        myKeyPair = await generateKeys();
        showChatUI(conn.peer);
        sendHandshake();
    });
    
    conn.on('data', async (data) => {
        if (data.type === 'HANDSHAKE') {
            const pubKey = await window.crypto.subtle.importKey(
                'raw', 
                new Uint8Array(data.key),
                { name: 'ECDH', namedCurve: 'P-256' },
                true, 
                []
            );
            sharedSecretKey = await window.crypto.subtle.deriveKey(
                { name: 'ECDH', public: pubKey },
                myKeyPair.privateKey,
                { name: 'AES-GCM', length: 256 },
                true,
                ['encrypt', 'decrypt']
            );
            showNotification('🔑 Ключ шифрования установлен!');
            
        } else if (data.type === 'MESSAGE') {
            if (!sharedSecretKey) return;
            const text = await decrypt(data.encrypted, sharedSecretKey);
            appendMessage(text, 'in');
            showNotification(`📩 Новое сообщение`);
            updateLastMessage(remoteId, text);
            
        } else if (data.type === 'IMAGE') {
            if (!sharedSecretKey) return;
            const img = await decrypt(data.encrypted, sharedSecretKey);
            appendImage(img, 'in');
            showNotification('📷 Получено изображение');
            updateLastMessage(remoteId, '📷 Изображение');
        }
    });
    
    conn.on('close', () => {
        console.log('🔌 Соединение закрыто');
        isConnected = false;
        showNotification('🔌 Соединение разорвано');
        resetChat();
    });
    
    conn.on('error', (err) => {
        console.error('❌ Ошибка:', err);
        showNotification('❌ Ошибка соединения');
        resetChat();
    });
}

async function sendHandshake() {
    if (!conn || conn.open === false) {
        setTimeout(sendHandshake, 1000);
        return;
    }
    
    const raw = await window.crypto.subtle.exportKey('raw', myKeyPair.publicKey);
    conn.send({
        type: 'HANDSHAKE',
        key: Array.from(new Uint8Array(raw))
    });
}

// ============================================
// ЧАТЫ
// ============================================

function loadChats(uid) {
    database.ref('chats/' + uid).on('value', (snapshot) => {
        const data = snapshot.val();
        chatsList.innerHTML = '';
        if (!data) {
            chatsList.innerHTML = `
                <div class="empty-chats">
                    <span>💬</span>
                    <p>Нет чатов</p>
                </div>
            `;
            return;
        }
        
        const sorted = Object.values(data).sort((a, b) => b.timestamp - a.timestamp);
        sorted.forEach(chat => {
            const div = document.createElement('div');
            div.className = 'chat-item';
            div.dataset.id = chat.peerId;
            div.innerHTML = `
                <img class="avatar" src="${chat.avatar || ''}">
                <div class="user-info">
                    <div class="user-name">${chat.name}</div>
                    <div class="chat-status">${chat.lastMessage || 'Новый чат'}</div>
                </div>
            `;
            div.onclick = () => openChat(chat.peerId);
            chatsList.appendChild(div);
        });
    });
}

function saveChat(peerId, name, avatar) {
    database.ref('chats/' + myId + '/' + peerId).set({
        peerId: peerId,
        name: name || 'Собеседник',
        avatar: avatar || '',
        lastMessage: '',
        timestamp: Date.now()
    });
}

function updateLastMessage(peerId, text) {
    database.ref('chats/' + myId + '/' + peerId).update({
        lastMessage: text.substring(0, 50),
        timestamp: Date.now()
    });
}

function openChat(peerId) {
    if (isConnected && remoteId === peerId) return;
    
    if (conn) {
        conn.close();
        conn = null;
    }
    isConnected = false;
    sharedSecretKey = null;
    
    remoteId = peerId;
    peerIdInput.value = peerId;
    showChatUI(peerId);
    btnConnect.click();
}

function showChatUI(peerId) {
    systemPlaceholder.style.display = 'none';
    activeChatHeader.style.display = 'flex';
    inputArea.style.display = 'flex';
    chatName.textContent = 'Подключение...';
    chatAvatar.src = '';
    messagesContainer.innerHTML = '';
    
    database.ref('users/' + peerId).once('value', (snap) => {
        const user = snap.val();
        if (user) {
            chatName.textContent = user.name || 'Собеседник';
            chatAvatar.src = user.avatar || '';
        }
    });
    
    document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
    const item = document.querySelector(`.chat-item[data-id="${peerId}"]`);
    if (item) item.classList.add('active');
}

// ============================================
// ОТПРАВКА СООБЩЕНИЙ
// ============================================

btnSend.addEventListener('click', async () => {
    const text = messageInput.value.trim();
    if (!text) {
        showNotification('❌ Введите сообщение');
        return;
    }
    if (!conn || conn.open === false) {
        showNotification('❌ Соединение не установлено');
        return;
    }
    if (!sharedSecretKey) {
        showNotification('❌ Ключ шифрования не установлен');
        return;
    }
    
    const encrypted = await encrypt(text, sharedSecretKey);
    conn.send({
        type: 'MESSAGE',
        encrypted: encrypted
    });
    appendMessage(text, 'out');
    updateLastMessage(remoteId, text);
    messageInput.value = '';
});

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') btnSend.click();
});

// ============================================
// ИЗОБРАЖЕНИЯ
// ============================================

let fileInput = null;

document.getElementById('btn-attach')?.addEventListener('click', () => {
    if (!fileInput) {
        fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.onchange = async (e) => {
            const file = e.target.files[0];
            if (file) await sendImage(file);
            fileInput.value = '';
        };
    }
    fileInput.click();
});

async function sendImage(file) {
    if (!conn || conn.open === false) {
        showNotification('❌ Соединение не установлено');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = async (e) => {
        const imgData = e.target.result;
        if (sharedSecretKey) {
            const encrypted = await encrypt(imgData, sharedSecretKey);
            conn.send({
                type: 'IMAGE',
                encrypted: encrypted
            });
            appendImage(imgData, 'out');
            updateLastMessage(remoteId, '📷 Изображение');
        }
    };
    reader.readAsDataURL(file);
}

// ============================================
// ОТОБРАЖЕНИЕ
// ============================================

function appendMessage(text, dir) {
    const div = document.createElement('div');
    div.className = 'message ' + dir;
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    div.innerHTML = `
        <div>${escapeHTML(text)}</div>
        <div class="message-time">${time}</div>
    `;
    messagesContainer.appendChild(div);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function appendImage(src, dir) {
    const div = document.createElement('div');
    div.className = 'message ' + dir;
    const img = document.createElement('img');
    img.className = 'message-image';
    img.src = src;
    img.onclick = () => window.open(src);
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    div.appendChild(img);
    const timeDiv = document.createElement('div');
    timeDiv.className = 'message-time';
    timeDiv.textContent = time;
    div.appendChild(timeDiv);
    messagesContainer.appendChild(div);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function escapeHTML(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

// ============================================
// RESET
// ============================================

function resetChat() {
    if (conn) {
        conn.close();
        conn = null;
    }
    isConnected = false;
    sharedSecretKey = null;
    
    if (chatStatusText) chatStatusText.textContent = 'Офлайн';
    if (statusDot) statusDot.className = 'status-dot offline';
}

// ============================================
// ПРОФИЛЬ
// ============================================

document.getElementById('chat-header-click')?.addEventListener('click', () => {
    if (remoteId) showProfile(remoteId);
});

document.getElementById('btn-profile')?.addEventListener('click', () => {
    if (remoteId) showProfile(remoteId);
});

document.getElementById('btn-call')?.addEventListener('click', () => {
    showNotification('📞 Функция звонков в разработке!');
});

document.getElementById('btn-emoji')?.addEventListener('click', () => {
    const emojis = ['😊', '😂', '❤️', '🔥', '👍', '👋', '🎉', '✨', '💪', '🤝'];
    messageInput.value += emojis[Math.floor(Math.random() * emojis.length)];
    messageInput.focus();
});

async function showProfile(userId) {
    const snap = await database.ref('users/' + userId).once('value');
    const user = snap.val();
    if (!user) return;
    
    document.getElementById('profile-avatar').src = user.avatar || '';
    document.getElementById('profile-name').textContent = user.name || 'Без имени';
    document.getElementById('profile-id').textContent = 'ID: ' + userId;
    document.getElementById('profile-status').textContent = user.online ? '🟢 Онлайн' : '⚫ Офлайн';
    document.getElementById('profile-modal').style.display = 'flex';
}

document.getElementById('profile-modal-close')?.addEventListener('click', () => {
    document.getElementById('profile-modal').style.display = 'none';
});

document.getElementById('profile-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
        document.getElementById('profile-modal').style.display = 'none';
    }
});

console.log('✅ App.js загружен!');
