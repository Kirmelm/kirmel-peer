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
let chatWith = null; // ID собеседника

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
        listenForMessages();
        
    } else {
        authScreen.style.display = 'flex';
        appScreen.style.display = 'none';
    }
});

// ============================================
// 2. ПОКАЗ СООБЩЕНИЙ
// ============================================

function showMessage(text, who) {
    const container = document.getElementById('messages-container');
    if (!container) {
        console.error('❌ Нет контейнера!');
        return;
    }
    
    const div = document.createElement('div');
    div.className = 'message ' + who;
    const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    div.innerHTML = `
        <div>${text}</div>
        <div class="message-time">${time}</div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    console.log('✅ Показано сообщение:', text);
}

// ============================================
// 3. СЛУШАТЕЛЬ СООБЩЕНИЙ
// ============================================

function listenForMessages() {
    console.log('🔊 Слушаю сообщения для:', myId);
    
    database.ref('messages/' + myId).on('child_added', (snapshot) => {
        const data = snapshot.val();
        const fromId = snapshot.key;
        
        console.log('📩 Пришло сообщение!');
        console.log('📩 От кого:', fromId);
        console.log('📩 Текст:', data ? data.text : 'нет текста');
        console.log('📩 Открыт чат с:', chatWith);
        
        if (!data || !data.text) return;
        
        // Если это сообщение от меня - игнорируем
        if (data.from === myId) {
            console.log('📩 Это моё сообщение');
            return;
        }
        
        // Показываем если чат открыт с этим человеком
        if (chatWith && chatWith === fromId) {
            console.log('📩 ПОКАЗЫВАЕМ В ЧАТЕ!');
            showMessage(data.text, 'in');
            updateLastMessage(fromId, data.text);
            
            // Уведомление
            showNotification(`📩 ${data.name || 'Собеседник'}: ${data.text.substring(0, 30)}`);
        } else {
            console.log('📩 Чат не открыт с этим человеком');
        }
        
        // Сохраняем чат в списке
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
    setTimeout(() => notif.remove(), 4000);
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
// 4. ИСТОРИЯ
// ============================================

function loadHistory(peerId) {
    const container = document.getElementById('messages-container');
    if (!container) return;
    container.innerHTML = '';
    chatWith = peerId;
    
    console.log('📚 Загружаем историю с:', peerId);
    
    database.ref('messages/' + myId + '/' + peerId).once('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            const messages = Object.values(data).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
            messages.forEach(msg => {
                if (msg && msg.text) {
                    const who = msg.from === myId ? 'out' : 'in';
                    showMessage(msg.text, who);
                }
            });
            console.log(`📚 Загружено ${messages.length} сообщений`);
        } else {
            console.log('📭 Нет истории');
        }
    });
}

// ============================================
// 5. ЧАТЫ
// ============================================

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
// 6. ОТКРЫТИЕ ЧАТА
// ============================================

function openChat(peerId) {
    console.log('📂 ОТКРЫВАЕМ ЧАТ С:', peerId);
    chatWith = peerId;
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

// ============================================
// 7. ОТПРАВКА
// ============================================

btnSend.addEventListener('click', () => {
    const text = messageInput.value.trim();
    if (!text) { alert('❌ Введите сообщение'); return; }
    if (!chatWith) { alert('❌ Нет собеседника'); return; }
    
    const timestamp = Date.now();
    
    console.log('📤 Отправка:', text, 'кому:', chatWith);
    
    // Отправляем собеседнику
    database.ref('messages/' + chatWith + '/' + myId).push().set({
        from: myId,
        text: text,
        name: currentUser.displayName || 'Собеседник',
        timestamp: timestamp
    });
    
    // Сохраняем у себя
    database.ref('messages/' + myId + '/' + chatWith).push().set({
        from: myId,
        text: text,
        name: currentUser.displayName || 'Собеседник',
        timestamp: timestamp
    });
    
    showMessage(text, 'out');
    updateLastMessage(chatWith, text);
    messageInput.value = '';
});

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') btnSend.click();
});

// ============================================
// 8. ПРОФИЛЬ
// ============================================

document.getElementById('chat-header-click')?.addEventListener('click', () => {
    if (chatWith) showProfile(chatWith);
});

document.getElementById('btn-profile')?.addEventListener('click', () => {
    if (chatWith) showProfile(chatWith);
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

console.log('✅ App.js загружен! (ПРОСТАЯ ВЕРСИЯ)');
