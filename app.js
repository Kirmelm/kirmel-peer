// Импортируем библиотеки напрямую без косяков с CDN
import { initializeApp } from "https://gstatic.com";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, onIdTokenChanged } from "https://gstatic.com";
import { Peer } from "https://esm.sh";

// ТВОИ КЛЮЧИ FIREBASE (Вставь их сюда вместо заглушек!)
const firebaseConfig = {
    apiKey: "AIzaSyCpqM2Mbz_0l1hB5BLgQ80F8GYFKdSw3PA",
    authDomain: "kirmelcript.firebaseapp.com",
    projectId: "kirmelcript",
    storageBucket: "kirmelcript.firebasestorage.app",
    messagingSenderId: "668992683850",
    appId: "1:668992683850:web:c2f76667fafac7cd714bb3",
    measurementId: "G-MD938Z2WX6"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

let currentUser = null;
let peerInstance = null;
let activeConnection = null;
let activeChat = null;
let myKeyPair = null;
let sharedSecretKey = null;

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

btnLogin.addEventListener('click', () => {
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider).catch(error => {
        errorMessage.innerText = error.message;
        errorMessage.style.display = 'block';
    });
});

onAuthStateChanged(auth, (user) => {
    if (user) {
        user.getIdTokenResult(true).then(() => {
            currentUser = user;
            authScreen.style.display = 'none';
            appScreen.style.display = 'block';
            initUserMetadata();
            initPeer();
        }).catch(() => showBlockMessage());
    } else {
        authScreen.style.display = 'flex';
        appScreen.style.display = 'none';
    }
});

onIdTokenChanged(auth, (user) => {
    if (user === null && currentUser !== null) showBlockMessage();
});

function showBlockMessage() {
    authScreen.style.display = 'flex';
    appScreen.style.display = 'none';
    errorMessage.innerText = "Ваш аккаунт заблокирован администратором KirmelPeer.";
    errorMessage.style.display = 'block';
    btnLogin.style.display = 'none';
}

function initUserMetadata() {
    myAvatar.src = currentUser.photoURL || 'https://placeholder.com';
    myName.innerText = currentUser.displayName || 'Аноним';
}

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
    return await window.crypto.subtle.importKey("raw", rawKey, { name: "ECDH", namedCurve: "P-256" }, true, []);
}

async function deriveSharedKey(privateKey, publicKey) {
    return await window.crypto.subtle.deriveKey({ name: "ECDH", public: publicKey }, privateKey, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

async function encryptMessage(text, key) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const iv = window.crypto.getRandomValues(new Uint8Array(12)); 
    const encrypted = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, data);
    return { iv: Array.from(iv), ciphertext: Array.from(new Uint8Array(encrypted)) };
}

async function decryptMessage(encryptedObj, key) {
    try {
        const iv = new Uint8Array(encryptedObj.iv);
        const ciphertext = new Uint8Array(encryptedObj.ciphertext);
        const decrypted = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, ciphertext);
        return new TextDecoder().decode(decrypted);
    } catch {
        return "[Ошибка: не удалось расшифровать сообщение]";
    }
}

async function initPeer() {
    myKeyPair = await generateKeyPair();
    peerInstance = new Peer();

    peerInstance.on('open', (id) => {
        myIdDisplay.innerText = `Ваш ID: ${id} (клик для копирования)`;
        myIdDisplay.onclick = () => {
            navigator.clipboard.writeText(id);
            alert('ID скопирован!');
        };
    });

    peerInstance.on('connection', (conn) => {
        if (activeConnection) { conn.close(); return; }
        setupConnection(conn);
    });
}

btnConnect.addEventListener('click', () => {
    const peerId = peerIdInput.value.trim();
    if (!peerId) return;
    if (peerId === peerInstance.id) return alert("Нельзя подключиться к себе");
    setupConnection(peerInstance.connect(peerId));
});

async function setupConnection(conn) {
    activeConnection = conn;

    conn.on('open', async () => {
        const rawPubKey = await exportPublicKey(myKeyPair.publicKey);
        conn.send({
            type: 'HANDSHAKE',
            name: currentUser.displayName,
            avatar: currentUser.photoURL,
            publicKey: rawPubKey
        });
    });

    conn.on('data', async (data) => {
        if (data.type === 'HANDSHAKE') {
            activeChat = { id: conn.peer, name: data.name, avatar: data.avatar };
            const peerPublicKey = await importPublicKey(data.publicKey);
            sharedSecretKey = await deriveSharedKey(myKeyPair.privateKey, peerPublicKey);

            if (!activeChatHeader.style.display || activeChatHeader.style.display === 'none') {
                const rawPubKey = await exportPublicKey(myKeyPair.publicKey);
                conn.send({
                    type: 'HANDSHAKE',
                    name: currentUser.displayName,
                    avatar: currentUser.photoURL,
                    publicKey: rawPubKey
                });
            }
            renderChatLayout();
        } 
        else if (data.type === 'MESSAGE') {
            const decryptedText = await decryptMessage(data.encrypted, sharedSecretKey);
            appendMessage(decryptedText, 'in');
        }
    });

    conn.on('close', () => { alert("Соединение закрыто"); resetChat(); });
    conn.on('error', () => resetChat());
}

function renderChatLayout() {
    systemPlaceholder.style.display = 'none';
    activeChatHeader.style.display = 'flex';
    inputArea.style.display = 'flex';
    chatAvatar.src = activeChat.avatar || 'https://placeholder.com';
    chatName.innerText = activeChat.name;

    chatsList.innerHTML = `
        <div class="chat-item active">
            <img class="avatar" src="${activeChat.avatar || 'https://placeholder.com'}">
            <div class="user-info">
                <div class="user-name">${activeChat.name}</div>
                <div class="chat-status">в сети</div>
            </div>
        </div>
    `;
}

async function handleSendMessage() {
    const text = messageInput.value.trim();
    if (!text || !activeConnection || !sharedSecretKey) return;

    const encryptedData = await encryptMessage(text, sharedSecretKey);
    activeConnection.send({ type: 'MESSAGE', encrypted: encryptedData });
    appendMessage(text, 'out');
    messageInput.value = '';
}

btnSend.addEventListener('click', handleSendMessage);
messageInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSendMessage(); });

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
    activeConnection = null; activeChat = null; sharedSecretKey = null;
    chatsList.innerHTML = ''; activeChatHeader.style.display = 'none'; inputArea.style.display = 'none';
    messagesContainer.innerHTML = `<div class="system-info">Соединение разорвано.</div>`;
}

function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
}
