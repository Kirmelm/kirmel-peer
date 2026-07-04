// ============ FIREBASE CONFIG ============
const firebaseConfig = {
    apiKey: "AIzaSyCpqM2Mbz_0l1hB5BLgQ80F8GYFKdSw3PA",
    authDomain: "kirmelcript.firebaseapp.com",
    projectId: "kirmelcript",
    storageBucket: "kirmelcript.firebasestorage.app",
    messagingSenderId: "668992683850",
    appId: "1:668992683850:web:c2f76667fafac7cd714bb3",
    measurementId: "G-MD938Z2WX6"
};

// ============ FIREBASE INITIALIZATION ============
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// ============ GLOBAL STATE ============
let currentUser = null;
let userKeyPair = null;
let currentChatId = null;

// ============ CRYPTO FUNCTIONS ============

// Generate ECDH Key Pair
async function generateKeyPair() {
    const keyPair = await window.crypto.subtle.generateKey(
        {
            name: "ECDH",
            namedCurve: "P-256",
        },
        true,
        ["deriveKey", "deriveBits"]
    );
    return keyPair;
}

// Export Public Key to JWK
async function exportPublicKey(publicKey) {
    const jwk = await window.crypto.subtle.exportKey("jwk", publicKey);
    return JSON.stringify(jwk);
}

// Export Private Key to JWK (for IndexedDB storage)
async function exportPrivateKey(privateKey) {
    const jwk = await window.crypto.subtle.exportKey("jwk", privateKey);
    return JSON.stringify(jwk);
}

// Import Public Key from JWK
async function importPublicKey(jwkString) {
    const jwk = JSON.parse(jwkString);
    return window.crypto.subtle.importKey("jwk", jwk, "ECDH", false, []);
}

// Import Private Key from JWK
async function importPrivateKey(jwkString) {
    const jwk = JSON.parse(jwkString);
    return window.crypto.subtle.importKey("jwk", jwk, "ECDH", true, ["deriveKey", "deriveBits"]);
}

// Derive Shared Secret
async function deriveSharedSecret(privateKey, publicKey) {
    return window.crypto.subtle.deriveBits(
        {
            name: "ECDH",
            public: publicKey,
        },
        privateKey,
        256
    );
}

// Derive AES Key from Shared Secret
async function deriveAESKey(sharedSecret) {
    return window.crypto.subtle.importKey(
        "raw",
        sharedSecret,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

// Encrypt Message
async function encryptMessage(message, aesKey) {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    
    const ciphertext = await window.crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv: iv,
        },
        aesKey,
        data
    );
    
    return {
        ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
        iv: btoa(String.fromCharCode(...iv))
    };
}

// Decrypt Message
async function decryptMessage(encrypted, aesKey) {
    const ciphertext = Uint8Array.from(atob(encrypted.ciphertext), c => c.charCodeAt(0));
    const iv = Uint8Array.from(atob(encrypted.iv), c => c.charCodeAt(0));
    
    const plaintext = await window.crypto.subtle.decrypt(
        {
            name: "AES-GCM",
            iv: iv,
        },
        aesKey,
        ciphertext
    );
    
    const decoder = new TextDecoder();
    return decoder.decode(plaintext);
}

// ============ INDEXEDDB STORAGE ============

const dbName = "KirmelCryptDB";
const storeName = "keyStore";

function initIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(storeName)) {
                db.createObjectStore(storeName);
            }
        };
    });
}

async function savePrivateKeyToIndexedDB(userId, privateKeyJwk) {
    const db = await initIndexedDB();
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    
    return new Promise((resolve, reject) => {
        const request = store.put(privateKeyJwk, `${userId}_private`);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}

async function getPrivateKeyFromIndexedDB(userId) {
    const db = await initIndexedDB();
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    
    return new Promise((resolve, reject) => {
        const request = store.get(`${userId}_private`);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
}

// ============ USER AUTHENTICATION ============

async function signUp(email, password) {
    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        // Generate and save key pair
        const keyPair = await generateKeyPair();
        userKeyPair = keyPair;
        
        const privateKeyJwk = await exportPrivateKey(keyPair.privateKey);
        const publicKeyJwk = await exportPublicKey(keyPair.publicKey);
        
        // Save private key to IndexedDB
        await savePrivateKeyToIndexedDB(user.uid, privateKeyJwk);
        
        // Save public key to Firestore
        await db.collection("user_keys").doc(user.uid).set({
            publicKey: publicKeyJwk,
            algorithm: "ECDH",
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        
        // Create user profile
        await db.collection("users").doc(user.uid).set({
            uid: user.uid,
            email: user.email,
            nickname: "User_" + Math.random().toString(36).substr(2, 9),
            bio: "",
            avatar: null,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        
        currentUser = user;
        return user;
    } catch (error) {
        throw new Error(`Sign up failed: ${error.message}`);
    }
}

async function signIn(email, password) {
    try {
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        // Load private key from IndexedDB
        const privateKeyJwk = await getPrivateKeyFromIndexedDB(user.uid);
        const privateKey = await importPrivateKey(privateKeyJwk);
        
        // Load public key from Firestore
        const keyDoc = await db.collection("user_keys").doc(user.uid).get();
        const publicKey = await importPublicKey(keyDoc.data().publicKey);
        
        userKeyPair = { privateKey, publicKey };
        currentUser = user;
        
        return user;
    } catch (error) {
        throw new Error(`Sign in failed: ${error.message}`);
    }
}

async function logOut() {
    try {
        await auth.signOut();
        currentUser = null;
        userKeyPair = null;
        currentChatId = null;
    } catch (error) {
        throw new Error(`Logout failed: ${error.message}`);
    }
}

// ============ USER MANAGEMENT ============

async function updateUserProfile(nickname, bio) {
    try {
        await db.collection("users").doc(currentUser.uid).update({
            nickname,
            bio,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
    } catch (error) {
        throw new Error(`Profile update failed: ${error.message}`);
    }
}

async function uploadAvatar(file) {
    try {
        const storageRef = storage.ref(`avatars/${currentUser.uid}`);
        await storageRef.put(file);
        const downloadURL = await storageRef.getDownloadURL();
        
        await db.collection("users").doc(currentUser.uid).update({
            avatar: downloadURL,
        });
        
        return downloadURL;
    } catch (error) {
        throw new Error(`Avatar upload failed: ${error.message}`);
    }
}

// ============ MESSAGING ============

async function sendMessage(recipientUid, messageText) {
    try {
        // Get recipient's public key
        const recipientKeyDoc = await db.collection("user_keys").doc(recipientUid).get();
        const recipientPublicKey = await importPublicKey(recipientKeyDoc.data().publicKey);
        
        // Derive shared secret
        const sharedSecret = await deriveSharedSecret(userKeyPair.privateKey, recipientPublicKey);
        const aesKey = await deriveAESKey(sharedSecret);
        
        // Encrypt message
        const encrypted = await encryptMessage(messageText, aesKey);
        
        // Save to Firestore
        const chatId = [currentUser.uid, recipientUid].sort().join("_");
        
        await db.collection("messages").add({
            chatId,
            senderId: currentUser.uid,
            recipientId: recipientUid,
            text: encrypted,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            participants: [currentUser.uid, recipientUid],
        });
    } catch (error) {
        throw new Error(`Message send failed: ${error.message}`);
    }
}

async function getMessages(chatId) {
    try {
        const snapshot = await db.collection("messages")
            .where("chatId", "==", chatId)
            .orderBy("timestamp", "asc")
            .get();
        
        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        throw new Error(`Failed to load messages: ${error.message}`);
    }
}

// ============ ADMIN FUNCTIONS ============

async function isUserAdmin() {
    try {
        const roleDoc = await db.collection("system_roles").doc(currentUser.uid).get();
        return roleDoc.exists && roleDoc.data().role === "admin";
    } catch (error) {
        return false;
    }
}

async function isOwner() {
    // Replace with your actual Firebase UID
    const OWNER_UID = "YOUR_PERSONAL_UID_HERE";
    return currentUser.uid === OWNER_UID;
}

async function banUser(userId, reason, banType, penalty) {
    try {
        await db.collection("banned_users").add({
            userId,
            reason,
            banType,
            penalty,
            bannedBy: currentUser.uid,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        });
    } catch (error) {
        throw new Error(`Ban failed: ${error.message}`);
    }
}

async function getUsers() {
    try {
        const snapshot = await db.collection("users").limit(100).get();
        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        throw new Error(`Failed to load users: ${error.message}`);
    }
}

async function getBannedUsers() {
    try {
        const snapshot = await db.collection("banned_users").get();
        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        throw new Error(`Failed to load banned users: ${error.message}`);
    }
}

// ============ AUTH STATE LISTENER ============

auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        // Show messenger
        document.getElementById("landing").classList.add("hidden");
        document.getElementById("authPage").classList.add("hidden");
        document.getElementById("messenger").classList.remove("hidden");
        
        // Show admin button if user is admin
        const isAdmin = await isUserAdmin();
        if (isAdmin) {
            document.getElementById("adminPanelBtn").classList.remove("hidden");
        }
    } else {
        currentUser = null;
        // Show landing
        document.getElementById("messenger").classList.add("hidden");
        document.getElementById("profilePage").classList.add("hidden");
        document.getElementById("landing").classList.remove("hidden");
    }
});