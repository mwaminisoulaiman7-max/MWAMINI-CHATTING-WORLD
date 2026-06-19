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

// --- NEW SYSTEM ELEMENTS ---
const statusBtn = document.getElementById('status-btn');
const clearSearchBtn = document.getElementById('clear-search-btn');
const searchHistoryContainer = document.getElementById('search-history-container');
const mobileBackBtn = document.getElementById('mobile-back-btn');

// State Tracking
let isLoginMode = true;
let currentUser = null;
let activeChatUser = null;
let activeGroup = null; 
let globalChannel = null;
let onlineUsers = new Set();
let userStatuses = {}; 
let myCurrentStatus = 'Online';
let typingTimer = null;
const profileCache = {};

async function init() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) await handleLoginSuccess(session.user);
    else showAuthScreen();

    supabase.auth.onAuthStateChange((_event, session) => {
        if (session) handleLoginSuccess(session.user);
        else showAuthScreen();
    });
    
    renderSearchHistory();
}

// --- UI NAVIGATION & PHONE RESPONSIVENESS MECHANICS ---
navBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        navBtns.forEach(b => b.classList.remove('active'));
        navPanels.forEach(p => p.classList.add('hidden'));
        e.target.classList.add('active');
        const view = e.target.id.split('-')[1];
        const panel = document.getElementById(`panel-${view}`);
        if (panel) panel.classList.remove('hidden');
        
        if (view === 'groups') loadGroups();
    });
});

function showAuthScreen() {
    if (authScreen) authScreen.classList.remove('hidden');
    if (chatScreen) chatScreen.classList.add('hidden');
    currentUser = null;
    activeChatUser = null;
    activeGroup = null;
    if (globalChannel) supabase.removeChannel(globalChannel);
    updateMobileLayoutView();
}

function showChatScreen() {
    if (authScreen) authScreen.classList.add('hidden');
    if (chatScreen) chatScreen.classList.remove('hidden');
    updateMobileLayoutView();
}

function updateMobileLayoutView() {
    const sidebar = document.querySelector('.sidebar');
    const chatArea = document.querySelector('.chat-area');
    if (!sidebar || !chatArea) return;

    if (activeChatUser || activeGroup) {
        sidebar.classList.add('mobile-hidden');
        chatArea.classList.remove('mobile-hidden');
    } else {
        sidebar.classList.remove('mobile-hidden');
        chatArea.classList.add('mobile-hidden');
    }
}

if (mobileBackBtn) {
    mobileBackBtn.addEventListener('click', () => {
        activeChatUser = null;
        activeGroup = null;
        updateMobileLayoutView();
    });
}

if (toggleAuthText) {
    toggleAuthText.addEventListener('click', () => {
        isLoginMode = !isLoginMode;
        if (signupFields) signupFields.classList.toggle('hidden');
        if (authBtn) authBtn.textContent = isLoginMode ? 'Login' : 'Register';
        toggleAuthText.innerHTML = isLoginMode ? 'Need an account? <span>Register here</span>' : 'Already have an account? <span>Login here</span>';
        
        const usernameInput = document.getElementById('username');
        const fullNameInput = document.getElementById('full_name');
        if (usernameInput) usernameInput.required = !isLoginMode;
        if (fullNameInput) fullNameInput.required = !isLoginMode;
    });
}

// --- AUTH LOGIC ---
if (authForm) {
    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const emailEl = document.getElementById('email');
        const passwordEl = document.getElementById('password');
        if (!emailEl || !passwordEl) return;

        const email = emailEl.value;
        const password = passwordEl.value;
        if (authError) authError.classList.add('hidden');

        if (isLoginMode) {
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) showError(error.message);
        } else {
            const username = document.getElementById('username')?.value;
            const full_name = document.getElementById('full_name')?.value;
            const { data, error } = await supabase.auth.signUp({ email, password });
            
            if (error) showError(error.message);
            else if (data.user) {
                await supabase.from('profiles').insert([{ id: data.user.id, username, full_name }]);
            }
        }
    });
}

function showError(msg) {
    if (authError) {
        authError.textContent = msg;
        authError.classList.remove('hidden');
    }
}

if (logoutBtn) logoutBtn.addEventListener('click', () => supabase.auth.signOut());

async function handleLoginSuccess(user) {
    currentUser = user;
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (myProfileName) myProfileName.textContent = data?.full_name || 'My Chat';
    showChatScreen();
    connectGlobalRealtime();
}

// --- SEARCH HISTORY CORE LOGIC ---
if (searchBtn) searchBtn.addEventListener('click', () => triggerSearch());
if (searchInput) searchInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') triggerSearch(); });

function triggerSearch() {
    if (!searchInput) return;
    const query = searchInput.value.trim();
    if (!query) return;
    saveSearchQuery(query);
    searchUsers(query);
}

async function searchUsers(query) {
    if (!userList) return;
    const { data } = await supabase.from('profiles').select('*').ilike('username', `%${query}%`).neq('id', currentUser.id);
    
    userList.innerHTML = '';
    if (!data || data.length === 0) {
        userList.innerHTML = '<div class="empty-state">No users found.</div>';
        return;
    }

    data.forEach(user => {
        const isOnline = onlineUsers.has(user.id);
        const customText = userStatuses[user.id] || 'Online';
        const statusClass = isOnline ? customText.toLowerCase() : 'offline';

        const div = document.createElement('div');
        div.className = 'user-item';
        div.innerHTML = `
            <div>
                ${user.full_name} <br>
                <span class="user-item-username">@${user.username} ${isOnline ? `(${customText})` : ''}</span>
            </div>
            <div class="status-dot ${isOnline ? `online ${statusClass}` : ''}"></div>
        `;
        div.onclick = () => startChat(user);
        userList.appendChild(div);
    });
}

function saveSearchQuery(query) {
    let history = JSON.parse(localStorage.getItem('chat_search_history')) || [];
    history = history.filter(q => q.toLowerCase() !== query.toLowerCase());
    history.unshift(query);
    if (history.length > 5) history.pop(); // Keep top 5
    localStorage.setItem('chat_search_history', JSON.stringify(history));
    renderSearchHistory();
}

function renderSearchHistory() {
    if (!searchHistoryContainer) return;
    const history = JSON.parse(localStorage.getItem('chat_search_history')) || [];
    if (history.length === 0) {
        searchHistoryContainer.innerHTML = '';
        return;
    }

    searchHistoryContainer.innerHTML = '<div class="history-label">Recent Searches:</div>';
    const tagsWrapper = document.createElement('div');
    tagsWrapper.className = 'history-tags';
    
    history.forEach(query => {
        const span = document.createElement('span');
        span.className = 'history-tag';
        span.textContent = query;
        span.onclick = () => {
            if (searchInput) {
                searchInput.value = query;
                searchUsers(query);
            }
        };
        tagsWrapper.appendChild(span);
    });
    searchHistoryContainer.appendChild(tagsWrapper);
}

if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', () => {
        localStorage.removeItem('chat_search_history');
        if (searchInput) searchInput.value = '';
        if (userList) userList.innerHTML = '<div class="empty-state">Search history cleared.</div>';
        renderSearchHistory();
    });
}

async function startChat(user) {
    activeGroup = null;
    activeChatUser = user;
    if (activeChatName) activeChatName.textContent = user.full_name;
    if (groupActions) groupActions.classList.add('hidden');
    if (messageForm) messageForm.classList.remove('hidden');
    updateMobileLayoutView();
    updateActiveChatPresenceUI();
    await loadMessages();
}

function updateActiveChatPresenceUI() {
    if (!activeChatUser || !activeChatStatus) return;
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
if (createGroupBtn) {
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
}

async function loadGroups() {
    if (!groupList) return;
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
    if (activeChatName) activeChatName.textContent = group.name;
    if (activeChatStatus) activeChatStatus.classList.add('hidden');
    updateMobileLayoutView();

    if (isAdmin || status === 'approved') {
        if (groupActions) {
            groupActions.style.setProperty('display', isAdmin ? 'flex' : 'none', 'important');
            if (isAdmin) groupActions.classList.remove('hidden');
        }
        if (messageForm) messageForm.classList.remove('hidden');
        await loadMessages();
    } else if (status === 'pending') {
        if (groupActions) groupActions.classList.add('hidden');
        if (messageForm) messageForm.classList.add('hidden');
        if (messagesContainer) messagesContainer.innerHTML = '<div class="empty-state">Your entry request is pending admin approval.</div>';
    } else {
        if (groupActions) groupActions.classList.add('hidden');
        if (messageForm) messageForm.classList.add('hidden');
        if (messagesContainer) {
            messagesContainer.innerHTML = `
                <div class="empty-state">
                    <p>You are not a member of this group.</p>
                    <button id="request-join-btn" class="action-btn" style="margin-top:10px; max-width:200px;">Request Entry</button>
                </div>
            `;
            const joinBtn = document.getElementById('request-join-btn');
            if (joinBtn) {
                joinBtn.onclick = async () => {
                    await supabase.from('group_members').insert([{ group_id: group.id, user_id: currentUser.id, status: 'pending' }]);
                    alert('Request sent to group admin!');
                    loadGroups();
                    selectGroup(group, 'pending', false);
                };
            }
        }
    }
}

if (groupManageBtn) {
    groupManageBtn.onclick = async () => {
        if (!activeGroup || !messagesContainer) return;
        
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
            const approveBtn = div.querySelector('button');
            if (approveBtn) {
                approveBtn.onclick = async () => {
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
            }
            messagesContainer.appendChild(div);
        }
    };
}

if (groupDeleteBtn) {
    groupDeleteBtn.onclick = async () => {
        if (!activeGroup) return;
        if (confirm(`Warning: Are you sure you want to permanently delete "${activeGroup.name}"?`)) {
            const { error } = await supabase.from('groups').delete().eq('id', activeGroup.id);
            if (error) {
                alert("Delete failed: " + error.message);
                return;
            }
            alert('Group deleted.');
            if (groupActions) groupActions.classList.add('hidden');
            if (activeChatName) activeChatName.textContent = 'Select a user to start chatting';
            if (messagesContainer) messagesContainer.innerHTML = '';
            if (messageForm) messageForm.classList.add('hidden');
            activeGroup = null;
            loadGroups();
            updateMobileLayoutView();
        }
    };
}

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
    if (!messagesContainer) return;
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
    if (!messagesContainer || document.getElementById(`msg-${msg.id}`)) return;

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

if (messageForm) {
    messageForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!messageInput || !imageUpload) return;
        const text = messageInput.value.trim();
        const file = imageUpload.files[0];
        
        if ((!activeChatUser && !activeGroup) || (!text && !file)) return;
        
        messageInput.value = '';
        let imageUrl = null;
        const sendBtn = document.getElementById('send-btn');

        if (file) {
            if (uploadPreview) uploadPreview.classList.remove('hidden');
            if (sendBtn) sendBtn.disabled = true;
            
            const fileExt = file.name.split('.').pop();
            const fileName = `${Date.now()}-${Math.random()}.${fileExt}`;
            const filePath = `${currentUser.id}/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('chat-media')
                .upload(filePath, file);

            if (uploadError) {
                alert("Image Upload Failed: " + uploadError.message);
                if (uploadPreview) uploadPreview.classList.add('hidden');
                if (sendBtn) sendBtn.disabled = false;
                return; 
            }

            const { data } = supabase.storage.from('chat-media').getPublicUrl(filePath);
            imageUrl = data.publicUrl;
            
            imageUpload.value = '';
            if (uploadPreview) uploadPreview.classList.add('hidden');
            if (sendBtn) sendBtn.disabled = false;
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
}

// --- FAIL-SAFE PRESENCE REALTIME ENGINE ---
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
            // Automatically patch status updates across any active layout renderers
            const query = searchInput ? searchInput.value.trim() : '';
            if (query && userList) searchUsers(query);
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

// --- CYCLE BUTTON ENGINE FOR RELIABLE PRESENCE TRACKING ---
if (statusBtn) {
    statusBtn.addEventListener('click', async () => {
        // Cycle status logic
        if (myCurrentStatus === 'Online') myCurrentStatus = 'Away';
        else if (myCurrentStatus === 'Away') myCurrentStatus = 'Busy';
        else myCurrentStatus = 'Online';
        
        // Instant visual confirmation
        statusBtn.textContent = `Status: ${myCurrentStatus}`;
        statusBtn.className = `status-btn-mode ${myCurrentStatus.toLowerCase()}`;
        
        // Transmit state mapping across network channels securely
        if (globalChannel && currentUser) {
            await globalChannel.track({
                user_id: currentUser.id,
                custom_status: myCurrentStatus,
                online_at: new Date().toISOString()
            });
        }
    });
}

if (messageInput) {
    messageInput.addEventListener('input', () => {
        if (!activeChatUser || !globalChannel) return;
        globalChannel.send({ type: 'broadcast', event: 'typing', payload: { sender_id: currentUser.id } });
    });
}

function showTypingUI() {
    if (activeChatStatus) activeChatStatus.classList.add('hidden');
    if (typingIndicator) typingIndicator.classList.remove('hidden');
    clearTimeout(typingTimer);
    typingTimer = setTimeout(stopTypingUI, 2000);
}

function stopTypingUI() {
    if (typingIndicator) typingIndicator.classList.add('hidden');
    updateActiveChatPresenceUI();
}

function scrollToBottom() { 
    if (messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight; 
}

init();
