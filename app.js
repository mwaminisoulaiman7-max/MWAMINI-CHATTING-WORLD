import { supabase } from './supabase.js';

/**
 * Enterprise Application State Container
 */
const AppState = {
    currentUser: null,
    activeChatUser: null,
    activeGroup: null,
    globalChannel: null,
    onlineUsers: new Set(),
    typingTimer: null,
    isLoginMode: true
};

/**
 * DOM Elements Cache Matrix
 */
const DOM = {
    authScreen: document.getElementById('auth-screen'),
    chatScreen: document.getElementById('chat-screen'),
    authForm: document.getElementById('auth-form'),
    toggleAuthText: document.getElementById('toggle-auth'),
    signupFields: document.getElementById('signup-fields'),
    authBtn: document.getElementById('auth-btn'),
    authError: document.getElementById('auth-error'),
    logoutBtn: document.getElementById('logout-btn'),
    myProfileName: document.getElementById('my-profile-name'),
    searchInput: document.getElementById('search-input'),
    searchBtn: document.getElementById('search-btn'),
    userList: document.getElementById('user-list'),
    activeChatName: document.getElementById('active-chat-name'),
    activeChatStatus: document.getElementById('active-chat-status'),
    typingIndicator: document.getElementById('typing-indicator'),
    messagesContainer: document.getElementById('messages-container'),
    messageForm: document.getElementById('message-form'),
    messageInput: document.getElementById('message-input'),
    imageUpload: document.getElementById('image-upload'),
    uploadPreview: document.getElementById('upload-preview'),
    navBtns: document.querySelectorAll('.nav-btn'),
    navPanels: document.querySelectorAll('.nav-panel'),
    groupList: document.getElementById('group-list'),
    createGroupBtn: document.getElementById('create-group-btn'),
    groupActions: document.getElementById('group-actions'),
    groupManageBtn: document.getElementById('group-manage-btn'),
    groupDeleteBtn: document.getElementById('group-delete-btn')
};

/**
 * Core Orchestrator
 */
async function init() {
    try {
        setupEventListeners();
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        
        if (session) {
            await handleLoginSuccess(session.user);
        } else {
            showAuthScreen();
        }
    } catch (err) {
        console.error("Initialization failure:", err);
        showError("Failed to initialize application lifecycle.");
    }
}

function setupEventListeners() {
    // Navigation Lifecycle Management
    DOM.navBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            DOM.navBtns.forEach(b => b.classList.remove('active'));
            DOM.navPanels.forEach(p => p.classList.add('hidden'));
            
            const target = e.currentTarget;
            target.classList.add('active');
            const view = target.id.split('-')[1];
            
            const targetPanel = document.getElementById(`panel-${view}`);
            if (targetPanel) targetPanel.classList.remove('hidden');
            if (view === 'groups') loadGroups();
        });
    });

    // Auth Form Stream
    DOM.authForm.addEventListener('submit', handleAuthSubmit);
    DOM.toggleAuthText.addEventListener('click', toggleAuthMode);
    DOM.logoutBtn.addEventListener('click', () => supabase.auth.signOut());

    // Search Operations
    DOM.searchBtn.addEventListener('click', searchUsers);
    DOM.searchInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') searchUsers(); });

    // Messengers UI Dispatch
    DOM.messageForm.addEventListener('submit', handleMessageSubmit);
    DOM.messageInput.addEventListener('input', dispatchTypingSignal);
}

/**
 * Authentication Engine
 */
async function handleAuthSubmit(e) {
    e.preventDefault();
    DOM.authError.classList.add('hidden');
    
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const username = document.getElementById('username')?.value.trim();
    const full_name = document.getElementById('full_name')?.value.trim();

    if (!email || !password) return;

    try {
        if (AppState.isLoginMode) {
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) throw error;
        } else {
            if (!username || !full_name) {
                showError("Username and Full Name are mandatory fields.");
                return;
            }
            const { data, error } = await supabase.auth.signUp({ email, password });
            if (error) throw error;
            
            if (data?.user) {
                const { error: profileErr } = await supabase
                    .from('profiles')
                    .insert([{ id: data.user.id, username, full_name }]);
                if (profileErr) throw profileErr;
            }
        }
    } catch (err) {
        showError(err.message || "An authentication exception occurred.");
    }
}

function toggleAuthMode() {
    AppState.isLoginMode = !AppState.isLoginMode;
    DOM.signupFields.classList.toggle('hidden');
    DOM.authBtn.textContent = AppState.isLoginMode ? 'Login' : 'Register';
    
    DOM.toggleAuthText.innerHTML = AppState.isLoginMode 
        ? 'Need an account? <span>Register here</span>' 
        : 'Already have an account? <span>Login here</span>';
        
    const uInput = document.getElementById('username');
    const fInput = document.getElementById('full_name');
    if (uInput) uInput.required = !AppState.isLoginMode;
    if (fInput) fInput.required = !AppState.isLoginMode;
}

async function handleLoginSuccess(user) {
    AppState.currentUser = user;
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', user.id)
            .single();
            
        if (error) throw error;
        DOM.myProfileName.textContent = data?.full_name || 'My Chat';
        showChatScreen();
        connectGlobalRealtime();
    } catch (err) {
        console.error("Profile retrieval broken:", err);
        DOM.myProfileName.textContent = 'My Chat';
        showChatScreen();
    }
}

function showAuthScreen() {
    DOM.authScreen.classList.remove('hidden');
    DOM.chatScreen.classList.add('hidden');
    AppState.currentUser = null;
    AppState.activeChatUser = null;
    AppState.activeGroup = null;
    if (AppState.globalChannel) {
        supabase.removeChannel(AppState.globalChannel);
        AppState.globalChannel = null;
    }
}

function showChatScreen() {
    DOM.authScreen.classList.add('hidden');
    DOM.chatScreen.classList.remove('hidden');
}

/**
 * 1-on-1 Realtime Directory Ingestion
 */
async function searchUsers() {
    const query = DOM.searchInput.value.trim();
    if (!query) return;

    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('id, username, full_name')
            .ilike('username', `%${query}%`)
            .neq('id', AppState.currentUser.id)
            .limit(20);
            
        if (error) throw error;
        
        DOM.userList.innerHTML = '';
        (data || []).forEach(user => {
            const isOnline = AppState.onlineUsers.has(user.id);
            const div = document.createElement('div');
            div.className = 'user-item';
            div.innerHTML = `
                <div>${escapeHTML(user.full_name)} <br>
                <span class="user-item username">@${escapeHTML(user.username)}</span></div>
                <div class="status-dot ${isOnline ? 'online' : ''}"></div>`;
            div.onclick = () => startChat(user);
            DOM.userList.appendChild(div);
        });
    } catch (err) {
        console.error("Directory query fault:", err);
    }
}

async function startChat(user) {
    AppState.activeGroup = null;
    AppState.activeChatUser = user;
    DOM.activeChatName.textContent = user.full_name;
    DOM.groupActions.classList.add('hidden');
    DOM.messageForm.classList.remove('hidden');
    updateActiveChatPresenceUI();
    await loadMessages();
}

function updateActiveChatPresenceUI() {
    if (!AppState.activeChatUser) return;
    DOM.activeChatStatus.classList.remove('hidden');
    const isOnline = AppState.onlineUsers.has(AppState.activeChatUser.id);
    DOM.activeChatStatus.textContent = isOnline ? 'Online' : 'Offline';
    DOM.activeChatStatus.className = `status-text ${isOnline ? 'online' : ''}`;
}

/**
 * Highly Optimized Relational Group Mapping Engine
 */
async function loadGroups() {
    try {
        // Query optimization: Execute single parallelized data stream across references
        const [groupsRes, membersRes] = await Promise.all([
            supabase.from('groups').select('id, name, admin_id'),
            supabase.from('group_members').select('group_id, status').eq('user_id', AppState.currentUser.id)
        ]);

        if (groupsRes.error) throw groupsRes.error;
        if (membersRes.error) throw membersRes.error;

        const membershipMap = {};
        (membersRes.data || []).forEach(m => membershipMap[m.group_id] = m.status);

        DOM.groupList.innerHTML = '';
        if (!groupsRes.data || groupsRes.data.length === 0) {
            DOM.groupList.innerHTML = '<div class="empty-state">No groups available. Create one!</div>';
            return;
        }

        groupsRes.data.forEach(group => {
            const status = membershipMap[group.id];
            const isAdmin = group.admin_id === AppState.currentUser.id;

            let subText = 'Click to join';
            if (isAdmin) subText = 'You are the Admin';
            else if (status === 'approved') subText = 'Member';
            else if (status === 'pending') subText = 'Pending Admin Approval';

            const div = document.createElement('div');
            div.className = 'user-item';
            div.innerHTML = `<div><strong>${escapeHTML(group.name)}</strong><br><span class="user-item username">${subText}</span></div>`;
            div.onclick = () => selectGroup(group, status, isAdmin);
            DOM.groupList.appendChild(div);
        });
    } catch (err) {
        console.error("Group parsing engine failure:", err);
    }
}

async function selectGroup(group, status, isAdmin) {
    AppState.activeChatUser = null;
    AppState.activeGroup = group;
    DOM.activeChatName.textContent = group.name;
    DOM.activeChatStatus.classList.add('hidden');

    if (isAdmin || status === 'approved') {
        if (isAdmin) DOM.groupActions.classList.remove('hidden');
        else DOM.groupActions.classList.add('hidden');
        DOM.messageForm.classList.remove('hidden');
        await loadMessages();
    } else if (status === 'pending') {
        DOM.groupActions.classList.add('hidden');
        DOM.messageForm.classList.add('hidden');
        DOM.messagesContainer.innerHTML = '<div class="empty-state">Your entry request is pending admin approval.</div>';
    } else {
        DOM.groupActions.classList.add('hidden');
        DOM.messageForm.classList.add('hidden');
        DOM.messagesContainer.innerHTML = `
            <div class="empty-state">
                <p>You are not a member of this group.</p>
                <button id="request-join-btn" class="action-btn" style="margin-top:10px; max-width:200px;">Request Entry</button>
            </div>`;
        
        const joinBtn = document.getElementById('request-join-btn');
        if (joinBtn) {
            joinBtn.onclick = async () => {
                await supabase.from('group_members').insert([{ group_id: group.id, user_id: AppState.currentUser.id, status: 'pending' }]);
                alert('Request sent to group admin!');
                loadGroups();
                selectGroup(group, 'pending', false);
            };
        }
    }
}

/**
 * Transactional Data IO Messaging Pipeline
 */
async function loadMessages() {
    DOM.messagesContainer.innerHTML = '';
    if (!AppState.activeChatUser && !AppState.activeGroup) return;

    try {
        let query = supabase.from('messages').select('*');
        if (AppState.activeChatUser) {
            query = query.or(`and(sender_id.eq.${AppState.currentUser.id},receiver_id.eq.${AppState.activeChatUser.id}),and(sender_id.eq.${AppState.activeChatUser.id},receiver_id.eq.${AppState.currentUser.id})`);
        } else {
            query = query.eq('group_id', AppState.activeGroup.id);
        }

        const { data, error } = await query.order('created_at', { ascending: true });
        if (error) throw error;
        
        if (data) data.forEach(renderMessage);
        scrollToBottom();
    } catch (err) {
        console.error("Message stack retrieval error:", err);
    }
}

function renderMessage(msg) {
    if (document.getElementById(`msg-${msg.id}`)) return;

    const isSent = msg.sender_id === AppState.currentUser.id;
    const div = document.createElement('div');
    div.className = `message ${isSent ? 'msg-sent' : 'msg-recv'}`;
    div.id = `msg-${msg.id}`;

    let content = '';
    if (msg.image_url) {
        content += `<img src="${encodeURI(msg.image_url)}" class="message-img" loading="lazy"><br>`;
    }
    if (msg.message_text) {
        content += `<span>${escapeHTML(msg.message_text)}</span>`;
    }

    div.innerHTML = content;

    if (isSent) {
        const delBtn = document.createElement('button');
        delBtn.className = 'delete-btn';
        delBtn.innerHTML = '✖';
        delBtn.onclick = async () => {
            try {
                const { error } = await supabase.from('messages').delete().match({ id: msg.id });
                if (error) throw error;
            } catch (err) {
                console.error("Deletion verification drop:", err);
            }
        };
        div.appendChild(delBtn);
    }
    DOM.messagesContainer.appendChild(div);
    scrollToBottom();
}

async function handleMessageSubmit(e) {
    e.preventDefault();
    const text = DOM.messageInput.value.trim();
    const file = DOM.imageUpload.files[0];

    if ((!AppState.activeChatUser && !AppState.activeGroup) || (!text && !file)) return;

    DOM.messageInput.value = '';
    let imageUrl = null;

    try {
        if (file) {
            DOM.uploadPreview.classList.remove('hidden');
            const sendBtn = document.getElementById('send-btn');
            if (sendBtn) sendBtn.disabled = true;

            const fileExt = file.name.split('.').pop();
            const fileName = `${Date.now()}-${Math.random()}.${fileExt}`;
            const filePath = `${AppState.currentUser.id}/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('chat-media')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data } = supabase.storage.from('chat-media').getPublicUrl(filePath);
            imageUrl = data?.publicUrl;

            DOM.imageUpload.value = '';
            DOM.uploadPreview.classList.add('hidden');
            if (sendBtn) sendBtn.disabled = false;
        }

        if (text || imageUrl) {
            const packet = {
                sender_id: AppState.currentUser.id,
                message_text: text || '',
                image_url: imageUrl
            };

            if (AppState.activeGroup) packet.group_id = AppState.activeGroup.id;
            else packet.receiver_id = AppState.activeChatUser.id;

            const { error } = await supabase.from('messages').insert([packet]);
            if (error) throw error;
        }
    } catch (err) {
        console.error("Transmission error:", err);
        alert(`Failed to forward message: ${err.message}`);
        DOM.uploadPreview.classList.add('hidden');
        const sendBtn = document.getElementById('send-btn');
        if (sendBtn) sendBtn.disabled = false;
    }
}

/**
 * Isolated Realtime Layer Multiplexing
 */
function connectGlobalRealtime() {
    if (AppState.globalChannel) {
        supabase.removeChannel(AppState.globalChannel);
    }

    AppState.globalChannel = supabase.channel('global', {
        config: { presence: { key: AppState.currentUser.id } }
    });

    AppState.globalChannel
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
            const msg = payload.new;
            if (AppState.activeChatUser && ((msg.sender_id === AppState.currentUser.id && msg.receiver_id === AppState.activeChatUser.id) || (msg.sender_id === AppState.activeChatUser.id && msg.receiver_id === AppState.currentUser.id))) {
                renderMessage(msg);
                if (msg.sender_id === AppState.activeChatUser.id) stopTypingUI();
            } else if (AppState.activeGroup && msg.group_id === AppState.activeGroup.id) {
                renderMessage(msg);
            }
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, payload => {
            const el = document.getElementById(`msg-${payload.old.id}`);
            if (el) el.remove();
        })
        .on('presence', { event: 'sync' }, () => {
            AppState.onlineUsers.clear();
            Object.keys(AppState.globalChannel.presenceState()).forEach(id => AppState.onlineUsers.add(id));
            updateActiveChatPresenceUI();
        })
        .on('broadcast', { event: 'typing' }, payload => {
            if (AppState.activeChatUser && payload.payload.sender_id === AppState.activeChatUser.id) {
                showTypingUI();
            }
        })
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await AppState.globalChannel.track({ user_id: AppState.currentUser.id });
            }
        });
}

function dispatchTypingSignal() {
    if (!AppState.activeChatUser || !AppState.globalChannel) return;
    AppState.globalChannel.send({
        type: 'broadcast',
        event: 'typing',
        payload: { sender_id: AppState.currentUser.id }
    });
}

function showTypingUI() {
    DOM.activeChatStatus.classList.add('hidden');
    DOM.typingIndicator.classList.remove('hidden');
    clearTimeout(AppState.typingTimer);
    AppState.typingTimer = setTimeout(stopTypingUI, 2000);
}

function stopTypingUI() {
    DOM.typingIndicator.classList.add('hidden');
    updateActiveChatPresenceUI();
}

/**
 * Security & Presentation Layer Defenses
 */
function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

function showError(msg) {
    DOM.authError.textContent = msg;
    DOM.authError.classList.remove('hidden');
}

function scrollToBottom() {
    DOM.messagesContainer.scrollTop = DOM.messagesContainer.scrollHeight;
}

// Instantiate Layer Context
document.addEventListener('DOMContentLoaded', init);
