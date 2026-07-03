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
let isConnected = false;
let isCaller = false;
let reconnectAttempts = 0;

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
            alert('✅ ID скопирован!');
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
// 2. WEBRTC С TURN
// ============================================

// ИСПОЛЬЗУЕМ ТОЛЬКО РАБОЧИЕ TURN СЕРВЕРА
const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        // РАБОЧИЙ TURN СЕРВЕР
        {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        {
            urls: 'turn:openrelay.metered.ca:443',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        {
            urls: 'turn:openrelay.metered.ca:443?transport=tcp',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        }
    ],
    iceCandidatePoolSize: 10
};

function listenForCalls() {
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
        console.log('📞 Обработка входящего...');
        
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
            const state = peerConnection.iceConnectionState;
            console.log('🔄 ICE состояние:', state);
            if (state === 'connected') {
                console.log('✅ ICE соединен!');
            } else if (state === 'failed') {
                console.log('❌ ICE failed');
                // Пробуем переподключиться
                if (reconnectAttempts < 3) {
                    reconnectAttempts++;
                    setTimeout(() => {
                        if (peerConnection) {
                            try { peerConnection.restartIce(); } catch(e) {}
                        }
                    }, 2000);
                }
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
        reconnectAttempts = 0;
        if (chatStatusText) chatStatusText.textContent = 'Подключено ✅';
        if (statusDot) statusDot.className = 'status-dot online';
        showChatUI(remoteId);
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
            if (data.type === 'message') {
                appendMessage(data.text, 'in');
                updateLastMessage(remoteId, data.text);
            }
        } catch(e) {
            console.error('Ошибка сообщения:', e);
        }
    };
}

// ============================================
// 3. ВЫЗОВ СОБЕСЕДНИКА
// ============================================

btnConnect.addEventListener('click', async () => {
    const targetId = peerIdInput.value.trim();
    if (!targetId) {
        alert('❌ Введите ID');
        return;
    }
    if (targetId === myId) {
        alert('❌ Нельзя к себе');
        return;
    }
    if (isConnected) {
        alert('❌ Уже есть соединение');
        return;
    }
    
    const snap = await database.ref('users/' + targetId).once('value');
    if (!snap.exists()) {
        alert('❌ Пользователь не найден');
        return;
    }
    
    await database.ref('calls/' + targetId + '/' + myId).remove();
    await database.ref('calls/' + myId).remove();
    
    remoteId = targetId;
    isCaller = true;
    reconnectAttempts = 0;
    
    try {
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
            const state = peerConnection.iceConnectionState;
            console.log('🔄 ICE состояние:', state);
            if (state === 'connected') {
                console.log('✅ ICE соединен!');
            } else if (state === 'failed') {
                console.log('❌ ICE failed');
                if (reconnectAttempts < 3) {
                    reconnectAttempts++;
                    setTimeout(() => {
                        if (peerConnection) {
                            try { peerConnection.restartIce(); } catch(e) {}
                        }
                    }, 2000);
                }
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
        
    } catch(e) {
        console.error('Ошибка:', e);
        alert('❌ Ошибка: ' + e.message);
        resetChat();
    }
});

// ============================================
// 4. ЧАТЫ
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
    isCaller = false;
    reconnectAttempts = 0;
    
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
// 5. ОТПРАВКА СООБЩЕНИЙ
// ============================================

btnSend.addEventListener('click', () => {
    const text = messageInput.value.trim();
    if (!text) {
        alert('❌ Введите сообщение');
        return;
    }
    if (!dataChannel || dataChannel.readyState !== 'open') {
        alert('❌ Соединение не установлено');
        return;
    }
    
    dataChannel.send(JSON.stringify({
        type: 'message',
        text: text
    }));
    appendMessage(text, 'out');
    updateLastMessage(remoteId, text);
    messageInput.value = '';
});

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') btnSend.click();
});

// ============================================
// 6. ОТОБРАЖЕНИЕ
// ============================================

function appendMessage(text, dir) {
    const div = document.createElement('div');
    div.className = 'message ' + dir;
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    div.innerHTML = `
        <div>${text}</div>
        <div class="message-time">${time}</div>
    `;
    messagesContainer.appendChild(div);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// ============================================
// 7. RESET
// ============================================

function resetChat() {
    if (peerConnection) {
        try { peerConnection.close(); } catch(e) {}
        peerConnection = null;
    }
    dataChannel = null;
    isConnected = false;
    
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
// 8. ПРОФИЛЬ
// ============================================

document.getElementById('chat-header-click')?.addEventListener('click', () => {
    if (remoteId) showProfile(remoteId);
});

document.getElementById('btn-profile')?.addEventListener('click', () => {
    if (remoteId) showProfile(remoteId);
});

document.getElementById('btn-call')?.addEventListener('click', () => {
    alert('📞 Функция звонков в разработке!');
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

console.log('✅ App.js загружен! (упрощенная версия)');
