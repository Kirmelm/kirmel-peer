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
let activeChatId = null;
let loadedMessages = new Set();

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

btnLogin.addEventListener('click', () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(error => {
        errorMessage.innerText = error.message;
        errorMessage.style.display = 'block';
    });
});

auth.onAuthStateChanged(async (user) => {
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
        listenForMessages();
        
    } else {
        authScreen.style.display = 'flex';
        appScreen.style.display = 'none';
    }
});

function formatDate(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    if (msgDate.getTime() === today.getTime()) return 'Сегодня';
    if (msgDate.getTime() === yesterday.getTime()) return 'Вчера';
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function addDateSeparator(dateStr) {
    const container = document.getElementById('messages-container');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'date-separator';
    div.textContent = dateStr;
    container.appendChild(div);
}

function appendMessage(text, dir, timestamp) {
    const container = document.getElementById('messages-container');
    if (!container) {
        console.error('❌ messages-container не найден!');
        return;
    }
    
    console.log('📝 [appendMessage] Текст:', text);
    console.log('📝 [appendMessage] Направление:', dir);
    
    const msgKey = text + timestamp + dir;
    if (loadedMessages.has(msgKey)) {
        console.log('⚠️ Дубль, пропускаем');
        return;
    }
    loadedMessages.add(msgKey);
    
    const dateStr = formatDate(timestamp || Date.now());
    const separators = container.querySelectorAll('.date-separator');
    let lastSeparator = separators[separators.length - 1];
    if (!lastSeparator || lastSeparator.textContent !== dateStr) {
        addDateSeparator(dateStr);
    }
    
    const div = document.createElement('div');
    div.className = 'message ' + dir;
    const timeStr = formatTime(timestamp || Date.now());
    div.innerHTML = `
        <div>${escapeHTML(text)}</div>
        <div class="message-time">${timeStr}</div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    console.log('✅ [appendMessage] Сообщение добавлено в чат!');
}

function escapeHTML(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

function listenForMessages() {
    console.log('🔊 [listenForMessages] Запущен слушатель для:', myId);
    
    database.ref('messages/' + myId).on('child_added', (snapshot) => {
        const data = snapshot.val();
        const fromId = snapshot.key;
        
        if (!data || !data.text) return;
        
        console.log('📩 [СЛУШАТЕЛЬ] Сообщение от:', fromId);
        console.log('📩 [СЛУШАТЕЛЬ] Текст:', data.text);
        console.log('📩 [СЛУШАТЕЛЬ] from:', data.from);
        console.log('📩 [СЛУШАТЕЛЬ] myId:', myId);
        console.log('📩 [СЛУШАТЕЛЬ] activeChatId:', activeChatId);
        
        if (data.from === myId) {
            console.log('📩 [СЛУШАТЕЛЬ] Это моё сообщение, пропускаем');
            return;
        }
        
        if (activeChatId) {
            console.log('📩 [СЛУШАТЕЛЬ] Показываем в чате!');
            appendMessage(data.text, 'in', data.timestamp || Date.now());
            updateLastMessage(fromId, data.text);
            showNotification(`📩 ${data.name || 'Собеседник'}: ${data.text.substring(0, 30)}`);
        } else {
            console.log('📩 [СЛУШАТЕЛЬ] Чат не открыт');
        }
        
        database.ref('users/' + fromId).once('value', (snap) => {
            const user = snap.val();
            if (user) {
                saveChat(fromId, user.name, user.avatar);
                updateLastMessage(fromId, data.text);
            }
        });
    });
}

function showNotification(text) {
    const notif = document.createElement('div');
    notif.style.cssText = `
        position: fixed; top: 20px; right: 20px;
        background: #2b5278; color: white;
        padding: 12px 20px; border-radius: 8px;
        z-index: 9999; font-size: 14px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        animation: slideIn 0.3s ease;
        max-width: 300px; cursor: pointer;
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
    .date-separator {
        text-align: center;
        color: var(--text-muted);
        font-size: 12px;
        padding: 8px 0;
        margin: 4px 0;
    }
`;
document.head.appendChild(style);

function loadHistory(peerId) {
    const container = document.getElementById('messages-container');
    if (!container) return;
    container.innerHTML = '';
    loadedMessages.clear();
    activeChatId = peerId;
    
    console.log('📚 Загружаем историю для:', peerId);
    
    database.ref('messages/' + myId + '/' + peerId).once('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            const messages = Object.values(data).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
            let lastDate = '';
            messages.forEach(msg => {
                if (msg && msg.text) {
                    const dir = msg.from === myId ? 'out' : 'in';
                    const dateStr = formatDate(msg.timestamp || Date.now());
                    if (dateStr !== lastDate) {
                        addDateSeparator(dateStr);
                        lastDate = dateStr;
                    }
                    const div = document.createElement('div');
                    div.className = 'message ' + dir;
                    div.innerHTML = `
                        <div>${escapeHTML(msg.text)}</div>
                        <div class="message-time">${formatTime(msg.timestamp || Date.now())}</div>
                    `;
                    container.appendChild(div);
                    const msgKey = msg.text + (msg.timestamp || Date.now()) + dir;
                    loadedMessages.add(msgKey);
                }
            });
            console.log(`📚 Загружено ${messages.length} сообщений`);
            container.scrollTop = container.scrollHeight;
        }
    });
}

function loadChats() {
    database.ref('chats/' + myId).on('value', (snapshot) => {
        const data = snapshot.val();
        if (!chatsList) return;
        chatsList.innerHTML = '';
        if (!data) {
            chatsList.innerHTML = `<div class="empty-chats"><span>💬</span><p>Нет чатов</p></div>`;
            return;
        }
        const sorted = Object.values(data).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        sorted.forEach(chat => {
            const div = document.createElement('div');
            div.className = 'chat-item';
            if (chat.peerId === activeChatId) div.classList.add('active');
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
    if (!myId || !peerId) return;
    database.ref('chats/' + myId + '/' + peerId).once('value', (snap) => {
        if (!snap.exists()) {
            database.ref('chats/' + myId + '/' + peerId).set({
                peerId: peerId,
                name: name || 'Собеседник',
                avatar: avatar || '',
                lastMessage: '',
                timestamp: Date.now()
            });
        }
    });
}

function updateLastMessage(peerId, text) {
    if (!myId || !peerId) return;
    database.ref('chats/' + myId + '/' + peerId).update({
        lastMessage: text.substring(0, 50),
        timestamp: Date.now()
    });
}

function openChat(peerId) {
    activeChatId = peerId;
    peerIdInput.value = peerId;
    
    if (systemPlaceholder) systemPlaceholder.style.display = 'none';
    if (activeChatHeader) activeChatHeader.style.display = 'flex';
    if (inputArea) inputArea.style.display = 'flex';
    if (chatName) chatName.textContent = 'Загрузка...';
    if (chatAvatar) chatAvatar.src = '';
    
    database.ref('users/' + peerId).once('value', (snap) => {
        const user = snap.val();
        if (user && chatName) {
            chatName.textContent = user.name || 'Собеседник';
            if (chatAvatar) chatAvatar.src = user.avatar || '';
        }
    });
    
    document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
    const item = document.querySelector(`.chat-item[data-id="${peerId}"]`);
    if (item) item.classList.add('active');
    
    if (chatStatusText) chatStatusText.textContent = 'Онлайн ✅';
    if (statusDot) statusDot.className = 'status-dot online';
    
    loadHistory(peerId);
}

btnConnect.addEventListener('click', async () => {
    const targetId = peerIdInput.value.trim();
    if (!targetId) { alert('❌ Введите ID'); return; }
    if (targetId === myId) { alert('❌ Нельзя к себе'); return; }
    const snap = await database.ref('users/' + targetId).once('value');
    if (!snap.exists()) { alert('❌ Пользователь не найден'); return; }
    const user = snap.val();
    saveChat(targetId, user.name, user.avatar);
    openChat(targetId);
});

btnSend.addEventListener('click', () => {
    const text = messageInput.value.trim();
    if (!text) { alert('❌ Введите сообщение'); return; }
    if (!activeChatId) { alert('❌ Нет собеседника'); return; }
    
    const targetId = activeChatId;
    const timestamp = Date.now();
    
    console.log('📤 [ОТПРАВКА] Сообщение:', text);
    console.log('📤 [ОТПРАВКА] Кому:', targetId);
    
    database.ref('messages/' + targetId + '/' + myId).push().set({
        from: myId,
        text: text,
        name: currentUser.displayName || 'Собеседник',
        timestamp: timestamp
    });
    
    database.ref('messages/' + myId + '/' + targetId).push().set({
        from: myId,
        text: text,
        name: currentUser.displayName || 'Собеседник',
        timestamp: timestamp
    });
    
    appendMessage(text, 'out', timestamp);
    updateLastMessage(targetId, text);
    messageInput.value = '';
});

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') btnSend.click();
});

document.getElementById('chat-header-click')?.addEventListener('click', () => {
    if (activeChatId) showProfile(activeChatId);
});

document.getElementById('btn-profile')?.addEventListener('click', () => {
    if (activeChatId) showProfile(activeChatId);
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

console.log('✅ App.js загружен! (ФИНАЛЬНАЯ ВЕРСИЯ)');
