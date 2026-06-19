import { supabase } from './supabase.js';

// DOM Elements
const authScreen = document.getElementById('auth-screen');
const chatScreen = document.getElementById('chat-screen');
const authForm = document.getElementById('auth-form');
const toggleAuthText = document.getElementById('toggle-auth');
const signupFields = document.getElementById('signup-fields');
const authBtn = document.getElementById('auth-btn');
const authError = document.getElementById('auth-error');

const logoutBtn = document.getElementById('logout-btn');
const myProfileName = document.getElementById('my-profile-name');
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const userList = document.getElementById('user-list');

const activeChatName = document.getElementById('active-chat-name');
const activeChatStatus = document.getElementById('active-chat-status');
const typingIndicator = document.getElementById('typing-indicator');
const messagesContainer = document.getElementById('messages-container');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');

// Media UI
const imageUpload = document.getElementById('image-upload');
const uploadPreview = document.getElementById('upload-preview');

// Navigation
const navBtns = document.querySelectorAll('.nav-btn');
const navPanels = document.querySelectorAll('.nav-panel');

// State
let isLoginMode = true;
let currentUser = null;
let activeChatUser = null;
let globalChannel = null;
let onlineUsers = new Set();
let typingTimer = null;

async function init() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) await handleLoginSuccess(session.user);
    else showAuthScreen();

    supabase.auth.onAuthStateChange((_event, session) => {
        if (session) handleLoginSuccess(session.user);
        else showAuthScreen();
    });
}

// --- UI NAVIGATION ---
navBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        navBtns.forEach(b => b.classList.remove('active'));
        navPanels.forEach(p => p.classList.add('hidden'));
        e.target.classList.add('active');
        document.getElementById(`panel-${e.target.id.split('-')[1]}`).classList.remove('hidden');
    });
});

function showAuthScreen() {
    authScreen.classList.remove('hidden');
    chatScreen.classList.add('hidden');
    currentUser = null;
    activeChatUser = null;
    if(globalChannel) supabase.removeChannel(globalChannel);
}

function showChatScreen() {
    authScreen.classList.add('hidden');
    chatScreen.classList.remove('hidden');
}

toggleAuthText.addEventListener('click', () => {
    isLoginMode = !isLoginMode;
    signupFields.classList.toggle('hidden');
    authBtn.textContent = isLoginMode ? 'Login' : 'Register';
    toggleAuthText.innerHTML = isLoginMode ? 'Need an account? <span>Register here</span>' : 'Already have an account? <span>Login here</span>';
    document.getElementById('username').required = !isLoginMode;
    document.getElementById('full_name').required = !isLoginMode;
});

// --- AUTH LOGIC ---
authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    authError.classList.add('hidden');

    if (isLoginMode) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) showError(error.message);
    } else {
        const username = document.getElementById('username').value;
        const full_name = document.getElementById('full_name').value;
        const { data, error } = await supabase.auth.signUp({ email, password });
        
        if (error) showError(error.message);
        else if (data.user) {
            await supabase.from('profiles').insert([{ id: data.user.id, username, full_name }]);
        }
    }
});

function showError(msg) {
    authError.textContent = msg;
    authError.classList.remove('hidden');
}

logoutBtn.addEventListener('click', () => supabase.auth.signOut());

async function handleLoginSuccess(user) {
    currentUser = user;
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    myProfileName.textContent = data?.full_name || 'My Chat';
    showChatScreen();
    connectGlobalRealtime();
}

// --- SEARCH & CHAT LOGIC ---
searchBtn.addEventListener('click', searchUsers);
searchInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') searchUsers(); });

async function searchUsers() {
    const query = searchInput.value.trim();
    if (!query) return;
    const { data } = await supabase.from('profiles').select('*').ilike('username', `%${query}%`).neq('id', currentUser.id);
    
    userList.innerHTML = '';
    (data || []).forEach(user => {
        const isOnline = onlineUsers.has(user.id);
        const div = document.createElement('div');
        div.className = 'user-item';
        div.innerHTML = `<div>${user.full_name} <br><span class="user-item-username">@${user.username}</span></div><div class="status-dot ${isOnline ? 'online' : ''}"></div>`;
        div.onclick = () => startChat(user);
        userList.appendChild(div);
    });
}

async function startChat(user) {
    activeChatUser = user;
    activeChatName.textContent = user.full_name;
    messageForm.classList.remove('hidden');
    updateActiveChatPresenceUI();
    await loadMessages();
}

function updateActiveChatPresenceUI() {
    if (!activeChatUser) return;
    activeChatStatus.classList.remove('hidden');
    activeChatStatus.textContent = onlineUsers.has(activeChatUser.id) ? 'Online' : 'Offline';
    activeChatStatus.className = `status-text ${onlineUsers.has(activeChatUser.id) ? 'online' : ''}`;
}

// --- MESSAGES & IMAGE UPLOAD ---
async function loadMessages() {
    const { data } = await supabase.from('messages').select('*')
        .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${activeChatUser.id}),and(sender_id.eq.${activeChatUser.id},receiver_id.eq.${currentUser.id})`)
        .order('created_at', { ascending: true });

    messagesContainer.innerHTML = '';
    if (data) data.forEach(renderMessage);
    scrollToBottom();
}

function renderMessage(msg) {
    if(document.getElementById(`msg-${msg.id}`)) return;

    const isSent = msg.sender_id === currentUser.id;
    const div = document.createElement('div');
    div.className = `message ${isSent ? 'msg-sent' : 'msg-recv'}`;
    div.id = `msg-${msg.id}`;

    let content = '';
    if (msg.image_url) {
        content += `<img src="${msg.image_url}" class="message-img"><br>`;
    }
    if (msg.message_text) {
        content += `<span>${msg.message_text}</span>`;
    }
    
    div.innerHTML = content;

    if (isSent) {
        const delBtn = document.createElement('button');
        delBtn.className = 'delete-btn';
        delBtn.innerHTML = '✖';
        delBtn.onclick = async () => {
            await supabase.from('messages').delete().match({ id: msg.id });
        };
        div.appendChild(delBtn);
    }
    messagesContainer.appendChild(div);
    scrollToBottom();
}

messageForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = messageInput.value.trim();
    const file = imageUpload.files[0];
    
    if (!activeChatUser || (!text && !file)) return;
    
    messageInput.value = '';
    let imageUrl = null;

    // Handle Image Upload
    if (file) {
        uploadPreview.classList.remove('hidden');
        document.getElementById('send-btn').disabled = true;
        
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random()}.${fileExt}`;
        const filePath = `${currentUser.id}/${fileName}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('chat-media')
            .upload(filePath, file);

        if (!uploadError) {
            const { data } = supabase.storage.from('chat-media').getPublicUrl(filePath);
            imageUrl = data.publicUrl;
        }
        
        imageUpload.value = '';
        uploadPreview.classList.add('hidden');
        document.getElementById('send-btn').disabled = false;
    }

    await supabase.from('messages').insert([{
        sender_id: currentUser.id,
        receiver_id: activeChatUser.id,
        message_text: text || '',
        image_url: imageUrl
    }]);
});

// --- REALTIME ---
function connectGlobalRealtime() {
    if (globalChannel) supabase.removeChannel(globalChannel);
    globalChannel = supabase.channel('global', { config: { presence: { key: currentUser.id } } });

    globalChannel
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
            const msg = payload.new;
            if (activeChatUser && ((msg.sender_id === currentUser.id && msg.receiver_id === activeChatUser.id) || (msg.sender_id === activeChatUser.id && msg.receiver_id === currentUser.id))) {
                renderMessage(msg);
                if(msg.sender_id === activeChatUser.id) stopTypingUI();
            }
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, payload => {
            const el = document.getElementById(`msg-${payload.old.id}`);
            if (el) el.remove();
        })
        .on('presence', { event: 'sync' }, () => {
            onlineUsers.clear();
            Object.keys(globalChannel.presenceState()).forEach(id => onlineUsers.add(id));
            updateActiveChatPresenceUI();
        })
        .on('broadcast', { event: 'typing' }, payload => {
            if (activeChatUser && payload.payload.sender_id === activeChatUser.id) showTypingUI();
        })
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') await globalChannel.track({ user_id: currentUser.id });
        });
}

messageInput.addEventListener('input', () => {
    if (!activeChatUser || !globalChannel) return;
    globalChannel.send({ type: 'broadcast', event: 'typing', payload: { sender_id: currentUser.id } });
});

function showTypingUI() {
    activeChatStatus.classList.add('hidden');
    typingIndicator.classList.remove('hidden');
    clearTimeout(typingTimer);
    typingTimer = setTimeout(stopTypingUI, 2000);
}

function stopTypingUI() {
    typingIndicator.classList.add('hidden');
    updateActiveChatPresenceUI();
}

function scrollToBottom() { messagesContainer.scrollTop = messagesContainer.scrollHeight; }

init();
