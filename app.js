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

// ============================================
// ПЕРЕМЕННЫЕ
// ============================================

let currentUser = null;
let myId = null;
let remoteId = null;
let peerConnection = null;
let dataChannel = null;
let sharedSecretKey = null;
let myKeyPair = null;
let isConnected = false;
let isCaller = false;
let connectionTimeout = null;

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
// 1. ВХОД
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
        myId = user.uid;
        
        myIdDisplay.textContent = `ID: ${myId.substring(0, 12)} (клик)`;
        myIdDisplay.onclick = () => {
            navigator.clipboard.writeText(myId.substring(0, 12));
            showNotification('✅ ID скопирован!');
        };
        
        database.ref('users/' + myId).set({
            name: user.displayName,
            avatar: user.photoURL,
            online: true
        });
        
        loadChats();
        listenForCalls();
        
    } else {
        authScreen.style.display = 'flex';
        appScreen.style.display = 'none';
    }
});

// ============================================
// 2. УВЕДОМЛЕНИЯ
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
        cursor: pointer;
    `;
    notif.textContent = text;
    notif.onclick = () => notif.remove();
    document.body.appendChild(notif);
    
    setTimeout(() => {
        notif.style.opacity = '0';
        notif.style.transition = 'opacity 0.3s';
        setTimeout(() => notif.remove(), 300);
    }, 4000);
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
// 3. КРИПТОГРАФИЯ
// ============================================

async function generateKeys() {
    return await window.crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        false,
        ["deriveKey", "deriveBits"]
    );
}

async function exportKey(key) {
    return await window.crypto.subtle.exportKey("raw", key);
}

async function importKey(raw) {
    return await window.crypto.subtle.importKey(
        "raw",
        raw,
        { name: "ECDH", namedCurve: "P-256" },
        true,
        []
    );
}

async function deriveKey(privateKey, publicKey) {
    return await window.crypto.subtle.deriveKey(
        { name: "ECDH", public: publicKey },
        privateKey,
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
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
        return '[Ошибка расшифровки]'; 
    }
}

// ============================================
// 4. WEBRTC С TURN
// ============================================

// ДОБАВЛЯЕМ TURN СЕРВЕР
const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        // Бесплатные TURN сервера
        {
            urls: 'turn:turn.anyfirewall.com:443?transport=tcp',
            username: 'webrtc',
            credential: 'webrtc'
        },
        {
            urls: 'turn:turnserver.com:3478',
            username: 'user',
            credential: 'pass'
        }
    ],
    iceCandidatePoolSize: 10,
    iceTransportPolicy: 'all'
};

function listenForCalls() {
    // Очищаем старые вызовы
    database.ref('calls/' + myId).remove();
    
    database.ref('calls/' + myId).on('child_added', async (snapshot) => {
        const data = snapshot.val();
        const callerId = snapshot.key;
        
        if (!data || !data.type || callerId === myId) return;
        if (isConnected) return;
        
        console.log('📞 Входящий вызов от:', callerId, 'тип:', data.type);
        
        try {
            if (data.type === 'offer') {
                remoteId = callerId;
                await handleOffer(callerId, data);
            } else if (data.type === 'answer' && isCaller) {
                await handleAnswer(data);
            } else if (data.type === 'candidate') {
                if (peerConnection) {
                    try {
                        const candidate = new RTCIceCandidate(data.candidate);
                        await peerConnection.addIceCandidate(candidate);
                        console.log('✅ ICE кандидат добавлен');
                    } catch(e) {
                        console.log('Ошибка ICE:', e);
                    }
                }
            }
        } catch(e) {
            console.error('Ошибка:', e);
        }
    });
}

async function handleOffer(callerId, data) {
    try {
        showNotification(`📞 Входящий вызов`);
        
        myKeyPair = await generateKeys();
        peerConnection = new RTCPeerConnection(rtcConfig);
        
        peerConnection.ondatachannel = (event) => {
            console.log('📡 Data channel получен');
            dataChannel = event.channel;
            setupDataChannel();
        };
        
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('📤 Отправка ICE кандидата');
                database.ref('calls/' + callerId + '/' + myId).set({
                    type: 'candidate',
                    candidate: event.candidate
                });
            }
        };
        
        peerConnection.oniceconnectionstatechange = () => {
            console.log('🔄 ICE состояние:', peerConnection.iceConnectionState);
            if (peerConnection.iceConnectionState === 'connected') {
                console.log('✅ ICE соединен!');
            } else if (peerConnection.iceConnectionState === 'failed') {
                console.log('❌ ICE failed');
                showNotification('❌ Ошибка ICE соединения');
            }
        };
        
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        await database.ref('calls/' + callerId + '/' + myId).set({
            type: 'answer',
            sdp: answer
        });
        
        remoteId = callerId;
        showChatUI(callerId);
        saveChat(callerId);
        
    } catch(e) {
        console.error('Ошибка ответа:', e);
        showNotification('❌ Ошибка соединения');
        resetChat();
    }
}

async function handleAnswer(data) {
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
        console.log('✅ Remote description установлен');
    } catch(e) {
        console.error('Ошибка:', e);
    }
}

function setupDataChannel() {
    if (!dataChannel) return;
    
    dataChannel.onopen = () => {
        console.log('✅ КАНАЛ ОТКРЫТ!');
        isConnected = true;
        showNotification('✅ Соединение установлено!');
        if (chatStatusText) chatStatusText.textContent = 'Подключено ✅';
        if (statusDot) statusDot.className = 'status-dot online';
        renderChatLayout();
        sendHandshake();
        
        if (connectionTimeout) {
            clearTimeout(connectionTimeout);
            connectionTimeout = null;
        }
    };
    
    dataChannel.onclose = () => {
        console.log('🔌 Канал закрыт');
        isConnected = false;
        showNotification('🔌 Соединение разорвано');
        resetChat();
    };
    
    dataChannel.onerror = (error) => {
        console.error('❌ Ошибка канала:', error);
    };
    
    dataChannel.onmessage = async (event) => {
        try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'HANDSHAKE') {
                const pubKey = await importKey(new Uint8Array(data.key));
                sharedSecretKey = await deriveKey(myKeyPair.privateKey, pubKey);
                showNotification('🔑 Ключ шифрования установлен!');
                console.log('🔑 Ключ шифрования установлен!');
                
            } else if (data.type === 'MESSAGE') {
                if (!sharedSecretKey) return;
                const text = await decrypt(data.encrypted, sharedSecretKey);
                appendMessage(text, 'in');
                updateLastMessage(remoteId, text);
                showNotification(`📩 Новое сообщение`);
                
            } else if (data.type === 'IMAGE') {
                if (!sharedSecretKey) return;
                const img = await decrypt(data.encrypted, sharedSecretKey);
                appendImage(img, 'in');
                updateLastMessage(remoteId, '📷 Изображение');
                showNotification('📷 Получено изображение');
            }
        } catch(e) {
            console.error('Ошибка сообщения:', e);
        }
    };
}

async function sendHandshake() {
    if (!dataChannel || dataChannel.readyState !== 'open') {
        setTimeout(sendHandshake, 1000);
        return;
    }
    
    const raw = await exportKey(myKeyPair.publicKey);
    dataChannel.send(JSON.stringify({
        type: 'HANDSHAKE',
        key: Array.from(new Uint8Array(raw))
    }));
}

// ============================================
// 5. ВЫЗОВ СОБЕСЕДНИКА
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
    
    // Проверяем пользователя
    const snap = await database.ref('users/' + targetId).once('value');
    if (!snap.exists()) {
        showNotification('❌ Пользователь не найден');
        return;
    }
    
    // Очищаем старые вызовы
    await database.ref('calls/' + targetId + '/' + myId).remove();
    await database.ref('calls/' + myId).remove();
    
    remoteId = targetId;
    isCaller = true;
    showNotification(`📞 Звонок...`);
    
    try {
        myKeyPair = await generateKeys();
        peerConnection = new RTCPeerConnection(rtcConfig);
        
        dataChannel = peerConnection.createDataChannel('chat');
        setupDataChannel();
        
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('📤 Отправка ICE кандидата');
                database.ref('calls/' + targetId + '/' + myId).set({
                    type: 'candidate',
                    candidate: event.candidate
                });
            }
        };
        
        peerConnection.oniceconnectionstatechange = () => {
            console.log('🔄 ICE состояние:', peerConnection.iceConnectionState);
            if (peerConnection.iceConnectionState === 'connected') {
                console.log('✅ ICE соединен!');
            } else if (peerConnection.iceConnectionState === 'failed') {
                console.log('❌ ICE failed');
                showNotification('❌ Ошибка ICE соединения');
                // Пробуем перезапустить ICE
                try {
                    peerConnection.restartIce();
                } catch(e) {}
            }
        };
        
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        await database.ref('calls/' + targetId + '/' + myId).set({
            type: 'offer',
            sdp: offer
        });
        
        const user = snap.val();
        saveChat(targetId);
        showChatUI(targetId);
        
        // Таймаут
        connectionTimeout = setTimeout(() => {
            if (!isConnected) {
                showNotification('⏰ Таймаут, попробуйте еще раз');
                resetChat();
            }
        }, 30000);
        
    } catch(e) {
        console.error('Ошибка:', e);
        showNotification('❌ Ошибка: ' + e.message);
        resetChat();
    }
});

// ============================================
// 6. ЧАТЫ
// ============================================

function loadChats() {
    database.ref('chats/' + myId).on('value', (snapshot) => {
        const data = snapshot.val();
        chatsList.innerHTML = '';
        if (!data) {
            chatsList.innerHTML = `
                <div class="empty-chats">
                    <span>💬</span>
                    <p>Нет активных чатов</p>
                    <p style="font-size: 12px; color: var(--text-muted);">Введите ID друга чтобы начать</p>
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

function saveChat(peerId) {
    database.ref('users/' + peerId).once('value', (snap) => {
        const user = snap.val();
        if (user) {
            database.ref('chats/' + myId + '/' + peerId).set({
                peerId: peerId,
                name: user.name || 'Собеседник',
                avatar: user.avatar || '',
                lastMessage: '',
                timestamp: Date.now()
            });
        }
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
    
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    dataChannel = null;
    isConnected = false;
    sharedSecretKey = null;
    isCaller = false;
    
    if (connectionTimeout) {
        clearTimeout(connectionTimeout);
        connectionTimeout = null;
    }
    
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

function renderChatLayout() {
    database.ref('users/' + remoteId).once('value', (snap) => {
        const user = snap.val();
        if (user) {
            chatName.textContent = user.name || 'Собеседник';
            chatAvatar.src = user.avatar || '';
        }
    });
}

// ============================================
// 7. ОТПРАВКА СООБЩЕНИЙ
// ============================================

btnSend.addEventListener('click', async () => {
    const text = messageInput.value.trim();
    if (!text) {
        showNotification('❌ Введите сообщение');
        return;
    }
    if (!dataChannel || dataChannel.readyState !== 'open') {
        showNotification('❌ Соединение не установлено');
        return;
    }
    if (!sharedSecretKey) {
        showNotification('❌ Ключ шифрования не установлен');
        return;
    }
    
    const encrypted = await encrypt(text, sharedSecretKey);
    dataChannel.send(JSON.stringify({
        type: 'MESSAGE',
        encrypted: encrypted
    }));
    appendMessage(text, 'out');
    updateLastMessage(remoteId, text);
    messageInput.value = '';
});

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') btnSend.click();
});

// ============================================
// 8. ИЗОБРАЖЕНИЯ
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
    if (!dataChannel || dataChannel.readyState !== 'open') {
        showNotification('❌ Соединение не установлено');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = async (e) => {
        const imgData = e.target.result;
        if (sharedSecretKey) {
            const encrypted = await encrypt(imgData, sharedSecretKey);
            dataChannel.send(JSON.stringify({
                type: 'IMAGE',
                encrypted: encrypted
            }));
            appendImage(imgData, 'out');
            updateLastMessage(remoteId, '📷 Изображение');
        }
    };
    reader.readAsDataURL(file);
}

// ============================================
// 9. ОТОБРАЖЕНИЕ
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
// 10. RESET
// ============================================

function resetChat() {
    if (peerConnection) {
        try {
            peerConnection.close();
        } catch(e) {}
        peerConnection = null;
    }
    dataChannel = null;
    isConnected = false;
    sharedSecretKey = null;
    isCaller = false;
    
    if (connectionTimeout) {
        clearTimeout(connectionTimeout);
        connectionTimeout = null;
    }
    
    if (chatStatusText) chatStatusText.textContent = 'Офлайн';
    if (statusDot) statusDot.className = 'status-dot offline';
    
    if (myId) {
        database.ref('calls/' + myId).remove();
    }
    if (remoteId) {
        database.ref('calls/' + remoteId + '/' + myId).remove();
    }
}

// ============================================
// 11. ПРОФИЛЬ
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
    document.getElementById('profile-id').textContent = 'ID: ' + userId.substring(0, 12);
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

console.log('✅ App.js загружен! (WebRTC через Firebase + TURN)');
