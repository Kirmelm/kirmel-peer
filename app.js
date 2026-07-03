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

let myId = null;
let chatWith = null;
let currentUser = null;

const btnLogin = document.getElementById('btn-login');
const errorMessage = document.getElementById('error-message');

btnLogin.addEventListener('click', () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(err => {
        errorMessage.textContent = err.message;
        errorMessage.style.display = 'block';
    });
});

auth.onAuthStateChanged(user => {
    if (user) {
        currentUser = user;
        const authScreen = document.getElementById('auth-screen');
        const appScreen = document.getElementById('app-screen');
        if (authScreen) authScreen.style.display = 'none';
        if (appScreen) appScreen.style.display = 'block';
        
        myId = user.uid;
        
        const avatar = document.getElementById('my-avatar');
        if (avatar) avatar.src = user.photoURL || '';
        
        const name = document.getElementById('my-name');
        if (name) name.textContent = user.displayName || 'Аноним';
        
        const idDisplay = document.getElementById('my-id-display');
        if (idDisplay) {
            idDisplay.textContent = `ID: ${myId.substring(0, 12)} (клик)`;
            idDisplay.onclick = () => {
                navigator.clipboard.writeText(myId.substring(0, 12));
                alert('✅ ID скопирован!');
            };
        }
        
        database.ref('users/' + myId).set({
            name: user.displayName,
            avatar: user.photoURL,
            online: true
        });
        
        loadChats();
        listenMessages();
        checkAdmin();
    } else {
        const authScreen = document.getElementById('auth-screen');
        const appScreen = document.getElementById('app-screen');
        if (authScreen) authScreen.style.display = 'flex';
        if (appScreen) appScreen.style.display = 'none';
    }
});

// ===== ПОКАЗ СООБЩЕНИЙ =====
function showMessage(text, who, time) {
    const container = document.getElementById('messages-container');
    if (!container) return;
    
    const div = document.createElement('div');
    div.className = 'message ' + who;
    const t = new Date(time || Date.now()).toLocaleTimeString('ru-RU', {hour:'2-digit',minute:'2-digit'});
    div.innerHTML = `<div>${text}</div><div class="message-time">${t}</div>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

// ===== СЛУШАТЕЛЬ =====
function listenMessages() {
    database.ref('messages/' + myId).on('child_added', snap => {
        const data = snap.val();
        if (!data || !data.text || data.from === myId) return;
        
        console.log('📩 Пришло:', data.text);
        
        if (chatWith && chatWith === snap.key) {
            showMessage(data.text, 'in', data.timestamp);
            updateLastMessage(snap.key, data.text);
        }
        
        database.ref('users/' + snap.key).once('value', s => {
            const u = s.val();
            if (u) saveChat(snap.key, u.name, u.avatar);
        });
    });
}

// ===== ИСТОРИЯ =====
function loadHistory(peerId) {
    const container = document.getElementById('messages-container');
    if (!container) return;
    container.innerHTML = '';
    chatWith = peerId;
    
    database.ref('messages/' + myId + '/' + peerId).once('value', snap => {
        const data = snap.val();
        if (data) {
            Object.values(data).sort((a,b) => (a.timestamp||0) - (b.timestamp||0)).forEach(msg => {
                if (msg && msg.text) {
                    showMessage(msg.text, msg.from === myId ? 'out' : 'in', msg.timestamp);
                }
            });
        }
    });
}

// ===== ЧАТЫ =====
function loadChats() {
    database.ref('chats/' + myId).on('value', snap => {
        const data = snap.val();
        const list = document.getElementById('chats-list');
        if (!list) return;
        list.innerHTML = '';
        if (!data) {
            list.innerHTML = '<div class="empty-chats">💬<p>Нет чатов</p></div>';
            return;
        }
        Object.values(data).sort((a,b) => (b.timestamp||0) - (a.timestamp||0)).forEach(chat => {
            const div = document.createElement('div');
            div.className = 'chat-item';
            if (chat.peerId === chatWith) div.classList.add('active');
            div.dataset.id = chat.peerId;
            div.innerHTML = `
                <img class="avatar" src="${chat.avatar || ''}">
                <div class="user-info">
                    <div class="user-name">${chat.name}</div>
                    <div class="chat-status">${chat.lastMessage || 'Новый чат'}</div>
                </div>
            `;
            div.onclick = () => openChat(chat.peerId);
            list.appendChild(div);
        });
    });
}

function saveChat(peerId, name, avatar) {
    database.ref('chats/' + myId + '/' + peerId).once('value', snap => {
        if (!snap.exists()) {
            database.ref('chats/' + myId + '/' + peerId).set({
                peerId, name: name || 'Собеседник', avatar: avatar || '', lastMessage: '', timestamp: Date.now()
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

// ===== ОТКРЫТИЕ ЧАТА (ИСПРАВЛЕНО) =====
function openChat(peerId) {
    chatWith = peerId;
    
    const input = document.getElementById('peer-id-input');
    if (input) input.value = peerId;
    
    const placeholder = document.getElementById('system-placeholder');
    if (placeholder) placeholder.style.display = 'none';
    
    const header = document.getElementById('active-chat-header');
    if (header) header.style.display = 'flex';
    
    const inputArea = document.getElementById('input-area');
    if (inputArea) inputArea.style.display = 'flex';
    
    const chatNameEl = document.getElementById('chat-name');
    if (chatNameEl) chatNameEl.textContent = 'Загрузка...';
    
    const chatAvatarEl = document.getElementById('chat-avatar');
    if (chatAvatarEl) chatAvatarEl.src = '';
    
    database.ref('users/' + peerId).once('value', snap => {
        const user = snap.val();
        if (user && chatNameEl) {
            chatNameEl.textContent = user.name || 'Собеседник';
        }
        if (chatAvatarEl && user) {
            chatAvatarEl.src = user.avatar || '';
        }
    });
    
    document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
    const item = document.querySelector(`.chat-item[data-id="${peerId}"]`);
    if (item) item.classList.add('active');
    
    const statusText = document.getElementById('chat-status-text');
    if (statusText) statusText.textContent = 'Онлайн ✅';
    
    const dot = document.querySelector('.status-dot');
    if (dot) dot.className = 'status-dot online';
    
    loadHistory(peerId);
}

// ===== КНОПКА ПОДКЛЮЧИТЬСЯ =====
const btnConnect = document.getElementById('btn-connect');
if (btnConnect) {
    btnConnect.addEventListener('click', async () => {
        const input = document.getElementById('peer-id-input');
        const target = input ? input.value.trim() : '';
        if (!target) return alert('Введите ID');
        if (target === myId) return alert('Нельзя к себе');
        
        const snap = await database.ref('users/' + target).once('value');
        if (!snap.exists()) return alert('Пользователь не найден');
        
        const user = snap.val();
        saveChat(target, user.name, user.avatar);
        openChat(target);
    });
}

// ===== ОТПРАВКА =====
const btnSend = document.getElementById('btn-send');
if (btnSend) {
    btnSend.addEventListener('click', () => {
        const input = document.getElementById('message-input');
        const text = input ? input.value.trim() : '';
        if (!text) return alert('Введите сообщение');
        if (!chatWith) return alert('Нет собеседника');
        
        const ts = Date.now();
        database.ref('messages/' + chatWith + '/' + myId).push().set({
            from: myId, text, name: currentUser.displayName, timestamp: ts
        });
        database.ref('messages/' + myId + '/' + chatWith).push().set({
            from: myId, text, name: currentUser.displayName, timestamp: ts
        });
        
        showMessage(text, 'out', ts);
        updateLastMessage(chatWith, text);
        if (input) input.value = '';
    });
}

const msgInput = document.getElementById('message-input');
if (msgInput) {
    msgInput.addEventListener('keypress', e => {
        if (e.key === 'Enter') {
            const btn = document.getElementById('btn-send');
            if (btn) btn.click();
        }
    });
}

// ===== ПРОФИЛЬ =====
const headerClick = document.getElementById('chat-header-click');
if (headerClick) {
    headerClick.onclick = () => {
        if (chatWith) showProfile(chatWith);
    };
}

const profileBtn = document.getElementById('btn-profile');
if (profileBtn) {
    profileBtn.onclick = () => {
        if (chatWith) showProfile(chatWith);
    };
}

async function showProfile(userId) {
    const snap = await database.ref('users/' + userId).once('value');
    const user = snap.val();
    if (!user) return;
    
    const avatar = document.getElementById('profile-avatar');
    if (avatar) avatar.src = user.avatar || '';
    
    const name = document.getElementById('profile-name');
    if (name) name.textContent = user.name || 'Без имени';
    
    const id = document.getElementById('profile-id');
    if (id) id.textContent = 'ID: ' + userId.substring(0, 12);
    
    const status = document.getElementById('profile-status');
    if (status) status.textContent = user.online ? '🟢 Онлайн' : '⚫ Офлайн';
    
    const modal = document.getElementById('profile-modal');
    if (modal) modal.style.display = 'flex';
}

const modalClose = document.getElementById('profile-modal-close');
if (modalClose) {
    modalClose.onclick = () => {
        const modal = document.getElementById('profile-modal');
        if (modal) modal.style.display = 'none';
    };
}

const modal = document.getElementById('profile-modal');
if (modal) {
    modal.onclick = e => {
        if (e.target === e.currentTarget) {
            modal.style.display = 'none';
        }
    };
}

const profileChat = document.getElementById('profile-chat');
if (profileChat) {
    profileChat.onclick = () => {
        const modal = document.getElementById('profile-modal');
        if (modal) modal.style.display = 'none';
        if (chatWith) openChat(chatWith);
    };
}

// ===== ЭМОДЗИ =====
const emojiBtn = document.getElementById('btn-emoji');
if (emojiBtn) {
    emojiBtn.onclick = () => {
        const input = document.getElementById('message-input');
        if (!input) return;
        const emojis = ['😊', '😂', '❤️', '🔥', '👍', '👋', '🎉', '✨', '💪', '🤝'];
        input.value += emojis[Math.floor(Math.random() * emojis.length)];
        input.focus();
    };
}

// ===== АДМИНКА =====
let isAdmin = false, isCreator = false;

async function checkAdmin() {
    const c = await database.ref('creator').once('value');
    if (c.exists() && c.val() === myId) { isCreator = true; isAdmin = true; }
    else {
        const a = await database.ref('admins/' + myId).once('value');
        if (a.exists()) isAdmin = true;
    }
    const panel = document.getElementById('admin-panel');
    if (panel && (isAdmin || isCreator)) {
        panel.style.display = 'block';
    }
}

const banBtn = document.getElementById('btn-ban');
if (banBtn) {
    banBtn.onclick = async () => {
        const input = document.getElementById('admin-user-id');
        const id = input ? input.value.trim() : '';
        if (!id) return alert('Введите ID');
        if (!isAdmin && !isCreator) return alert('Нет прав');
        await database.ref('banned/' + id).set({ bannedAt: Date.now(), reason: 'Нарушение', bannedBy: myId });
        alert('✅ Забанен');
    };
}

const unbanBtn = document.getElementById('btn-unban');
if (unbanBtn) {
    unbanBtn.onclick = async () => {
        const input = document.getElementById('admin-user-id');
        const id = input ? input.value.trim() : '';
        if (!id) return alert('Введите ID');
        if (!isAdmin && !isCreator) return alert('Нет прав');
        await database.ref('banned/' + id).remove();
        alert('✅ Разбанен');
    };
}

const makeAdminBtn = document.getElementById('btn-make-admin');
if (makeAdminBtn) {
    makeAdminBtn.onclick = async () => {
        const input = document.getElementById('admin-user-id');
        const id = input ? input.value.trim() : '';
        if (!id) return alert('Введите ID');
        if (!isCreator) return alert('Только создатель');
        const snap = await database.ref('users/' + id).once('value');
        if (!snap.exists()) return alert('Пользователь не найден');
        await database.ref('admins/' + id).set({ role: 'admin', name: snap.val().name, addedAt: Date.now() });
        alert('✅ Админ назначен');
    };
}

const showUsersBtn = document.getElementById('btn-show-users');
if (showUsersBtn) {
    showUsersBtn.onclick = async () => {
        if (!isAdmin && !isCreator) return alert('Нет прав');
        const snap = await database.ref('users').once('value');
        const users = snap.val();
        const list = document.getElementById('admin-users-list');
        if (!list) return;
        let html = '';
        for (const [id, user] of Object.entries(users || {})) {
            const banned = await database.ref('banned/' + id).once('value');
            html += `<div style="padding:4px;border-bottom:1px solid #333;display:flex;justify-content:space-between;">
                <span>${user.name || 'Без имени'}</span>
                <span>${banned.exists() ? '🚫' : '✅'}</span>
            </div>`;
        }
        list.innerHTML = html;
    };
}

console.log('✅ App.js загружен!');
