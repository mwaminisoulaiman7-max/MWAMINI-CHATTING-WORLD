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
const groupAvatarBtn = document.getElementById('group-avatar-btn');
const groupAvatarUpload = document.getElementById('group-avatar-upload');

// Status Elements
const addPhotoStatusBtn = document.getElementById('add-photo-status-btn');
const addTextStatusBtn = document.getElementById('add-text-status-btn');
const textStatusContainer = document.getElementById('text-status-container');
const textStatusInput = document.getElementById('text-status-input');
const submitTextStatusBtn = document.getElementById('submit-text-status-btn');
const statusImageUpload = document.getElementById('status-image-upload');
const statusList = document.getElementById('status-list');
const statusViewer = document.getElementById('status-viewer');
const statusViewerClose = document.getElementById('status-viewer-close');
const statusViewerHeader = document.getElementById('status-viewer-header');
const statusViewerImg = document.getElementById('status-viewer-img');
const statusViewerText = document.getElementById('status-viewer-text');

// Application State
let isLoginMode = true;
let currentUser = null;
let currentProfile = null;
let activeChatUser = null;
let activeGroup = null;
let globalChannel = null;
let onlineUsers = new Set();
let typingTimer = null;

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

async function init() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    await handleLoginSuccess(session.user);
  } else {
    showAuthScreen();
  }
}

supabase.auth.onAuthStateChange((_event, session) => {
  if (session) {
    handleLoginSuccess(session.user);
  } else {
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
    myProfileName.textContent = data?.full_name || 'My Chat';
    myProfileUsername.textContent = `@${data?.username || 'user'} ✏️`;
    if (data?.avatar_url) myProfileAvatar.src = data.avatar_url;
    showChatScreen();
    connectGlobalRealtime();
  } catch (err) {
    console.error("Profile resolution error:", err.message);
  }
}

// --- PROFILE EDITING ---
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

myProfileUsername.addEventListener('click', async () => {
  const newUsername = prompt("Enter your new username (must be unique):", currentProfile?.username || "");
  if (!newUsername || newUsername.trim() === "" || newUsername.trim() === currentProfile?.username) return;
  const cleanUsername = newUsername.trim().replace(/\s+/g, '').toLowerCase();

  try {
    const { data: existing } = await supabase.from('profiles').select('id').eq('username', cleanUsername).maybeSingle();
    if (existing && existing.id !== currentUser.id) return alert("That username is already taken. Please choose another one.");
    const { error } = await supabase.from('profiles').update({ username: cleanUsername }).eq('id', currentUser.id);
    if (error) throw error;
    currentProfile.username = cleanUsername;
    myProfileUsername.textContent = `@${cleanUsername} ✏️`;
    alert("Username updated successfully!");
  } catch (err) { alert("Failed to update username: " + err.message); }
});

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

// --- SECURE START CHAT ---
async function startChat(user) {
    // Check if the target user has a password set on their profile
    const { data: targetProfile, error: profileError } = await supabase
        .from('profiles')
        .select('chat_password')
        .eq('id', user.id)
        .single();

    if (profileError) { console.error("Error checking chat protection", profileError); return; }

    // If password exists, prompt user
    if (targetProfile?.chat_password) {
        const userInput = prompt("This user has a private chat password. Please enter it:");
        if (userInput !== targetProfile.chat_password) {
            alert("Incorrect password. Access denied.");
            return;
        }
    }

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
    groupActions.style.display = isAdmin ? 'flex' : 'none';
    if (isAdmin) groupActions.classList.remove('hidden');
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

// Group Admin functions
groupAvatarBtn.onclick = () => {
  const action = prompt("Group Photo: Type 'U' to upload a new photo, or 'D' to delete the current one.", "U");
  if (action?.toUpperCase() === 'U') groupAvatarUpload.click();
  else if (action?.toUpperCase() === 'D') updateGroupAvatar(null);
};
groupAvatarUpload.addEventListener('change', async () => { /* Logic omitted for brevity */ });
async function updateGroupAvatar(url) { /* Logic omitted for brevity */ };
groupManageBtn.onclick = async () => { /* Logic omitted for brevity */ };
groupDeleteBtn.onclick = async () => { /* Logic omitted for brevity */ };


// --- STATUS SYSTEM ---
addPhotoStatusBtn.addEventListener('click', () => statusImageUpload.click());
addTextStatusBtn.addEventListener('click', () => { textStatusContainer.classList.toggle('hidden'); if (!textStatusContainer.classList.contains('hidden')) textStatusInput.focus(); });
submitTextStatusBtn.addEventListener('click', () => { /* Submit text status */ });
statusImageUpload.addEventListener('change', async () => { /* Upload status image */ });
async function saveStatusToDatabase(type, content) { /* Save status */ }
async function loadStatuses() { /* Load status */ }
function openStatusViewer(status) { /* Open viewer */ }
statusViewerClose.addEventListener('click', () => { statusViewer.classList.add('hidden'); statusViewerImg.src = ''; statusViewerText.textContent = ''; });


// --- MEDIA HANDLING ---
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
  if (document.getElementById(`msg-${msg.id}`)) return;
  const isSent = msg.sender_id === currentUser.id;
  const div = document.createElement('div'); div.className = `message ${isSent ? 'msg-sent' : 'msg-recv'}`; div.id = `msg-${msg.id}`;
  
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
          pdfLink.innerHTML = `<div class="pdf-icon">📄</div><div class="pdf-info"><span class="pdf-name">${msg.file_name || 'Document.pdf'}</span></div>`;
          div.appendChild(pdfLink);
      }
      div.appendChild(document.createElement('br'));
  }

  if (msg.message_text) { 
      const textSpan = document.createElement('span'); textSpan.textContent = msg.message_text; 
      div.appendChild(textSpan); 
  }
  
  const timeSpan = document.createElement('span'); timeSpan.className = 'message-time';
  timeSpan.textContent = msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  div.appendChild(timeSpan);
  
  if (isSent) {
    const delBtn = document.createElement('button'); delBtn.className = 'delete-btn'; delBtn.textContent = '✖';
    delBtn.onclick = async () => { await supabase.from('messages').delete().match({ id: msg.id }); }; div.appendChild(delBtn);
  }
  messagesContainer.appendChild(div); scrollToBottom();
}

messageForm.addEventListener('submit', async (e) => {
  e.preventDefault(); 
  const text = messageInput.value.trim(); 
  const file = fileUpload.files[0];
  if ((!activeChatUser && !activeGroup) || (!text && !file)) return;
  messageInput.value = ''; 
  // ... [Upload logic remains standard] ...
});

// --- WEBRTC AND REALTIME ---
function setupPeerConnection() { /* Setup code */ }
function sendSignalingMessage(payload) { /* Signaling code */ }
function endCall() { /* End code */ }

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
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, payload => { const el = document.getElementById(`msg-${payload.old.id}`); if (el) el.remove(); })
    .on('presence', { event: 'sync' }, () => { onlineUsers.clear(); Object.keys(globalChannel.presenceState()).forEach(id => onlineUsers.add(id)); updateActiveChatPresenceUI(); })
    .on('broadcast', { event: 'webrtc' }, async (payload) => { /* WebRTC events */ })
    .subscribe(async (status) => { if (status === 'SUBSCRIBED') await globalChannel.track({ user_id: currentUser.id }); });
}

messageInput.addEventListener('input', () => { if (!activeChatUser || !globalChannel) return; globalChannel.send({ type: 'broadcast', event: 'typing', payload: { sender_id: currentUser.id } }); });
function showTypingUI() { activeChatStatus.classList.add('hidden'); typingIndicator.classList.remove('hidden'); clearTimeout(typingTimer); typingTimer = setTimeout(stopTypingUI, 2000); }
function stopTypingUI() { typingIndicator.classList.add('hidden'); updateActiveChatPresenceUI(); }
function scrollToBottom() { messagesContainer.scrollTop = messagesContainer.scrollHeight; }

init();
