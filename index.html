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
        generateUserId();
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
        // Очищаем вызовы
        database.ref('calls/' + myId).remove();
    });
    
    // Очищаем старые вызовы при старте
    database.ref('calls/' + myId).remove();
    
    listenForCalls();
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

// --- WEBRTC С TURN СЕРВЕРОМ ---

// Бесплатный TURN сервер от Google (ограниченный, но работает)
const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        // TURN сервер (нужен когда STUN не работает)
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

async function listenForCalls() {
    database.ref('calls/' + myId).on('child_added', async (snapshot) => {
        if (isProcessingCall) return;
        
        const data = snapshot.val();
        const callerId = snapshot.key;
        
        if (!data || !data.type || callerId === myId) return;
        if (isConnected) {
            // Если уже есть соединение, отклоняем
            return;
        }
        
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
        
        // Обработка входящего data channel
        myPeerConnection.ondatachannel = (event) => {
            console.log('📡 Data channel получен');
            dataChannel = event.channel;
            setupDataChannel();
        };
        
        // Сбор ICE кандидатов
        myPeerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('📤 Отправка ICE кандидата');
                database.ref('calls/' + callerId + '/' + myId).set({
                    type: 'candidate',
                    candidate: event.candidate
                });
            }
        };
        
        // Обработка ошибок ICE
        myPeerConnection.oniceconnectionstatechange = () => {
            const state = myPeerConnection.iceConnectionState;
            console.log('🔄 ICE состояние:', state);
            if (state === 'failed') {
                console.log('❌ ICE failed, пробуем переподключиться...');
                // Пробуем переподключиться через TURN
                restartIce();
            }
        };
        
        // Устанавливаем удаленное описание
        await myPeerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
        console.log('✅ Remote description установлен');
        
        // Создаем ответ
        const answer = await myPeerConnection.createAnswer();
        await myPeerConnection.setLocalDescription(answer);
        console.log('✅ Local description установлен');
        
        // Отправляем ответ
        await database.ref('calls/' + callerId + '/' + myId).set({
            type: 'answer',
            sdp: answer
        });
        console.log('✅ Ответ отправлен');
        
        remoteId = callerId;
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
                
                // Отправляем ответный handshake
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
    
    // Проверяем существует ли пользователь
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
    
    // Очищаем старые вызовы
    await database.ref('calls/' + peerId + '/' + myId).remove();
    await database.ref('calls/' + myId).remove();
    
    remoteId = peerId;
    isCaller = true;
    await startCall(peerId);
});

async function startCall(peerId) {
    try {
        console.log('📞 Звонок к:', peerId);
        myKeyPair = await generateKeyPair();
        
        myPeerConnection = new RTCPeerConnection(rtcConfig);
        
        // Создаем data channel
        dataChannel = myPeerConnection.createDataChannel('chat');
        setupDataChannel();
        console.log('📡 Data channel создан');
        
        // Сбор ICE кандидатов
        myPeerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('📤 Отправка ICE кандидата');
                database.ref('calls/' + peerId + '/' + myId).set({
                    type: 'candidate',
                    candidate: event.candidate
                });
            }
        };
        
        // Обработка ошибок ICE
        myPeerConnection.oniceconnectionstatechange = () => {
            const state = myPeerConnection.iceConnectionState;
            console.log('🔄 ICE состояние:', state);
            if (state === 'failed') {
                console.log('❌ ICE failed, пробуем переподключиться...');
                restartIce();
            } else if (state === 'connected') {
                console.log('✅ ICE соединение установлено!');
            }
        };
        
        // Создаем offer
        const offer = await myPeerConnection.createOffer();
        await myPeerConnection.setLocalDescription(offer);
        console.log('✅ Offer создан');
        
        // Отправляем offer
        await database.ref('calls/' + peerId + '/' + myId).set({
            type: 'offer',
            sdp: offer
        });
        console.log('✅ Offer отправлен');
        
        showChat(peerId);
        
        // Таймаут на случай если соединение не устанавливается
        setTimeout(() => {
            if (!isConnected) {
                console.log('⏰ Таймаут соединения');
                // Пробуем переподключиться
                restartIce();
            }
        }, 15000);
        
    } catch (e) {
        console.error('❌ Ошибка звонка:', e);
        alert('Ошибка подключения: ' + e.message);
        resetChat();
    }
}

function showChat(peerId) {
    systemPlaceholder.style.display = 'none';
    activeChatHeader.style.display = 'flex';
    chatName.innerText = 'Подключение...';
    chatAvatar.src = '';
    
    database.ref('users/' + peerId).once('value', (snapshot) => {
        const user = snapshot.val();
        if (user) {
            chatName.innerText = user.name || 'Собеседник';
            chatAvatar.src = user.avatar || '';
        }
    });
}

// --- ИНТЕРФЕЙС ---

function renderChatLayout() {
    systemPlaceholder.style.display = 'none';
    activeChatHeader.style.display = 'flex';
    inputArea.style.display = 'flex';
    
    database.ref('users/' + remoteId).once('value', (snapshot) => {
        const user = snapshot.val();
        if (user) {
            chatName.innerText = user.name || 'Собеседник';
            chatAvatar.src = user.avatar || '';
        }
    });
    
    chatsList.innerHTML = `
        <div class="chat-item active">
            <img class="avatar" src="${chatAvatar.src || ''}">
            <div class="user-info">
                <div class="user-name">${chatName.innerText}</div>
                <div class="chat-status">🔒 Защищено</div>
            </div>
        </div>
    `;
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
    
    // Очищаем вызовы
    if (myId) {
        database.ref('calls/' + myId).remove();
    }
    if (remoteId) {
        database.ref('calls/' + remoteId + '/' + myId).remove();
    }
    
    chatsList.innerHTML = '';
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

console.log('✅ App.js загружен! (WebRTC с TURN)');
