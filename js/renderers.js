import { state } from './state.js';
import { timeSince, formatViewsCount, shuffleArray, getStringSizeInKB } from './utils.js';
import { callScriptAction, autoSaveToCloud, fetchYTProxy } from './api.js';
import { devLog, requirePin, closeModal } from './ui.js';

// Utilità YouTube mancante
window.getYouTubeID = function(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
};

// ==========================================
// FUNZIONI SUPPORTO IDEE
// ==========================================
export function getIdeaStatus(idea) {
    if (idea.checklist && idea.checklist.script && idea.checklist.audio && idea.checklist.video && idea.checklist.final) { return 'completed'; }
    if (idea.assignee) { return 'progress'; }
    const createdTime = idea.createdAt || 0; 
    const hours48 = 48 * 60 * 60 * 1000;
    if (Date.now() - createdTime <= hours48 && createdTime > 0) { return 'new'; }
    return 'available';
}

export function getFilteredIdeas() {
    let filtered = [...state.videoIdeas];
    if (state.activeChannelId !== null) filtered = filtered.filter(v => v.channelId === state.activeChannelId);
    
    const term = document.getElementById('searchInput').value.toLowerCase();
    if (term) filtered = filtered.filter(v => v.title.toLowerCase().includes(term));
    
    let n = 0, a = 0, p = 0, c = 0;
    filtered.forEach(v => { 
        const s = getIdeaStatus(v); 
        if(s === 'new') { n++; a++; } 
        else if(s === 'available') a++; 
        else if(s === 'progress') p++; 
        else if(s === 'completed') c++; 
    });
    
    document.getElementById('countNew').textContent = n; 
    document.getElementById('countAvailable').textContent = a; 
    document.getElementById('countProgress').textContent = p; 
    document.getElementById('countCompleted').textContent = c;

    if (state.activeStatusFilter !== 'all') {
        filtered = filtered.filter(v => {
            const stat = getIdeaStatus(v);
            if (state.activeStatusFilter === 'available') return stat === 'available' || stat === 'new';
            return stat === state.activeStatusFilter;
        });
    }
    
    if (state.activeChannelId === null && !term && state.activeStatusFilter === 'all') {
        filtered.sort((x, y) => {
            let iA = state.randomIdeaOrder.indexOf(x.id); 
            let iB = state.randomIdeaOrder.indexOf(y.id);
            if(iA === -1) iA = 999999; if(iB === -1) iB = 999999; return iA - iB;
        });
    }
    return filtered;
}

// ==========================================
// RENDER VIDEO IDEE
// ==========================================
export function renderVideos(videosToRender) {
    const grid = document.getElementById('videoGrid'); 
    const noRes = document.getElementById('noResults');
    grid.innerHTML = '';
    
    if (videosToRender.length === 0) { noRes.classList.remove('hidden'); grid.classList.add('hidden'); return; }
    noRes.classList.add('hidden'); grid.classList.remove('hidden');

    videosToRender.forEach(video => {
        const ch = state.channels.find(c => c.id === video.channelId);
        const channelName = ch ? ch.name : 'Nessun Canale';
        const statusType = getIdeaStatus(video);
        
        let bColor = 'text-gray-400'; let bLabel = '';
        if(statusType==='new'){bColor='text-blue-400';bLabel='Nuova';} 
        else if(statusType==='available'){bColor='text-yellow-400';bLabel='Disponibile';} 
        else if(statusType==='progress'){bColor='text-purple-400';bLabel='In Progress';} 
        else if(statusType==='completed'){bColor='text-green-400';bLabel='Completata';}
        
        let avatarHtml = ch && ch.profilePicUrl 
            ? `<img src="${ch.profilePicUrl}" class="w-9 h-9 rounded-full object-cover shrink-0 border border-[#404040]">` 
            : `<div class="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-sm font-bold border border-[#404040]" style="background:${ch?ch.color||'#555':'#555'}">${channelName.charAt(0).toUpperCase()}</div>`;
        
        const timeAgoStr = video.createdAt ? timeSince(video.createdAt) : video.timeAgo;

        const card = document.createElement('div'); 
        card.className = 'flex flex-col gap-3 cursor-pointer group relative';
        card.onclick = () => window.openIdeaDashboard(video); 
        
        card.innerHTML = `
            <div class="relative w-full aspect-video rounded-xl overflow-hidden bg-[#272727] border border-transparent group-hover:border-[#303030] transition-colors">
                <img src="${video.thumbnail}" onerror="this.src='https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=800&auto=format&fit=crop'" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300">
                <div class="absolute top-2 left-2 bg-black/80 px-2 py-0.5 rounded text-[11px] font-bold ${bColor} uppercase border border-[#444] shadow">${bLabel}</div>
            </div>
            <div class="flex gap-3 pr-2">
                ${avatarHtml}
                <div class="flex flex-col">
                    <h3 class="text-[16px] font-semibold text-[#f1f1f1] line-clamp-2 leading-tight group-hover:text-[#3ea6ff] transition-colors" title="${video.title}">${video.title}</h3>
                    <div class="text-[12px] text-[#aaaaaa] mt-1 flex flex-col"><span>${channelName} &bull; ${timeAgoStr}</span><span class="mt-0.5">Resp: ${video.assignee ? `<span class="text-white font-semibold">${video.assignee}</span>` : `<span class="italic">Nessuno</span>`}</span></div>
                </div>
            </div>
        `;
        
        const act = document.createElement('div'); 
        act.className = 'absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-10';
        act.innerHTML = `<button class="editBtn bg-blue-600/90 hover:bg-blue-500 text-white text-xs w-8 h-8 rounded-full shadow-lg hover:scale-110 transition-transform">✏️</button><button class="delBtn bg-red-600/90 hover:bg-red-500 text-white text-xs w-8 h-8 rounded-full shadow-lg hover:scale-110 transition-transform">🗑️</button>`;
        
        act.querySelector('.editBtn').onclick = (e) => { 
            e.stopPropagation(); 
            requirePin(`Vuoi modificare l'idea "${video.title}"?`, () => window.openEditIdeaModal(video)); 
        };
        act.querySelector('.delBtn').onclick = (e) => { 
            e.stopPropagation(); 
            requirePin(`Eliminare "${video.title}"?`, async () => { 
                state.videoIdeas = state.videoIdeas.filter(v => v.id !== video.id); 
                renderVideos(getFilteredIdeas()); 
                renderChannelList(); 
                await autoSaveToCloud(); 
            }); 
        };
        
        card.appendChild(act); 
        grid.appendChild(card);
    });
}

// ==========================================
// RENDER CANALI
// ==========================================
export async function checkAllChannelFolders() {
    if (!state.SCRIPT_URL) return;
    const idsToCheck = state.channels.filter(c => c.driveFolderId && typeof state.folderStatusCache[c.driveFolderId] === 'undefined').map(c => c.driveFolderId);
    if (idsToCheck.length === 0) return; 
    try {
        const res = await callScriptAction({ action: 'checkFolders', folderIds: idsToCheck });
        Object.assign(state.folderStatusCache, res.results || {});
        state.channels.forEach(ch => {
            const icon = document.querySelector(`.folder-status-icon[data-chid="${ch.id}"]`);
            if (!icon || !ch.driveFolderId) return;
            if (state.folderStatusCache[ch.driveFolderId] === true) { icon.textContent = '✅'; icon.title = 'Cartella OK'; } 
            else if (state.folderStatusCache[ch.driveFolderId] === false) { icon.textContent = '⚠️'; icon.title = 'Errore cartella'; }
        });
    } catch(e) {} 
}

export function renderChannelList() {
    const channelListEl = document.getElementById('channelList');
    channelListEl.innerHTML = ''; 
    document.getElementById('inputChannel').innerHTML = '<option value="">— Nessun canale —</option>';
    
    state.channels.forEach(ch => {
        document.getElementById('inputChannel').innerHTML += `<option value="${ch.id}">${ch.name}</option>`;
        const count = state.videoIdeas.filter(v => v.channelId === ch.id).length;
        
        let avatarHTML = ch.profilePicUrl 
            ? `<img src="${ch.profilePicUrl}" class="w-7 h-7 rounded-full object-cover shrink-0 border border-[#404040]">` 
            : `<div class="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs font-bold border border-[#404040]" style="background:${ch.color || '#3ea6ff'}">${ch.name.charAt(0).toUpperCase()}</div>`;
        
        let folderIcon = '⏳'; let folderTitle = 'Verifica cartella in corso...';
        if (!ch.driveFolderId) { folderIcon = '❓'; folderTitle = 'Nessuna cartella Drive'; } 
        else if (state.folderStatusCache[ch.driveFolderId] === true) { folderIcon = '✅'; folderTitle = 'Cartella OK'; } 
        else if (state.folderStatusCache[ch.driveFolderId] === false) { folderIcon = '⚠️'; folderTitle = 'Errore cartella'; }

        const el = document.createElement('div');
        el.className = `channel-item channel-sidebar-item flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer ${state.activeChannelId === ch.id ? 'active' : ''}`;
        el.dataset.id = ch.id;
        
        // DRAG & DROP
        el.draggable = true;
        el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', ch.id); el.style.opacity = '0.5'; });
        el.addEventListener('dragend', () => { el.style.opacity = '1'; });
        el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('border-t-2', 'border-blue-500'); });
        el.addEventListener('dragleave', () => { el.classList.remove('border-t-2', 'border-blue-500'); });
        el.addEventListener('drop', (e) => {
            e.preventDefault(); el.classList.remove('border-t-2', 'border-blue-500');
            const draggedId = e.dataTransfer.getData('text/plain');
            if (draggedId && draggedId !== ch.id) {
                const draggedIdx = state.channels.findIndex(c => c.id === draggedId);
                const targetIdx = state.channels.findIndex(c => c.id === ch.id);
                if(draggedIdx > -1 && targetIdx > -1) {
                    const [draggedItem] = state.channels.splice(draggedIdx, 1);
                    state.channels.splice(targetIdx, 0, draggedItem);
                    renderChannelList(); autoSaveToCloud();
                }
            }
        });

        el.innerHTML = `<div class="shrink-0">${avatarHTML}</div><span class="sidebar-label text-sm text-gray-200 flex-1 truncate">${ch.name}</span><span class="sidebar-label folder-status-icon text-sm" data-chid="${ch.id}" title="${folderTitle}">${folderIcon}</span><span class="sidebar-label text-[11px] text-gray-500 bg-[#222] px-1.5 py-0.5 rounded ml-1 transition-opacity">${count}</span>`;
        el.addEventListener('click', () => window.setActiveFilter(ch.id));
        channelListEl.appendChild(el);
    });
    checkAllChannelFolders();
}

export function renderAdminChannelList() {
    const list = document.getElementById('adminChannelList');
    const noChText = document.getElementById('adminNoChannels');
    list.innerHTML = '';
    
    if(state.channels.length === 0) { noChText.classList.remove('hidden'); return; }
    noChText.classList.add('hidden');

    state.channels.forEach(ch => {
        const count = state.videoIdeas.filter(v => v.channelId === ch.id).length;
        let avatarHTML = ch.profilePicUrl 
            ? `<img src="${ch.profilePicUrl}" class="w-10 h-10 rounded-full object-cover shrink-0 border border-[#404040]">` 
            : `<div class="w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-sm font-bold border border-[#404040]" style="background:${ch.color || '#3ea6ff'}">${ch.name.charAt(0).toUpperCase()}</div>`;

        const li = document.createElement('li');
        li.className = "flex items-center justify-between p-3 hover:bg-[#151515] transition-colors";
        li.innerHTML = `
            <div class="flex items-center gap-3">${avatarHTML}<div class="flex flex-col"><span class="text-sm font-bold text-white">${ch.name}</span><span class="text-xs text-gray-500">${count} idee collegate</span></div></div>
            <div class="flex items-center gap-2">
                <button class="admin-edit-ch px-3 py-1.5 bg-[#2a2a2a] hover:bg-[#3ea6ff] hover:text-black text-gray-300 rounded text-xs font-bold transition-colors">Modifica</button>
                <button class="admin-del-ch px-3 py-1.5 bg-[#2a2a2a] hover:bg-red-500 hover:text-white text-red-400 rounded text-xs font-bold transition-colors">Elimina</button>
            </div>
        `;
        
        li.querySelector('.admin-del-ch').addEventListener('click', async () => {
            if(confirm(`Vuoi eliminare DEFINITIVAMENTE il canale "${ch.name}"?`)) {
                state.videoIdeas = state.videoIdeas.map(v => v.channelId === ch.id ? {...v, channelId: ''} : v);
                state.channels = state.channels.filter(c => c.id !== ch.id);
                if (state.activeChannelId === ch.id) window.setActiveFilter(null);
                renderChannelList(); renderAdminChannelList();
                if (state.currentView === 'idee') renderVideos(getFilteredIdeas()); 
                await autoSaveToCloud();
            }
        });

        li.querySelector('.admin-edit-ch').addEventListener('click', () => {
            document.getElementById('editChannelId').value = ch.id;
            document.getElementById('editChannelName').value = ch.name;
            const preview = document.getElementById('editChannelAvatarPreview');
            if (ch.profilePicUrl) preview.innerHTML = `<img src="${ch.profilePicUrl}" class="w-full h-full object-cover rounded-full">`;
            else preview.innerHTML = '📺';
            document.getElementById('editChannelAvatar').value = '';
            state.files.editChannelAvatar = null;
            document.getElementById('editChannelModal').classList.remove('hidden');
            document.getElementById('editChannelModal').classList.add('flex');
        });
        list.appendChild(li);
    });
}

// ==========================================
// RENDER TOOLS & TRAINING
// ==========================================
export function renderTools() {
    const toolsGrid = document.getElementById('toolsGrid');
    const noToolsResults = document.getElementById('noToolsResults');
    toolsGrid.innerHTML = '';
    const term = document.getElementById('searchInput').value.toLowerCase();
    const filteredTools = term ? state.toolsData.filter(t => t.title.toLowerCase().includes(term) || t.description.toLowerCase().includes(term)) : state.toolsData;

    if (filteredTools.length === 0) { noToolsResults.classList.remove('hidden'); toolsGrid.classList.add('hidden'); return; }
    noToolsResults.classList.add('hidden'); toolsGrid.classList.remove('hidden');

    filteredTools.forEach(tool => {
        const card = document.createElement('div');
        card.className = 'bg-[#212121] rounded-xl overflow-hidden border border-[#303030] hover:border-blue-500 transition-all flex flex-col group relative cursor-move';
        
        card.draggable = true;
        card.addEventListener('dragstart', (e) => { e.dataTransfer.setData('toolId', tool.id); card.classList.add('opacity-50'); });
        card.addEventListener('dragend', () => card.classList.remove('opacity-50'));
        card.addEventListener('dragover', (e) => { e.preventDefault(); card.classList.add('ring-2', 'ring-blue-500'); });
        card.addEventListener('dragleave', () => card.classList.remove('ring-2', 'ring-blue-500'));
        card.addEventListener('drop', (e) => {
            e.preventDefault(); card.classList.remove('ring-2', 'ring-blue-500');
            const draggedId = e.dataTransfer.getData('toolId');
            if(draggedId && draggedId !== tool.id) {
                const draggedIdx = state.toolsData.findIndex(t => t.id === draggedId);
                const targetIdx = state.toolsData.findIndex(t => t.id === tool.id);
                if(draggedIdx > -1 && targetIdx > -1) {
                    const [draggedItem] = state.toolsData.splice(draggedIdx, 1);
                    state.toolsData.splice(targetIdx, 0, draggedItem);
                    renderTools(); autoSaveToCloud();
                }
            }
        });

        const act = document.createElement('div');
        act.className = 'absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-10';
        act.innerHTML = `<button class="editBtn bg-blue-600/90 hover:bg-blue-500 text-white text-xs w-8 h-8 rounded-full shadow-lg hover:scale-110">✏️</button><button class="delBtn bg-red-600/90 hover:bg-red-500 text-white text-xs w-8 h-8 rounded-full shadow-lg hover:scale-110">🗑️</button>`;
        
        act.querySelector('.editBtn').onclick = (e) => {
            e.stopPropagation();
            requirePin(`Modificare lo strumento "${tool.title}"?`, () => {
                document.getElementById('inputToolId').value = tool.id;
                document.getElementById('inputToolTitle').value = tool.title;
                document.getElementById('inputToolDesc').value = tool.description;
                document.getElementById('inputToolLink').value = tool.link;
                document.getElementById('toolPreview').src = tool.image;
                document.getElementById('toolPreview').classList.remove('hidden');
                document.getElementById('toolDropHint').classList.add('hidden');
                document.getElementById('inputToolFile').required = false;
                document.getElementById('toolModalTitle').textContent = 'Modifica Strumento';
                document.getElementById('btnSubmitTool').textContent = 'Salva Modifiche';
                document.getElementById('addToolModal').classList.remove('hidden');
                document.getElementById('addToolModal').classList.add('flex');
            });
        };
        act.querySelector('.delBtn').onclick = (e) => {
            e.stopPropagation();
            requirePin(`Eliminare lo strumento "${tool.title}"?`, async () => {
                state.toolsData = state.toolsData.filter(t => t.id !== tool.id);
                renderTools(); await autoSaveToCloud();
            });
        };

        card.innerHTML = `<img src="${tool.image}" class="w-full h-32 object-cover bg-[#111] pointer-events-none"><div class="p-4 flex-1 flex flex-col"><h3 class="font-bold text-white text-lg">${tool.title}</h3><p class="text-sm text-gray-400 mt-1 line-clamp-3 flex-1">${tool.description}</p><button onclick="window.open('${tool.link}', '_blank')" class="mt-4 w-full py-2.5 bg-[#303030] hover:bg-[#404040] text-white rounded text-sm font-semibold transition-colors flex justify-center items-center gap-2">Apri Strumento ↗</button></div>`;
        card.appendChild(act); toolsGrid.appendChild(card);
    });
}

export function renderTraining() {
    const trainingGrid = document.getElementById('trainingGrid');
    const noTrainingResults = document.getElementById('noTrainingResults');
    trainingGrid.innerHTML = '';
    const term = document.getElementById('searchInput').value.toLowerCase();
    const filteredTraining = term ? state.trainingData.filter(t => t.title.toLowerCase().includes(term)) : state.trainingData;

    if (filteredTraining.length === 0) { noTrainingResults.classList.remove('hidden'); trainingGrid.classList.add('hidden'); return; }
    noTrainingResults.classList.add('hidden'); trainingGrid.classList.remove('hidden');

    filteredTraining.forEach(training => {
        const card = document.createElement('div');
        card.className = 'bg-[#212121] rounded-xl overflow-hidden border border-[#303030] hover:border-purple-500 transition-colors flex flex-col group relative cursor-move';
        
        card.draggable = true;
        card.addEventListener('dragstart', (e) => { e.dataTransfer.setData('trainingId', training.id); card.classList.add('opacity-50'); });
        card.addEventListener('dragend', () => card.classList.remove('opacity-50'));
        card.addEventListener('dragover', (e) => { e.preventDefault(); card.classList.add('ring-2', 'ring-purple-500'); });
        card.addEventListener('dragleave', () => card.classList.remove('ring-2', 'ring-purple-500'));
        card.addEventListener('drop', (e) => {
            e.preventDefault(); card.classList.remove('ring-2', 'ring-purple-500');
            const draggedId = e.dataTransfer.getData('trainingId');
            if(draggedId && draggedId !== training.id) {
                const draggedIdx = state.trainingData.findIndex(t => t.id === draggedId);
                const targetIdx = state.trainingData.findIndex(t => t.id === training.id);
                if(draggedIdx > -1 && targetIdx > -1) {
                    const [draggedItem] = state.trainingData.splice(draggedIdx, 1);
                    state.trainingData.splice(targetIdx, 0, draggedItem);
                    renderTraining(); autoSaveToCloud();
                }
            }
        });

        const act = document.createElement('div');
        act.className = 'absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-20';
        act.innerHTML = `<button class="editBtn bg-blue-600/90 hover:bg-blue-500 text-white text-xs w-8 h-8 rounded-full shadow-lg hover:scale-110">✏️</button><button class="delBtn bg-red-600/90 hover:bg-red-500 text-white text-xs w-8 h-8 rounded-full shadow-lg hover:scale-110">🗑️</button>`;
        
        act.querySelector('.editBtn').onclick = (e) => {
            e.stopPropagation();
            requirePin(`Modificare la risorsa "${training.title}"?`, () => {
                document.getElementById('inputTrainingId').value = training.id;
                document.getElementById('inputTrainingTitle').value = training.title;
                document.getElementById('inputTrainingLink').value = training.link;
                if (training.ytId) document.querySelector('input[name="trainingType"][value="youtube"]').checked = true;
                else {
                    document.querySelector('input[name="trainingType"][value="custom"]').checked = true;
                    document.getElementById('trainingPreview').src = training.thumbnail;
                    document.getElementById('trainingPreview').classList.remove('hidden');
                    document.getElementById('trainingDropHint').classList.add('hidden');
                }
                window.toggleTrainingType();
                document.getElementById('trainingModalTitle').textContent = 'Modifica Risorsa';
                document.getElementById('btnSubmitTraining').textContent = 'Salva Modifiche';
                document.getElementById('addTrainingModal').classList.remove('hidden');
                document.getElementById('addTrainingModal').classList.add('flex');
            });
        };
        act.querySelector('.delBtn').onclick = (e) => {
            e.stopPropagation();
            requirePin(`Eliminare la formazione "${training.title}"?`, async () => {
                state.trainingData = state.trainingData.filter(t => t.id !== training.id);
                renderTraining(); await autoSaveToCloud();
            });
        };

        let thumbSrc = training.ytId ? `https://img.youtube.com/vi/${training.ytId}/maxresdefault.jpg` : training.thumbnail;

        card.innerHTML = `<div class="relative aspect-video bg-[#111]" onclick="window.open('${training.link}', '_blank')"><img src="${thumbSrc}" onerror="this.src='${training.thumbnail || ''}'; if(this.src==='') this.src='https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=800&auto=format&fit=crop'" class="w-full h-full object-cover pointer-events-none"><div class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"><span class="text-5xl drop-shadow-lg">▶️</span></div>${!training.ytId ? '<div class="absolute top-2 left-2 bg-purple-600 px-2 py-0.5 rounded text-[10px] font-bold uppercase shadow">Link Esterno</div>' : ''}</div><div class="p-4 flex-1 flex flex-col justify-center"><h3 class="font-bold text-white text-sm line-clamp-2 leading-tight group-hover:text-purple-400 transition-colors">${training.title}</h3></div>`;
        card.appendChild(act); trainingGrid.appendChild(card);
    });
}

// ==========================================
// RENDER EDITORS HUB
// ==========================================
export function switchEHTab(tabName) {
    state.currentEHTab = tabName;
    document.querySelectorAll('.eh-tab').forEach(btn => {
        if(btn.dataset.ehtab === tabName) { btn.classList.add('active', 'border-blue-500', 'text-blue-400'); btn.classList.remove('text-gray-400'); } 
        else { btn.classList.remove('active', 'border-blue-500', 'text-blue-400'); btn.classList.add('text-gray-400'); }
    });
    renderEditorsHub();
}

export function updateAudioUI() {
    document.querySelectorAll('.eh-play-trigger').forEach(trigger => {
        const id = trigger.dataset.id;
        const mainIcon = trigger.querySelector('.eh-icon-main');
        const playIcon = trigger.querySelector('.eh-play-icon');
        if(!mainIcon || !playIcon) return;
        
        if (id === state.currentlyPlayingEHId && !state.globalAudioPlayer.paused) {
            mainIcon.className = 'eh-icon-main hidden';
            playIcon.className = 'eh-play-icon block text-[#3ea6ff] text-sm';
            playIcon.textContent = '⏸️';
        } else {
            mainIcon.className = 'eh-icon-main group-hover/audio:hidden';
            playIcon.className = 'eh-play-icon hidden group-hover/audio:block text-[#3ea6ff] text-sm';
            playIcon.textContent = '▶️';
        }
    });
}

export function renderEditorsHub() {
    const ehGrid = document.getElementById('ehGrid');
    const noEHResults = document.getElementById('noEHResults');
    ehGrid.innerHTML = '';
    const term = document.getElementById('searchInput').value.toLowerCase();
    
    let filteredEH = state.editorsHubData.filter(item => item.category === state.currentEHTab);
    if (term) filteredEH = filteredEH.filter(item => item.title.toLowerCase().includes(term));

    if (filteredEH.length === 0) { noEHResults.classList.remove('hidden'); ehGrid.classList.add('hidden'); return; }
    noEHResults.classList.add('hidden'); ehGrid.classList.remove('hidden');

    filteredEH.forEach(item => {
        const isIcon = item.category === 'icons';
        const icon = item.category === 'sfx' ? '🔊' : '🎵';
        
        const card = document.createElement('div');
        card.className = 'bg-[#1a1a1a] rounded-xl p-4 border border-[#303030] hover:border-[#555] transition-colors flex flex-col relative group';
        
        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '🗑️';
        deleteBtn.className = 'absolute top-3 right-3 text-gray-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity z-10 text-sm bg-black/50 w-6 h-6 rounded-full flex items-center justify-center';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            requirePin(`Vuoi eliminare il file "${item.title}"?`, async () => {
                state.editorsHubData = state.editorsHubData.filter(t => t.id !== item.id);
                if(state.currentlyPlayingEHId === item.id) state.globalAudioPlayer.pause();
                renderEditorsHub(); await autoSaveToCloud();
            });
        };

        if (isIcon) {
            card.innerHTML = `<div class="w-full h-32 mb-3 bg-[#111] rounded-lg overflow-hidden flex items-center justify-center border border-[#333]"><img src="${item.link}" class="max-w-full max-h-full object-contain"></div><div class="flex flex-col pr-6 mb-3"><h3 class="font-bold text-white text-sm leading-tight line-clamp-1" title="${item.title}">${item.title}</h3><span class="text-[10px] text-gray-500 uppercase tracking-widest mt-0.5">Immagine / Icona</span></div><div class="mt-auto flex w-full"><button class="w-full py-2 bg-[#3ea6ff] hover:bg-[#65b8ff] text-black rounded text-sm font-bold transition-colors flex justify-center items-center gap-2 download-eh-btn">⬇️ Scarica File</button></div>`;
        } else {
            const isPlaying = state.currentlyPlayingEHId === item.id && !state.globalAudioPlayer.paused;
            const mainIconClass = isPlaying ? 'hidden' : 'group-hover/audio:hidden';
            const playIconClass = isPlaying ? 'block' : 'hidden group-hover/audio:block';
            
            card.innerHTML = `<div class="flex items-start gap-3 mb-4"><div class="relative w-10 h-10 rounded-lg bg-[#272727] flex items-center justify-center text-xl shrink-0 border border-[#404040] group/audio cursor-pointer eh-play-trigger" data-id="${item.id}" title="Clicca per ascoltare"><span class="eh-icon-main ${mainIconClass}">${icon}</span><span class="eh-play-icon ${playIconClass} text-[#3ea6ff] text-sm">${isPlaying ? '⏸️' : '▶️'}</span></div><div class="flex flex-col pr-6 flex-1"><h3 class="font-bold text-white text-sm leading-tight line-clamp-2" title="${item.title}">${item.title}</h3><span class="text-[10px] text-gray-500 mt-1 uppercase tracking-widest">${item.category === 'sfx' ? 'Sound Effect' : 'Audio Track'}</span></div></div><div class="mt-auto pt-2 flex w-full"><button class="w-full py-2 bg-[#3ea6ff] hover:bg-[#65b8ff] text-black rounded text-sm font-bold transition-colors flex justify-center items-center gap-2 download-eh-btn">⬇️ Scarica File</button></div>`;
            
            setTimeout(() => {
                const trigger = card.querySelector('.eh-play-trigger');
                if(trigger) {
                    trigger.onclick = (e) => {
                        e.stopPropagation();
                        if (state.currentlyPlayingEHId === item.id) {
                            if (state.globalAudioPlayer.paused) state.globalAudioPlayer.play().catch(() => window.open(item.link, '_blank'));
                            else state.globalAudioPlayer.pause();
                        } else {
                            if (state.currentlyPlayingEHId) updateAudioUI();
                            state.globalAudioPlayer.src = item.link;
                            state.globalAudioPlayer.play().catch(() => { state.currentlyPlayingEHId = null; updateAudioUI(); window.open(item.link, '_blank'); });
                            state.currentlyPlayingEHId = item.id;
                        }
                    };
                }
            }, 0);
        }

        card.appendChild(deleteBtn);
        setTimeout(() => {
            const btn = card.querySelector('.download-eh-btn');
            if(btn) btn.onclick = () => { window.open(item.link, '_blank'); state.downloadedEHFiles.push(item.id); localStorage.setItem('creatorhub_eh_downloads', JSON.stringify(state.downloadedEHFiles)); };
        }, 0);
        ehGrid.appendChild(card);
    });
}

// ==========================================
// STATS & DB
// ==========================================
export function renderStats() {
    let total = state.videoIdeas.length;
    let n = 0, p = 0, c = 0;
    const hours48 = 48 * 60 * 60 * 1000;
    const now = Date.now();

    state.videoIdeas.forEach(v => {
        const stat = getIdeaStatus(v);
        if (stat === 'new' || (now - (v.createdAt||0) <= hours48 && !v.assignee)) n++;
        if (stat === 'progress') p++;
        if (stat === 'completed') c++;
    });

    document.getElementById('statTotalIdeas').textContent = total;
    document.getElementById('statNewIdeas').textContent = n;
    document.getElementById('statProgressIdeas').textContent = p;
    document.getElementById('statCompletedIdeas').textContent = c;

    const teamBody = document.getElementById('teamPerformanceBody');
    teamBody.innerHTML = '';
    let teamData = state.TEAM_MEMBERS.map(member => {
        const assigned = state.videoIdeas.filter(v => v.assignee === member);
        const completed = assigned.filter(v => getIdeaStatus(v) === 'completed').length;
        return { name: member, completed, inProgress: assigned.length - completed, total: assigned.length };
    });

    const sortBy = document.getElementById('teamSortSelect').value;
    teamData.sort((a, b) => {
        if (sortBy === 'completed') return b.completed - a.completed;
        if (sortBy === 'inProgress') return b.inProgress - a.inProgress;
        return b.total - a.total;
    });

    teamData.forEach(member => {
        teamBody.innerHTML += `<tr><td class="px-4 py-3 font-semibold text-white">${member.name}</td><td class="px-4 py-3"><span class="bg-purple-900/30 text-purple-400 px-2 py-0.5 rounded text-xs border border-purple-500/30">${member.inProgress} in corso</span></td><td class="px-4 py-3"><span class="bg-green-900/30 text-green-400 px-2 py-0.5 rounded text-xs border border-green-500/30">${member.completed} finiti</span></td><td class="px-4 py-3 text-gray-400">${member.total} totali</td></tr>`;
    });
    
    // Timeline
    const timeline = document.getElementById('timelineContainer');
    timeline.innerHTML = '';
    const recent = [...state.videoIdeas].sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 15);
    if(recent.length === 0) timeline.innerHTML = '<p class="text-sm text-gray-500 mt-4 ml-4">Nessuna attività recente.</p>';
    else recent.forEach(idea => {
        const stat = getIdeaStatus(idea);
        let color = 'bg-gray-500', text = `Creata: <strong>${idea.title}</strong>`, subText = timeSince(idea.createdAt || Date.now());
        if(stat === 'completed') { color = 'bg-green-500'; text = `Completata: <strong>${idea.title}</strong>`; subText = `Da ${idea.assignee}`; }
        else if (stat === 'progress') { color = 'bg-purple-500'; text = `In lavorazione: <strong>${idea.title}</strong>`; subText = `Da ${idea.assignee}`; }
        else if (stat === 'new') { color = 'bg-blue-500'; text = `Nuova: <strong>${idea.title}</strong>`; }
        timeline.innerHTML += `<div class="mb-6 ml-6 relative"><span class="absolute flex items-center justify-center w-3 h-3 ${color} rounded-full -left-[31px] top-1 ring-4 ring-[#1a1a1a]"></span><h3 class="text-sm font-semibold text-gray-200 leading-tight">${text}</h3><time class="block mb-1 text-xs font-normal text-gray-500 mt-0.5">${subText}</time></div>`;
    });
}

export function renderDatabaseStats() {
    const sizeIdeas = parseFloat(getStringSizeInKB(JSON.stringify(state.videoIdeas)));
    const sizeTools = parseFloat(getStringSizeInKB(JSON.stringify(state.toolsData)));
    const sizeChannels = parseFloat(getStringSizeInKB(JSON.stringify(state.channels)));
    const sizeOther = parseFloat(getStringSizeInKB(JSON.stringify(state.trainingData))) + parseFloat(getStringSizeInKB(JSON.stringify(state.editorsHubData))) + parseFloat(getStringSizeInKB(JSON.stringify(state.inspChannels)));
    
    const totalKB = sizeIdeas + sizeTools + sizeChannels + sizeOther;
    
    if (totalKB > 1024) { document.getElementById('dbTotalSize').textContent = (totalKB/1024).toFixed(2); document.getElementById('dbTotalUnit').textContent = 'MB'; } 
    else { document.getElementById('dbTotalSize').textContent = totalKB.toFixed(1); document.getElementById('dbTotalUnit').textContent = 'KB'; }
    
    document.getElementById('dbSizeIdeas').textContent = sizeIdeas.toFixed(1) + ' KB';
    document.getElementById('dbSizeTools').textContent = sizeTools.toFixed(1) + ' KB';
    document.getElementById('dbSizeChannels').textContent = sizeChannels.toFixed(1) + ' KB';
    document.getElementById('dbSizeOther').textContent = sizeOther.toFixed(1) + ' KB';

    if (totalKB > 0) {
        document.getElementById('dbBarIdeas').style.width = `${(sizeIdeas / totalKB) * 100}%`;
        document.getElementById('dbBarTools').style.width = `${(sizeTools / totalKB) * 100}%`;
        document.getElementById('dbBarChannels').style.width = `${(sizeChannels / totalKB) * 100}%`;
        document.getElementById('dbBarOther').style.width = `${(sizeOther / totalKB) * 100}%`;
    }

    const heavyItems = [];
    state.videoIdeas.forEach(i => { if (i.thumbnail && i.thumbnail.length > 1000) heavyItems.push({ type: 'Idea', id: i.id, title: i.title, size: getStringSizeInKB(i.thumbnail), arrayRef: state.videoIdeas }); });
    state.toolsData.forEach(t => { if (t.image && t.image.length > 1000) heavyItems.push({ type: 'Tool', id: t.id, title: t.title, size: getStringSizeInKB(t.image), arrayRef: state.toolsData }); });
    state.channels.forEach(c => { if (c.profilePicUrl && c.profilePicUrl.length > 1000) heavyItems.push({ type: 'Canale', id: c.id, title: c.name, size: getStringSizeInKB(c.profilePicUrl), arrayRef: state.channels }); });

    heavyItems.sort((a, b) => parseFloat(b.size) - parseFloat(a.size));
    const tableBody = document.getElementById('dbHeavyItemsBody');
    tableBody.innerHTML = '';

    if (heavyItems.length === 0) {
        tableBody.parentElement.classList.add('hidden'); document.getElementById('dbNoHeavyItems').classList.remove('hidden');
    } else {
        tableBody.parentElement.classList.remove('hidden'); document.getElementById('dbNoHeavyItems').classList.add('hidden');
        heavyItems.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td class="px-5 py-3"><span class="px-2 py-0.5 rounded text-[10px] uppercase font-bold border border-gray-500/30">${item.type}</span></td><td class="px-5 py-3 font-semibold text-white">${item.title}</td><td class="px-5 py-3 text-yellow-400 font-bold">${item.size} KB</td><td class="px-5 py-3 text-right"><button class="delete-heavy-btn text-xs bg-red-900/40 hover:bg-red-600 text-red-400 hover:text-white px-3 py-1.5 rounded transition-colors font-bold">Elimina Elemento</button></td>`;
            tr.querySelector('.delete-heavy-btn').addEventListener('click', () => {
                requirePin(`Eliminare "${item.title}" per liberare spazio?`, async () => {
                    const idx = item.arrayRef.findIndex(x => x.id === item.id);
                    if (idx > -1) { item.arrayRef.splice(idx, 1); renderDatabaseStats(); await autoSaveToCloud(); }
                });
            });
            tableBody.appendChild(tr);
        });
    }
}

// ==========================================
// YOUTUBE FEED & INSPIRATIONS
// ==========================================
export function renderInspChannels() {
    const tbody = document.getElementById('inspChannelListBody');
    tbody.innerHTML = '';
    const term = document.getElementById('searchInput').value.toLowerCase();
    const filtered = term ? state.inspChannels.filter(c => c.name.toLowerCase().includes(term)) : state.inspChannels;

    if (filtered.length === 0) { document.getElementById('noInspChannels').classList.remove('hidden'); tbody.parentElement.classList.add('hidden'); } 
    else {
        document.getElementById('noInspChannels').classList.add('hidden'); tbody.parentElement.classList.remove('hidden');
        filtered.forEach(ch => {
            const tr = document.createElement('tr'); tr.className = 'hover:bg-[#272727] transition-colors';
            let avatarHtml = ch.avatar ? `<img src="${ch.avatar}" class="w-8 h-8 rounded-full object-cover shrink-0 border border-[#404040]">` : `<div class="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold border border-[#444]">${ch.name.charAt(0).toUpperCase()}</div>`;
            tr.innerHTML = `<td class="px-5 py-4 font-bold text-white flex items-center gap-3"><a href="${ch.url}" target="_blank" class="flex items-center gap-3 hover:text-blue-400 transition-colors">${avatarHtml}${ch.name}</a></td><td class="px-5 py-4 text-gray-300 font-mono text-sm">${ch.subs || 'N/A'}</td><td class="px-5 py-4 text-gray-300 font-mono text-sm">${ch.views || 'N/A'}</td><td class="px-5 py-4 text-gray-300">${ch.frequency || 'N/A'}</td><td class="px-5 py-4 font-semibold ${ch.trend.includes('Crescita') ? 'text-green-400' : (ch.trend.includes('Calo') ? 'text-red-400' : 'text-gray-400')}">${ch.trend || '➡️ Stabile'}</td><td class="px-5 py-4 text-right"><button class="text-red-400 hover:text-red-300 font-bold transition-colors del-insp-ch-btn text-lg" title="Elimina canale">🗑️</button></td>`;
            tr.querySelector('.del-insp-ch-btn').onclick = (e) => { e.stopPropagation(); requirePin(`Eliminare "${ch.name}"?`, async () => { state.inspChannels = state.inspChannels.filter(c => c.id !== ch.id); state.globalFeed = state.globalFeed.filter(v => v.channelId !== ch.id); renderInspChannels(); await autoSaveToCloud(); }); };
            tbody.appendChild(tr);
        });
    }
}

export function extractVideosFromYtData(ytData, channelId, channelName, avatarUrl) {
    let videos = [];
    try {
        const tabs = ytData.contents.twoColumnBrowseResultsRenderer.tabs;
        const videosTab = tabs.find(t => t.tabRenderer && (t.tabRenderer.title.toLowerCase().includes('video') || t.tabRenderer.endpoint.commandMetadata.webCommandMetadata.url.includes('/videos'))); 
        if (!videosTab || !videosTab.tabRenderer.content || !videosTab.tabRenderer.content.richGridRenderer) return videos;

        const list = videosTab.tabRenderer.content.richGridRenderer.contents;
        for (let item of list) {
            if (item.richItemRenderer && item.richItemRenderer.content.videoRenderer) {
                const v = item.richItemRenderer.content.videoRenderer;
                const lengthText = v.lengthText ? v.lengthText.simpleText : "0:00";
                const timeParts = lengthText.split(':').reverse();
                let durationSecs = 0;
                if (timeParts[0]) durationSecs += parseInt(timeParts[0]);
                if (timeParts[1]) durationSecs += parseInt(timeParts[1]) * 60;
                if (timeParts[2]) durationSecs += parseInt(timeParts[2]) * 3600;

                // SCUDO ANTI-SHORTS: Se durata <= 5 min, salta!
                if (durationSecs <= 300) continue;

                const title = v.title.runs[0].text;
                const videoId = v.videoId;
                const viewsText = v.viewCountText ? v.viewCountText.simpleText : "0 views";
                let viewsNum = 0;
                if (viewsText) {
                    let clean = viewsText.replace(/[^0-9.,KMB]/ig, '').replace(',', '.');
                    if(clean.includes('K')||clean.includes('k')) viewsNum = parseFloat(clean) * 1000;
                    else if(clean.includes('M')||clean.includes('m')) viewsNum = parseFloat(clean) * 1000000;
                    else viewsNum = parseInt(clean.replace(/\./g, ''));
                }

                let thumb = '';
                if(v.thumbnail && v.thumbnail.thumbnails && v.thumbnail.thumbnails.length > 0) thumb = v.thumbnail.thumbnails[v.thumbnail.thumbnails.length - 1].url;

                videos.push({ ytId: videoId, title: title, link: `https://www.youtube.com/watch?v=${videoId}`, thumbnail: thumb, views: isNaN(viewsNum)?0:viewsNum, viewsFormatted: formatViewsCount(isNaN(viewsNum)?0:viewsNum), timeAgoStr: v.publishedTimeText ? v.publishedTimeText.simpleText : "", pubDateMs: Date.now() - 86400000, duration: durationSecs, channelId: channelId, channelName: channelName, avatar: avatarUrl });
            }
        }
    } catch(e) {}
    return videos;
}

export async function loadInspFeed() {
    const grid = document.getElementById('inspFeedGrid');
    const noRes = document.getElementById('noInspFeed');
    const loadMoreBtn = document.getElementById('loadMoreFeedBtn');

    if(state.inspChannels.length === 0) { grid.innerHTML = ''; noRes.classList.remove('hidden'); loadMoreBtn.classList.add('hidden'); return; }

    noRes.classList.add('hidden');
    grid.innerHTML = '<div class="col-span-full text-center text-gray-400 py-20 flex flex-col items-center gap-4"><span class="text-4xl animate-spin">⏳</span><p class="font-bold tracking-widest uppercase text-xs text-gray-500">Recupero Feed in corso...</p></div>';
    grid.classList.remove('hidden'); loadMoreBtn.classList.add('hidden');

    let rawVideos = [];
    for (const ch of state.inspChannels) {
        if (!ch.ytId) continue;
        try {
            const html = await fetchYTProxy(`https://www.youtube.com/channel/${ch.ytId}/videos`);
            const ytDataStr = html.match(/var ytInitialData = (\{.*?\});<\/script>/);
            if (ytDataStr) rawVideos.push(...extractVideosFromYtData(JSON.parse(ytDataStr[1]), ch.id, ch.name, ch.avatar));
        } catch(e) {}
        await new Promise(r => setTimeout(r, 800)); 
    }

    rawVideos.sort((a, b) => b.pubDateMs - a.pubDateMs);
    const uniqueIds = new Set(); const uniqueVideos = [];
    for(let v of rawVideos) { if(!uniqueIds.has(v.ytId)) { uniqueIds.add(v.ytId); uniqueVideos.push(v); } }
    
    state.globalFeed = uniqueVideos; state.feedDisplayIndex = 0;
    grid.innerHTML = '';
    if(state.globalFeed.length === 0) { grid.innerHTML = '<div class="col-span-full text-center text-gray-500 py-10">Nessun video trovato.</div>'; return; }
    renderNextFeedBatch();
}

export function renderNextFeedBatch() {
    const grid = document.getElementById('inspFeedGrid');
    const loadMoreBtn = document.getElementById('loadMoreFeedBtn');
    const term = document.getElementById('searchInput').value.toLowerCase();
    
    let filteredFeed = term ? state.globalFeed.filter(v => v.title.toLowerCase().includes(term) || (v.channelName && v.channelName.toLowerCase().includes(term))) : state.globalFeed;
    
    const batchSize = 16; 
    const batch = filteredFeed.slice(state.feedDisplayIndex, state.feedDisplayIndex + batchSize);
    
    if(batch.length === 0 && state.feedDisplayIndex === 0) { grid.innerHTML = '<div class="col-span-full text-center text-gray-500 py-10">Nessun video corrispondente.</div>'; loadMoreBtn.classList.add('hidden'); return; }

    batch.forEach(video => {
        const card = document.createElement('div'); card.className = 'flex flex-col gap-2 cursor-pointer group relative';
        card.onclick = () => window.open(video.link, '_blank');
        let avatarHtml = video.avatar ? `<img src="${video.avatar}" class="w-9 h-9 rounded-full object-cover shrink-0 border border-[#404040]">` : `<div class="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold border border-[#404040] shrink-0">${video.channelName.charAt(0).toUpperCase()}</div>`;
        card.innerHTML = `<div class="relative w-full aspect-video rounded-xl overflow-hidden bg-[#272727] border border-transparent group-hover:border-[#444] transition-colors shadow-lg"><img src="${video.thumbnail}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"><div class="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"><span class="text-4xl drop-shadow-lg">▶️</span></div><div class="absolute top-2 left-2 bg-black/80 px-2 py-0.5 rounded text-[11px] font-bold text-gray-300 uppercase border border-[#444] backdrop-blur-sm">👀 ${video.viewsFormatted}</div><div class="absolute bottom-2 right-2 bg-black/80 px-1.5 py-0.5 rounded text-[10px] font-bold text-white border border-[#444]">${Math.floor(video.duration/60)}:${(video.duration%60).toString().padStart(2, '0')}</div></div><div class="flex gap-3 pr-2 mt-1">${avatarHtml}<div class="flex flex-col"><h3 class="text-[14px] font-semibold text-[#f1f1f1] line-clamp-2 leading-tight group-hover:text-blue-400 transition-colors">${video.title}</h3><div class="text-[12px] text-[#aaaaaa] mt-1 font-medium flex items-center gap-1">${video.channelName} <span class="text-[8px] opacity-50">•</span> ${video.timeAgoStr}</div></div></div>`;
        grid.appendChild(card);
    });

    state.feedDisplayIndex += batchSize;
    if (state.feedDisplayIndex >= filteredFeed.length) loadMoreBtn.classList.add('hidden');
    else loadMoreBtn.classList.remove('hidden');
}

// ==========================================
// MODALS ESTERNE E BINDINGS (GLOBALI)
// ==========================================

function updateChecklistProgress(idea) {
    const total = 4;
    const done = [idea.checklist.script, idea.checklist.audio, idea.checklist.video, idea.checklist.final].filter(Boolean).length;
    const perc = (done / total) * 100;
    
    document.getElementById('dashProgressText').textContent = `${perc}%`;
    document.getElementById('dashProgressBar').style.width = `${perc}%`;
    
    if(perc === 100) {
        document.getElementById('dashProgressBar').classList.replace('bg-blue-500', 'bg-green-500');
        document.getElementById('dashProgressText').classList.replace('text-blue-400', 'text-green-400');
        if (!idea.completedAt) idea.completedAt = new Date().toLocaleDateString('it-IT');
    } else {
        document.getElementById('dashProgressBar').classList.replace('bg-green-500', 'bg-blue-500');
        document.getElementById('dashProgressText').classList.replace('text-green-400', 'text-blue-400');
        idea.completedAt = null;
    }

    let dateHtml = `Preso in carico da <span class="font-bold text-white">${idea.assignee}</span> il <span class="text-gray-300">${idea.assignedAt || ''}</span>`;
    if (idea.completedAt) dateHtml += `<br><span class="text-green-400 font-medium text-xs">Completato il ${idea.completedAt} ✅</span>`;
    document.getElementById('dashAssignDateContainer').innerHTML = dateHtml;

    const sb = document.getElementById('dashStatusBadge');
    if (perc === 100) { sb.textContent='Completata'; sb.className='bg-green-600/20 text-green-400 text-xs px-2 py-0.5 rounded border border-green-500/30'; } 
    else { sb.textContent='In Progress'; sb.className='bg-purple-600/20 text-purple-400 text-xs px-2 py-0.5 rounded border border-purple-500/30'; }
}

window.openIdeaDashboard = function(idea) {
    state.currentlyOpenIdeaId = idea.id;
    if (!idea.checklist) idea.checklist = { script: false, audio: false, video: false, final: false };
    
    const ch = state.channels.find(c => c.id === idea.channelId);
    document.getElementById('dashThumb').src = idea.thumbnail || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=800&auto=format&fit=crop';
    document.getElementById('dashTitle').textContent = idea.title;
    document.getElementById('dashChannelBadge').textContent = ch ? ch.name : 'Nessun Canale';
    
    const statusType = getIdeaStatus(idea);
    const sb = document.getElementById('dashStatusBadge');
    if(statusType==='new') { sb.textContent='Nuova'; sb.className='bg-blue-600/20 text-blue-400 text-xs px-2 py-0.5 rounded border border-blue-500/30'; }
    if(statusType==='available') { sb.textContent='Disponibile'; sb.className='bg-yellow-600/20 text-yellow-400 text-xs px-2 py-0.5 rounded border border-yellow-500/30'; }
    if(statusType==='progress') { sb.textContent='In Progress'; sb.className='bg-purple-600/20 text-purple-400 text-xs px-2 py-0.5 rounded border border-purple-500/30'; }
    if(statusType==='completed') { sb.textContent='Completata'; sb.className='bg-green-600/20 text-green-400 text-xs px-2 py-0.5 rounded border border-green-500/30'; }

    document.getElementById('dashDriveBtn').onclick = () => { if(idea.driveLink) window.open(idea.driveLink, '_blank'); else alert('Nessun link Drive.'); };

    const assignSec = document.getElementById('dashAssignSection');
    const progSec = document.getElementById('dashProgressSection');
    const select = document.getElementById('assigneeSelect');
    const btnAssign = document.getElementById('assignConfirmBtn');

    if (!idea.assignee) {
        assignSec.classList.remove('hidden'); progSec.classList.add('hidden');
        select.value = ""; btnAssign.disabled = true;
        select.onchange = () => { btnAssign.disabled = (select.value === ""); };
        btnAssign.onclick = async () => {
            idea.assignee = select.value; idea.assignedAt = new Date().toLocaleDateString('it-IT');
            await autoSaveToCloud(); renderVideos(getFilteredIdeas()); window.openIdeaDashboard(idea); 
        };
    } else {
        assignSec.classList.add('hidden'); progSec.classList.remove('hidden');
        document.getElementById('chkScript').checked = idea.checklist.script;
        document.getElementById('chkAudio').checked = idea.checklist.audio;
        document.getElementById('chkVideo').checked = idea.checklist.video;
        document.getElementById('chkFinal').checked = idea.checklist.final;
        updateChecklistProgress(idea);
    }

    document.getElementById('dashDeleteBtn').onclick = () => {
        requirePin(`Eliminare l'idea "${idea.title}"?`, async () => {
            state.videoIdeas = state.videoIdeas.filter(v => v.id !== idea.id);
            document.getElementById('ideaDashboardModal').classList.add('hidden');
            document.getElementById('ideaDashboardModal').classList.remove('flex');
            renderVideos(getFilteredIdeas()); await autoSaveToCloud();
        });
    };

    document.getElementById('ideaDashboardModal').classList.remove('hidden');
    document.getElementById('ideaDashboardModal').classList.add('flex');
};

window.openEditIdeaModal = function(idea) {
    document.getElementById('editIdeaId').value = idea.id;
    document.getElementById('editIdeaTitle').value = idea.title;
    document.getElementById('editIdeaDriveLink').value = idea.driveLink || '';
    if (idea.assignee) { document.getElementById('editIdeaAssigneeContainer').classList.remove('hidden'); document.getElementById('editIdeaAssignee').value = idea.assignee; } 
    else { document.getElementById('editIdeaAssigneeContainer').classList.add('hidden'); document.getElementById('editIdeaAssignee').value = ""; }
    if (idea.thumbnail) { document.getElementById('editIdeaThumbPreview').src = idea.thumbnail; document.getElementById('editIdeaThumbPreview').classList.remove('hidden'); document.getElementById('editIdeaThumbDropHint').classList.add('hidden'); } 
    else { document.getElementById('editIdeaThumbPreview').src = ''; document.getElementById('editIdeaThumbPreview').classList.add('hidden'); document.getElementById('editIdeaThumbDropHint').classList.remove('hidden'); }
    document.getElementById('editIdeaThumbFileName').classList.add('hidden');
    state.files.editIdeaThumb = null;
    document.getElementById('editIdeaModal').classList.remove('hidden');
    document.getElementById('editIdeaModal').classList.add('flex');
};

// Listeners permanenti per le checkbox del modal Dashboard
setTimeout(() => {
    ['script', 'audio', 'video', 'final'].forEach(key => {
        const el = document.getElementById('chk' + key.charAt(0).toUpperCase() + key.slice(1));
        if(el) {
            el.addEventListener('change', async (e) => {
                if(!state.currentlyOpenIdeaId) return;
                const idea = state.videoIdeas.find(v => v.id === state.currentlyOpenIdeaId);
                if(idea) {
                    idea.checklist[key] = e.target.checked;
                    updateChecklistProgress(idea);
                    renderVideos(getFilteredIdeas());
                    await autoSaveToCloud();
                }
            });
        }
    });
}, 500);
