import { supabase } from './supabase.js';

// DOM Elements Initialization
const authScreen = document.getElementById('auth-screen');
const chatScreen = document.getElementById('chat-screen');
const authForm = document.getElementById('auth-form');
const toggleAuthText = document.getElementById('toggle-auth');
const signupFields = document.getElementById('signup-fields');
const authBtn = document.getElementById('auth-btn');
const authError = document.getElementById('auth-error');
const logoutBtn = document.getElementById('logout-btn');

// Profile Elements
const myProfileName = document.getElementById('my-profile-name');
const myProfileUsername = document.getElementById('my-profile-username');
const myProfileAvatar = document.getElementById('my-profile-avatar');
const profileImageUpload = document.getElementById('profile-image-upload');

const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const settingsCloseBtn = document.getElementById('settings-close-btn');
const settingFullname = document.getElementById('setting-fullname');
const settingUsername = document.getElementById('setting-username');
const settingsSaveBtn = document.getElementById('settings-save-btn');

const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const userList = document.getElementById('user-list');
const activeChatName = document.getElementById('active-chat-name');
const activeChatAvatar = document.getElementById('active-chat-avatar');
const activeChatStatus = document.getElementById('active-chat-status');
const typingIndicator = document.getElementById('typing-indicator');
const messagesContainer = document.getElementById('messages-container');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const fileUpload = document.getElementById('file-upload');
const uploadPreview = document.getElementById('upload-preview');
const navBtns = document.querySelectorAll('.nav-btn');
const navPanels = document.querySelectorAll('.nav-panel');

// Voice Note Elements
const recordVoiceBtn = document.getElementById('record-voice-btn');
const recordTimerDisplay = document.getElementById('record-timer');

// Call Elements
const callActions = document.getElementById('call-actions');
const audioCallBtn = document.getElementById('audio-call-btn');
const videoCallBtn = document.getElementById('video-call-btn');
const callModal = document.getElementById('call-modal');
const callTitle = document.getElementById('call-title');
const callTimerDisplay = document.getElementById('call-timer-display');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const callAcceptBtn = document.getElementById('call-accept-btn');
const callMuteBtn = document.getElementById('call-mute-btn');
const callCamBtn = document.getElementById('call-cam-btn');
const callEndBtn = document.getElementById('call-end-btn');

// Group Elements
const groupList = document.getElementById('group-list');
const createGroupBtn = document.getElementById('create-group-btn');
const groupActions = document.getElementById('group-actions');
const groupManageBtn = document.getElementById('group-manage-btn');
const groupDeleteBtn = document.getElementById('group-delete-btn');
const groupLeaveBtn = document.getElementById('group-leave-btn');
const groupAddMemberBtn = document.getElementById('group-add-member-btn');
const groupAvatarBtn = document.getElementById('group-avatar-btn');
const groupAvatarUpload = document.getElementById('group-avatar-upload');
const addMemberModal = document.getElementById('add-member-modal');
const addMemberCloseBtn = document.getElementById('add-member-close-btn');
const addMemberList = document.getElementById('add-member-list');

// Status Elements
const addPhotoStatusBtn = document.getElementById('add-photo-status-btn');
const addTextStatusBtn = document.getElementById('add-text-status-btn');
const textStatusContainer = document.getElementById('text-status-container');
const textStatusInput = document.getElementById('text-status-input');
const statusBgColor = document.getElementById('status-bg-color');
const statusPrivacy = document.getElementById('status-privacy');
const submitTextStatusBtn = document.getElementById('submit-text-status-btn');
const statusImageUpload = document.getElementById('status-image-upload');
const statusList = document.getElementById('status-list');
const statusViewer = document.getElementById('status-viewer');
const statusViewerClose = document.getElementById('status-viewer-close');
const statusViewerHeader = document.getElementById('status-viewer-header');
const statusViewerImg = document.getElementById('status-viewer-img');
const statusViewerText = document.getElementById('status-viewer-text');
const statusActions = document.getElementById('status-actions');
const statusDeleteBtn = document.getElementById('status-delete-btn');

// Application State
let isLoginMode = true;
let currentUser = null;
let currentProfile = null;
let activeChatUser = null;
let activeGroup = null;
let globalChannel = null;
let onlineUsers = new Set();
let typingTimer = null;
let activeStatusView = null; // To track what status is being viewed

// Voice Note State
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let recordTimerInterval = null;
let recordSeconds = 0;

// WebRTC State
let localStream = null;
let peerConnection = null;
let isCallActive = false;
let currentCallType = 'audio'; 
let incomingCallData = null;
let callDurationInterval = null;
let callSeconds = 0;
let isAudioMuted = false;
let isVideoMuted = false;

const rtcConfig = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

// --- AUTHENTICATION ---
supabase.auth.getSession().then(({ data: { session } }) => {
  if (session) {
    handleLoginSuccess(session.user);
  } else {
    showAuthScreen();
  }
});

supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN') {
    handleLoginSuccess(session.user);
  } else if (event === 'SIGNED_OUT') {
    showAuthScreen();
  }
});

navBtns.forEach(btn => {
  btn.addEventListener('click', (e) => {
    navBtns.forEach(b => b.classList.remove('active'));
    navPanels.forEach(p => p.classList.add('hidden'));
    const target = e.currentTarget;
    target.classList.add('active');
    const view = target.id.split('-')[1];
    document.getElementById(`panel-${view}`).classList.remove('hidden');
    
    if (view === 'groups') loadGroups();
    else if (view === 'status') loadStatuses();
  });
});

function showAuthScreen() {
  authScreen.classList.remove('hidden');
  chatScreen.classList.add('hidden');
  currentUser = null;
  currentProfile = null;
  activeChatUser = null;
  activeGroup = null;
  if (globalChannel) {
    supabase.removeChannel(globalChannel);
    globalChannel = null;
  }
}

function showChatScreen() {
  authScreen.classList.add('hidden');
  chatScreen.classList.remove('hidden');
}

toggleAuthText.addEventListener('click', () => {
  isLoginMode = !isLoginMode;
  signupFields.classList.toggle('hidden');
  authBtn.textContent = isLoginMode ? 'Login' : 'Register';
  toggleAuthText.innerHTML = isLoginMode 
    ? 'Need an account? <span>Register here</span>' 
    : 'Already have an account? <span>Login here</span>';
  document.getElementById('username').required = !isLoginMode;
  document.getElementById('full_name').required = !isLoginMode;
});

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  authError.classList.add('hidden');
  authBtn.disabled = true;
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  try {
    if (isLoginMode) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } else {
      const username = document.getElementById('username').value.trim().toLowerCase().replace(/\s+/g, '');
      const full_name = document.getElementById('full_name').value.trim();
      
      const { data: existing } = await supabase.from('profiles').select('id').eq('username', username).single();
      if (existing) throw new Error("Username is already taken.");
      
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      if (data.user) {
        const { error: profileError } = await supabase.from('profiles').insert([{ id: data.user.id, username, full_name }]);
        if (profileError) throw profileError;
      }
    }
  } catch (err) {
    showError(err.message);
  } finally {
    authBtn.disabled = false;
  }
});

function showError(msg) {
  authError.textContent = msg;
  authError.classList.remove('hidden');
}

logoutBtn.addEventListener('click', () => supabase.auth.signOut());

async function handleLoginSuccess(user) {
  currentUser = user;
  try {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (error) throw error;
    currentProfile = data;
    updateProfileUI(data);
    showChatScreen();
    connectGlobalRealtime();
  } catch (err) {
    console.error("Profile resolution error:", err.message);
  }
}

function updateProfileUI(profile) {
    myProfileName.textContent = profile?.full_name || 'My Chat';
    myProfileUsername.textContent = `@${profile?.username || 'user'}`;
    if (profile?.avatar_url) myProfileAvatar.src = profile.avatar_url;
}

// --- PROFILE EDITING (Settings Modal) ---
settingsBtn.addEventListener('click', () => {
    settingFullname.value = currentProfile?.full_name || '';
    settingUsername.value = currentProfile?.username || '';
    settingsModal.classList.remove('hidden');
});

settingsCloseBtn.addEventListener('click', () => settingsModal.classList.add('hidden'));

settingsSaveBtn.addEventListener('click', async () => {
    const newUsername = settingUsername.value.trim().toLowerCase().replace(/\s+/g, '');
    const newFullname = settingFullname.value.trim();
    if(!newUsername || !newFullname) return alert("Fields cannot be empty.");

    try {
        if(newUsername !== currentProfile.username) {
            const { data: existing } = await supabase.from('profiles').select('id').eq('username', newUsername).maybeSingle();
            if (existing && existing.id !== currentUser.id) return alert("That username is already taken.");
        }
        
        const { error } = await supabase.from('profiles').update({ 
            username: newUsername, 
            full_name: newFullname 
        }).eq('id', currentUser.id);
        
        if (error) throw error;
        currentProfile.username = newUsername;
        currentProfile.full_name = newFullname;
        updateProfileUI(currentProfile);
        settingsModal.classList.add('hidden');
        alert("Profile updated successfully!");
    } catch (err) { alert("Failed to update profile: " + err.message); }
});

myProfileAvatar.addEventListener('click', () => {
  const action = prompt("Profile Photo: Type 'U' to upload a new photo, or 'D' to delete the current one.", "U");
  if (action?.toUpperCase() === 'U') profileImageUpload.click();
  else if (action?.toUpperCase() === 'D') updateProfileAvatar(null);
});

profileImageUpload.addEventListener('change', async () => {
  const file = profileImageUpload.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) return alert("File limit exceeded (Max 5MB).");
  
  try {
    const fileExt = file.name.split('.').pop();
    const filePath = `avatars/${currentUser.id}-${Date.now()}.${fileExt}`;
    const { error: uploadError } = await supabase.storage.from('chat-media').upload(filePath, file);
    if (uploadError) throw uploadError;
    const { data } = supabase.storage.from('chat-media').getPublicUrl(filePath);
    await updateProfileAvatar(data.publicUrl);
  } catch (err) { alert("Avatar Upload Error: " + err.message); } 
  finally { profileImageUpload.value = ''; }
});

async function updateProfileAvatar(url) {
  try {
    const { error } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', currentUser.id);
    if (error) throw error;
    myProfileAvatar.src = url || 'https://via.placeholder.com/40';
  } catch (err) { alert("Failed to update profile: " + err.message); }
}

// --- USER SEARCH ---
searchBtn.addEventListener('click', searchUsers);
searchInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') searchUsers(); });

async function searchUsers() {
  const query = searchInput.value.trim();
  if (!query) return;
  try {
    const { data, error } = await supabase.from('profiles').select('*').ilike('username', `%${query}%`).neq('id', currentUser.id);
    if (error) throw error;
    userList.innerHTML = '';
    (data || []).forEach(user => {
      const isOnline = onlineUsers.has(user.id);
      const div = document.createElement('div');
      div.className = 'user-item';
      
      const wrap = document.createElement('div');
      wrap.style.display = 'flex'; wrap.style.alignItems = 'center'; wrap.style.gap = '10px';
      
      const img = document.createElement('img');
      img.src = user.avatar_url || 'https://via.placeholder.com/40';
      img.className = 'status-img-thumb';
      img.style.width = '35px'; img.style.height = '35px';
      
      const infoContainer = document.createElement('div');
      const nameSpan = document.createElement('span'); nameSpan.textContent = user.full_name;
      const metaSpan = document.createElement('span'); metaSpan.className = 'user-item-username'; metaSpan.textContent = ` @${user.username}`;
      infoContainer.appendChild(nameSpan); infoContainer.appendChild(document.createElement('br')); infoContainer.appendChild(metaSpan);
      
      wrap.appendChild(img); wrap.appendChild(infoContainer);
      const dot = document.createElement('div');
      dot.className = `status-dot ${isOnline ? 'online' : ''}`;
      
      div.appendChild(wrap); div.appendChild(dot);
      div.onclick = () => startChat(user);
      userList.appendChild(div);
    });
  } catch (err) { console.error(err.message); }
}

async function startChat(user) {
  activeGroup = null;
  activeChatUser = user;
  activeChatName.textContent = user.full_name;
  activeChatAvatar.src = user.avatar_url || 'https://via.placeholder.com/40';
  activeChatAvatar.classList.remove('hidden');
  groupActions.classList.add('hidden');
  callActions.classList.remove('hidden');
  messageForm.classList.remove('hidden');
  updateActiveChatPresenceUI();
  await loadMessages();
}

function updateActiveChatPresenceUI() {
  if (!activeChatUser) return;
  activeChatStatus.classList.remove('hidden');
  const isOnline = onlineUsers.has(activeChatUser.id);
  activeChatStatus.textContent = isOnline ? 'Online' : 'Offline';
  activeChatStatus.className = `status-text ${isOnline ? 'online' : ''}`;
}

// --- GROUPS ---
createGroupBtn.addEventListener('click', async () => {
  const groupName = prompt('Enter a name for your new group:');
  if (!groupName || !groupName.trim()) return;
  const groupPass = prompt('Enter a password to make this private, or leave blank to make it open (admin-approval):');
  
  try {
    const { data, error } = await supabase.from('groups')
      .insert([{ name: groupName.trim(), admin_id: currentUser.id, group_password: groupPass || null }])
      .select().single();
    if (error) throw error;
    if (data) {
      await supabase.from('group_members').insert([{ group_id: data.id, user_id: currentUser.id, status: 'approved' }]);
      alert(`Group "${groupName.trim()}" created successfully!`);
      loadGroups();
    }
  } catch (err) { alert('Failed to create group: ' + err.message); }
});

async function loadGroups() {
  try {
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
      
      let subText = group.group_password ? '🔒 Password Protected' : 'Open (Click to request)';
      if (isAdmin) subText = 'You are the Admin';
      else if (status === 'approved') subText = 'Member';
      else if (status === 'pending') subText = 'Pending Admin Approval';
      
      const div = document.createElement('div'); div.className = 'user-item';
      const wrap = document.createElement('div'); wrap.style.display = 'flex'; wrap.style.alignItems = 'center'; wrap.style.gap = '10px';
      const img = document.createElement('img');
      img.src = group.avatar_url || 'https://via.placeholder.com/40?text=Grp';
      img.className = 'status-img-thumb'; img.style.width = '35px'; img.style.height = '35px';
      
      const textWrap = document.createElement('div');
      const titleStrong = document.createElement('strong'); titleStrong.textContent = group.name;
      const subSpan = document.createElement('span'); subSpan.className = 'user-item-username'; subSpan.textContent = subText;
      textWrap.appendChild(titleStrong); textWrap.appendChild(document.createElement('br')); textWrap.appendChild(subSpan);
      
      wrap.appendChild(img); wrap.appendChild(textWrap); div.appendChild(wrap);
      div.onclick = () => selectGroup(group, status, isAdmin);
      groupList.appendChild(div);
    });
  } catch (err) { console.error(err.message); }
}

async function selectGroup(group, status, isAdmin) {
  activeChatUser = null;
  activeGroup = group;
  activeChatName.textContent = group.name;
  activeChatAvatar.src = group.avatar_url || 'https://via.placeholder.com/40?text=Grp';
  activeChatAvatar.classList.remove('hidden');
  activeChatStatus.classList.add('hidden');
  callActions.classList.add('hidden'); 
  
  if (isAdmin || status === 'approved') {
    groupActions.style.display = 'flex';
    groupActions.classList.remove('hidden');
    
    // Toggle Admin Specific Actions
    groupManageBtn.style.display = isAdmin ? 'block' : 'none';
    groupDeleteBtn.style.display = isAdmin ? 'block' : 'none';
    groupAvatarBtn.style.display = isAdmin ? 'block' : 'none';
    
    // Non-admins can leave
    groupLeaveBtn.style.display = isAdmin ? 'none' : 'block';
    // Members can add members (or limit to admin if you want, doing all members here)
    groupAddMemberBtn.style.display = 'block';

    messageForm.classList.remove('hidden');
    await loadMessages();
  } else if (status === 'pending') {
    groupActions.classList.add('hidden'); messageForm.classList.add('hidden');
    messagesContainer.innerHTML = '<div class="empty-state">Your entry request is pending admin approval.</div>';
  } else {
    groupActions.classList.add('hidden'); messageForm.classList.add('hidden');
    const container = document.createElement('div'); container.className = 'empty-state';
    const p = document.createElement('p'); p.textContent = 'You are not a member of this group.';
    const reqBtn = document.createElement('button'); reqBtn.className = 'action-btn';
    reqBtn.style.marginTop = '10px'; reqBtn.style.maxWidth = '200px';
    reqBtn.textContent = group.group_password ? 'Enter Password to Join' : 'Request Entry';
    
    reqBtn.onclick = async () => {
      if (group.group_password) {
        const passAttempt = prompt("This group is private. Please enter the password:");
        if (passAttempt === group.group_password) {
          await supabase.from('group_members').insert([{ group_id: group.id, user_id: currentUser.id, status: 'approved' }]);
          alert('Password accepted. You are now a member!'); loadGroups(); selectGroup(group, 'approved', false);
        } else if (passAttempt !== null) alert('Incorrect password.');
      } else {
        await supabase.from('group_members').insert([{ group_id: group.id, user_id: currentUser.id, status: 'pending' }]);
        alert('Request sent to group admin!'); loadGroups(); selectGroup(group, 'pending', false);
      }
    };
    container.appendChild(p); container.appendChild(reqBtn);
    messagesContainer.innerHTML = ''; messagesContainer.appendChild(container);
  }
}

// Leave Group
groupLeaveBtn.addEventListener('click', async () => {
    if(!activeGroup || !confirm(`Are you sure you want to leave ${activeGroup.name}?`)) return;
    try {
        await supabase.from('group_members').delete().match({ group_id: activeGroup.id, user_id: currentUser.id });
        alert(`You left ${activeGroup.name}`);
        activeGroup = null;
        activeChatName.textContent = "Select a user to start chatting";
        activeChatAvatar.classList.add('hidden');
        groupActions.classList.add('hidden');
        messagesContainer.innerHTML = '';
        messageForm.classList.add('hidden');
        loadGroups();
    } catch(err) { alert("Failed to leave: " + err.message); }
});

// Add Member to Group UI
groupAddMemberBtn.addEventListener('click', async () => {
    if(!activeGroup) return;
    try {
        // Fetch all users NOT currently in this group
        const { data: members } = await supabase.from('group_members').select('user_id').eq('group_id', activeGroup.id);
        const memberIds = members.map(m => m.user_id);
        
        const { data: users } = await supabase.from('profiles').select('*');
        addMemberList.innerHTML = '';
        
        const availableUsers = users.filter(u => !memberIds.includes(u.id));
        if(availableUsers.length === 0) {
            addMemberList.innerHTML = '<div class="empty-state">No users available to add.</div>';
        } else {
            availableUsers.forEach(u => {
                const div = document.createElement('div');
                div.className = 'user-item';
                div.innerHTML = `
                    <div style="display:flex; align-items:center; gap:10px;">
                        <img src="${u.avatar_url || 'https://via.placeholder.com/40'}" class="status-img-thumb" style="width:30px;height:30px;">
                        <div>
                            <strong>${u.full_name}</strong><br>
                            <span class="user-item-username">@${u.username}</span>
                        </div>
                    </div>
                    <button class="action-btn" style="width:auto; padding:5px 15px; font-size:0.8rem;">Add</button>
                `;
                div.querySelector('button').onclick = async () => {
                    await supabase.from('group_members').insert([{ group_id: activeGroup.id, user_id: u.id, status: 'approved' }]);
                    alert(`${u.full_name} added to the group!`);
                    div.remove();
                };
                addMemberList.appendChild(div);
            });
        }
        addMemberModal.classList.remove('hidden');
    } catch(err) { console.error(err); }
});

addMemberCloseBtn.addEventListener('click', () => addMemberModal.classList.add('hidden'));

// --- STATUS SYSTEM ---
addPhotoStatusBtn.addEventListener('click', () => statusImageUpload.click());

addTextStatusBtn.addEventListener('click', () => { 
  textStatusContainer.classList.toggle('hidden'); 
  if (!textStatusContainer.classList.contains('hidden')) textStatusInput.focus(); 
});

submitTextStatusBtn.addEventListener('click', () => { 
  const text = textStatusInput.value.trim();
  const color = statusBgColor.value;
  const priv = statusPrivacy.value;
  if (text) saveStatusToDatabase('text', text, color, priv);
});

statusImageUpload.addEventListener('change', async () => { 
  const file = statusImageUpload.files[0];
  if (!file) return;
  const priv = statusPrivacy.value || 'public'; // Image UI defaults to public unless built otherwise
  try {
    const fileExt = file.name.split('.').pop();
    const filePath = `statuses/${currentUser.id}-${Date.now()}.${fileExt}`;
    
    const { error: uploadError } = await supabase.storage.from('chat-media').upload(filePath, file);
    if (uploadError) throw uploadError;
    
    const { data } = supabase.storage.from('chat-media').getPublicUrl(filePath);
    await saveStatusToDatabase('image', data.publicUrl, '#202c33', priv);
  } catch (err) { 
    alert("Status Upload Error: " + err.message); 
  } finally { 
    statusImageUpload.value = ''; 
  }
});

async function saveStatusToDatabase(type, content, bgColor = '#202c33', privacy = 'public') { 
  try {
    const { error } = await supabase.from('statuses').insert([
      { user_id: currentUser.id, type: type, content: content, bg_color: bgColor, privacy: privacy }
    ]);
    if (error) throw error;
    
    textStatusInput.value = '';
    textStatusContainer.classList.add('hidden');
    loadStatuses();
  } catch (err) { 
    alert("Failed to save status: " + err.message); 
  }
}

async function loadStatuses() { 
  try {
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    // Fetch all recent statuses
    const { data, error } = await supabase
      .from('statuses')
      .select('*, profiles(username, full_name, avatar_url)')
      .gte('created_at', yesterday)
      .order('created_at', { ascending: false });

    if (error) throw error;
    
    statusList.innerHTML = '';
    
    // Filter logic: Only show public statuses OR if I am the owner
    const visibleStatuses = (data || []).filter(st => st.privacy === 'public' || st.user_id === currentUser.id);

    if (visibleStatuses.length === 0) {
      statusList.innerHTML = '<div class="empty-state">No recent statuses.</div>';
      return;
    }

    visibleStatuses.forEach(status => {
      const div = document.createElement('div');
      div.className = 'user-item';
      div.innerHTML = `
        <div style="display:flex; align-items:center; gap:10px;">
          <img src="${status.profiles?.avatar_url || 'https://via.placeholder.com/40'}" class="status-img-thumb" style="width:35px;height:35px;">
          <div>
            <strong>${status.profiles?.full_name || 'User'}</strong> 
            ${status.privacy === 'private' ? '🔒' : ''}<br>
            <span style="font-size: 0.75rem; color: var(--text-secondary)">${new Date(status.created_at).toLocaleTimeString()}</span>
          </div>
        </div>
      `;
      div.onclick = () => openStatusViewer(status);
      statusList.appendChild(div);
    });
  } catch (err) { 
    console.error("Failed to load statuses:", err.message); 
  }
}

function openStatusViewer(status) { 
  activeStatusView = status;
  statusViewer.classList.remove('hidden');
  statusViewerHeader.textContent = `${status.profiles?.full_name}'s Status ${status.privacy === 'private' ? '(Private)' : ''}`;
  
  if(status.user_id === currentUser.id) {
      statusActions.classList.remove('hidden');
  } else {
      statusActions.classList.add('hidden');
  }

  if (status.type === 'image') {
    statusViewerImg.src = status.content;
    statusViewerImg.classList.remove('hidden');
    statusViewerText.classList.add('hidden');
    statusViewerText.style.background = 'transparent';
  } else {
    statusViewerText.textContent = status.content;
    statusViewerText.style.background = status.bg_color || 'var(--bg-panel)';
    statusViewerText.classList.remove('hidden');
    statusViewerImg.classList.add('hidden');
  }
}

statusViewerClose.addEventListener('click', () => { 
  statusViewer.classList.add('hidden'); 
  statusViewerImg.src = ''; 
  statusViewerText.textContent = ''; 
  activeStatusView = null;
});

statusDeleteBtn.addEventListener('click', async () => {
    if(!activeStatusView) return;
    try {
        await supabase.from('statuses').delete().match({ id: activeStatusView.id });
        statusViewerClose.click();
        loadStatuses();
    } catch(err) { alert("Failed to delete: " + err.message); }
});

// --- MEDIA HANDLING (Audio / Video / PDF) ---
function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024; const dm = decimals < 0 ? 0 : decimals; const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

// --- REALTIME MESSAGING ---
async function loadMessages() {
  messagesContainer.innerHTML = ''; let query = supabase.from('messages').select('*');
  if (activeChatUser) query = query.or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${activeChatUser.id}),and(sender_id.eq.${activeChatUser.id},receiver_id.eq.${currentUser.id})`);
  else if (activeGroup) query = query.eq('group_id', activeGroup.id);
  else return;
  const { data, error } = await query.order('created_at', { ascending: true });
  if (data) data.forEach(renderMessage); scrollToBottom();
}

function renderMessage(msg) {
  let div = document.getElementById(`msg-${msg.id}`);
  const isSent = msg.sender_id === currentUser.id;

  if (!div) {
      div = document.createElement('div'); 
      div.className = `message ${isSent ? 'msg-sent' : 'msg-recv'}`; 
      div.id = `msg-${msg.id}`;
      messagesContainer.appendChild(div);
  } else {
      div.innerHTML = ''; // Clear for re-render if it's an update
  }
  
  const fileUrl = msg.file_url || msg.image_url; 
  if (fileUrl) {
      const fType = msg.file_type || (msg.image_url ? 'image/jpeg' : '');
      
      if (fType.startsWith('image/')) {
          const img = document.createElement('img'); img.src = fileUrl; img.className = 'message-img';
          div.appendChild(img);
      } else if (fType.startsWith('video/')) {
          const vid = document.createElement('video'); vid.src = fileUrl; vid.controls = true; vid.className = 'message-video';
          div.appendChild(vid);
      } else if (fType.startsWith('audio/')) {
          const aud = document.createElement('audio'); aud.src = fileUrl; aud.controls = true; aud.className = 'message-audio';
          div.appendChild(aud);
      } else if (fType === 'application/pdf') {
          const pdfLink = document.createElement('a'); pdfLink.href = fileUrl; pdfLink.target = '_blank'; pdfLink.className = 'message-pdf';
          pdfLink.innerHTML = `
            <div class="pdf-icon">📄</div>
            <div class="pdf-info">
              <span class="pdf-name">${msg.file_name || 'Document.pdf'}</span>
              <span class="pdf-size">${msg.file_size ? formatBytes(msg.file_size) : 'Download'}</span>
            </div>
          `;
          div.appendChild(pdfLink);
      }
      div.appendChild(document.createElement('br'));
  }

  if (msg.message_text) { 
      const textSpan = document.createElement('span'); 
      textSpan.className = 'msg-text-content';
      textSpan.textContent = msg.message_text; 
      div.appendChild(textSpan); 
      if(msg.is_edited) {
          const editedTag = document.createElement('span');
          editedTag.className = 'edited-tag';
          editedTag.textContent = '(edited)';
          div.appendChild(editedTag);
      }
  }
  
  const timeSpan = document.createElement('span'); timeSpan.className = 'message-time';
  timeSpan.textContent = msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  div.appendChild(timeSpan);
  
  if (isSent) {
    const actionWrap = document.createElement('div');
    actionWrap.className = 'msg-actions';

    if(msg.message_text) {
        const editBtn = document.createElement('button');
        editBtn.className = 'msg-action-btn';
        editBtn.textContent = '✏️';
        editBtn.title = 'Edit Message';
        editBtn.onclick = async () => {
            const newText = prompt("Edit message:", msg.message_text);
            if(newText !== null && newText.trim() !== '' && newText !== msg.message_text) {
                await supabase.from('messages').update({ message_text: newText.trim(), is_edited: true }).match({ id: msg.id });
            }
        };
        actionWrap.appendChild(editBtn);
    }

    const delBtn = document.createElement('button'); 
    delBtn.className = 'msg-action-btn'; 
    delBtn.textContent = '✖';
    delBtn.title = 'Delete Message';
    delBtn.onclick = async () => { await supabase.from('messages').delete().match({ id: msg.id }); }; 
    
    actionWrap.appendChild(delBtn);
    div.appendChild(actionWrap);
  }
  scrollToBottom();
}

messageForm.addEventListener('submit', async (e) => {
  e.preventDefault(); 
  const text = messageInput.value.trim(); 
  const file = fileUpload.files[0];
  if ((!activeChatUser && !activeGroup) || (!text && !file)) return;
  
  messageInput.value = ''; 
  let fUrl = null;
  let fType = null;
  let fName = null;
  let fSize = null;
  
  if (file) {
    if (file.size > 50 * 1024 * 1024) return alert("Files must be under 50MB."); 
    
    uploadPreview.textContent = `Uploading ${file.name}...`;
    uploadPreview.classList.remove('hidden'); 
    document.getElementById('send-btn').disabled = true;
    
    const fileExt = file.name.split('.').pop(); 
    const filePath = `messages/${currentUser.id}/${Date.now()}-${Math.random()}.${fileExt}`;
    
    const { error: uploadError } = await supabase.storage.from('chat-media').upload(filePath, file);
    if (uploadError) { 
        alert("Upload error: " + uploadError.message); 
        uploadPreview.classList.add('hidden'); 
        document.getElementById('send-btn').disabled = false; 
        return; 
    }
    
    const { data } = supabase.storage.from('chat-media').getPublicUrl(filePath); 
    fUrl = data.publicUrl;
    fType = file.type || 'application/octet-stream';
    fName = file.name;
    fSize = file.size;
    
    fileUpload.value = ''; 
    uploadPreview.classList.add('hidden'); 
    document.getElementById('send-btn').disabled = false;
  }
  
  if (text || fUrl) {
    const packet = { 
        sender_id: currentUser.id, 
        message_text: text || '', 
        file_url: fUrl,
        file_type: fType,
        file_name: fName,
        file_size: fSize,
        image_url: (fType && fType.startsWith('image/')) ? fUrl : null,
        is_edited: false
    };
    if (activeGroup) packet.group_id = activeGroup.id; else packet.receiver_id = activeChatUser.id;
    await supabase.from('messages').insert([packet]);
  }
});

// --- VOICE NOTES ---
recordVoiceBtn.addEventListener('click', async () => {
    if (!isRecording) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            
            mediaRecorder.ondataavailable = e => { if(e.data.size > 0) audioChunks.push(e.data); };
            mediaRecorder.onstop = async () => {
                clearInterval(recordTimerInterval);
                recordTimerDisplay.classList.add('hidden');
                recordVoiceBtn.classList.remove('recording');
                
                if (audioChunks.length === 0) return;
                
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                await uploadAndSendAudio(audioBlob);
            };
            
            mediaRecorder.start();
            isRecording = true;
            recordSeconds = 0;
            recordTimerDisplay.textContent = '0:00';
            recordTimerDisplay.classList.remove('hidden');
            recordVoiceBtn.classList.add('recording');
            
            recordTimerInterval = setInterval(() => {
                recordSeconds++;
                const m = Math.floor(recordSeconds / 60);
                const s = recordSeconds % 60;
                recordTimerDisplay.textContent = `${m}:${s.toString().padStart(2, '0')}`;
            }, 1000);
            
        } catch (err) { alert("Microphone access denied or unavailable."); }
    } else {
        mediaRecorder.stop();
        isRecording = false;
    }
});

async function uploadAndSendAudio(blob) {
    if (!activeChatUser && !activeGroup) return;
    uploadPreview.textContent = `Uploading Voice Note...`;
    uploadPreview.classList.remove('hidden');
    
    const filePath = `messages/${currentUser.id}/audio-${Date.now()}.webm`;
    const { error: uploadError } = await supabase.storage.from('chat-media').upload(filePath, blob);
    
    if (uploadError) {
        alert("Audio upload failed: " + uploadError.message);
        uploadPreview.classList.add('hidden');
        return;
    }
    
    const { data } = supabase.storage.from('chat-media').getPublicUrl(filePath);
    
    const packet = { 
        sender_id: currentUser.id, 
        message_text: '', 
        file_url: data.publicUrl,
        file_type: 'audio/webm',
        file_name: 'Voice Note',
        file_size: blob.size
    };
    
    if (activeGroup) packet.group_id = activeGroup.id; else packet.receiver_id = activeChatUser.id;
    await supabase.from('messages').insert([packet]);
    uploadPreview.classList.add('hidden');
}


// --- WEBRTC CALLING ---
audioCallBtn.onclick = () => startCall('audio');
videoCallBtn.onclick = () => startCall('video');

async function startCall(type) {
    if (!activeChatUser) return;
    currentCallType = type;
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === 'video' });
        showCallUI(`Calling ${activeChatUser.full_name}...`, true);
        setupPeerConnection();
        
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
        localVideo.srcObject = localStream;
        if(type === 'audio') localVideo.classList.add('hidden'); else localVideo.classList.remove('hidden');
        
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        sendSignalingMessage({ action: 'offer', data: offer, callType: type });
    } catch (err) {
        alert("Could not access media devices: " + err.message);
    }
}

function handleIncomingCall(payload) {
    if (isCallActive) return; 
    incomingCallData = payload;
    currentCallType = payload.callType;
    showCallUI(`Incoming ${currentCallType} call...`, false);
}

callAcceptBtn.onclick = async () => {
    if (!incomingCallData) return;
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: currentCallType === 'video' });
        setupPeerConnection();
        
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
        localVideo.srcObject = localStream;
        if(currentCallType === 'audio') localVideo.classList.add('hidden'); else localVideo.classList.remove('hidden');
        
        await peerConnection.setRemoteDescription(new RTCSessionDescription(incomingCallData.data));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        sendSignalingMessage({ action: 'answer', data: answer, target_id: incomingCallData.sender_id });
        
        callAcceptBtn.classList.add('hidden');
        callTitle.textContent = "In Call";
        startCallTimer();
        isCallActive = true;
    } catch (err) { alert("Could not access media devices."); endCall(); }
};

callEndBtn.onclick = () => {
    sendSignalingMessage({ action: 'end' });
    endCall();
};

function setupPeerConnection() {
    peerConnection = new RTCPeerConnection(rtcConfig);
    peerConnection.onicecandidate = e => {
        if (e.candidate) sendSignalingMessage({ action: 'ice-candidate', data: e.candidate });
    };
    peerConnection.ontrack = e => {
        remoteVideo.srcObject = e.streams[0];
        if(currentCallType === 'audio') remoteVideo.classList.add('hidden'); else remoteVideo.classList.remove('hidden');
    };
    peerConnection.onconnectionstatechange = () => {
        if (peerConnection.connectionState === 'disconnected' || peerConnection.connectionState === 'failed') endCall();
    };
}

function sendSignalingMessage(payload) {
    payload.sender_id = currentUser.id;
    payload.target_id = payload.target_id || activeChatUser.id;
    globalChannel.send({ type: 'broadcast', event: 'webrtc', payload });
}

function showCallUI(titleText, isCaller) {
    callModal.classList.remove('hidden');
    callTitle.textContent = titleText;
    callAcceptBtn.classList.toggle('hidden', isCaller);
    callSeconds = 0;
    callTimerDisplay.textContent = '00:00';
    clearInterval(callDurationInterval);
}

function startCallTimer() {
    callDurationInterval = setInterval(() => {
        callSeconds++;
        const m = Math.floor(callSeconds / 60);
        const s = callSeconds % 60;
        callTimerDisplay.textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }, 1000);
}

function endCall() {
    if (peerConnection) { peerConnection.close(); peerConnection = null; }
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;
    callModal.classList.add('hidden');
    clearInterval(callDurationInterval);
    isCallActive = false;
    incomingCallData = null;
}

// Media Controls
callMuteBtn.onclick = () => {
    if (!localStream) return;
    isAudioMuted = !isAudioMuted;
    localStream.getAudioTracks()[0].enabled = !isAudioMuted;
    callMuteBtn.textContent = isAudioMuted ? '🔇 Unmute' : '🎤 Mute';
    callMuteBtn.style.background = isAudioMuted ? 'var(--danger)' : 'var(--bg-panel)';
};

callCamBtn.onclick = () => {
    if (!localStream || currentCallType === 'audio') return;
    isVideoMuted = !isVideoMuted;
    localStream.getVideoTracks()[0].enabled = !isVideoMuted;
    callCamBtn.textContent = isVideoMuted ? '🚫 Cam On' : '📹 Cam Off';
    callCamBtn.style.background = isVideoMuted ? 'var(--danger)' : 'var(--bg-panel)';
};

// --- GLOBAL CHANNEL SETUP ---
function connectGlobalRealtime() {
  if (globalChannel) supabase.removeChannel(globalChannel);
  globalChannel = supabase.channel('global', { config: { presence: { key: currentUser.id } } });
  globalChannel
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
      const msg = payload.new;
      if (activeChatUser && ((msg.sender_id === currentUser.id && msg.receiver_id === activeChatUser.id) || (msg.sender_id === activeChatUser.id && msg.receiver_id === currentUser.id))) { renderMessage(msg); if (msg.sender_id === activeChatUser.id) stopTypingUI(); }
      else if (activeGroup && msg.group_id === activeGroup.id) { renderMessage(msg); }
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, payload => {
      const msg = payload.new;
      if (activeChatUser && ((msg.sender_id === currentUser.id && msg.receiver_id === activeChatUser.id) || (msg.sender_id === activeChatUser.id && msg.receiver_id === currentUser.id))) { renderMessage(msg); }
      else if (activeGroup && msg.group_id === activeGroup.id) { renderMessage(msg); }
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, payload => { const el = document.getElementById(`msg-${payload.old.id}`); if (el) el.remove(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'statuses' }, () => { const statusNav = document.getElementById('nav-status'); if (statusNav && statusNav.classList.contains('active')) loadStatuses(); })
    .on('presence', { event: 'sync' }, () => { onlineUsers.clear(); Object.keys(globalChannel.presenceState()).forEach(id => onlineUsers.add(id)); updateActiveChatPresenceUI(); })
    .on('broadcast', { event: 'typing' }, payload => { if (activeChatUser && payload.payload.sender_id === activeChatUser.id) showTypingUI(); })
    .on('broadcast', { event: 'webrtc' }, async (payload) => {
        const data = payload.payload;
        if (data.target_id !== currentUser.id) return;
        
        if (data.action === 'offer') { handleIncomingCall(data); }
        else if (data.action === 'answer' && peerConnection) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.data));
            callTitle.textContent = "In Call";
            startCallTimer();
            isCallActive = true;
        }
        else if (data.action === 'ice-candidate' && peerConnection) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.data));
        }
        else if (data.action === 'end') { endCall(); }
    })
    .subscribe(async (status) => { if (status === 'SUBSCRIBED') await globalChannel.track({ user_id: currentUser.id }); });
}

let typingTimeout = null;
messageInput.addEventListener('input', () => { 
  if (!activeChatUser || !globalChannel || typingTimeout) return; 
  
  globalChannel.send({ type: 'broadcast', event: 'typing', payload: { sender_id: currentUser.id } }); 
  
  typingTimeout = setTimeout(() => {
    typingTimeout = null;
  }, 2000);
});

function showTypingUI() { activeChatStatus.classList.add('hidden'); typingIndicator.classList.remove('hidden'); clearTimeout(typingTimer); typingTimer = setTimeout(stopTypingUI, 2000); }
function stopTypingUI() { typingIndicator.classList.add('hidden'); updateActiveChatPresenceUI(); }
function scrollToBottom() { messagesContainer.scrollTop = messagesContainer.scrollHeight; }
