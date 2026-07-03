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
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('app-screen').style.display = 'block';
        
        myId = user.uid;
        document.getElementById('my-avatar').src = user.photoURL || '';
        document.getElementById('my-name').textContent = user.displayName || 'Аноним';
        document.getElementById('my-id-display').textContent = `ID: ${myId.substring(0, 12)} (клик)`;
        document.getElementById('my-id-display').onclick = () => {
            navigator.clipboard.writeText(myId.substring(0, 12));
            alert('✅ ID скопирован!');
        };
        
        database.ref('users/' + myId).set({
            name: user.displayName,
            avatar: user.photoURL,
            online: true
        });
        
        loadChats();
        listenMessages();
        checkAdmin();
    } else {
        document.getElementById('auth-screen').style.display = 'flex';
        document.getElementById('app-screen').style.display = 'none';
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
        list.innerHTML = '';
        if (!data) {
            list.innerHTML = '<div class="empty-chats">💬<p>Нет чатов</p></div>';
            return;
        }
        Object.values(data).sort((a,b) => (b.timestamp||0) - (a.timestamp||0)).forEach(chat => {
            const div = document.createElement('div');
            div.className = 'chat-item';
            if (chat.peerId === chatWith) div.classList.add('active');
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

// ===== ОТКРЫТИЕ ЧАТА =====
function openChat(peerId) {
    chatWith = peerId;
    document.getElementById('peer-id-input').value = peerId;
    document.getElementById('system-placeholder').style.display = 'none';
    document.getElementById('active-chat-header').style.display = 'flex';
    document.getElementById('input-area').style.display = 'flex';
    document.getElementById('chat-name').textContent = 'Загрузка...';
    
    database.ref('users/' + peerId).once('value', snap => {
        const user = snap.val();
        if (user) document.getElementById('chat-name').textContent = user.name || 'Собеседник';
        document.getElementById('chat-avatar').src = user?.avatar || '';
    });
    
    document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
    const item = document.querySelector(`.chat-item[data-id="${peerId}"]`);
    if (item) item.classList.add('active');
    
    loadHistory(peerId);
}

document.getElementById('btn-connect').addEventListener('click', async () => {
    const target = document.getElementById('peer-id-input').value.trim();
    if (!target) return alert('Введите ID');
    if (target === myId) return alert('Нельзя к себе');
    
    const snap = await database.ref('users/' + target).once('value');
    if (!snap.exists()) return alert('Пользователь не найден');
    
    const user = snap.val();
    saveChat(target, user.name, user.avatar);
    openChat(target);
});

// ===== ОТПРАВКА =====
document.getElementById('btn-send').addEventListener('click', () => {
    const text = document.getElementById('message-input').value.trim();
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
    document.getElementById('message-input').value = '';
});

document.getElementById('message-input').addEventListener('keypress', e => {
    if (e.key === 'Enter') document.getElementById('btn-send').click();
});

// ===== ПРОФИЛЬ =====
document.getElementById('chat-header-click').onclick = () => {
    if (chatWith) showProfile(chatWith);
};
document.getElementById('btn-profile').onclick = () => {
    if (chatWith) showProfile(chatWith);
};

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

document.getElementById('profile-modal-close').onclick = () => {
    document.getElementById('profile-modal').style.display = 'none';
};
document.getElementById('profile-modal').onclick = e => {
    if (e.target === e.currentTarget) document.getElementById('profile-modal').style.display = 'none';
};

// ===== АДМИНКА =====
let isAdmin = false, isCreator = false;

async function checkAdmin() {
    const c = await database.ref('creator').once('value');
    if (c.exists() && c.val() === myId) { isCreator = true; isAdmin = true; }
    else {
        const a = await database.ref('admins/' + myId).once('value');
        if (a.exists()) isAdmin = true;
    }
    if (isAdmin || isCreator) document.getElementById('admin-panel').style.display = 'block';
}

document.getElementById('btn-ban').onclick = async () => {
    const id = document.getElementById('admin-user-id').value.trim();
    if (!id) return alert('Введите ID');
    if (!isAdmin && !isCreator) return alert('Нет прав');
    await database.ref('banned/' + id).set({ bannedAt: Date.now(), reason: 'Нарушение', bannedBy: myId });
    alert('✅ Забанен');
};
document.getElementById('btn-unban').onclick = async () => {
    const id = document.getElementById('admin-user-id').value.trim();
    if (!id) return alert('Введите ID');
    if (!isAdmin && !isCreator) return alert('Нет прав');
    await database.ref('banned/' + id).remove();
    alert('✅ Разбанен');
};
document.getElementById('btn-make-admin').onclick = async () => {
    const id = document.getElementById('admin-user-id').value.trim();
    if (!id) return alert('Введите ID');
    if (!isCreator) return alert('Только создатель');
    const snap = await database.ref('users/' + id).once('value');
    if (!snap.exists()) return alert('Пользователь не найден');
    await database.ref('admins/' + id).set({ role: 'admin', name: snap.val().name, addedAt: Date.now() });
    alert('✅ Админ назначен');
};
document.getElementById('btn-show-users').onclick = async () => {
    if (!isAdmin && !isCreator) return alert('Нет прав');
    const snap = await database.ref('users').once('value');
    const users = snap.val();
    const list = document.getElementById('admin-users-list');
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

console.log('✅ App.js загружен!');
