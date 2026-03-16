import { state } from './state.js';
import { timeSince, formatViewsCount, shuffleArray, getStringSizeInKB } from './utils.js';
import { callScriptAction, autoSaveToCloud, fetchYTProxy } from './api.js';
import { devLog, requirePin, closeModal, switchView } from './ui.js';

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
    filtered.forEach(v => { const s = getIdeaStatus(v); if(s==='new'){n++;a++;} else if(s==='available')a++; else if(s==='progress')p++; else if(s==='completed')c++; });
    document.getElementById('countNew').textContent = n; document.getElementById('countAvailable').textContent = a; document.getElementById('countProgress').textContent = p; document.getElementById('countCompleted').textContent = c;

    if (state.activeStatusFilter !== 'all') {
        filtered = filtered.filter(v => {
            const stat = getIdeaStatus(v);
            if (state.activeStatusFilter === 'available') return stat === 'available' || stat === 'new';
            return stat === state.activeStatusFilter;
        });
    }
    if (state.activeChannelId === null && !term && state.activeStatusFilter === 'all') {
        filtered.sort((x, y) => {
            let iA = state.randomIdeaOrder.indexOf(x.id); let iB = state.randomIdeaOrder.indexOf(y.id);
            if(iA === -1) iA = 999999; if(iB === -1) iB = 999999; return iA - iB;
        });
    }
    return filtered;
}

export function renderVideos(videosToRender) {
    const grid = document.getElementById('videoGrid'); const noRes = document.getElementById('noResults');
    grid.innerHTML = '';
    if (videosToRender.length === 0) { noRes.classList.remove('hidden'); grid.classList.add('hidden'); return; }
    noRes.classList.add('hidden'); grid.classList.remove('hidden');

    videosToRender.forEach(video => {
        const ch = state.channels.find(c => c.id === video.channelId);
        const channelName = ch ? ch.name : 'Nessun Canale';
        const statusType = getIdeaStatus(video);
        let bColor = 'text-gray-400'; let bLabel = '';
        if(statusType==='new'){bColor='text-blue-400';bLabel='Nuova';} else if(statusType==='available'){bColor='text-yellow-400';bLabel='Disponibile';} else if(statusType==='progress'){bColor='text-purple-400';bLabel='In Progress';} else if(statusType==='completed'){bColor='text-green-400';bLabel='Completata';}
        
        let avatarHtml = ch && ch.profilePicUrl ? `<img src="${ch.profilePicUrl}" class="w-9 h-9 rounded-full object-cover shrink-0 border border-[#404040]">` : `<div class="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-sm font-bold border border-[#404040]" style="background:${ch?ch.color||'#555':'#555'}">${channelName.charAt(0).toUpperCase()}</div>`;
        const timeAgoStr = video.createdAt ? timeSince(video.createdAt) : video.timeAgo;

        const card = document.createElement('div'); card.className = 'flex flex-col gap-3 cursor-pointer group relative';
        card.onclick = () => window.openIdeaDashboard(video); // Bound globally later
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
        const act = document.createElement('div'); act.className = 'absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-10';
        act.innerHTML = `<button class="editBtn bg-blue-600/90 hover:bg-blue-500 text-white text-xs w-8 h-8 rounded-full shadow-lg hover:scale-110">✏️</button><button class="delBtn bg-red-600/90 hover:bg-red-500 text-white text-xs w-8 h-8 rounded-full shadow-lg hover:scale-110">🗑️</button>`;
        act.querySelector('.editBtn').onclick = (e) => { e.stopPropagation(); requirePin(`Vuoi modificare l'idea "${video.title}"?`, () => window.openEditIdeaModal(video)); };
        act.querySelector('.delBtn').onclick = (e) => { e.stopPropagation(); requirePin(`Eliminare "${video.title}"?`, async () => { state.videoIdeas = state.videoIdeas.filter(v => v.id !== video.id); renderVideos(getFilteredIdeas()); window.renderChannelList(); await autoSaveToCloud(); }); };
        card.appendChild(act); grid.appendChild(card);
    });
}

// ... Continua implementando `renderChannelList`, `renderTools`, `renderTraining`, `renderEditorsHub`, `renderStats`, `renderDatabaseStats`, `loadInspFeed` e `renderInspChannels` usando "state." per leggere e scrivere arrays.
// (Per brevità mostro come convertire renderChannelList, il resto segue lo stesso identico pattern)

export function renderChannelList() {
    const channelListEl = document.getElementById('channelList');
    channelListEl.innerHTML = ''; document.getElementById('inputChannel').innerHTML = '<option value="">— Nessun canale —</option>';
    state.channels.forEach(ch => {
        document.getElementById('inputChannel').innerHTML += `<option value="${ch.id}">${ch.name}</option>`;
        const count = state.videoIdeas.filter(v => v.channelId === ch.id).length;
        let avatarHTML = ch.profilePicUrl ? `<img src="${ch.profilePicUrl}" class="w-7 h-7 rounded-full object-cover shrink-0 border border-[#404040]">` : `<div class="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs font-bold border border-[#404040]" style="background:${ch.color || '#3ea6ff'}">${ch.name.charAt(0).toUpperCase()}</div>`;
        const el = document.createElement('div');
        el.className = `channel-item channel-sidebar-item flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer ${state.activeChannelId === ch.id ? 'active' : ''}`;
        el.innerHTML = `<div class="shrink-0">${avatarHTML}</div><span class="sidebar-label text-sm text-gray-200 flex-1 truncate">${ch.name}</span><span class="sidebar-label text-[11px] text-gray-500 bg-[#222] px-1.5 py-0.5 rounded ml-1 transition-opacity">${count}</span>`;
        el.addEventListener('click', () => { window.setActiveFilter(ch.id); });
        channelListEl.appendChild(el);
    });
}