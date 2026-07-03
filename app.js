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
let isConnected = false;
let messageListener = null;
let isAdmin = false;
let isCreator = false;
let loadedMessages = new Set();
let activeChatId = null;

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
        listenForGlobalMessages();
        await checkAdminStatus();
        showAdminPanel();
        
    } else {
        authScreen.style.display = 'flex';
        appScreen.style.display = 'none';
    }
});

// ============================================
// 2. ФОРМАТИРОВАНИЕ ДАТЫ
// ============================================

function formatDate(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    if (msgDate.getTime() === today.getTime()) {
        return 'Сегодня';
    } else if (msgDate.getTime() === yesterday.getTime()) {
        return 'Вчера';
    } else {
        const options = { day: 'numeric', month: 'long', year: 'numeric' };
        return date.toLocaleDateString('ru-RU', options);
    }
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

// ============================================
// 3. ОТОБРАЖЕНИЕ СООБЩЕНИЙ
// ============================================

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
        console.error('❌ Контейнер не найден!');
        return;
    }
    
    const msgKey = text + timestamp + dir;
    if (loadedMessages.has(msgKey)) {
        console.log('⚠️ Дубль:', text);
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
    
    console.log(`✅ Сообщение показано: ${text} (${dir})`);
}

function escapeHTML(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

// ============================================
// 4. ГЛОБАЛЬНЫЙ СЛУШАТЕЛЬ (ФИКС!)
// ============================================

function listenForGlobalMessages() {
    // Слушаем ВСЕ сообщения, которые приходят к НАМ
    database.ref('messages/' + myId).on('child_added', (snapshot) => {
        const data = snapshot.val();
        const fromId = snapshot.key;
        
        if (!data || !data.text) return;
        
        console.log('📩 ПОЛУЧЕНО СООБЩЕНИЕ от:', fromId);
        console.log('📩 Текст:', data.text);
        console.log('📩 Текущий чат:', activeChatId);
        
        // Определяем направление
        const dir = data.from === myId ? 'out' : 'in';
        
        // ПОКАЗЫВАЕМ СООБЩЕНИЕ В ЧАТЕ (если чат открыт)
        if (activeChatId) {
            console.log('✅ Показываем в чате');
            appendMessage(data.text, dir, data.timestamp || Date.now());
            updateLastMessage(fromId, data.text);
        }
        
        // Обновляем список чатов
        database.ref('users/' + fromId).once('value', (snap) => {
            const user = snap.val();
            if (user) {
                saveChat(fromId, user.name, user.avatar);
                updateLastMessage(fromId, data.text);
            }
        });
        
        // Уведомление
        if (data.from !== myId) {
            showNotification(`📩 ${data.name || 'Собеседник'}: ${data.text.substring(0, 30)}`);
        }
    });
}

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
        z-index: 10000;
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

// ============================================
// 5. ЗАГРУЗКА ИСТОРИИ
// ============================================

function loadFullHistory(peerId) {
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
                    const timeStr = formatTime(msg.timestamp || Date.now());
                    div.innerHTML = `
                        <div>${escapeHTML(msg.text)}</div>
                        <div class="message-time">${timeStr}</div>
                    `;
                    container.appendChild(div);
                    
                    const msgKey = msg.text + (msg.timestamp || Date.now()) + dir;
                    loadedMessages.add(msgKey);
                }
            });
            
            console.log(`📚 Загружено ${messages.length} сообщений`);
            container.scrollTop = container.scrollHeight;
        } else {
            console.log('📭 Нет истории сообщений');
        }
    });
}

// ============================================
// 6. ЧАТЫ
// ============================================

function loadChats() {
    database.ref('chats/' + myId).on('value', (snapshot) => {
        const data = snapshot.val();
        renderChatsList(data);
    });
}

function renderChatsList(data) {
    if (!chatsList) return;
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
    
    const sorted = Object.values(data).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    sorted.forEach(chat => {
        const div = document.createElement('div');
        div.className = 'chat-item';
        if (chat.peerId === activeChatId) {
            div.classList.add('active');
        }
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

// ============================================
// 7. ОТКРЫТИЕ ЧАТА
// ============================================

function openChat(peerId) {
    console.log('📂 Открываем чат с:', peerId);
    
    remoteId = peerId;
    isConnected = true;
    activeChatId = peerId;
    peerIdInput.value = peerId;
    showChatUI(peerId);
    loadFullHistory(peerId);
    
    if (chatStatusText) chatStatusText.textContent = 'Онлайн ✅';
    if (statusDot) statusDot.className = 'status-dot online';
}

function showChatUI(peerId) {
    if (systemPlaceholder) systemPlaceholder.style.display = 'none';
    if (activeChatHeader) activeChatHeader.style.display = 'flex';
    if (inputArea) inputArea.style.display = 'flex';
    if (chatName) chatName.textContent = 'Загрузка...';
    if (chatAvatar) chatAvatar.src = '';
    
    database.ref('users/' + peerId).once('value', async (snap) => {
        const user = snap.val();
        if (user && chatName) {
            chatName.textContent = user.name || 'Собеседник';
            if (chatAvatar) chatAvatar.src = user.avatar || '';
            
            const role = await getUserRole(peerId);
            const badge = getRoleBadge(role);
            const color = getRoleColor(role);
            if (badge) {
                const badgeSpan = document.createElement('span');
                badgeSpan.className = 'role-badge';
                badgeSpan.style.cssText = `
                    color: ${color};
                    font-size: 11px;
                    margin-left: 6px;
                    background: rgba(255,255,255,0.1);
                    padding: 2px 8px;
                    border-radius: 10px;
                    display: inline-block;
                `;
                badgeSpan.textContent = badge;
                chatName.appendChild(badgeSpan);
            }
        }
    });
    
    document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
    const item = document.querySelector(`.chat-item[data-id="${peerId}"]`);
    if (item) item.classList.add('active');
}

// ============================================
// 8. КНОПКА "ПОДКЛЮЧИТЬСЯ"
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
    
    if (await checkBanned(targetId)) {
        alert('❌ Этот пользователь забанен!');
        return;
    }
    if (await checkBanned(myId)) {
        alert('❌ Вы забанены!');
        return;
    }
    
    const snap = await database.ref('users/' + targetId).once('value');
    if (!snap.exists()) {
        alert('❌ Пользователь не найден');
        return;
    }
    
    const user = snap.val();
    saveChat(targetId, user.name, user.avatar);
    openChat(targetId);
});

// ============================================
// 9. ОТПРАВКА (ГЛАВНЫЙ ФИКС!)
// ============================================

btnSend.addEventListener('click', () => {
    const text = messageInput.value.trim();
    if (!text) {
        alert('❌ Введите сообщение');
        return;
    }
    if (!activeChatId) {
        alert('❌ Нет собеседника');
        return;
    }
    
    const targetId = activeChatId;
    const timestamp = Date.now();
    
    console.log('📤 ОТПРАВКА сообщения:', text, 'кому:', targetId);
    
    // Отправляем СОБЕСЕДНИКУ (в его папку messages)
    database.ref('messages/' + targetId + '/' + myId).push().set({
        from: myId,
        text: text,
        name: currentUser.displayName || 'Собеседник',
        timestamp: timestamp
    });
    
    // Сохраняем У СЕБЯ (в свою папку messages)
    database.ref('messages/' + myId + '/' + targetId).push().set({
        from: myId,
        text: text,
        name: currentUser.displayName || 'Собеседник',
        timestamp: timestamp
    });
    
    // Показываем сразу
    appendMessage(text, 'out', timestamp);
    updateLastMessage(targetId, text);
    messageInput.value = '';
});

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') btnSend.click();
});

// ============================================
// 10. РОЛИ
// ============================================

async function checkAdminStatus() {
    try {
        const creatorSnap = await database.ref('creator').once('value');
        if (creatorSnap.exists() && creatorSnap.val() === myId) {
            isCreator = true;
            isAdmin = true;
            return;
        }
        const adminSnap = await database.ref('admins/' + myId).once('value');
        if (adminSnap.exists()) {
            isAdmin = true;
        }
    } catch(e) {
        console.log('Ошибка проверки роли:', e);
    }
}

async function getUserRole(userId) {
    try {
        const creatorSnap = await database.ref('creator').once('value');
        if (creatorSnap.exists() && creatorSnap.val() === userId) {
            return 'creator';
        }
        const adminSnap = await database.ref('admins/' + userId).once('value');
        if (adminSnap.exists()) {
            return 'admin';
        }
        return 'user';
    } catch(e) {
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

async function showAdminPanel() {
    const panel = document.getElementById('admin-panel');
    if (!panel) return;
    
    if (isAdmin || isCreator) {
        panel.style.display = 'block';
        
        document.getElementById('btn-ban')?.addEventListener('click', async () => {
            const userId = document.getElementById('admin-user-id').value.trim();
            if (!userId) return alert('Введите ID');
            await banUser(userId, prompt('Причина бана:'));
        });
        
        document.getElementById('btn-unban')?.addEventListener('click', async () => {
            const userId = document.getElementById('admin-user-id').value.trim();
            if (!userId) return alert('Введите ID');
            await unbanUser(userId);
        });
        
        document.getElementById('btn-make-admin')?.addEventListener('click', async () => {
            const userId = document.getElementById('admin-user-id').value.trim();
            if (!userId) return alert('Введите ID');
            await makeAdmin(userId);
        });
        
        document.getElementById('btn-show-users')?.addEventListener('click', async () => {
            await showUserList();
        });
    }
}

async function banUser(userId, reason) {
    if (!isAdmin && !isCreator) return alert('❌ Нет прав!');
    try {
        await database.ref('banned/' + userId).set({
            bannedAt: Date.now(),
            reason: reason || 'Нарушение правил',
            bannedBy: myId
        });
        alert('✅ Пользователь забанен!');
    } catch(e) {
        alert('❌ Ошибка бана');
    }
}

async function unbanUser(userId) {
    if (!isAdmin && !isCreator) return alert('❌ Нет прав!');
    try {
        await database.ref('banned/' + userId).remove();
        alert('✅ Пользователь разбанен!');
    } catch(e) {
        alert('❌ Ошибка разбана');
    }
}

async function makeAdmin(userId) {
    if (!isCreator) return alert('❌ Только создатель может назначать админов!');
    try {
        const snap = await database.ref('users/' + userId).once('value');
        const user = snap.val();
        if (!user) return alert('❌ Пользователь не найден');
        await database.ref('admins/' + userId).set({
            role: 'admin',
            name: user.name || 'Без имени',
            addedAt: Date.now()
        });
        alert('✅ Пользователь назначен админом!');
    } catch(e) {
        alert('❌ Ошибка');
    }
}

async function showUserList() {
    if (!isAdmin && !isCreator) return alert('❌ Нет прав!');
    try {
        const snap = await database.ref('users').once('value');
        const users = snap.val();
        const list = document.getElementById('admin-users-list');
        if (!list) return;
        
        let html = '<div style="max-height:200px;overflow-y:auto;">';
        for (const [id, user] of Object.entries(users || {})) {
            const role = await getUserRole(id);
            const badge = getRoleBadge(role);
            const isBanned = await checkBanned(id);
            html += `
                <div style="padding:4px;border-bottom:1px solid #333;display:flex;justify-content:space-between;">
                    <span>${user.name || 'Без имени'} ${badge}</span>
                    <span>${isBanned ? '🚫' : '✅'}</span>
                </div>
            `;
        }
        html += '</div>';
        list.innerHTML = html;
    } catch(e) {
        alert('❌ Ошибка загрузки');
    }
}

async function checkBanned(userId) {
    try {
        const snap = await database.ref('banned/' + userId).once('value');
        return snap.exists();
    } catch(e) {
        return false;
    }
}

// ============================================
// 11. ПРОФИЛЬ
// ============================================

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
    
    const role = await getUserRole(userId);
    const badge = getRoleBadge(role);
    
    document.getElementById('profile-avatar').src = user.avatar || '';
    document.getElementById('profile-name').textContent = user.name || 'Без имени';
    document.getElementById('profile-id').textContent = 'ID: ' + userId.substring(0, 12);
    document.getElementById('profile-status').textContent = user.online ? '🟢 Онлайн' : '⚫ Офлайн';
    document.getElementById('profile-role').textContent = badge || 'Пользователь';
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

console.log('✅ App.js загружен! (FIX: сообщения видны у обоих)');
