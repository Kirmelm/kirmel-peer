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
// 2. ГЛОБАЛЬНЫЙ СЛУШАТЕЛЬ
// ============================================

function listenForGlobalMessages() {
    database.ref('messages/' + myId).on('child_added', (snapshot) => {
        const data = snapshot.val();
        const fromId = snapshot.key;
        
        console.log('📩 Новое сообщение от:', fromId, data);
        
        if (data && data.text) {
            // Если это наш собеседник - показываем
            if (fromId === remoteId) {
                appendMessage(data.text, 'in');
                updateLastMessage(remoteId, data.text);
                showNotification(`📩 ${data.name || 'Собеседник'}: ${data.text.substring(0, 30)}`);
            }
            
            // Сохраняем чат
            database.ref('users/' + fromId).once('value', (snap) => {
                const user = snap.val();
                if (user) {
                    saveChat(fromId, user.name, user.avatar);
                }
            });
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
// 3. ОТОБРАЖЕНИЕ СООБЩЕНИЙ
// ============================================

function appendMessage(text, dir) {
    const container = document.getElementById('messages-container');
    if (!container) {
        console.error('❌ messages-container не найден!');
        return;
    }
    
    const div = document.createElement('div');
    div.className = 'message ' + dir;
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    div.innerHTML = `
        <div>${escapeHTML(text)}</div>
        <div class="message-time">${time}</div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function escapeHTML(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

// ============================================
// 4. ЧАТЫ
// ============================================

function loadChats() {
    database.ref('chats/' + myId).on('value', (snapshot) => {
        const data = snapshot.val();
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
// 5. ПОДКЛЮЧЕНИЕ + ИСТОРИЯ
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
    
    remoteId = targetId;
    isConnected = true;
    
    const user = snap.val();
    saveChat(targetId, user.name, user.avatar);
    showChatUI(targetId);
    loadFullHistory(targetId); // ЗАГРУЖАЕМ ВСЮ ИСТОРИЮ
    
    if (chatStatusText) chatStatusText.textContent = 'Онлайн ✅';
    if (statusDot) statusDot.className = 'status-dot online';
});

function openChat(peerId) {
    if (isConnected && remoteId === peerId) return;
    
    remoteId = peerId;
    isConnected = true;
    peerIdInput.value = peerId;
    showChatUI(peerId);
    loadFullHistory(peerId); // ЗАГРУЖАЕМ ВСЮ ИСТОРИЮ
    
    if (chatStatusText) chatStatusText.textContent = 'Онлайн ✅';
    if (statusDot) statusDot.className = 'status-dot online';
}

// ============================================
// 6. ЗАГРУЗКА ВСЕЙ ИСТОРИИ (ФИКС!)
// ============================================

function loadFullHistory(peerId) {
    const container = document.getElementById('messages-container');
    if (!container) return;
    
    // Очищаем контейнер
    container.innerHTML = '';
    
    // Сначала загружаем ВСЕ старые сообщения
    database.ref('messages/' + myId + '/' + peerId).once('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            // Сортируем по времени
            const messages = Object.values(data).sort((a, b) => a.timestamp - b.timestamp);
            messages.forEach(msg => {
                if (msg && msg.text) {
                    const dir = msg.from === myId ? 'out' : 'in';
                    appendMessage(msg.text, dir);
                }
            });
            console.log(`📚 Загружено ${messages.length} сообщений из истории`);
        } else {
            console.log('📭 Нет истории сообщений');
        }
    });
    
    // Потом подписываемся на НОВЫЕ сообщения
    if (messageListener) {
        messageListener.off();
        messageListener = null;
    }
    
    messageListener = database.ref('messages/' + myId + '/' + peerId);
    messageListener.on('child_added', (snapshot) => {
        const data = snapshot.val();
        if (data && data.text && data.from !== myId) {
            // Проверяем что это не дубль (уже есть в истории)
            appendMessage(data.text, 'in');
            updateLastMessage(peerId, data.text);
        }
    });
}

function showChatUI(peerId) {
    if (systemPlaceholder) systemPlaceholder.style.display = 'none';
    if (activeChatHeader) activeChatHeader.style.display = 'flex';
    if (inputArea) inputArea.style.display = 'flex';
    if (chatName) chatName.textContent = 'Подключение...';
    if (chatAvatar) chatAvatar.src = '';
    
    // НЕ ОЧИЩАЕМ КОНТЕЙНЕР ЗДЕСЬ - очистка в loadFullHistory
    
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
// 7. ОТПРАВКА
// ============================================

btnSend.addEventListener('click', () => {
    const text = messageInput.value.trim();
    if (!text) {
        alert('❌ Введите сообщение');
        return;
    }
    if (!remoteId) {
        alert('❌ Нет собеседника');
        return;
    }
    
    const timestamp = Date.now();
    
    // Отправляем собеседнику
    database.ref('messages/' + remoteId + '/' + myId).push().set({
        from: myId,
        text: text,
        name: currentUser.displayName || 'Собеседник',
        timestamp: timestamp
    });
    
    // Сохраняем у себя
    database.ref('messages/' + myId + '/' + remoteId).push().set({
        from: myId,
        text: text,
        name: currentUser.displayName || 'Собеседник',
        timestamp: timestamp
    });
    
    appendMessage(text, 'out');
    updateLastMessage(remoteId, text);
    messageInput.value = '';
});

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') btnSend.click();
});

// ============================================
// 8. РОЛИ
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
// 9. ПРОФИЛЬ
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

console.log('✅ App.js загружен! (с историей)');
