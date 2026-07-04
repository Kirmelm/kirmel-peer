// ============ УПРАВЛЕНИЕ ТЕМОЙ ============

const THEME_KEY = "kirmel_theme";

function initTheme() {
    const savedTheme = localStorage.getItem(THEME_KEY) || "dark";
    document.documentElement.setAttribute("data-theme", savedTheme);
    updateThemeButton(savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute("data-theme");
    const newTheme = currentTheme === "dark" ? "light" : "dark";
    
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem(THEME_KEY, newTheme);
    updateThemeButton(newTheme);
    console.log(`🎨 Тема изменена на: ${newTheme}`);
}

function updateThemeButton(theme) {
    const btn = document.getElementById("themeToggle");
    btn.textContent = theme === "dark" ? "☀️" : "🌙";
}

// ============ НАВИГАЦИЯ ПО ЭКРАНАМ ============

function showScreen(screenId) {
    document.querySelectorAll(".screen").forEach(s => s.classList.add("hidden"));
    document.getElementById(screenId).classList.remove("hidden");
}

// ============ СТРАНИЦА АВТОРИЗАЦИИ ============

let isSignUpMode = true;

document.getElementById("signUpBtn").addEventListener("click", () => {
    isSignUpMode = true;
    document.getElementById("authTitle").textContent = "Регистрация";
    document.getElementById("authForm").querySelector("button").textContent = "Регистрация";
    document.getElementById("confirmPasswordDiv").classList.remove("hidden");
    document.getElementById("toggleAuthMode").querySelector("span").textContent = "Вход";
    showScreen("authPage");
});

document.getElementById("signInBtn").addEventListener("click", () => {
    isSignUpMode = false;
    document.getElementById("authTitle").textContent = "Вход";
    document.getElementById("authForm").querySelector("button").textContent = "Вход";
    document.getElementById("confirmPasswordDiv").classList.add("hidden");
    document.getElementById("toggleAuthMode").querySelector("span").textContent = "Регистрация";
    showScreen("authPage");
});

document.getElementById("toggleAuthMode").addEventListener("click", () => {
    isSignUpMode = !isSignUpMode;
    if (isSignUpMode) {
        document.getElementById("authTitle").textContent = "Регистрация";
        document.getElementById("authForm").querySelector("button").textContent = "Регистрация";
        document.getElementById("confirmPasswordDiv").classList.remove("hidden");
        document.getElementById("toggleAuthMode").querySelector("span").textContent = "Вход";
    } else {
        document.getElementById("authTitle").textContent = "Вход";
        document.getElementById("authForm").querySelector("button").textContent = "Вход";
        document.getElementById("confirmPasswordDiv").classList.add("hidden");
        document.getElementById("toggleAuthMode").querySelector("span").textContent = "Регистрация";
    }
});

document.getElementById("authForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const email = document.getElementById("authEmail").value.trim();
    const password = document.getElementById("authPassword").value;
    const confirmPassword = document.getElementById("authConfirmPassword").value;
    
    if (isSignUpMode && password !== confirmPassword) {
        showError("authError", "Пароли не совпадают");
        return;
    }
    
    if (password.length < 6) {
        showError("authError", "Пароль должен быть минимум 6 символов");
        return;
    }
    
    try {
        showLoading(true);
        if (isSignUpMode) {
            await signUp(email, password);
        } else {
            await signIn(email, password);
        }
        showLoading(false);
        showScreen("messenger");
    } catch (error) {
        showLoading(false);
        showError("authError", error.message);
    }
});

document.getElementById("backFromAuth").addEventListener("click", () => {
    showScreen("landing");
});

// ============ СТРАНИЦА ПРОФИЛЯ ============

document.getElementById("profileBtn").addEventListener("click", () => {
    showScreen("profilePage");
    loadProfile();
});

document.getElementById("backFromProfile").addEventListener("click", () => {
    showScreen("messenger");
});

document.getElementById("uploadAvatarBtn").addEventListener("click", () => {
    document.getElementById("avatarInput").click();
});

document.getElementById("avatarInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
        showLoading(true);
        const url = await uploadAvatar(file);
        document.getElementById("avatarPreview").src = url;
        showLoading(false);
    } catch (error) {
        showLoading(false);
        showError("profileError", error.message);
    }
});

document.getElementById("profileForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const nickname = document.getElementById("nicknameInput").value.trim();
    const bio = document.getElementById("bioInput").value.trim();
    
    if (!nickname) {
        showError("profileError", "Никнейм не может быть пустым");
        return;
    }
    
    try {
        showLoading(true);
        await updateUserProfile(nickname, bio);
        showLoading(false);
        alert("✅ Профиль обновлён!");
        showScreen("messenger");
    } catch (error) {
        showLoading(false);
        showError("profileError", error.message);
    }
});

async function loadProfile() {
    try {
        const userDoc = await db.collection("users").doc(currentUser.uid).get();
        const userData = userDoc.data();
        
        document.getElementById("nicknameInput").value = userData.nickname || "";
        document.getElementById("bioInput").value = userData.bio || "";
        if (userData.avatar) {
            document.getElementById("avatarPreview").src = userData.avatar;
        }
    } catch (error) {
        showError("profileError", error.message);
    }
}

document.getElementById("logoutBtn").addEventListener("click", async () => {
    try {
        await logOut();
        showScreen("landing");
    } catch (error) {
        showError("profileError", error.message);
    }
});

// ============ АДМИН-ПАНЕЛЬ ============

document.getElementById("adminPanelBtn").addEventListener("click", () => {
    document.getElementById("adminModal").classList.remove("hidden");
    loadAdminPanel();
});

document.getElementById("closeAdminModal").addEventListener("click", () => {
    document.getElementById("adminModal").classList.add("hidden");
});

document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        const tabName = btn.getAttribute("data-tab");
        switchTab(tabName);
    });
});

function switchTab(tabName) {
    document.querySelectorAll(".tab-content").forEach(t => t.classList.add("hidden"));
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    
    document.getElementById(tabName + "Tab").classList.remove("hidden");
    document.querySelector(`[data-tab="${tabName}"]`).classList.add("active");
}

async function loadAdminPanel() {
    try {
        const users = await getUsers();
        renderUsersList(users);
        
        const banned = await getBannedUsers();
        renderBannedList(banned);
    } catch (error) {
        console.error("Ошибка загрузки админ-панели:", error);
    }
}

function renderUsersList(users) {
    const list = document.getElementById("usersList");
    list.innerHTML = users.map(user => `
        <div class="user-item">
            <div class="user-info">
                <img src="${user.avatar || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Ccircle cx=%2250%22 cy=%2250%22 r=%2250%22 fill=%22%23ddd%22/%3E%3C/svg%3E'}" class="user-avatar" alt="${user.nickname}">
                <div>
                    <p class="user-nickname">${escapeHtml(user.nickname)}</p>
                    <p class="user-email">${escapeHtml(user.email)}</p>
                </div>
            </div>
            <button class="btn-icon ban-btn" onclick="openBanModal('${user.uid}', '${escapeHtml(user.nickname)}')">⛔</button>
        </div>
    `).join("");
}

function renderBannedList(banned) {
    const list = document.getElementById("bannedList");
    list.innerHTML = banned.map(ban => `
        <div class="banned-item">
            <p><strong>ID пользователя:</strong> ${escapeHtml(ban.userId)}</p>
            <p><strong>Причина:</strong> ${escapeHtml(ban.reason)}</p>
            <p><strong>Тип:</strong> ${ban.banType === 'temporary' ? 'Временная (24ч)' : 'Постоянная'}</p>
            <p><strong>Штраф:</strong> ${escapeHtml(ban.penalty || 'N/A')}</p>
            <p><small>Заблокирован: ${new Date(ban.timestamp.toDate()).toLocaleString('ru-RU')}</small></p>
        </div>
    `).join("");
}

function openBanModal(userId, nickname) {
    document.getElementById("banModal").classList.remove("hidden");
    document.getElementById("banForm").dataset.userId = userId;
}

document.getElementById("closeBanModal").addEventListener("click", () => {
    document.getElementById("banModal").classList.add("hidden");
});

document.getElementById("banForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const userId = e.target.dataset.userId;
    const reason = document.getElementById("banReason").value.trim();
    const banType = document.getElementById("banType").value;
    const penalty = document.getElementById("banPenalty").value.trim();
    
    try {
        await banUser(userId, reason, banType, penalty);
        alert("✅ Пользователь заблокирован!");
        document.getElementById("banModal").classList.add("hidden");
        document.getElementById("banForm").reset();
        loadAdminPanel();
    } catch (error) {
        alert("❌ Ошибка: " + error.message);
    }
});

// ============ МЕССЕНДЖЕР ============

document.getElementById("newChatBtn").addEventListener("click", () => {
    const userId = prompt("Введите ID пользователя для чата:");
    if (userId) {
        startChat(userId);
    }
});

function startChat(userId) {
    currentChatId = [currentUser.uid, userId].sort().join("_");
    document.getElementById("chatEmpty").classList.add("hidden");
    document.getElementById("chatWindow").classList.remove("hidden");
    loadMessages();
}

async function loadMessages() {
    try {
        const messages = await getMessages(currentChatId);
        renderMessages(messages);
    } catch (error) {
        console.error("Ошибка загрузки сообщений:", error);
    }
}

function renderMessages(messages) {
    const container = document.getElementById("messagesContainer");
    container.innerHTML = messages.map(msg => {
        const isOwn = msg.senderId === currentUser.uid;
        const time = new Date(msg.timestamp.toDate()).toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit'});
        return `
            <div class="message ${isOwn ? 'own' : 'other'}">
                <p class="message-text">${escapeHtml(msg.text.ciphertext.substring(0, 50))}...</p>
                <small>${time}</small>
            </div>
        `;
    }).join("");
    container.scrollTop = container.scrollHeight;
}

document.getElementById("messageForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const messageText = document.getElementById("messageInput").value.trim();
    if (!messageText) return;
    
    try {
        const recipientId = currentChatId.split("_").find(id => id !== currentUser.uid);
        await sendMessage(recipientId, messageText);
        document.getElementById("messageInput").value = "";
        loadMessages();
    } catch (error) {
        alert("❌ Ошибка отправки: " + error.message);
    }
});

// ============ УТИЛИТЫ ============

function showLoading(show) {
    document.getElementById("loading").classList.toggle("hidden", !show);
}

function showError(elementId, message) {
    const el = document.getElementById(elementId);
    el.textContent = message;
    el.classList.remove("hidden");
    setTimeout(() => el.classList.add("hidden"), 5000);
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

// ============ ИНИЦИАЛИЗАЦИЯ ============

document.getElementById("themeToggle").addEventListener("click", toggleTheme);

document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    console.log("✅ Приложение КирмельКрипт запущено");
});