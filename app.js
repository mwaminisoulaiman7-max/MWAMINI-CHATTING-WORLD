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

// State
let isLoginMode = true;
let currentUser = null;
let currentProfile = null;
let activeChatUser = null;

// Realtime State
let globalChannel = null;
let onlineUsers = new Set();
let typingTimer = null;
let currentSearchResults = []; // Store to update green dots instantly

// --- INITIALIZATION ---
async function init() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        await handleLoginSuccess(session.user);
    } else {
        showAuthScreen();
    }

    supabase.auth.onAuthStateChange((_event, session) => {
        if (session) handleLoginSuccess(session.user);
        else showAuthScreen();
    });
}

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
    if (isLoginMode) {
        signupFields.classList.add('hidden');
        authBtn.textContent = 'Login';
        toggleAuthText.innerHTML = 'Need an account? <span>Register here</span>';
        document.getElementById('username').required = false;
        document.getElementById('full_name').required = false;
    } else {
        signupFields.classList.remove('hidden');
        authBtn.textContent = 'Register';
        toggleAuthText.innerHTML = 'Already have an account? <span>Login here</span>';
        document.getElementById('username').required = true;
        document.getElementById('full_name').required = true;
    }
    authError.classList.add('hidden');
});

// --- AUTH LOGIC ---
authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    authError.classList.add('hidden');
    authBtn.disabled = true;

    if (isLoginMode) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) showError(error.message);
    } else {
        const username = document.getElementById('username').value;
        const full_name = document.getElementById('full_name').value;
        const { data, error } = await supabase.auth.signUp({ email, password });
        
        if (error) {
            showError(error.message);
        } else if (data.user) {
            const { error: profileError } = await supabase.from('profiles').insert([
                { id: data.user.id, username, full_name }
            ]);
            if (profileError) showError("Failed to create profile: " + profileError.message);
        }
    }
    authBtn.disabled = false;
});

function showError(msg) {
    authError.textContent = msg;
    authError.classList.remove('hidden');
}

logoutBtn.addEventListener('click', async () => {
    await supabase.auth.signOut();
});

async function handleLoginSuccess(user) {
    currentUser = user;
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    currentProfile = data;
    myProfileName.textContent = currentProfile?.full_name || 'My Chat';
    showChatScreen();
    
    // Connect to WebSockets globally as soon as we log in
    connectGlobalRealtime();
}

// --- USER SEARCH ---
searchBtn.addEventListener('click', searchUsers);
searchInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') searchUsers(); });

async function searchUsers() {
    const query = searchInput.value.trim();
    if (!query) return;

    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .ilike('username', `%${query}%`)
        .neq('id', currentUser.id);

    currentSearchResults = data || [];
    renderUserList();
}

function renderUserList() {
    userList.innerHTML = '';
    if (currentSearchResults.length > 0) {
        currentSearchResults.forEach(user => {
            const isOnline = onlineUsers.has(user.id);
            const div = document.createElement('div');
            div.className = 'user-item';
            div.innerHTML = `
                <div class="user-info">
                    <div>${user.full_name}</div>
                    <div class="user-item-username">@${user.username}</div>
                </div>
                <div class="status-dot ${isOnline ? 'online' : ''}"></div>
            `;
            div.onclick = () => startChat(user);
            userList.appendChild(div);
        });
    } else {
        userList.innerHTML = '<div style="padding:15px; color:#8696a0;">No users found</div>';
    }
}

// --- CHAT LOGIC ---
async function startChat(user) {
    activeChatUser = user;
    activeChatName.textContent = user.full_name;
    messageForm.classList.remove('hidden');
    document.body.classList.add('chat-active'); 
    
    updateActiveChatPresenceUI();
    await loadMessages();
}

function updateActiveChatPresenceUI() {
    if (!activeChatUser) return;
    activeChatStatus.classList.remove('hidden');
    
    if (onlineUsers.has(activeChatUser.id)) {
        activeChatStatus.textContent = 'Online';
        activeChatStatus.classList.add('online');
    } else {
        activeChatStatus.textContent = 'Offline';
        activeChatStatus.classList.remove('online');
    }
}

async function loadMessages() {
    const { data, error } = await supabase
        .from('messages')
        .select('*')
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
    div.textContent = msg.message_text;

    if (isSent) {
        const delBtn = document.createElement('button');
        delBtn.className = 'delete-btn';
        delBtn.innerHTML = '✖';
        delBtn.onclick = () => deleteMessage(msg.id);
        div.appendChild(delBtn);
    }
    messagesContainer.appendChild(div);
    scrollToBottom();
}

messageForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = messageInput.value.trim();
    if (!text || !activeChatUser) return;
    messageInput.value = '';

    await supabase.from('messages').insert([{
        sender_id: currentUser.id,
        receiver_id: activeChatUser.id,
        message_text: text
    }]);
});

async function deleteMessage(msgId) {
    await supabase.from('messages').delete().match({ id: msgId, sender_id: currentUser.id });
}

// --- GLOBAL REALTIME (CHAT + PRESENCE + TYPING) ---
function connectGlobalRealtime() {
    if (globalChannel) supabase.removeChannel(globalChannel);

    globalChannel = supabase.channel('global_chat_channel', {
        config: { presence: { key: currentUser.id } }
    });

    globalChannel
        // 1. Listen for new messages
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
            const msg = payload.new;
            if (activeChatUser && (
                (msg.sender_id === currentUser.id && msg.receiver_id === activeChatUser.id) ||
                (msg.sender_id === activeChatUser.id && msg.receiver_id === currentUser.id)
            )) {
                renderMessage(msg);
                // Clear typing indicator immediately when a message arrives
                if(msg.sender_id === activeChatUser.id) stopTypingUI();
            }
        })
        // 2. Listen for deleted messages
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, payload => {
            const el = document.getElementById(`msg-${payload.old.id}`);
            if (el) el.remove();
        })
        // 3. Listen for Online/Offline Presence Syncs
        .on('presence', { event: 'sync' }, () => {
            const state = globalChannel.presenceState();
            onlineUsers.clear();
            Object.keys(state).forEach(userId => onlineUsers.add(userId));
            
            renderUserList(); // Update green dots
            updateActiveChatPresenceUI(); // Update Header
        })
        // 4. Listen for Typing Broadcasts
        .on('broadcast', { event: 'typing' }, payload => {
            if (activeChatUser && 
                payload.payload.sender_id === activeChatUser.id && 
                payload.payload.receiver_id === currentUser.id) {
                showTypingUI();
            }
        })
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await globalChannel.track({ user_id: currentUser.id });
            }
        });
}

// Broadcast Typing Event
messageInput.addEventListener('input', () => {
    if (!activeChatUser || !globalChannel) return;
    globalChannel.send({
        type: 'broadcast',
        event: 'typing',
        payload: { sender_id: currentUser.id, receiver_id: activeChatUser.id }
    });
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

function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

init();
