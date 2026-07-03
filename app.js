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
const database = firebase.database();

// Глобальные переменные
let currentUser = null;
let myPeerConnection = null;
let dataChannel = null;
let activeChat = null;
let myKeyPair = null;
let sharedSecretKey = null;
let myId = null;
let remoteId = null;
let isCaller = false;
let isConnected = false;
let isProcessingCall = false;
let myChats = {}; // Хранит все чаты пользователя

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
const chatStatusText = document.getElementById('chat-status-text');
const statusDot = document.querySelector('.status-dot');
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
        generateUserId();
        showAdminPanel();
        loadChats(); // ЗАГРУЖАЕМ СОХРАНЕННЫЕ ЧАТЫ
    } else {
        authScreen.style.display = 'flex';
        appScreen.style.display = 'none';
    }
});

function initUserMetadata() {
    myAvatar.src = currentUser.photoURL || '';
    myName.innerText = currentUser.displayName || 'Аноним';
}

// --- ГЕНЕРАЦИЯ ID ---

function generateUserId() {
    myId = currentUser.uid.substring(0, 12);
    myIdDisplay.innerText = `Ваш ID: ${myId} (клик для копирования)`;
    myIdDisplay.onclick = () => {
        navigator.clipboard.writeText(myId);
        alert('ID скопирован!');
    };
    
    database.ref('users/' + myId).set({
        name: currentUser.displayName,
        avatar: currentUser.photoURL,
        online: true,
        lastSeen: Date.now()
    });
    
    window.addEventListener('beforeunload', () => {
        database.ref('users/' + myId).update({ online: false });
        if (myPeerConnection) {
            myPeerConnection.close();
        }
        database.ref('calls/' + myId).remove();
    });
    
    database.ref('calls/' + myId).remove();
    listenForCalls();
}

// --- СОХРАНЕНИЕ И ЗАГРУЗКА ЧАТОВ ---

// Сохранить чат в Firebase
function saveChat(peerId) {
    if (!myId || !peerId) return;
    
    database.ref('users/' + peerId).once('value', (snapshot) => {
        const user = snapshot.val();
        if (user) {
            const chatData = {
                peerId: peerId,
                name: user.name || 'Собеседник',
                avatar: user.avatar || '',
                lastMessage: '',
                timestamp: Date.now()
            };
            
            // Сохраняем в список чатов пользователя
            database.ref('chats/' + myId + '/' + peerId).set(chatData);
            myChats[peerId] = chatData;
        }
    });
}

// Загрузить сохраненные чаты
function loadChats() {
    if (!myId) return;
    
    database.ref('chats/' + myId).on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            myChats = data;
            renderChatsList();
        } else {
            // Показываем пустой список
            showEmptyChats();
        }
    });
}

// Показать список чатов
function renderChatsList() {
    const list = document.getElementById('chats-list');
    list.innerHTML = '';
    
    // Сортируем по времени (последние сверху)
    const sortedChats = Object.values(myChats).sort((a, b) => b.timestamp - a.timestamp);
    
    if (sortedChats.length === 0) {
        showEmptyChats();
        return;
    }
    
    sortedChats.forEach(chat => {
        const chatItem = document.createElement('div');
        chatItem.className = 'chat-item';
        if (chat.peerId === remoteId) {
            chatItem.classList.add('active');
        }
        chatItem.dataset.id = chat.peerId;
        chatItem.innerHTML = `
            <img class="avatar" src="${chat.avatar || ''}" alt="">
            <div class="user-info">
                <div class="user-name">${chat.name || 'Собеседник'}</div>
                <div class="chat-status">${chat.lastMessage || 'Нажмите чтобы открыть'}</div>
            </div>
        `;
        
        chatItem.addEventListener('click', () => {
            openChat(chat.peerId);
        });
        
        list.appendChild(chatItem);
    });
}

function showEmptyChats() {
    const list = document.getElementById('chats-list');
    list.innerHTML = `
        <div class="empty-chats">
            <span>💬</span>
            <p>Нет активных чатов</p>
            <p style="font-size: 12px; color: var(--text-muted);">Введите ID друга чтобы начать</p>
        </div>
    `;
}

// Обновить последнее сообщение в чате
function updateLastMessage(peerId, message) {
    if (!myId || !peerId) return;
    
    const chatRef = database.ref('chats/' + myId + '/' + peerId);
    chatRef.update({
        lastMessage: message.substring(0, 50) + (message.length > 50 ? '...' : ''),
        timestamp: Date.now()
    });
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

// --- WEBRTC ---

const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        {
            urls: 'turn:turn.anyfirewall.com:443?transport=tcp',
            username: 'webrtc',
            credential: 'webrtc'
        }
    ],
    iceCandidatePoolSize: 10,
    iceTransportPolicy: 'all'
};

async function listenForCalls() {
    database.ref('calls/' + myId).on('child_added', async (snapshot) => {
        if (isProcessingCall) return;
        
        const data = snapshot.val();
        const callerId = snapshot.key;
        
        if (!data || !data.type || callerId === myId) return;
        if (isConnected) return;
        
        console.log('📞 Входящий вызов от:', callerId, 'тип:', data.type);
        
        try {
            isProcessingCall = true;
            
            if (data.type === 'offer') {
                isCaller = false;
                remoteId = callerId;
                await handleIncomingCall(callerId, data);
            } else if (data.type === 'answer' && isCaller) {
                await handleAnswer(data);
            } else if (data.type === 'candidate') {
                if (myPeerConnection) {
                    try {
                        const candidate = new RTCIceCandidate(data.candidate);
                        await myPeerConnection.addIceCandidate(candidate);
                        console.log('✅ ICE кандидат добавлен');
                    } catch (e) {
                        console.log('Ошибка добавления кандидата:', e);
                    }
                }
            }
        } catch (e) {
            console.error('Ошибка обработки вызова:', e);
        } finally {
            isProcessingCall = false;
        }
    });
}

async function handleIncomingCall(callerId, data) {
    try {
        console.log('📞 Обработка входящего вызова от:', callerId);
        myKeyPair = await generateKeyPair();
        
        myPeerConnection = new RTCPeerConnection(rtcConfig);
        
        myPeerConnection.ondatachannel = (event) => {
            console.log('📡 Data channel получен');
            dataChannel = event.channel;
            setupDataChannel();
        };
        
        myPeerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('📤 Отправка ICE кандидата');
                database.ref('calls/' + callerId + '/' + myId).set({
                    type: 'candidate',
                    candidate: event.candidate
                });
            }
        };
        
        myPeerConnection.oniceconnectionstatechange = () => {
            const state = myPeerConnection.iceConnectionState;
            console.log('🔄 ICE состояние:', state);
            if (state === 'connected') {
                console.log('✅ ICE соединение установлено!');
            } else if (state === 'failed') {
                console.log('❌ ICE failed');
                restartIce();
            }
        };
        
        await myPeerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
        console.log('✅ Remote description установлен');
        
        const answer = await myPeerConnection.createAnswer();
        await myPeerConnection.setLocalDescription(answer);
        console.log('✅ Local description установлен');
        
        await database.ref('calls/' + callerId + '/' + myId).set({
            type: 'answer',
            sdp: answer
        });
        console.log('✅ Ответ отправлен');
        
        remoteId = callerId;
        saveChat(callerId); // СОХРАНЯЕМ ЧАТ
        showChat(callerId);
        
    } catch (e) {
        console.error('❌ Ошибка ответа на звонок:', e);
        alert('Ошибка соединения: ' + e.message);
        resetChat();
    }
}

async function handleAnswer(data) {
    try {
        await myPeerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
        console.log('✅ Remote description установлен');
    } catch (e) {
        console.error('❌ Ошибка установки ответа:', e);
    }
}

function restartIce() {
    if (myPeerConnection) {
        try {
            myPeerConnection.restartIce();
            console.log('🔄 ICE перезапущен');
        } catch (e) {
            console.error('❌ Ошибка перезапуска ICE:', e);
        }
    }
}

function setupDataChannel() {
    if (!dataChannel) {
        console.error('❌ Нет data channel');
        return;
    }
    
    dataChannel.onopen = () => {
        console.log('✅ Канал данных открыт!');
        isConnected = true;
        saveChat(remoteId); // СОХРАНЯЕМ ЧАТ ПРИ ПОДКЛЮЧЕНИИ
        renderChatLayout();
        sendHandshake();
    };
    
    dataChannel.onclose = () => {
        console.log('🔌 Канал закрыт');
        isConnected = false;
        resetChat();
    };
    
    dataChannel.onerror = (error) => {
        console.error('❌ Ошибка канала:', error);
    };
    
    dataChannel.onmessage = async (event) => {
        try {
            const data = JSON.parse(event.data);
            console.log('📩 Получено сообщение:', data.type);
            
            if (data.type === 'HANDSHAKE') {
                const peerPublicKey = await importPublicKey(new Uint8Array(data.publicKey));
                sharedSecretKey = await deriveSharedKey(myKeyPair.privateKey, peerPublicKey);
                console.log('🔑 Ключ шифрования установлен!');
                
                const rawPubKey = await exportPublicKey(myKeyPair.publicKey);
                if (dataChannel && dataChannel.readyState === 'open') {
                    dataChannel.send(JSON.stringify({
                        type: 'HANDSHAKE',
                        publicKey: Array.from(new Uint8Array(rawPubKey))
                    }));
                }
            } else if (data.type === 'MESSAGE') {
                if (!sharedSecretKey) {
                    console.warn('❌ Нет ключа шифрования');
                    return;
                }
                const decryptedText = await decryptMessage(data.encrypted, sharedSecretKey);
                appendMessage(decryptedText, 'in');
                updateLastMessage(remoteId, decryptedText); // ОБНОВЛЯЕМ ПОСЛЕДНЕЕ СООБЩЕНИЕ
            } else if (data.type === 'IMAGE') {
                if (!sharedSecretKey) return;
                const decryptedImage = await decryptMessage(data.encrypted, sharedSecretKey);
                appendImage(decryptedImage, 'in');
                updateLastMessage(remoteId, '📷 Изображение');
            }
        } catch (e) {
            console.error('❌ Ошибка обработки сообщения:', e);
        }
    };
}

// --- ВЫЗОВ СОБЕСЕДНИКА ---

btnConnect.addEventListener('click', async () => {
    const peerId = peerIdInput.value.trim();
    if (!peerId) {
        alert('Введите ID собеседника');
        return;
    }
    if (peerId === myId) {
        alert('Нельзя подключиться к самому себе');
        return;
    }
    if (isConnected) {
        alert('Уже есть активное соединение');
        return;
    }
    
    try {
        const userSnapshot = await database.ref('users/' + peerId).once('value');
        if (!userSnapshot.exists()) {
            alert('❌ Пользователь не найден');
            return;
        }
    } catch (e) {
        alert('Ошибка проверки пользователя');
        return;
    }
    
    await database.ref('calls/' + peerId + '/' + myId).remove();
    await database.ref('calls/' + myId).remove();
    
    remoteId = peerId;
    isCaller = true;
    saveChat(peerId); // СОХРАНЯЕМ ЧАТ
    await startCall(peerId);
});

async function startCall(peerId) {
    try {
        console.log('📞 Звонок к:', peerId);
        myKeyPair = await generateKeyPair();
        
        myPeerConnection = new RTCPeerConnection(rtcConfig);
        
        dataChannel = myPeerConnection.createDataChannel('chat');
        setupDataChannel();
        console.log('📡 Data channel создан');
        
        myPeerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('📤 Отправка ICE кандидата');
                database.ref('calls/' + peerId + '/' + myId).set({
                    type: 'candidate',
                    candidate: event.candidate
                });
            }
        };
        
        myPeerConnection.oniceconnectionstatechange = () => {
            const state = myPeerConnection.iceConnectionState;
            console.log('🔄 ICE состояние:', state);
            if (state === 'connected') {
                console.log('✅ ICE соединение установлено!');
            } else if (state === 'failed') {
                console.log('❌ ICE failed');
                restartIce();
            }
        };
        
        const offer = await myPeerConnection.createOffer();
        await myPeerConnection.setLocalDescription(offer);
        console.log('✅ Offer создан');
        
        await database.ref('calls/' + peerId + '/' + myId).set({
            type: 'offer',
            sdp: offer
        });
        console.log('✅ Offer отправлен');
        
        showChat(peerId);
        
        setTimeout(() => {
            if (!isConnected) {
                console.log('⏰ Таймаут соединения');
                restartIce();
            }
        }, 15000);
        
    } catch (e) {
        console.error('❌ Ошибка звонка:', e);
        alert('Ошибка подключения: ' + e.message);
        resetChat();
    }
}

// --- ИНТЕРФЕЙС ---

function showChat(peerId) {
    systemPlaceholder.style.display = 'none';
    activeChatHeader.style.display = 'flex';
    chatName.innerText = 'Подключение...';
    chatAvatar.src = '';
    inputArea.style.display = 'flex';
    
    database.ref('users/' + peerId).once('value', (snapshot) => {
        const user = snapshot.val();
        if (user) {
            chatName.innerText = user.name || 'Собеседник';
            chatAvatar.src = user.avatar || '';
            listenUserStatus(peerId);
        }
    });
    
    // Подсвечиваем в списке
    document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
    const item = document.querySelector(`.chat-item[data-id="${peerId}"]`);
    if (item) item.classList.add('active');
}

function renderChatLayout() {
    systemPlaceholder.style.display = 'none';
    activeChatHeader.style.display = 'flex';
    inputArea.style.display = 'flex';
    
    database.ref('users/' + remoteId).once('value', (snapshot) => {
        const user = snapshot.val();
        if (user) {
            chatName.innerText = user.name || 'Собеседник';
            chatAvatar.src = user.avatar || '';
            listenUserStatus(remoteId);
        }
    });
    
    document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
    const item = document.querySelector(`.chat-item[data-id="${remoteId}"]`);
    if (item) item.classList.add('active');
    
    sendHandshake();
}

function listenUserStatus(userId) {
    database.ref('users/' + userId).on('value', (snapshot) => {
        const user = snapshot.val();
        if (user) {
            if (chatStatusText) {
                chatStatusText.textContent = user.online ? 'Онлайн' : 'Офлайн';
                if (statusDot) {
                    statusDot.className = 'status-dot ' + (user.online ? 'online' : 'offline');
                }
            }
        }
    });
}

async function sendHandshake() {
    if (!dataChannel || dataChannel.readyState !== 'open') {
        setTimeout(sendHandshake, 1000);
        return;
    }
    
    try {
        const rawPubKey = await exportPublicKey(myKeyPair.publicKey);
        dataChannel.send(JSON.stringify({
            type: 'HANDSHAKE',
            publicKey: Array.from(new Uint8Array(rawPubKey))
        }));
        console.log('🤝 Handshake отправлен');
    } catch (e) {
        console.error('❌ Ошибка отправки handshake:', e);
    }
}

// --- ОТПРАВКА СООБЩЕНИЙ ---

async function handleSendMessage() {
    const text = messageInput.value.trim();
    if (!text) {
        alert('Введите сообщение');
        return;
    }
    if (!dataChannel || dataChannel.readyState !== 'open') {
        alert('Соединение не установлено');
        return;
    }
    if (!sharedSecretKey) {
        alert('Ключ шифрования не установлен');
        return;
    }

    try {
        const encryptedData = await encryptMessage(text, sharedSecretKey);
        dataChannel.send(JSON.stringify({
            type: 'MESSAGE',
            encrypted: encryptedData
        }));
        appendMessage(text, 'out');
        updateLastMessage(remoteId, text);
        messageInput.value = '';
    } catch (e) {
        console.error('❌ Ошибка отправки:', e);
        alert('Ошибка отправки сообщения');
    }
}

btnSend.addEventListener('click', handleSendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSendMessage();
});

// --- ОТПРАВКА ИЗОБРАЖЕНИЙ ---

let fileInput = null;

document.getElementById('btn-attach')?.addEventListener('click', () => {
    if (!fileInput) {
        fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.onchange = async (e) => {
            const file = e.target.files[0];
            if (file) {
                await sendImage(file);
            }
            fileInput.value = '';
        };
    }
    fileInput.click();
});

async function sendImage(file) {
    if (!dataChannel || dataChannel.readyState !== 'open') {
        alert('Соединение не установлено');
        return;
    }
    
    try {
        const reader = new FileReader();
        reader.onload = async (e) => {
            const imageData = e.target.result;
            if (sharedSecretKey) {
                const encryptedData = await encryptMessage(imageData, sharedSecretKey);
                dataChannel.send(JSON.stringify({
                    type: 'IMAGE',
                    encrypted: encryptedData
                }));
                appendImage(imageData, 'out');
                updateLastMessage(remoteId, '📷 Изображение');
            }
        };
        reader.readAsDataURL(file);
    } catch (e) {
        console.error('Ошибка отправки фото:', e);
    }
}

function appendImage(src, direction) {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message', direction);
    
    const img = document.createElement('img');
    img.className = 'message-image';
    img.src = src;
    img.onclick = () => window.open(src, '_blank');
    
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    msgDiv.appendChild(img);
    const timeDiv = document.createElement('div');
    timeDiv.className = 'message-time';
    timeDiv.textContent = time;
    msgDiv.appendChild(timeDiv);
    
    messagesContainer.appendChild(msgDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

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

// --- ПРОФИЛЬ ---

document.getElementById('chat-header-click')?.addEventListener('click', () => {
    if (remoteId) {
        showProfile(remoteId);
    }
});

document.getElementById('btn-profile')?.addEventListener('click', () => {
    if (remoteId) {
        showProfile(remoteId);
    }
});

document.getElementById('btn-call')?.addEventListener('click', () => {
    alert('📞 Функция звонков в разработке!');
});

document.getElementById('btn-emoji')?.addEventListener('click', () => {
    const input = document.getElementById('message-input');
    const emojis = ['😊', '😂', '❤️', '🔥', '👍', '👋', '🎉', '✨', '💪', '🤝'];
    const emoji = emojis[Math.floor(Math.random() * emojis.length)];
    input.value += emoji;
    input.focus();
});

document.getElementById('profile-modal-close')?.addEventListener('click', () => {
    document.getElementById('profile-modal').style.display = 'none';
});

document.getElementById('profile-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
        document.getElementById('profile-modal').style.display = 'none';
    }
});

async function showProfile(userId) {
    try {
        const snapshot = await database.ref('users/' + userId).once('value');
        const user = snapshot.val();
        if (!user) {
            alert('Пользователь не найден');
            return;
        }
        
        const role = await getUserRole(userId);
        const roleBadge = getRoleBadge(role);
        
        document.getElementById('profile-avatar').src = user.avatar || '';
        document.getElementById('profile-name').textContent = user.name || 'Без имени';
        document.getElementById('profile-id').textContent = 'ID: ' + userId;
        document.getElementById('profile-status').textContent = user.online ? '🟢 Онлайн' : '⚫ Офлайн';
        document.getElementById('profile-role').textContent = roleBadge || 'Пользователь';
        
        document.getElementById('profile-modal').style.display = 'flex';
        
        document.getElementById('profile-chat').onclick = () => {
            document.getElementById('profile-modal').style.display = 'none';
            openChat(userId);
        };
        
    } catch (e) {
        console.error('Ошибка загрузки профиля:', e);
    }
}

// --- АДМИН-ФУНКЦИИ ---

async function checkIfAdmin() {
    if (!currentUser) return false;
    try {
        const snapshot = await database.ref('admins/' + currentUser.uid).once('value');
        return snapshot.exists() && snapshot.val().role === 'admin';
    } catch (e) {
        console.error('Ошибка проверки админа:', e);
        return false;
    }
}

async function checkIfCreator() {
    if (!currentUser) return false;
    try {
        const snapshot = await database.ref('creator').once('value');
        return snapshot.exists() && snapshot.val() === currentUser.uid;
    } catch (e) {
        console.error('Ошибка проверки создателя:', e);
        return false;
    }
}

async function getUserRole(userId) {
    try {
        const creatorSnapshot = await database.ref('creator').once('value');
        if (creatorSnapshot.exists() && creatorSnapshot.val() === userId) {
            return 'creator';
        }
        const adminSnapshot = await database.ref('admins/' + userId).once('value');
        if (adminSnapshot.exists()) {
            return 'admin';
        }
        return 'user';
    } catch (e) {
        console.error('Ошибка получения роли:', e);
        return 'user';
    }
}

function getRoleBadge(role) {
    if (role === 'creator') return '👑 Создатель';
    if (role === 'admin') return '⭐ Админ';
    return '';
}

function getRoleColor(role) {
    if (role === 'creator') return '#ffd700';
    if (role === 'admin') return '#00bfff';
    return '#708499';
}

// --- АДМИН ПАНЕЛЬ ---

async function showAdminPanel() {
    const isAdmin = await checkIfAdmin();
    const isCreator = await checkIfCreator();
    const panel = document.getElementById('admin-panel');
    
    if (!panel) return;
    
    if (isAdmin || isCreator) {
        panel.style.display = 'block';
    }
}

async function banUser(userId, reason) {
    if (!await checkIfAdmin()) {
        alert('❌ Нет прав администратора!');
        return false;
    }
    try {
        await database.ref('banned/' + userId).set({
            bannedAt: Date.now(),
            reason: reason || 'Нарушение правил',
            bannedBy: currentUser.uid
        });
        if (dataChannel && remoteId === userId) {
            dataChannel.close();
            resetChat();
        }
        console.log('✅ Пользователь забанен:', userId);
        return true;
    } catch (e) {
        console.error('Ошибка бана:', e);
        return false;
    }
}

async function unbanUser(userId) {
    if (!await checkIfAdmin()) {
        alert('❌ Нет прав администратора!');
        return false;
    }
    try {
        await database.ref('banned/' + userId).remove();
        console.log('✅ Пользователь разбанен:', userId);
        return true;
    } catch (e) {
        console.error('Ошибка разбана:', e);
        return false;
    }
}

async function checkBanned(userId) {
    try {
        const snapshot = await database.ref('banned/' + userId).once('value');
        return snapshot.exists();
    } catch (e) {
        console.error('Ошибка проверки бана:', e);
        return false;
    }
}

async function getAllUsers() {
    if (!await checkIfAdmin()) {
        alert('❌ Нет прав администратора!');
        return [];
    }
    try {
        const snapshot = await database.ref('users').once('value');
        const users = [];
        snapshot.forEach((child) => {
            users.push({
                id: child.key,
                ...child.val()
            });
        });
        return users;
    } catch (e) {
        console.error('Ошибка получения пользователей:', e);
        return [];
    }
}

async function makeAdmin(userId) {
    if (!await checkIfAdmin()) {
        alert('❌ Нет прав администратора!');
        return false;
    }
    try {
        const snapshot = await database.ref('users/' + userId).once('value');
        const user = snapshot.val();
        if (!user) {
            alert('❌ Пользователь не найден');
            return false;
        }
        await database.ref('admins/' + userId).set({
            role: 'admin',
            email: user.email || '',
            name: user.name || '',
            addedAt: Date.now()
        });
        console.log('✅ Пользователь назначен админом:', userId);
        return true;
    } catch (e) {
        console.error('Ошибка назначения админа:', e);
        return false;
    }
}

// --- RESET ---

function resetChat() {
    if (myPeerConnection) {
        myPeerConnection.close();
        myPeerConnection = null;
    }
    dataChannel = null;
    activeChat = null;
    sharedSecretKey = null;
    isConnected = false;
    isCaller = false;
    isProcessingCall = false;
    
    if (myId) {
        database.ref('calls/' + myId).remove();
    }
    if (remoteId) {
        database.ref('calls/' + remoteId + '/' + myId).remove();
    }
    
    activeChatHeader.style.display = 'none';
    inputArea.style.display = 'none';
    systemPlaceholder.style.display = 'block';
    messagesContainer.innerHTML = `<div class="system-info" id="system-placeholder">Соединение разорвано</div>`;
}

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

console.log('✅ App.js загружен! (с сохранением чатов)');
