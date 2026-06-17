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

// Navigation & Groups
const navBtns = document.querySelectorAll('.nav-btn');
const navPanels = document.querySelectorAll('.nav-panel');
const groupList = document.getElementById('group-list');
const createGroupBtn = document.getElementById('create-group-btn');
const groupActions = document.getElementById('group-actions');
const groupManageBtn = document.getElementById('group-manage-btn');
const groupDeleteBtn = document.getElementById('group-delete-btn');

// Manual Status Action Button (Add an element with id="status-btn" to your HTML if using manual toggles)
const statusBtn = document.getElementById('status-btn');

// State Tracking
let isLoginMode = true;
let currentUser = null;
let activeChatUser = null;
let activeGroup = null; 
let globalChannel = null;
let onlineUsers = new Set();
let userStatuses = {}; // Tracks custom text statuses (Online, Away, Busy) across clients
let myCurrentStatus = 'Online';
let typingTimer = null;
const profileCache = {}; // Cache to avoid redundant database reads

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
        const view = e.target.id.split('-')[1];
        document.getElementById(`panel-${view}`).classList.remove('hidden');
        
        if (view === 'groups') loadGroups();
    });
});

function showAuthScreen() {
    authScreen.classList.remove('hidden');
    chatScreen.classList.add('hidden');
    currentUser = null;
    activeChatUser = null;
    activeGroup = null;
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

// --- SEARCH & 1-ON-1 CHAT LOGIC ---
searchBtn.addEventListener('click', searchUsers);
searchInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') searchUsers(); });

async function searchUsers() {
    const query = searchInput.value.trim();
    if (!query) return;
    const { data } = await supabase.from('profiles').select('*').ilike('username', `%${query}%`).neq('id', currentUser.id);
    
    userList.innerHTML = '';
    (data || []).forEach(user => {
        const isOnline = onlineUsers.has(user.id);
        const customText = userStatuses[user.id] || 'Online';
        const div = document.createElement('div');
        div.className = 'user-item';
        div.innerHTML = `<div>${user.full_name} <br><span class="user-item-username">@${user.username} ${isOnline ? `(${customText})` : ''}</span></div><div class="status-dot ${isOnline ? 'online' : ''}"></div>`;
        div.onclick = () => startChat(user);
        userList.appendChild(div);
    });
}

async function startChat(user) {
    activeGroup = null;
    activeChatUser = user;
    activeChatName.textContent = user.full_name;
    groupActions.classList.add('hidden');
    messageForm.classList.remove('hidden');
    updateActiveChatPresenceUI();
    await loadMessages();
}

function updateActiveChatPresenceUI() {
    if (!activeChatUser) return;
    activeChatStatus.classList.remove('hidden');
    const isOnline = onlineUsers.has(activeChatUser.id);
    
    if (isOnline) {
        const currentCustomStatus = userStatuses[activeChatUser.id] || 'Online';
        activeChatStatus.textContent = currentCustomStatus;
        activeChatStatus.className = `status-text online ${currentCustomStatus.toLowerCase()}`;
    } else {
        activeChatStatus.textContent = 'Offline';
        activeChatStatus.className = 'status-text';
    }
}

// --- GROUPS CORE LOGIC ---
createGroupBtn.addEventListener('click', async () => {
    const groupName = prompt('Enter a name for your new group:');
    if (!groupName || !groupName.trim()) return;
    
    const { data, error } = await supabase.from('groups').insert([
        { name: groupName.trim(), admin_id: currentUser.id }
    ]).select().single();
    
    if (error) {
        alert('Failed to create group: ' + error.message);
    } else if (data) {
        await supabase.from('group_members').insert([
            { group_id: data.id, user_id: currentUser.id, status: 'approved' }
        ]);
        alert(`Group "${groupName}" created successfully!`);
        loadGroups();
    }
});

async function loadGroups() {
    const { data: allGroups } = await supabase.from('groups').select('*');
    const { data: myMemberships } = await supabase.from('group_members').select('*').eq('user_id', currentUser.id);
    
    const membershipMap = {};
    (myMemberships || []).forEach(m => membershipMap[m.group_id] = m.status);

    groupList.innerHTML = '';
    if (!allGroups || allGroups.length === 0) {
        groupList.innerHTML = '<div class="empty-state">No groups available. Create one!</div>';
        return;
    }

    allGroups.forEach(group => {
        const status = membershipMap[group.id]; 
        const isAdmin = group.admin_id === currentUser.id;
        
        let subText = 'Click to join';
        if (isAdmin) subText = 'You are the Admin';
        else if (status === 'approved') subText = 'Member';
        else if (status === 'pending') subText = 'Pending Admin Approval';

        const div = document.createElement('div');
        div.className = 'user-item';
        div.innerHTML = `<div><strong>${group.name}</strong><br><span class="user-item-username">${subText}</span></div>`;
        div.onclick = () => selectGroup(group, status, isAdmin);
        groupList.appendChild(div);
    });
}

async function selectGroup(group, status, isAdmin) {
    activeChatUser = null;
    activeGroup = group;
    activeChatName.textContent = group.name;
    activeChatStatus.classList.add('hidden');

    if (isAdmin || status === 'approved') {
        groupActions.style.setProperty('display', isAdmin ? 'flex' : 'none', 'important');
        if (isAdmin) groupActions.classList.remove('hidden');
        messageForm.classList.remove('hidden');
        await loadMessages();
    } else if (status === 'pending') {
        groupActions.classList.add('hidden');
        messageForm.classList.add('hidden');
        messagesContainer.innerHTML = '<div class="empty-state">Your entry request is pending admin approval.</div>';
    } else {
        groupActions.classList.add('hidden');
        messageForm.classList.add('hidden');
        messagesContainer.innerHTML = `
            <div class="empty-state">
                <p>You are not a member of this group.</p>
                <button id="request-join-btn" class="action-btn" style="margin-top:10px; max-width:200px;">Request Entry</button>
            </div>
        `;
        document.getElementById('request-join-btn').onclick = async () => {
            await supabase.from('group_members').insert([{ group_id: group.id, user_id: currentUser.id, status: 'pending' }]);
            alert('Request sent to group admin!');
            loadGroups();
            selectGroup(group, 'pending', false);
        };
    }
}

groupManageBtn.onclick = async () => {
    if (!activeGroup) return;
    
    const { data: pendings, error } = await supabase.from('group_members')
        .select('user_id, status')
        .eq('group_id', activeGroup.id)
        .eq('status', 'pending');
        
    messagesContainer.innerHTML = '<h3 style="padding-bottom:10px; color:white;">Pending Membership Requests</h3>';
    
    if (error) {
        alert("Failed to read requests: " + error.message);
        return;
    }
    
    if (!pendings || pendings.length === 0) {
        messagesContainer.innerHTML += '<div class="empty-state">No pending requests found.</div>';
        return;
    }
    
    for (const p of pendings) {
        const profile = await fetchSenderProfile(p.user_id);
        const div = document.createElement('div');
        div.className = 'user-item';
        div.style.background = 'var(--bg-panel, #252529)';
        div.style.margin = '5px 0';
        div.style.borderRadius = '6px';
        div.innerHTML = `
            <div>${profile.full_name} <span class="user-item-username">@${profile.username}</span></div>
            <button class="action-btn" style="max-width:90px; background:var(--accent, #00adb5); color:white; border:none;">Approve</button>
        `;
        div.querySelector('button').onclick = async () => {
            const { error: upError } = await supabase.from('group_members')
                .update({ status: 'approved' })
                .eq('group_id', activeGroup.id)
                .eq('user_id', p.user_id);
                
            if (upError) {
                alert("Approval failed: " + upError.message);
            } else {
                alert('User approved!');
                groupManageBtn.click(); 
            }
        };
        messagesContainer.appendChild(div);
    }
};

groupDeleteBtn.onclick = async () => {
    if (!activeGroup) return;
    if (confirm(`Warning: Are you sure you want to permanently delete "${activeGroup.name}"?`)) {
        const { error } = await supabase.from('groups').delete().eq('id', activeGroup.id);
        if (error) {
            alert("Delete failed: " + error.message);
            return;
        }
        alert('Group deleted.');
        groupActions.classList.add('hidden');
        activeChatName.textContent = 'Select a user to start chatting';
        messagesContainer.innerHTML = '';
        messageForm.classList.add('hidden');
        activeGroup = null;
        loadGroups();
    }
};

// --- SAFE MESSAGES SYSTEM ---
async function fetchSenderProfile(userId) {
    if (profileCache[userId]) return profileCache[userId];
    const { data } = await supabase.from('profiles').select('username, full_name').eq('id', userId).single();
    if (data) {
        profileCache[userId] = data;
        return data;
    }
    return { username: 'user', full_name: 'User' };
}

async function loadMessages() {
    messagesContainer.innerHTML = '';
    let query = supabase.from('messages').select('*');

    if (activeChatUser) {
        query = query.or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${activeChatUser.id}),and(sender_id.eq.${activeChatUser.id},receiver_id.eq.${currentUser.id})`);
    } else if (activeGroup) {
        query = query.eq('group_id', activeGroup.id);
    } else {
        return;
    }

    const { data, error } = await query.order('created_at', { ascending: true });
    
    if (error) {
        console.error("Error loading chat context:", error.message);
        return;
    }

    if (data) {
        for (const msg of data) {
            await renderMessage(msg);
        }
    }
    scrollToBottom();
}

async function renderMessage(msg) {
    if(document.getElementById(`msg-${msg.id}`)) return;

    const isSent = msg.sender_id === currentUser.id;
    const div = document.createElement('div');
    div.className = `message ${isSent ? 'msg-sent' : 'msg-recv'}`;
    div.id = `msg-${msg.id}`;

    let content = '';
    
    if (!isSent && activeGroup) {
        const profile = await fetchSenderProfile(msg.sender_id);
        content += `<small style="color: #00adb5; font-weight: bold; display: block; margin-bottom: 4px;">@${profile.username}</small>`;
    }

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
    
    if ((!activeChatUser && !activeGroup) || (!text && !file)) return;
    
    messageInput.value = '';
    let imageUrl = null;

    if (file) {
        uploadPreview.classList.remove('hidden');
        document.getElementById('send-btn').disabled = true;
        
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random()}.${fileExt}`;
        const filePath = `${currentUser.id}/${fileName}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('chat-media')
            .upload(filePath, file);

        if (uploadError) {
            alert("Image Upload Failed: " + uploadError.message);
            uploadPreview.classList.add('hidden');
            document.getElementById('send-btn').disabled = false;
            return; 
        }

        const { data } = supabase.storage.from('chat-media').getPublicUrl(filePath);
        imageUrl = data.publicUrl;
        
        imageUpload.value = '';
        uploadPreview.classList.add('hidden');
        document.getElementById('send-btn').disabled = false;
    }

    if (text || imageUrl) {
        const packet = {
            sender_id: currentUser.id,
            message_text: text || '',
            image_url: imageUrl
        };

        if (activeGroup) packet.group_id = activeGroup.id;
        else packet.receiver_id = activeChatUser.id;

        const { error } = await supabase.from('messages').insert([packet]);
        if (error) alert("Database write rejected: " + error.message);
    }
});

// --- REALTIME ENGINE ---
function connectGlobalRealtime() {
    if (globalChannel) supabase.removeChannel(globalChannel);
    
    globalChannel = supabase.channel('global');

    globalChannel
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async payload => {
            const msg = payload.new;
            if (activeChatUser && ((msg.sender_id === currentUser.id && msg.receiver_id === activeChatUser.id) || (msg.sender_id === activeChatUser.id && msg.receiver_id === currentUser.id))) {
                await renderMessage(msg);
                if(msg.sender_id === activeChatUser.id) stopTypingUI();
            } else if (activeGroup && msg.group_id === activeGroup.id) {
                await renderMessage(msg);
            }
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, payload => {
            const el = document.getElementById(`msg-${payload.old.id}`);
            if (el) el.remove();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members' }, payload => {
            loadGroups(); 
            if (activeGroup && payload.new && payload.new.group_id === activeGroup.id) {
                if (payload.new.user_id === currentUser.id) {
                    selectGroup(activeGroup, payload.new.status, activeGroup.admin_id === currentUser.id);
                }
            }
        })
        // FIXED: Loop through the state payload value arrays to correctly map tracking parameters
        .on('presence', { event: 'sync' }, () => {
            onlineUsers.clear();
            userStatuses = {};
            const state = globalChannel.presenceState();
            
            Object.values(state).forEach(presences => {
                presences.forEach(presence => {
                    if (presence.user_id) {
                        onlineUsers.add(presence.user_id);
                        userStatuses[presence.user_id] = presence.custom_status || 'Online';
                    }
                });
            });
            
            updateActiveChatPresenceUI();
            if (searchInput.value.trim()) searchUsers();
        })
        .on('broadcast', { event: 'typing' }, payload => {
            if (activeChatUser && payload.payload.sender_id === activeChatUser.id) showTypingUI();
        })
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await globalChannel.track({
                    user_id: currentUser.id,
                    custom_status: myCurrentStatus,
                    online_at: new Date().toISOString()
                });
            }
        });
}

// Interactive Manual Status Toggle Handler
if (statusBtn) {
    statusBtn.addEventListener('click', async () => {
        if (!globalChannel || !currentUser) return;
        
        // Loop choices: Online -> Away -> Busy -> Online
        if (myCurrentStatus === 'Online') myCurrentStatus = 'Away';
        else if (myCurrentStatus === 'Away') myCurrentStatus = 'Busy';
        else myCurrentStatus = 'Online';
        
        statusBtn.textContent = `Status: ${myCurrentStatus}`;
        
        // Broadcast state updates directly to connected channels
        await globalChannel.track({
            user_id: currentUser.id,
            custom_status: myCurrentStatus,
            online_at: new Date().toISOString()
        });
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
