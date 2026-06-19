import { supabase } from './supabase.js';

// DOM Elements Selection Injection Nodes
const authScreen = document.getElementById('auth-screen');
const chatScreen = document.getElementById('chat-screen');
const authForm = document.getElementById('auth-form');
const toggleAuthText = document.getElementById('toggle-auth');
const signupFields = document.getElementById('signup-fields');
const authBtn = document.getElementById('auth-btn');
const authError = document.getElementById('auth-error');

const logoutBtn = document.getElementById('logout-btn');
const chatLogoutBtn = document.getElementById('chat-logout-btn');
const myProfileName = document.getElementById('my-profile-name');
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const userList = document.getElementById('user-list');

const chatBlanket = document.getElementById('chat-blanket');
const chatActiveFrame = document.getElementById('chat-active-frame');
const activeChatName = document.getElementById('active-chat-name');
const activeChatStatus = document.getElementById('active-chat-status');
const typingIndicator = document.getElementById('typing-indicator');
const messagesContainer = document.getElementById('messages-container');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');

const imageUpload = document.getElementById('image-upload');
const uploadPreview = document.getElementById('upload-preview');

const navBtns = document.querySelectorAll('.nav-tab');
const navPanels = document.querySelectorAll('.nav-panel');
const groupList = document.getElementById('group-list');
const createGroupBtn = document.getElementById('create-group-btn');
const groupActions = document.getElementById('group-actions');
const groupManageBtn = document.getElementById('group-manage-btn');
const groupDeleteBtn = document.getElementById('group-delete-btn');

const addStatusBtn = document.getElementById('add-status-btn');
const myStatusDisplay = document.getElementById('my-status-display');
const globalStatusList = document.getElementById('global-status-list');
const clearSearchBtn = document.getElementById('clear-search-btn');
const searchHistoryContainer = document.getElementById('search-history-container');
const mobileBackBtn = document.getElementById('mobile-back-btn');

// App Runtime State Variables
let isLoginMode = true;
let currentUser = null;
let activeChatUser = null;
let activeGroup = null; 
let globalChannel = null;
let onlineUsers = new Set();
let userStatuses = {}; 
let typingTimer = null;
const profileCache = {};

// 72-Hour Status Limit Metric Constant
const MAX_STATUS_AGE_MS = 72 * 60 * 60 * 1000;

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

// --- VIEW NAVIGATION SYSTEM ---
navBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        navBtns.forEach(b => b.classList.remove('active'));
        navPanels.forEach(p => p.classList.add('hidden'));
        
        e.target.classList.add('active');
        const view = e.target.id.split('-')[1]; // extracts: chats, groups, status
        const panel = document.getElementById(`panel-${view}`);
        if (panel) panel.classList.remove('hidden');
        
        if (view === 'groups') loadGroups();
        if (view === 'status') syncRenderStatusUpdates();
    });
});

function showAuthScreen() {
    if (authScreen) authScreen.classList.remove('hidden');
    if (chatScreen) chatScreen.classList.add('hidden');
    currentUser = null;
    activeChatUser = null;
    activeGroup = null;
    if (globalChannel) supabase.removeChannel(globalChannel);
    updateAdaptiveLayoutUI();
}

function showChatScreen() {
    if (authScreen) authScreen.classList.add('hidden');
    if (chatScreen) chatScreen.classList.remove('hidden');
    updateAdaptiveLayoutUI();
}

function updateAdaptiveLayoutUI() {
    const sidebar = document.getElementById('sidebar-panel');
    const chatArea = document.getElementById('chat-area-panel');
    if (!sidebar || !chatArea) return;

    if (activeChatUser || activeGroup) {
        sidebar.classList.add('mobile-hidden');
        chatArea.classList.remove('mobile-hidden');
        if (chatBlanket) chatBlanket.classList.add('hidden');
        if (chatActiveFrame) chatActiveFrame.classList.remove('hidden');
    } else {
        sidebar.classList.remove('mobile-hidden');
        chatArea.classList.add('mobile-hidden');
        if (chatBlanket) chatBlanket.classList.remove('hidden');
        if (chatActiveFrame) chatActiveFrame.classList.add('hidden');
    }
}

if (mobileBackBtn) {
    mobileBackBtn.addEventListener('click', () => {
        activeChatUser = null;
        activeGroup = null;
        updateAdaptiveLayoutUI();
    });
}

if (toggleAuthText) {
    toggleAuthText.addEventListener('click', () => {
        isLoginMode = !isLoginMode;
        if (signupFields) signupFields.classList.toggle('hidden');
        if (authBtn) authBtn.textContent = isLoginMode ? 'Login' : 'Register';
        toggleAuthText.innerHTML = isLoginMode ? 'Need an account? <span>Register here</span>' : 'Already have an account? <span>Login here</span>';
    });
}

// --- AUTH DATA ENGINE PIPELINES ---
if (authForm) {
    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email')?.value;
        const password = document.getElementById('password')?.value;
        if (authError) authError.classList.add('hidden');

        if (isLoginMode) {
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) showError(error.message);
        } else {
            const username = document.getElementById('username')?.value;
            const full_name = document.getElementById('full_name')?.value;
            
            const { data, error } = await supabase.auth.signUp({ email, password });
            if (error) { showError(error.message); return; }
            
            if (data.user) {
                await supabase.from('profiles').insert([
                    { id: data.user.id, username, full_name, status_text: '', status_created_at: null }
                ]);
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

const handleLogout = () => supabase.auth.signOut();
if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
if (chatLogoutBtn) chatLogoutBtn.addEventListener('click', handleLogout);

async function handleLoginSuccess(user) {
    currentUser = user;
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (data && myProfileName) {
        myProfileName.textContent = data.full_name || 'My Chat';
    }
    showChatScreen();
    connectGlobalRealtime();
    syncRenderStatusUpdates();
}

// --- ACTIVE USERS SEARCH CORE ENGINE ---
if (searchBtn) searchBtn.addEventListener('click', () => triggerSearch());
if (searchInput) searchInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') triggerSearch(); });

function triggerSearch() {
    const query = searchInput?.value.trim();
    if (!query) return;
    saveSearchQuery(query);
    searchUsers(query);
}

async function searchUsers(query) {
    if (!userList) return;
    const { data } = await supabase.from('profiles').select('*').ilike('username', `%${query}%`).neq('id', currentUser.id);
    
    userList.innerHTML = '';
    if (!data || data.length === 0) {
        userList.innerHTML = '<div class="empty-state">No users match query.</div>';
        return;
    }

    data.forEach(user => {
        const isOnline = onlineUsers.has(user.id);
        const statusClass = isOnline ? 'online' : 'offline';
        
        // Runtime expiration verification check
        let currentStatusText = 'Online';
        if (user.status_text && user.status_created_at) {
            const age = Date.now() - Date.parse(user.status_created_at);
            if (age < MAX_STATUS_AGE_MS) currentStatusText = user.status_text;
        }

        const div = document.createElement('div');
        div.className = 'user-item';
        div.innerHTML = `
            <div>
                <strong>${user.full_name}</strong> <br>
                <span class="user-item-username">@${user.username} - <span class="status-preview-text">${currentStatusText}</span></span>
            </div>
            <div class="status-dot ${statusClass}"></div>
        `;
        div.onclick = () => startChat(user);
        userList.appendChild(div);
    });
}

// --- LOCAL STORAGE RECENT QUERY TAGS ---
function saveSearchQuery(query) {
    let history = JSON.parse(localStorage.getItem('portal_search_history')) || [];
    history = history.filter(q => q.toLowerCase() !== query.toLowerCase());
    history.unshift(query);
    if (history.length > 4) history.pop();
    localStorage.setItem('portal_search_history', JSON.stringify(history));
    renderSearchHistory();
}

function renderSearchHistory() {
    if (!searchHistoryContainer) return;
    const history = JSON.parse(localStorage.getItem('portal_search_history')) || [];
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
        localStorage.removeItem('portal_search_history');
        if (searchInput) searchInput.value = '';
        if (userList) userList.innerHTML = '<div class="empty-state">Search context reset.</div>';
        renderSearchHistory();
    });
}

// --- 72-HOUR REACTIVE PROFILE EXPIRING STATUS PIPELINE ---
if (addStatusBtn) {
    addStatusBtn.addEventListener('click', async () => {
        const inputStatus = prompt("Enter your new status note (expires in 72 hours automatically):");
        if (inputStatus === null) return;
        
        const cleanStatus = inputStatus.trim();
        const timestamp = cleanStatus ? new Date().toISOString() : null;

        await supabase.from('profiles').update({
            status_text: cleanStatus,
            status_created_at: timestamp
        }).eq('id', currentUser.id);

        syncRenderStatusUpdates();
    });
}

async function syncRenderStatusUpdates() {
    // 1. Fetch own status payload
    const { data: myProfile } = await supabase.from('profiles').select('*').eq('id', currentUser.id).single();
    if (myProfile && myStatusDisplay) {
        if (myProfile.status_text && myProfile.status_created_at) {
            const myAge = Date.now() - Date.parse(myProfile.status_created_at);
            if (myAge < MAX_STATUS_AGE_MS) {
                const structuralHoursLeft = Math.round((MAX_STATUS_AGE_MS - myAge) / (1000 * 60 * 60));
                myStatusDisplay.innerHTML = `<strong>"${myProfile.status_text}"</strong> <br><span class="time-stamp" style="float:none; display:block; margin-top:4px;">Expires in ~${structuralHoursLeft} hours</span>`;
            } else {
                myStatusDisplay.textContent = 'No current status set';
            }
        } else {
            myStatusDisplay.textContent = 'No current status set';
        }
    }

    // 2. Fetch network-wide statuses
    if (!globalStatusList) return;
    globalStatusList.innerHTML = '';
    
    const { data: allProfiles } = await supabase.from('profiles').select('*').neq('id', currentUser.id);
    let renderedCount = 0;

    if (allProfiles) {
        allProfiles.forEach(p => {
            if (!p.status_text || !p.status_created_at) return;

            const age = Date.now() - Date.parse(p.status_created_at);
            if (age >= MAX_STATUS_AGE_MS) return; // Discard elements exceeding the 72-hour limit

            renderedCount++;
            const hoursLeft = Math.round((MAX_STATUS_AGE_MS - age) / (1000 * 60 * 60));
            const div = document.createElement('div');
            div.className = 'user-item';
            div.style.cursor = 'default';
            div.innerHTML = `
                <div>
                    <strong>${p.full_name}</strong> <span class="user-item-username">@${p.username}</span><br>
                    <span style="color:var(--text-primary); font-size:0.9rem; display:inline-block; margin-top:4px;">"${p.status_text}"</span>
                </div>
                <span class="time-stamp">${hoursLeft}h left</span>
            `;
            globalStatusList.appendChild(div);
        });
    }

    if (renderedCount === 0) {
        globalStatusList.innerHTML = '<div class="empty-state">No status logs recorded across network loops within the last 72 hours.</div>';
    }
}

// --- DYNAMIC DIRECT CONVERSATIONS ROUTER ---
async function startChat(user) {
    activeGroup = null;
    activeChatUser = user;
    if (activeChatName) activeChatName.textContent = user.full_name;
    if (groupActions) groupActions.classList.add('hidden');
    updateAdaptiveLayoutUI();
    updateActiveChatPresenceUI();
    await loadMessages();
}

function updateActiveChatPresenceUI() {
    if (!activeChatUser || !activeChatStatus) return;
    activeChatStatus.classList.remove('hidden');
    const isOnline = onlineUsers.has(activeChatUser.id);
    
    if (isOnline) {
        const livePresenceStatus = userStatuses[activeChatUser.id] || 'Online';
        activeChatStatus.textContent = livePresenceStatus;
        activeChatStatus.className = "status-text online";
    } else {
        activeChatStatus.textContent = 'Offline';
        activeChatStatus.className = 'status-text';
    }
}

// --- CHANNEL GROUP LAYER PROTOCOLS ---
if (createGroupBtn) {
    createGroupBtn.addEventListener('click', async () => {
        const groupName = prompt('Enter group channel name:');
        if (!groupName || !groupName.trim()) return;
        
        const { data, error } = await supabase.from('groups').insert([
            { name: groupName.trim(), admin_id: currentUser.id }
        ]).select().single();
        
        if (error) {
            alert('Group rejected: ' + error.message);
        } else if (data) {
            await supabase.from('group_members').insert([
                { group_id: data.id, user_id: currentUser.id, status: 'approved' }
            ]);
            alert(`Channel group "${groupName}" locked in!`);
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
        groupList.innerHTML = '<div class="empty-state">No active community groups found.</div>';
        return;
    }

    allGroups.forEach(group => {
        const status = membershipMap[group.id]; 
        const isAdmin = group.admin_id === currentUser.id;
        
        let subText = 'Tap to join group';
        if (isAdmin) subText = 'System Group Admin';
        else if (status === 'approved') subText = 'Approved Member';
        else if (status === 'pending') subText = 'Verification Pending';

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
    updateAdaptiveLayoutUI();

    if (isAdmin || status === 'approved') {
        if (groupActions) {
            groupActions.style.setProperty('display', isAdmin ? 'flex' : 'none', 'important');
            if (isAdmin) groupActions.classList.remove('hidden');
        }
        await loadMessages();
    } else if (status === 'pending') {
        if (groupActions) groupActions.classList.add('hidden');
        if (messagesContainer) messagesContainer.innerHTML = '<div class="empty-state">Membership verification is pending admin review.</div>';
    } else {
        if (groupActions) groupActions.classList.add('hidden');
        if (messagesContainer) {
            messagesContainer.innerHTML = `
                <div class="empty-state">
                    <p>Protected Cluster Context.</p>
                    <button id="request-join-btn" class="action-btn" style="margin-top:12px;">Send Entrance Request</button>
                </div>
            `;
            document.getElementById('request-join-btn').onclick = async () => {
                await supabase.from('group_members').insert([{ group_id: group.id, user_id: currentUser.id, status: 'pending' }]);
                alert('Entry request transmitted.');
                loadGroups();
                selectGroup(group, 'pending', false);
            };
        }
    }
}

if (groupManageBtn) {
    groupManageBtn.onclick = async () => {
        if (!activeGroup || !messagesContainer) return;
        const { data: pendings } = await supabase.from('group_members').select('user_id, status').eq('group_id', activeGroup.id).eq('status', 'pending');
        messagesContainer.innerHTML = '<h4 style="padding:10px 0; color:white; border-bottom:1px solid var(--border)">Access Requests Queue</h4>';
        
        if (!pendings || pendings.length === 0) {
            messagesContainer.innerHTML += '<div class="empty-state">No authorization requests pending.</div>';
            return;
        }
        
        for (const p of pendings) {
            const profile = await fetchSenderProfile(p.user_id);
            const div = document.createElement('div');
            div.className = 'user-item';
            div.innerHTML = `
                <div>${profile.full_name} <span class="user-item-username">@${profile.username}</span></div>
                <button class="action-btn" style="max-width:90px; background:var(--accent); color:white; padding:6px;">Accept</button>
            `;
            div.querySelector('button').onclick = async () => {
                await supabase.from('group_members').update({ status: 'approved' }).eq('group_id', activeGroup.id).eq('user_id', p.user_id);
                alert('Access authorized.');
                groupManageBtn.click(); 
            };
            messagesContainer.appendChild(div);
        }
    };
}

if (groupDeleteBtn) {
    groupDeleteBtn.onclick = async () => {
        if (!activeGroup) return;
        if (confirm(`Purge "${activeGroup.name}" context data permanently?`)) {
            await supabase.from('groups').delete().eq('id', activeGroup.id);
            activeGroup = null;
            loadGroups();
            updateAdaptiveLayoutUI();
        }
    };
}

// --- CONVERSATION FEED & GHOST PROTECTION FILTERS ---
async function fetchSenderProfile(userId) {
    if (profileCache[userId]) return profileCache[userId];
    const { data } = await supabase.from('profiles').select('username, full_name').eq('id', userId).single();
    if (data) { profileCache[userId] = data; return data; }
    return { username: 'user', full_name: 'User Node' };
}

async function loadMessages() {
    if (!messagesContainer) return;
    messagesContainer.innerHTML = '';
    let query = supabase.from('messages').select('*');

    if (activeChatUser) {
        query = query.or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${activeChatUser.id}),and(sender_id.eq.${activeChatUser.id},receiver_id.eq.${currentUser.id})`);
    } else if (activeGroup) {
        query = query.eq('group_id', activeGroup.id);
    } else { return; }

    const { data } = await query.order('created_at', { ascending: true });
    if (data) {
        for (const msg of data) { await renderMessage(msg); }
    }
    scrollToBottom();
}

async function renderMessage(msg) {
    if (!messagesContainer || document.getElementById(`msg-${msg.id}`)) return;
    
    // CRITICAL VALIDATION GATE: Absolutely drop rows missing text and images
    if (!msg.message_text && !msg.image_url) return;

    const isSent = msg.sender_id === currentUser.id;
    const div = document.createElement('div');
    div.className = `message ${isSent ? 'msg-sent' : 'msg-recv'}`;
    div.id = `msg-${msg.id}`;

    let content = '';
    if (!isSent && activeGroup) {
        const profile = await fetchSenderProfile(msg.sender_id);
        content += `<small style="color:var(--accent); font-weight:bold; display:block; margin-bottom:4px;">@${profile.username}</small>`;
    }
    if (msg.image_url) content += `<img src="${msg.image_url}" class="message-img">`;
    if (msg.message_text) content += `<span>${msg.message_text}</span>`;
    div.innerHTML = content;

    if (isSent) {
        const delBtn = document.createElement('button');
        delBtn.className = 'delete-btn';
        delBtn.innerHTML = '✖';
        delBtn.onclick = async () => { await supabase.from('messages').delete().match({ id: msg.id }); };
        div.appendChild(delBtn);
    }
    messagesContainer.appendChild(div);
    scrollToBottom();
}

if (messageForm) {
    messageForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = messageInput.value.trim();
        const file = imageUpload.files[0];
        if (!text && !file) return;
        
        messageInput.value = '';
        let imageUrl = null;

        if (file) {
            if (uploadPreview) uploadPreview.classList.remove('hidden');
            const filePath = `${currentUser.id}/${Date.now()}-${file.name}`;
            const { error: uploadError } = await supabase.storage.from('chat-media').upload(filePath, file);

            if (!uploadError) {
                const { data } = supabase.storage.from('chat-media').getPublicUrl(filePath);
                imageUrl = data.publicUrl;
            }
            imageUpload.value = '';
            if (uploadPreview) uploadPreview.classList.add('hidden');
        }

        const packet = { sender_id: currentUser.id, message_text: text || '', image_url: imageUrl };
        if (activeGroup) packet.group_id = activeGroup.id;
        else packet.receiver_id = activeChatUser.id;

        await supabase.from('messages').insert([packet]);
    });
}

// --- GLOBAL SUB-SURFACE REALTIME NETWORK CHANNEL ---
function connectGlobalRealtime() {
    if (globalChannel) supabase.removeChannel(globalChannel);
    globalChannel = supabase.channel('global');

    globalChannel
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async payload => {
            const msg = payload.new;
            if (activeChatUser && ((msg.sender_id === currentUser.id && msg.receiver_id === activeChatUser.id) || (msg.sender_id === activeChatUser.id && msg.receiver_id === currentUser.id))) {
                await renderMessage(msg);
                stopTypingUI();
            } else if (activeGroup && msg.group_id === activeGroup.id) {
                await renderMessage(msg);
            }
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, payload => {
            document.getElementById(`msg-${payload.old.id}`)?.remove();
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
        })
        .on('broadcast', { event: 'typing' }, payload => {
            if (activeChatUser && payload.payload.sender_id === activeChatUser.id) showTypingUI();
        })
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await globalChannel.track({
                    user_id: currentUser.id,
                    custom_status: 'Online',
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

function scrollToBottom() { if (messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight; }

init();
