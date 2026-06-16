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
const messagesContainer = document.getElementById('messages-container');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');

// State
let isLoginMode = true;
let currentUser = null;
let currentProfile = null;
let activeChatUser = null;
let realtimeSubscription = null;

// --- INITIALIZATION ---
async function init() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        await handleLoginSuccess(session.user);
    } else {
        showAuthScreen();
    }

    // Auth State Listener
    supabase.auth.onAuthStateChange((_event, session) => {
        if (session) handleLoginSuccess(session.user);
        else showAuthScreen();
    });
}

// --- UI TOGGLES ---
function showAuthScreen() {
    authScreen.classList.remove('hidden');
    chatScreen.classList.add('hidden');
    currentUser = null;
    activeChatUser = null;
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
            // Create profile for new user
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
    if(realtimeSubscription) supabase.removeChannel(realtimeSubscription);
});

async function handleLoginSuccess(user) {
    currentUser = user;
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    currentProfile = data;
    myProfileName.textContent = currentProfile?.full_name || 'My Chat';
    showChatScreen();
}

// --- USER SEARCH ---
searchBtn.addEventListener('click', searchUsers);
searchInput.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') searchUsers();
});

async function searchUsers() {
    const query = searchInput.value.trim();
    if (!query) return;

    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .ilike('username', `%${query}%`)
        .neq('id', currentUser.id);

    userList.innerHTML = '';
    if (data && data.length > 0) {
        data.forEach(user => {
            const div = document.createElement('div');
            div.className = 'user-item';
            div.innerHTML = `<div>${user.full_name}</div><div class="user-item-username">@${user.username}</div>`;
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
    document.body.classList.add('chat-active'); // For mobile layout toggle
    await loadMessages();
    subscribeToRealtime();
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
    // Check if message already exists (realtime overlap)
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

// Send Message
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

// Delete Message
async function deleteMessage(msgId) {
    await supabase.from('messages').delete().match({ id: msgId, sender_id: currentUser.id });
}

function removeMessageFromDOM(msgId) {
    const el = document.getElementById(`msg-${msgId}`);
    if (el) el.remove();
}

// Realtime Subscription
function subscribeToRealtime() {
    if (realtimeSubscription) supabase.removeChannel(realtimeSubscription);

    realtimeSubscription = supabase.channel('chat_channel')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
            const msg = payload.new;
            // Only render if it belongs to current active chat
            if (
                (msg.sender_id === currentUser.id && msg.receiver_id === activeChatUser.id) ||
                (msg.sender_id === activeChatUser.id && msg.receiver_id === currentUser.id)
            ) {
                renderMessage(msg);
            }
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, payload => {
            removeMessageFromDOM(payload.old.id);
        })
        .subscribe();
}

function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Run app
init();