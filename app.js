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
const imageUpload = document.getElementById('image-upload');
const uploadPreview = document.getElementById('upload-preview');
const navBtns = document.querySelectorAll('.nav-btn');
const navPanels = document.querySelectorAll('.nav-panel');
const groupList = document.getElementById('group-list');
const createGroupBtn = document.getElementById('create-group-btn');
const groupActions = document.getElementById('group-actions');
const groupManageBtn = document.getElementById('group-manage-btn');
const groupDeleteBtn = document.getElementById('group-delete-btn');

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
let activeChatUser = null;
let activeGroup = null;
let globalChannel = null;
let onlineUsers = new Set();
let typingTimer = null;

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

// Navigation Controller
navBtns.forEach(btn => {
  btn.addEventListener('click', (e) => {
    navBtns.forEach(b => b.classList.remove('active'));
    navPanels.forEach(p => p.classList.add('hidden'));
    
    const target = e.currentTarget;
    target.classList.add('active');
    
    const view = target.id.split('-')[1];
    document.getElementById(`panel-${view}`).classList.remove('hidden');
    
    if (view === 'groups') {
      loadGroups();
    } else if (view === 'status') {
      loadStatuses();
    }
  });
});

function showAuthScreen() {
  authScreen.classList.remove('hidden');
  chatScreen.classList.add('hidden');
  currentUser = null;
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

// Authentication Architecture
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
      const username = document.getElementById('username').value.trim();
      const full_name = document.getElementById('full_name').value.trim();
      
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      
      if (data.user) {
        const { error: profileError } = await supabase
          .from('profiles')
          .insert([{ id: data.user.id, username, full_name }]);
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
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
      
    if (error) throw error;
    myProfileName.textContent = data?.full_name || 'My Chat';
    showChatScreen();
    connectGlobalRealtime();
  } catch (err) {
    console.error("Profile configuration failure:", err.message);
  }
}

// User Querying
searchBtn.addEventListener('click', searchUsers);
searchInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') searchUsers(); });

async function searchUsers() {
  const query = searchInput.value.trim();
  if (!query) return;
  
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .ilike('username', `%${query}%`)
      .neq('id', currentUser.id);
      
    if (error) throw error;
    
    userList.innerHTML = '';
    (data || []).forEach(user => {
      const isOnline = onlineUsers.has(user.id);
      const div = document.createElement('div');
      div.className = 'user-item';
      
      const infoContainer = document.createElement('div');
      const nameSpan = document.createElement('span');
      nameSpan.textContent = user.full_name;
      const metaSpan = document.createElement('span');
      metaSpan.className = 'user-item-username';
      metaSpan.textContent = ` @${user.username}`;
      
      infoContainer.appendChild(nameSpan);
      infoContainer.appendChild(document.createElement('br'));
      infoContainer.appendChild(metaSpan);
      
      const dot = document.createElement('div');
      dot.className = `status-dot ${isOnline ? 'online' : ''}`;
      
      div.appendChild(infoContainer);
      div.appendChild(dot);
      div.onclick = () => startChat(user);
      userList.appendChild(div);
    });
  } catch (err) {
    console.error(err.message);
  }
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
  activeChatStatus.textContent = isOnline ? 'Online' : 'Offline';
  activeChatStatus.className = `status-text ${isOnline ? 'online' : ''}`;
}

// Group Component Module
createGroupBtn.addEventListener('click', async () => {
  const groupName = prompt('Enter a name for your new group:');
  if (!groupName || !groupName.trim()) return;
  
  try {
    const { data, error } = await supabase
      .from('groups')
      .insert([{ name: groupName.trim(), admin_id: currentUser.id }])
      .select()
      .single();
      
    if (error) throw error;
    
    if (data) {
      await supabase.from('group_members').insert([
        { group_id: data.id, user_id: currentUser.id, status: 'approved' }
      ]);
      alert(`Group "${groupName.trim()}" created successfully!`);
      loadGroups();
    }
  } catch (err) {
    alert('Failed to create group: ' + err.message);
  }
});

async function loadGroups() {
  try {
    const { data: allGroups } = await supabase.from('groups').select('*');
    const { data: myMemberships } = await supabase
      .from('group_members')
      .select('*')
      .eq('user_id', currentUser.id);
      
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
      
      const textWrap = document.createElement('div');
      const titleStrong = document.createElement('strong');
      titleStrong.textContent = group.name;
      const subSpan = document.createElement('span');
      subSpan.className = 'user-item-username';
      subSpan.textContent = subText;
      
      textWrap.appendChild(titleStrong);
      textWrap.appendChild(document.createElement('br'));
      textWrap.appendChild(subSpan);
      
      div.appendChild(textWrap);
      div.onclick = () => selectGroup(group, status, isAdmin);
      groupList.appendChild(div);
    });
  } catch (err) {
    console.error(err.message);
  }
}

async function selectGroup(group, status, isAdmin) {
  activeChatUser = null;
  activeGroup = group;
  activeChatName.textContent = group.name;
  activeChatStatus.classList.add('hidden');
  
  if (isAdmin || status === 'approved') {
    groupActions.style.display = isAdmin ? 'flex' : 'none';
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
    
    const container = document.createElement('div');
    container.className = 'empty-state';
    const p = document.createElement('p');
    p.textContent = 'You are not a member of this group.';
    
    const reqBtn = document.createElement('button');
    reqBtn.className = 'action-btn';
    reqBtn.style.marginTop = '10px';
    reqBtn.style.maxWidth = '200px';
    reqBtn.textContent = 'Request Entry';
    
    reqBtn.onclick = async () => {
      await supabase.from('group_members').insert([
        { group_id: group.id, user_id: currentUser.id, status: 'pending' }
      ]);
      alert('Request sent to group admin!');
      loadGroups();
      selectGroup(group, 'pending', false);
    };
    
    container.appendChild(p);
    container.appendChild(reqBtn);
    messagesContainer.innerHTML = '';
    messagesContainer.appendChild(container);
  }
}

groupManageBtn.onclick = async () => {
  if (!activeGroup) return;
  try {
    const { data: pendings, error } = await supabase
      .from('group_members')
      .select('user_id, profiles(full_name, username)')
      .eq('group_id', activeGroup.id)
      .eq('status', 'pending');
      
    if (error) throw error;
    
    messagesContainer.innerHTML = '';
    const h3 = document.createElement('h3');
    h3.style.paddingBottom = '10px';
    h3.textContent = 'Pending Membership Requests';
    messagesContainer.appendChild(h3);
    
    if (!pendings || pendings.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'empty-state';
      emptyDiv.textContent = 'No pending requests found.';
      messagesContainer.appendChild(emptyDiv);
      return;
    }
    
    pendings.forEach(p => {
      const div = document.createElement('div');
      div.className = 'user-item';
      div.style.background = 'var(--bg-panel)';
      div.style.margin = '5px 0';
      div.style.borderRadius = '6px';
      
      const labelDiv = document.createElement('div');
      labelDiv.textContent = `${p.profiles?.full_name || 'Unknown'} `;
      const uSpan = document.createElement('span');
      uSpan.className = 'user-item-username';
      uSpan.textContent = `@${p.profiles?.username || ''}`;
      labelDiv.appendChild(uSpan);
      
      const appBtn = document.createElement('button');
      appBtn.className = 'action-btn';
      appBtn.style.cssText = 'max-width:90px; background:var(--accent); color:white; border:none;';
      appBtn.textContent = 'Approve';
      
      appBtn.onclick = async () => {
        await supabase
          .from('group_members')
          .update({ status: 'approved' })
          .eq('group_id', activeGroup.id)
          .eq('user_id', p.user_id);
        alert('User approved!');
        groupManageBtn.click();
      };
      
      div.appendChild(labelDiv);
      div.appendChild(appBtn);
      messagesContainer.appendChild(div);
    });
  } catch (err) {
    console.error(err.message);
  }
};

groupDeleteBtn.onclick = async () => {
  if (!activeGroup) return;
  if (confirm(`Warning: Are you sure you want to permanently delete "${activeGroup.name}"?`)) {
    await supabase.from('groups').delete().eq('id', activeGroup.id);
    alert('Group deleted.');
    groupActions.classList.add('hidden');
    activeChatName.textContent = 'Select a user to start chatting';
    messagesContainer.innerHTML = '';
    messageForm.classList.add('hidden');
    activeGroup = null;
    loadGroups();
  }
};

// Status System
addPhotoStatusBtn.addEventListener('click', () => {
  statusImageUpload.click();
});

addTextStatusBtn.addEventListener('click', () => {
  textStatusContainer.classList.toggle('hidden');
  if (!textStatusContainer.classList.contains('hidden')) {
    textStatusInput.focus();
  }
});

submitTextStatusBtn.addEventListener('click', () => {
  const text = textStatusInput.value.trim();
  if (!text) return;
  
  submitTextStatusBtn.disabled = true;
  saveStatusToDatabase('text', text).finally(() => {
    submitTextStatusBtn.disabled = false;
    textStatusInput.value = '';
    textStatusContainer.classList.add('hidden');
  });
});

statusImageUpload.addEventListener('change', async () => {
  const file = statusImageUpload.files[0];
  if (!file) return;
  
  if (file.size > 5 * 1024 * 1024) {
    alert("File limit exceeded. Status images must be under 5MB.");
    statusImageUpload.value = '';
    return;
  }
  
  addPhotoStatusBtn.textContent = 'Uploading...';
  addPhotoStatusBtn.disabled = true;
  
  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random()}.${fileExt}`;
    const filePath = `statuses/${currentUser.id}/${fileName}`;
    
    const { error: uploadError } = await supabase.storage
      .from('chat-media')
      .upload(filePath, file);
      
    if (uploadError) throw uploadError;
    
    const { data } = supabase.storage.from('chat-media').getPublicUrl(filePath);
    await saveStatusToDatabase('image', data.publicUrl);
  } catch (err) {
    alert("Status Upload Error: " + err.message);
  } finally {
    statusImageUpload.value = '';
    addPhotoStatusBtn.textContent = '📷 Photo';
    addPhotoStatusBtn.disabled = false;
  }
});

async function saveStatusToDatabase(type, content) {
  try {
    const { error } = await supabase
      .from('statuses')
      .insert([{ user_id: currentUser.id, type, content }]);
    if (error) throw error;
    await loadStatuses();
  } catch (err) {
    alert("Failed to sync status: " + err.message);
  }
}

async function editStatus(statusId, currentContent) {
  const newText = prompt('Edit your text status:', currentContent);
  if (newText === null || newText.trim() === '' || newText.trim() === currentContent) return;
  
  try {
    const { error } = await supabase
      .from('statuses')
      .update({ content: newText.trim() })
      .eq('id', statusId);
    if (error) throw error;
    loadStatuses();
  } catch (err) {
    alert("Failed to update status: " + err.message);
  }
}

async function deleteStatus(statusId) {
  if (!confirm('Are you sure you want to permanently delete this status?')) return;
  
  try {
    const { error } = await supabase.from('statuses').delete().eq('id', statusId);
    if (error) throw error;
    loadStatuses();
  } catch (err) {
    alert("Failed to delete status: " + err.message);
  }
}

async function loadStatuses() {
  try {
    const cutoffTime = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
    
    const { data, error } = await supabase
      .from('statuses')
      .select('id, user_id, type, content, created_at, profiles(full_name, username)')
      .gte('created_at', cutoffTime)
      .order('created_at', { ascending: false });
      
    if (error) throw error;
    
    statusList.innerHTML = '';
    if (!data || data.length === 0) {
      statusList.innerHTML = '<div class="empty-state">No recent status updates found.</div>';
      return;
    }
    
    data.forEach(status => {
      const div = document.createElement('div');
      div.className = 'user-item';
      
      const wrapper = document.createElement('div');
      wrapper.style.display = 'flex';
      wrapper.style.alignItems = 'center';
      wrapper.style.gap = '15px';
      
      if (status.type === 'image') {
        const thumb = document.createElement('img');
        thumb.className = 'status-img-thumb';
        thumb.src = status.content;
        wrapper.appendChild(thumb);
      } else {
        const textIcon = document.createElement('div');
        textIcon.style.cssText = 'width:40px; height:40px; border-radius:50%; background:var(--accent); display:flex; align-items:center; justify-content:center; font-weight:bold; color:white; font-size:1.2rem;';
        textIcon.textContent = '✍';
        wrapper.appendChild(textIcon);
      }
      
      const textMeta = document.createElement('div');
      const authorStrong = document.createElement('strong');
      authorStrong.textContent = status.profiles?.full_name || 'Anonymous';
      
      const elapsedSpan = document.createElement('span');
      elapsedSpan.className = 'user-item-username';
      const timeLabel = new Date(status.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      elapsedSpan.textContent = ` • Posted at ${timeLabel}`;
      
      textMeta.appendChild(authorStrong);
      textMeta.appendChild(document.createElement('br'));
      textMeta.appendChild(elapsedSpan);
      wrapper.appendChild(textMeta);
      
      div.appendChild(wrapper);
      
      if (status.user_id === currentUser.id) {
        const actionDiv = document.createElement('div');
        actionDiv.style.display = 'flex';
        actionDiv.style.gap = '10px';
        
        if (status.type === 'text') {
          const editBtn = document.createElement('button');
          editBtn.textContent = '✏️';
          editBtn.style.cssText = 'background:transparent; border:none; cursor:pointer; font-size:1.1rem;';
          editBtn.onclick = (e) => { 
            e.stopPropagation(); 
            editStatus(status.id, status.content); 
          };
          actionDiv.appendChild(editBtn);
        }
        
        const delBtn = document.createElement('button');
        delBtn.textContent = '🗑️';
        delBtn.style.cssText = 'background:transparent; border:none; cursor:pointer; font-size:1.1rem;';
        delBtn.onclick = (e) => { 
          e.stopPropagation(); 
          deleteStatus(status.id); 
        };
        
        actionDiv.appendChild(delBtn);
        div.appendChild(actionDiv);
      }
      
      wrapper.onclick = () => openStatusViewer(status);
      wrapper.style.cursor = 'pointer';
      wrapper.style.flex = '1';
      
      statusList.appendChild(div);
    });
  } catch (err) {
    console.error("Error loading statuses:", err.message);
  }
}

function openStatusViewer(status) {
  statusViewerHeader.textContent = `${status.profiles?.full_name || 'User'} Status`;
  
  if (status.type === 'image') {
    statusViewerImg.src = status.content;
    statusViewerImg.classList.remove('hidden');
    statusViewerText.classList.add('hidden');
  } else {
    statusViewerText.textContent = status.content;
    statusViewerText.classList.remove('hidden');
    statusViewerImg.classList.add('hidden');
  }
  
  statusViewer.classList.remove('hidden');
}

statusViewerClose.addEventListener('click', () => {
  statusViewer.classList.add('hidden');
  statusViewerImg.src = '';
  statusViewerText.textContent = '';
});

// Real-Time Chat Engine Layer
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
  if (data) data.forEach(renderMessage);
  scrollToBottom();
}

function renderMessage(msg) {
  if (document.getElementById(`msg-${msg.id}`)) return;
  
  const isSent = msg.sender_id === currentUser.id;
  const div = document.createElement('div');
  div.className = `message ${isSent ? 'msg-sent' : 'msg-recv'}`;
  div.id = `msg-${msg.id}`;
  
  if (msg.image_url) {
    const img = document.createElement('img');
    img.src = msg.image_url;
    img.className = 'message-img';
    div.appendChild(img);
    div.appendChild(document.createElement('br'));
  }
  
  if (msg.message_text) {
    const textSpan = document.createElement('span');
    textSpan.textContent = msg.message_text;
    div.appendChild(textSpan);
  }
  
  // Calculate and Render Arrival Time Label
  const timeLabel = msg.created_at 
    ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
  const timeSpan = document.createElement('span');
  timeSpan.className = 'message-time';
  timeSpan.textContent = timeLabel;
  div.appendChild(timeSpan);
  
  if (isSent) {
    const delBtn = document.createElement('button');
    delBtn.className = 'delete-btn';
    delBtn.textContent = '✖';
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
    if (file.size > 5 * 1024 * 1024) {
      alert("File limit bounds exceeded. Images must be under 5MB.");
      return;
    }
    
    uploadPreview.classList.remove('hidden');
    const sendBtn = document.getElementById('send-btn');
    sendBtn.disabled = true;
    
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random()}.${fileExt}`;
    const filePath = `messages/${currentUser.id}/${fileName}`;
    
    const { error: uploadError } = await supabase.storage
      .from('chat-media')
      .upload(filePath, file);
      
    if (uploadError) {
      alert("Media upload error: " + uploadError.message);
      uploadPreview.classList.add('hidden');
      sendBtn.disabled = false;
      return;
    }
    
    const { data } = supabase.storage.from('chat-media').getPublicUrl(filePath);
    imageUrl = data.publicUrl;
    
    imageUpload.value = '';
    uploadPreview.classList.add('hidden');
    sendBtn.disabled = false;
  }
  
  if (text || imageUrl) {
    const packet = {
      sender_id: currentUser.id,
      message_text: text || '',
      image_url: imageUrl
    };
    
    if (activeGroup) packet.group_id = activeGroup.id;
    else packet.receiver_id = activeChatUser.id;
    
    await supabase.from('messages').insert([packet]);
  }
});

// Realtime Network Sync Pipelines
function connectGlobalRealtime() {
  if (globalChannel) supabase.removeChannel(globalChannel);
  
  globalChannel = supabase.channel('global', { config: { presence: { key: currentUser.id } } });
  
  globalChannel
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
      const msg = payload.new;
      if (activeChatUser && ((msg.sender_id === currentUser.id && msg.receiver_id === activeChatUser.id) || (msg.sender_id === activeChatUser.id && msg.receiver_id === currentUser.id))) {
        renderMessage(msg);
        if (msg.sender_id === activeChatUser.id) stopTypingUI();
      } else if (activeGroup && msg.group_id === activeGroup.id) {
        renderMessage(msg);
      }
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, payload => {
      const el = document.getElementById(`msg-${payload.old.id}`);
      if (el) el.remove();
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'statuses' }, () => {
      const statusNav = document.getElementById('nav-status');
      if (statusNav && statusNav.classList.contains('active')) {
        loadStatuses();
      }
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'statuses' }, () => {
      const statusNav = document.getElementById('nav-status');
      if (statusNav && statusNav.classList.contains('active')) {
        loadStatuses();
      }
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

function scrollToBottom() { 
  messagesContainer.scrollTop = messagesContainer.scrollHeight; 
}

init();
