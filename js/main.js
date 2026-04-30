import { state } from './state.js';
import { callScriptAction, loadDataFromCloud, autoSaveToCloud, fetchYTProxy } from './api.js';
import { devLog, updateStatus, closeModal, closePinModal, requirePin, switchView } from './ui.js';
import { 
    renderVideos, getFilteredIdeas, renderChannelList, renderTools, 
    renderTraining, renderEditorsHub, renderStats, renderDatabaseStats, 
    renderInspChannels, loadInspFeed, switchEHTab, updateAudioUI, renderTMSPicks,
    renderNextFeedBatch, renderFinanceDashboard, getIdeaStatus, renderDevTodo, renderAdminChannelList
} from './renderers.js';
import { compressImage, shuffleArray, formatViewsCount } from './utils.js';

// =============================================
// ASSOCIAZIONE FUNZIONI GLOBALI (Per l'HTML)
// =============================================
window.switchView = switchView;
window.closeModal = closeModal;
window.closePinModal = closePinModal;
window.requirePin = requirePin;
window.renderChannelList = renderChannelList;
window.renderAdminChannelList = renderAdminChannelList;
window.renderDatabaseStats = renderDatabaseStats;
window.renderTMSPicks = renderTMSPicks;
window.renderDevTodo = renderDevTodo;
window.switchEHTab = switchEHTab;

window.updateSyncIndicators = function() {
    if (!state.SCRIPT_URL) return;
    const indicators = document.querySelectorAll('.item-sync-indicator');
    let html = '';
    if (state.syncError) {
        html = '<span title="Errore di Sincronizzazione" class="text-red-500 text-[9px] bg-red-900/30 w-4 h-4 rounded-full border border-red-500/30 shadow-sm inline-flex items-center justify-center shrink-0 ml-1.5 cursor-help">❌</span>';
    } else if (state.isSyncing) {
        html = '<span title="Salvataggio nel Cloud in corso..." class="text-yellow-400 text-[9px] animate-pulse bg-yellow-900/30 w-4 h-4 rounded-full border border-yellow-500/30 shadow-sm inline-flex items-center justify-center shrink-0 ml-1.5 cursor-help">⏳</span>';
    } else {
        html = '<span title="Sincronizzato nel Cloud correttamente" class="text-green-400 text-[9px] bg-green-900/30 w-4 h-4 rounded-full border border-green-500/30 shadow-sm inline-flex items-center justify-center shrink-0 ml-1.5 cursor-help">✔️</span>';
    }
    indicators.forEach(el => {
        if(el.innerHTML !== html) el.innerHTML = html;
    });
};

window.setLabContext = (labId) => {
    state.activeLab = labId;
    const dbRef = state.db[labId] || {};
    
    state.videoIdeas = dbRef.videoIdeas || [];
    state.channels = dbRef.channels || [];
    state.toolsData = dbRef.toolsData || [];
    state.trainingData = dbRef.trainingData || [];
    state.editorsHubData = dbRef.editorsHubData || [];
    state.inspChannels = dbRef.inspChannels || [];
    state.tmsPicks = dbRef.tmsPicks || [];
    state.finance = dbRef.finance || { revenues: [], editorCosts: [], subscriptions: [] };
    if(!state.finance.revenues) state.finance.revenues = [];
    if(!state.finance.editorCosts) state.finance.editorCosts = [];
    if(!state.finance.subscriptions) state.finance.subscriptions = [];
    state.devTodoList = dbRef.devTodoList || [];
    state.fastIdeas = dbRef.fastIdeas || [];
    state.brainstormingText = dbRef.brainstormingText || "";
    state.competitorsAnalysis = dbRef.competitorsAnalysis || [];
    state.scheduleData = dbRef.scheduleData || { defaults: {}, overrides: {} };

    const bsInput = document.getElementById('brainstormingInput');
    if (bsInput) bsInput.value = state.brainstormingText;

    devLog(`[SYSTEM] Contesto impostato su: ${labId === '3d' ? 'TMS 3D Lab' : 'TMS YT Lab'}`, "info");
    
    // Aggiorna visivamente il testo nel logo della sidebar
    document.querySelectorAll('.lab-switch-target').forEach(el => {
        el.innerHTML = `${labId === '3d' ? 'TMS 3D Lab' : 'TMS YT Lab'} <span class="text-[10px] opacity-50 ml-1 relative -top-0.5">▼</span>`;
    });

    if (window.renderChannelList) window.renderChannelList();
    if (window.switchView) window.switchView(state.currentView || 'idee');
};

window.openEarnings = () => {
    requirePin("Inserisci il PIN di sicurezza per accedere alla Dashboard Finanziaria.", () => {
        switchView('earnings');
    });
};

window.openAddRevenueModal = () => {
    document.getElementById('formRevenue').reset();
    document.getElementById('revDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('addRevenueModal').classList.remove('hidden'); document.getElementById('addRevenueModal').classList.add('flex');
};

window.openAddSubModal = () => {
    document.getElementById('formSub').reset();
    document.getElementById('addSubModal').classList.remove('hidden'); document.getElementById('addSubModal').classList.add('flex');
};

window.openAddEditorCostModal = () => {
    document.getElementById('formEditorCost').reset();
    document.getElementById('edCostDate').value = new Date().toISOString().split('T')[0];
    
    const select = document.getElementById('edCostIdea');
    select.innerHTML = '<option value="">Seleziona idea video...</option>';
    
    const completedIdeas = state.videoIdeas.filter(v => getIdeaStatus(v) === 'completed');
    completedIdeas.forEach(idea => { select.innerHTML += `<option value="${idea.id}" data-editor="${idea.assignee || 'Sconosciuto'}">${idea.title}</option>`; });
    
    select.onchange = (e) => {
        const opt = e.target.options[e.target.selectedIndex];
        document.getElementById('edCostName').value = opt.dataset.editor || '';
    };
    
    document.getElementById('addEditorCostModal').classList.remove('hidden'); document.getElementById('addEditorCostModal').classList.add('flex');
};

window.setActiveFilter = (channelId) => {
    if (state.currentView !== 'idee') switchView('idee');
    state.activeChannelId = channelId;
    document.getElementById('filterAll').classList.toggle('active', channelId === null);
    document.querySelectorAll('.channel-sidebar-item').forEach(el => el.classList.toggle('active', el.dataset.id === channelId));
    
    const pageTitle = document.getElementById('pageTitle');
    const pageSubtitle = document.getElementById('pageSubtitle');

    if (channelId === null) {
        pageTitle.textContent = 'Le tue Idee Video'; 
        pageSubtitle.textContent = 'Tutte le idee su tutti i canali.';
        state.randomIdeaOrder = shuffleArray([...state.videoIdeas]).map(v => v.id);
    } else {
        const ch = state.channels.find(c => c.id === channelId);
        pageTitle.textContent = ch ? ch.name : 'Canale'; 
        pageSubtitle.textContent = `Idee del canale "${ch ? ch.name : ''}"`;
    }
    renderVideos(getFilteredIdeas());
};

window.switchInspTab = (tabName) => {
    state.currentInspTab = tabName;
    
    document.querySelectorAll('.insp-tab').forEach(btn => {
        if(btn.dataset.insptab === tabName) {
            btn.classList.add('active', 'border-blue-500', 'text-blue-400');
            btn.classList.remove('text-gray-400');
        } else {
            btn.classList.remove('active', 'border-blue-500', 'text-blue-400');
            btn.classList.add('text-gray-400');
        }
    });
    
    const mainActionBtn = document.getElementById('mainActionBtn');
    const mainActionText = document.getElementById('mainActionText');

    if(tabName === 'channels') {
        document.getElementById('inspChannelsView').classList.remove('hidden');
        document.getElementById('inspFeedView').classList.add('hidden');
                    document.getElementById('inspPicksView').classList.add('hidden');
        document.getElementById('btnRefreshFeed').classList.add('hidden');
        mainActionBtn.classList.remove('hidden');
        mainActionText.textContent = 'Aggiungi Canale';
        mainActionBtn.onclick = () => { 
            document.getElementById('addInspChannelModal').classList.remove('hidden'); 
            document.getElementById('addInspChannelModal').classList.add('flex'); 
        };
        renderInspChannels();
                } else if (tabName === 'picks') {
                    document.getElementById('inspChannelsView').classList.add('hidden');
                    document.getElementById('inspFeedView').classList.add('hidden');
                    document.getElementById('inspPicksView').classList.remove('hidden');
                    document.getElementById('btnRefreshFeed').classList.add('hidden');
                    mainActionBtn.classList.remove('hidden');
                    mainActionText.textContent = 'Aggiungi Pick';
                    mainActionBtn.onclick = () => { document.getElementById('addPickModal').classList.remove('hidden'); document.getElementById('addPickModal').classList.add('flex'); };
                    renderTMSPicks();
    } else {
        document.getElementById('inspChannelsView').classList.add('hidden');
        document.getElementById('inspFeedView').classList.remove('hidden');
                    document.getElementById('inspPicksView').classList.add('hidden');
        document.getElementById('btnRefreshFeed').classList.remove('hidden');
        mainActionBtn.classList.add('hidden');
        if(state.globalFeed.length === 0) loadInspFeed();
    }
};

window.toggleTrainingType = () => {
    const type = document.querySelector('input[name="trainingType"]:checked').value;
    const imgBlock = document.getElementById('trainingCustomImageBlock');
    const fileInput = document.getElementById('inputTrainingFile');
    if(type === 'custom') {
        imgBlock.classList.remove('hidden');
    } else {
        imgBlock.classList.add('hidden');
        fileInput.value = '';
        document.getElementById('trainingPreview').classList.add('hidden');
        document.getElementById('trainingDropHint').classList.remove('hidden');
    }
};


// =============================================
// EVENT LISTENERS AL CARICAMENTO DEL DOM
// =============================================
document.addEventListener('DOMContentLoaded', () => {

    // --- SYSTEM DEBUG EVENT LISTENER ---
    document.addEventListener('click', (e) => {
        const t = e.target.closest('button, a, [onclick], .cursor-pointer');
        if (t) {
            const idStr = t.id ? `#${t.id}` : '';
            console.debug(`%c[UI CLICK]%c Tag: ${t.tagName.toLowerCase()}${idStr}`, 'color:#a855f7;font-weight:bold', 'color:gray', t);
        }
    });

    // --- INJECT SOURCES UI (Idee) ---
    const ideaForm = document.getElementById('ideaForm');
    if (ideaForm && !document.getElementById('inputSources')) {
        const submitBtn = ideaForm.querySelector('button[type=submit]');
        const sourcesContainer = document.createElement('div');
        sourcesContainer.className = "flex flex-col gap-1 w-full mt-2";
        sourcesContainer.innerHTML = `
            <label class="text-[10px] text-gray-500 uppercase font-bold mb-1 flex items-center gap-1"><span class="text-sm">🔗</span> Link / Inspirations (1 per riga)</label>
            <textarea id="inputSources" rows="2" class="w-full bg-[#111] text-white px-3 py-2 rounded-lg border border-[#444] outline-none focus:border-blue-500 text-sm custom-scrollbar" placeholder="Incolla qui i link utili (es. video YouTube, articoli...)"></textarea>
        `;
        if (submitBtn) {
            const target = submitBtn.closest('.flex.justify-end') || submitBtn;
            ideaForm.insertBefore(sourcesContainer, target);
        }
    }

    const editIdeaForm = document.getElementById('editIdeaForm');
    if (editIdeaForm && !document.getElementById('editIdeaSources')) {
        const submitBtnEdit = editIdeaForm.querySelector('button[type=submit]') || document.getElementById('btnSubmitEditIdea');
        const editSourcesContainer = document.createElement('div');
        editSourcesContainer.className = "flex flex-col gap-1 w-full mt-2";
        editSourcesContainer.innerHTML = `
            <label class="text-[10px] text-gray-500 uppercase font-bold mb-1 flex items-center gap-1"><span class="text-sm">🔗</span> Link / Inspirations (1 per riga)</label>
            <textarea id="editIdeaSources" rows="2" class="w-full bg-[#111] text-white px-3 py-2 rounded-lg border border-[#444] outline-none focus:border-blue-500 text-sm custom-scrollbar" placeholder="Incolla qui i link utili (es. video YouTube, articoli...)"></textarea>
        `;
        if (submitBtnEdit) {
            const targetEdit = submitBtnEdit.closest('.flex.justify-end') || submitBtnEdit;
            editIdeaForm.insertBefore(editSourcesContainer, targetEdit);
        }
        
        if (!document.getElementById('editIdeaChannelContainer')) {
            const editChannelContainer = document.createElement('div');
            editChannelContainer.id = 'editIdeaChannelContainer';
            editChannelContainer.className = "flex flex-col gap-1 w-full mt-2";
            editChannelContainer.innerHTML = `
                <label class="text-[10px] text-gray-500 uppercase font-bold mb-1 flex items-center gap-1"><span class="text-sm">📺</span> Canale Appartenenza</label>
                <select id="editIdeaChannel" class="w-full bg-[#111] text-white px-3 py-2 rounded-lg border border-[#444] outline-none focus:border-blue-500 text-sm appearance-none cursor-pointer"></select>
            `;
            const targetEdit2 = submitBtnEdit.closest('.flex.justify-end') || submitBtnEdit;
            editIdeaForm.insertBefore(editChannelContainer, targetEdit2);
        }
    }

    window.initLabFlow = function(labId) {
        devLog(`Avvio flusso Lab richiesto per: ${labId}`, "info", state);
        const splash = document.getElementById('tmsSplashScreen');
        if (splash) {
            splash.classList.add('opacity-0');
            setTimeout(() => splash.remove(), 500);
        }
        
        window.setLabContext(labId);

        // --- INIT AUTH CHECK DOPO LA SCELTA DEL LAB ---
        const savedUser = localStorage.getItem('tmslab_logged_in_user');
        if (savedUser) {
            const adminBtn = document.getElementById('adminBtn');
            if (adminBtn) adminBtn.textContent = savedUser.substring(0, 2).toUpperCase();
            if (state.SCRIPT_URL) loadDataFromCloud();
            else switchView('idee');
        } else {
            const loginOverlay = document.getElementById('loginOverlay');
            if (loginOverlay) {
                loginOverlay.classList.remove('hidden');
                loginOverlay.classList.add('flex');
            } else {
                if (state.SCRIPT_URL) loadDataFromCloud();
                else switchView('idee'); 
            }
        }
    };

    // --- SPLASH SCREEN: IDEAS TO REALITY ---
    // Rimosso lo Splash Screen iniziale come richiesto. Accesso diretto:
    window.initLabFlow('yt');

    // --- BINDING TASTINI FILTRO STATI IDEE (EVENT DELEGATION) ---
    window.applyStatusFilter = function(targetStatus) {
        state.activeStatusFilter = state.activeStatusFilter === targetStatus ? 'all' : targetStatus;
        ['new', 'available', 'progress', 'completed'].forEach(s => {
            const cEl = document.getElementById('count' + s.charAt(0).toUpperCase() + s.slice(1));
            const cCard = cEl ? (cEl.closest('button') || cEl.closest('.flex-col') || cEl.closest('div[class*="rounded"]') || cEl.closest('div[class*="bg-[#"]') || cEl.parentElement) : null;
            if (cCard) {
                if (state.activeStatusFilter === s) cCard.classList.add('ring-2', 'ring-blue-500', 'bg-[#2a2a2a]');
                else cCard.classList.remove('ring-2', 'ring-blue-500', 'bg-[#2a2a2a]');
            }
        });
        renderVideos(getFilteredIdeas());
    };

    document.addEventListener('click', (e) => {
        ['new', 'available', 'progress', 'completed'].forEach(s => {
            const countEl = document.getElementById('count' + s.charAt(0).toUpperCase() + s.slice(1));
            if (countEl) {
                const card = countEl.closest('button') || countEl.closest('.flex-col') || countEl.closest('div[class*="rounded"]') || countEl.closest('div[class*="bg-[#"]') || countEl.parentElement;
                if (card && (e.target === card || card.contains(e.target))) {
                    window.applyStatusFilter(s);
                }
            }
        });
    });

    setInterval(() => {
        ['new', 'available', 'progress', 'completed'].forEach(status => {
            const countEl = document.getElementById('count' + status.charAt(0).toUpperCase() + status.slice(1));
            if (countEl && !countEl.dataset.hooked) {
                const card = countEl.closest('button') || countEl.closest('.flex-col') || countEl.closest('div[class*="rounded"]') || countEl.closest('div[class*="bg-[#"]') || countEl.parentElement;
                if (card) {
                    card.style.cursor = 'pointer'; card.title = `Filtra per stato: ${status}`;
                    countEl.dataset.hooked = "true";
                }
            }
        });
    }, 1500); // Controlla ogni 1.5 secondi per agganciare i tasti in modo indistruttibile

    // --- INJECT FAST IDEAS VIEW & NAV (Dinamico) ---
    const fastIdeasInterval = setInterval(() => {
        const ideeNav = document.getElementById('navIdee');
        const mainContent = document.getElementById('viewIdeeWrapper')?.parentNode;
        
        if (ideeNav && mainContent && !document.getElementById('navFastIdeas')) {
            const fastNav = ideeNav.cloneNode(true);
            fastNav.id = 'navFastIdeas';
            
            const textWalker = document.createTreeWalker(fastNav, NodeFilter.SHOW_TEXT, null, false);
            let node;
            while ((node = textWalker.nextNode())) {
                if (node.nodeValue.includes('Idee')) node.nodeValue = node.nodeValue.replace(/Idee Video|Idee/g, 'Idee Veloci');
                if (node.nodeValue.includes('💡')) node.nodeValue = node.nodeValue.replace('💡', '⚡');
            }
            
            ideeNav.parentNode.insertBefore(fastNav, ideeNav.nextSibling);
            fastNav.classList.remove('active');
            fastNav.addEventListener('click', (e) => { e.preventDefault(); window.switchView('fastideas'); });

            const fastView = document.createElement('div');
            fastView.id = 'viewFastIdeasWrapper';
            fastView.className = 'hidden flex flex-col h-[calc(100vh-140px)] gap-6 overflow-y-auto custom-scrollbar pr-2 pb-6';
            fastView.innerHTML = `
                <div class="bg-[#1a1a1a] rounded-2xl border border-[#333] p-6 shadow-md flex flex-col gap-4 shrink-0">
                    <h2 class="text-xl font-black text-white flex items-center gap-2"><span>⚡</span> Idee Veloci</h2>
                    <p class="text-sm text-gray-400">Salva rapidamente i titoli per le tue idee. Quando avrai la copertina pronta, potrai promuoverle a "Idea Video" completa.</p>
                    
                    <form id="fastIdeaForm" class="flex flex-col sm:flex-row gap-3 mt-2">
                        <input type="text" id="inputFastIdea" placeholder="Scrivi un'idea veloce..." required class="flex-1 bg-[#111] text-white px-4 py-3 rounded-xl border border-[#444] outline-none focus:border-blue-500 text-sm">
                        <button type="submit" class="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition-colors shadow">Salva Idea</button>
                    </form>
                </div>
                
                <div id="fastIdeasGrid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                </div>
                <div id="noFastIdeas" class="hidden flex-col items-center justify-center py-20 text-gray-500">
                    <span class="text-5xl mb-4">✍️</span>
                    <p class="text-lg font-semibold text-gray-300">Nessuna idea veloce salvata.</p>
                </div>
            `;
            mainContent.appendChild(fastView);

            const fastModalHtml = `
                <div id="fastIdeaInfoModal" class="hidden fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center backdrop-blur-sm p-4">
                    <div class="bg-[#1a1a1a] border border-[#333] rounded-2xl p-6 w-[90%] max-w-md shadow-2xl flex flex-col relative">
                        <button class="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors text-2xl z-20" onclick="closeModal('fastIdeaInfoModal')">✖</button>
                        <h2 class="text-xl font-black text-white mb-4 flex items-center gap-2"><span>ℹ️</span> Info Idea Veloce</h2>
                        <input type="hidden" id="fastIdeaInfoId">
                        <div class="flex flex-col gap-2 mb-4">
                            <label class="text-[10px] text-gray-500 uppercase font-bold">Titolo</label>
                            <input type="text" id="fastIdeaInfoTitle" class="bg-[#111] text-white px-3 py-2 rounded-lg border border-[#444] outline-none text-sm" readonly>
                        </div>
                        <div class="flex flex-col gap-2 mb-6">
                            <label class="text-[10px] text-gray-500 uppercase font-bold">Descrizione</label>
                            <textarea id="fastIdeaInfoDesc" rows="4" class="bg-[#111] text-white px-3 py-2 rounded-lg border border-[#444] outline-none focus:border-blue-500 text-sm custom-scrollbar" placeholder="Aggiungi dettagli, spunti, link..."></textarea>
                        </div>
                        <div class="flex justify-end gap-3 mt-auto pt-4 border-t border-[#333]">
                            <button class="px-4 py-2 bg-[#2a2a2a] hover:bg-[#333] text-gray-300 rounded font-bold transition-colors" onclick="closeModal('fastIdeaInfoModal')">Annulla</button>
                            <button id="btnSaveFastIdeaInfo" class="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-bold transition-colors">Salva</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', fastModalHtml);

            document.getElementById('btnSaveFastIdeaInfo')?.addEventListener('click', async () => {
                const id = document.getElementById('fastIdeaInfoId').value;
                const desc = document.getElementById('fastIdeaInfoDesc').value;
                const idea = state.fastIdeas.find(f => f.id === id);
                if(idea) {
                    idea.description = desc;
                    if(window.renderFastIdeas) window.renderFastIdeas();
                    closeModal('fastIdeaInfoModal');
                    await autoSaveToCloud();
                }
            });

            document.getElementById('fastIdeaForm')?.addEventListener('submit', async (e) => {
                e.preventDefault();
                const input = document.getElementById('inputFastIdea');
                const title = input.value.trim();
                if (!title) return;
                
                if (!state.fastIdeas) state.fastIdeas = [];
                state.fastIdeas.push({ id: Date.now().toString(), title, createdAt: Date.now() });
                input.value = '';
                if(window.renderFastIdeas) window.renderFastIdeas();
                await autoSaveToCloud();
            });
            
            clearInterval(fastIdeasInterval);
        }
    }, 1000);

    // --- INJECT BRAINSTORMING VIEW & NAV (Dinamico) ---
    const bsInterval = setInterval(() => {
        const ideeNav = document.getElementById('navIdee');
        const mainContent = document.getElementById('viewIdeeWrapper')?.parentNode;
        
        if (ideeNav && mainContent && !document.getElementById('navBrainstorming')) {
            const brainNav = ideeNav.cloneNode(true);
            brainNav.id = 'navBrainstorming';
            
            const textWalker = document.createTreeWalker(brainNav, NodeFilter.SHOW_TEXT, null, false);
            let node;
            while ((node = textWalker.nextNode())) {
                if (node.nodeValue.includes('Idee')) node.nodeValue = node.nodeValue.replace(/Idee Video|Idee/g, 'Brainstorming');
                if (node.nodeValue.includes('💡')) node.nodeValue = node.nodeValue.replace('💡', '🧠');
            }
            
            ideeNav.parentNode.insertBefore(brainNav, ideeNav.nextSibling);
            brainNav.classList.remove('active');
            brainNav.addEventListener('click', (e) => { e.preventDefault(); window.switchView('brainstorming'); });

            const brainView = document.createElement('div');
            brainView.id = 'viewBrainstormingWrapper';
            brainView.className = 'hidden flex flex-col h-[calc(100vh-140px)] gap-6';
            brainView.innerHTML = `
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
                    <div class="lg:col-span-1 bg-[#1a1a1a] rounded-2xl border border-[#333] p-6 flex flex-col gap-4 overflow-y-auto">
                        <h2 class="text-xl font-black text-white uppercase tracking-widest flex items-center gap-2"><span>🔥</span> Format Virali</h2>
                        <p class="text-sm text-gray-400 leading-relaxed">Sfrutta questi template testati per generare idee ad alta CTR:</p>
                        <ul class="text-sm text-gray-300 space-y-3 mt-2">
                            <li class="p-3 bg-[#222] rounded-xl border border-[#444] hover:border-blue-500 hover:bg-[#2a2a2a] transition-all cursor-pointer group" onclick="document.getElementById('brainstormingInput').value += '\\n\\n- Every level of... '">
                                <span class="font-bold text-white group-hover:text-blue-400 transition-colors">Every level of...</span>
                                <span class="block text-[11px] text-gray-500 mt-1 italic">Es: Every level of programming languages</span>
                            </li>
                            <li class="p-3 bg-[#222] rounded-xl border border-[#444] hover:border-purple-500 hover:bg-[#2a2a2a] transition-all cursor-pointer group" onclick="document.getElementById('brainstormingInput').value += '\\n\\n- Every rank of... '">
                                <span class="font-bold text-white group-hover:text-purple-400 transition-colors">Every rank of...</span>
                                <span class="block text-[11px] text-gray-500 mt-1 italic">Es: Every rank of chess players</span>
                            </li>
                            <li class="p-3 bg-[#222] rounded-xl border border-[#444] hover:border-green-500 hover:bg-[#2a2a2a] transition-all cursor-pointer group" onclick="document.getElementById('brainstormingInput').value += '\\n\\n- POV: '">
                                <span class="font-bold text-white group-hover:text-green-400 transition-colors">POV: ...</span>
                                <span class="block text-[11px] text-gray-500 mt-1 italic">Es: POV: You are a junior developer</span>
                            </li>
                            <li class="p-3 bg-[#222] rounded-xl border border-[#444] hover:border-red-500 hover:bg-[#2a2a2a] transition-all cursor-pointer group" onclick="document.getElementById('brainstormingInput').value += '\\n\\n- ... explained '">
                                <span class="font-bold text-white group-hover:text-red-400 transition-colors">... explained</span>
                                <span class="block text-[11px] text-gray-500 mt-1 italic">Es: Quantum physics explained</span>
                            </li>
                            <li class="p-3 bg-[#222] rounded-xl border border-[#444] hover:border-yellow-500 hover:bg-[#2a2a2a] transition-all cursor-pointer group" onclick="document.getElementById('brainstormingInput').value += '\\n\\n- Every ... explained in ... minutes '">
                                <span class="font-bold text-white group-hover:text-yellow-400 transition-colors">Every ... explained in ... mins</span>
                                <span class="block text-[11px] text-gray-500 mt-1 italic">Es: Every paradox explained in 10 minutes</span>
                            </li>
                            <li class="p-3 bg-[#222] rounded-xl border border-[#444] hover:border-orange-500 hover:bg-[#2a2a2a] transition-all cursor-pointer group" onclick="document.getElementById('brainstormingInput').value += '\\n\\n- ... made simple '">
                                <span class="font-bold text-white group-hover:text-orange-400 transition-colors">... made simple</span>
                                <span class="block text-[11px] text-gray-500 mt-1 italic">Es: Machine learning made simple</span>
                            </li>
                            <li class="p-3 bg-[#222] rounded-xl border border-[#444] hover:border-teal-500 hover:bg-[#2a2a2a] transition-all cursor-pointer group" onclick="document.getElementById('brainstormingInput').value += '\\n\\n- ... explained like you are 5 '">
                                <span class="font-bold text-white group-hover:text-teal-400 transition-colors">... explained like you are 5</span>
                                <span class="block text-[11px] text-gray-500 mt-1 italic">Es: The stock market explained like you are 5</span>
                            </li>
                            <li class="p-3 bg-[#222] rounded-xl border border-[#444] hover:border-pink-500 hover:bg-[#2a2a2a] transition-all cursor-pointer group" onclick="document.getElementById('brainstormingInput').value += '\\n\\n- What it is like to be... '">
                                <span class="font-bold text-white group-hover:text-pink-400 transition-colors">What it is like to be...</span>
                                <span class="block text-[11px] text-gray-500 mt-1 italic">Es: What it is like to be an astronaut</span>
                            </li>
                            <li class="p-3 bg-[#222] rounded-xl border border-[#444] hover:border-indigo-500 hover:bg-[#2a2a2a] transition-all cursor-pointer group" onclick="document.getElementById('brainstormingInput').value += '\\n\\n- Your life as a... '">
                                <span class="font-bold text-white group-hover:text-indigo-400 transition-colors">Your life as a...</span>
                                <span class="block text-[11px] text-gray-500 mt-1 italic">Es: Your life as a medieval king</span>
                            </li>
                            <li class="p-3 bg-[#222] rounded-xl border border-[#444] hover:border-rose-500 hover:bg-[#2a2a2a] transition-all cursor-pointer group" onclick="document.getElementById('brainstormingInput').value += '\\n\\n- The worst... '">
                                <span class="font-bold text-white group-hover:text-rose-400 transition-colors">The worst...</span>
                                <span class="block text-[11px] text-gray-500 mt-1 italic">Es: The worst design flaws in history</span>
                            </li>
                        </ul>
                    </div>
                    <div class="lg:col-span-2 bg-[#1a1a1a] rounded-2xl border border-[#333] flex flex-col h-full overflow-hidden shadow-2xl relative">
                        <div class="p-4 bg-[#222] border-b border-[#333] flex justify-between items-center z-10 shadow-sm">
                            <h2 class="text-lg font-bold text-white flex items-center gap-2"><span>📝</span> Blocco Appunti Libero</h2>
                            <div class="flex items-center gap-3">
                                <span id="bsSaveStatus" class="text-xs text-gray-400 font-medium"></span>
                                <button id="btnSaveBrainstorming" class="px-5 py-2 bg-gradient-to-r from-blue-600 to-blue-800 hover:from-blue-500 hover:to-blue-700 shadow hover:shadow-blue-500/25 text-white text-sm font-bold rounded-lg transition-all active:scale-95">Salva Ora</button>
                            </div>
                        </div>
                        <textarea id="brainstormingInput" class="flex-1 w-full p-8 bg-transparent text-gray-200 resize-none outline-none leading-relaxed text-lg placeholder:text-gray-600 custom-scrollbar" placeholder="Butta giù tutto quello che ti passa per la testa... Clicca sui format a sinistra per inserirli qui rapidamente."></textarea>
                    </div>
                </div>
            `;
            mainContent.appendChild(brainView);

            const bsInput = document.getElementById('brainstormingInput');
            const btnSaveBs = document.getElementById('btnSaveBrainstorming');
            const bsStatus = document.getElementById('bsSaveStatus');
            
            if (bsInput) bsInput.value = state.brainstormingText || '';

            const triggerSave = async () => {
                if (state.brainstormingText === bsInput.value) return;
                state.brainstormingText = bsInput.value;
                btnSaveBs.textContent = '🔄...'; btnSaveBs.disabled = true; bsStatus.textContent = "Salvataggio...";
                await autoSaveToCloud();
                btnSaveBs.textContent = 'Salva Ora'; btnSaveBs.disabled = false; bsStatus.textContent = "Salvato ✓";
                setTimeout(() => { if (bsStatus.textContent === "Salvato ✓") bsStatus.textContent = ""; }, 2500);
            };

            btnSaveBs.addEventListener('click', triggerSave);

            let bsTimeout;
            bsInput.addEventListener('input', () => {
                bsStatus.textContent = "Modificato...";
                clearTimeout(bsTimeout);
                bsTimeout = setTimeout(triggerSave, 2500); // Autosave dopo 2.5s di inattività
            });
            
            clearInterval(bsInterval); // Interrompe la ricerca non appena ha iniettato con successo
        }
    }, 1000);

    // --- INJECT COMPETITORS ANALYSIS VIEW & NAV (Dinamico) ---
    const compInterval = setInterval(() => {
        const inspNav = document.getElementById('navInspirations');
        const mainContent = document.getElementById('viewIdeeWrapper')?.parentNode;
        
        if (inspNav && mainContent && !document.getElementById('navCompetitors')) {
            const compNav = inspNav.cloneNode(true);
            compNav.id = 'navCompetitors';
            
            const textWalker = document.createTreeWalker(compNav, NodeFilter.SHOW_TEXT, null, false);
            let node;
            while ((node = textWalker.nextNode())) {
                if (node.nodeValue.includes('Inspirations')) node.nodeValue = node.nodeValue.replace('Inspirations', 'Competitors Analysis');
                if (node.nodeValue.includes('✨') || node.nodeValue.includes('📺')) node.nodeValue = node.nodeValue.replace(/✨|📺/g, '🕵️‍♂️');
            }
            
            inspNav.parentNode.insertBefore(compNav, inspNav.nextSibling);
            compNav.classList.remove('active');
            compNav.addEventListener('click', (e) => { e.preventDefault(); window.switchView('competitors'); });

            const compView = document.createElement('div');
            compView.id = 'viewCompetitorsWrapper';
            compView.className = 'hidden flex flex-col h-[calc(100vh-140px)] gap-6 overflow-y-auto custom-scrollbar pr-2 pb-6';
            compView.innerHTML = `
                <div id="noCompetitors" class="hidden flex flex-col items-center justify-center py-20 text-gray-500">
                    <span class="text-6xl mb-4">🕵️‍♂️</span>
                    <p class="text-lg font-semibold text-gray-300">Nessuna analisi competitor.</p>
                    <p class="text-sm mt-2">Aggiungi un link video da studiare.</p>
                </div>
                <div id="competitorsGrid" class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6"></div>
            `;
            mainContent.appendChild(compView);

            const modalsHtml = `
                <div id="addCompetitorModal" class="hidden fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center backdrop-blur-sm">
                    <div class="bg-[#1a1a1a] border border-[#333] rounded-2xl p-6 w-[90%] max-w-md shadow-2xl">
                        <h2 class="text-xl font-black text-white mb-4 flex items-center gap-2"><span>🕵️‍♂️</span> Aggiungi Video</h2>
                        <form id="competitorForm" class="flex flex-col gap-4">
                            <input type="url" id="inputCompLink" placeholder="Link Video YouTube..." required class="px-4 py-3 bg-[#111] text-white rounded-lg border border-[#444] outline-none focus:border-blue-500">
                            <div class="flex justify-end gap-3 mt-2">
                                <button type="button" class="px-4 py-2 bg-[#2a2a2a] hover:bg-[#333] text-gray-300 rounded font-bold transition-colors" onclick="closeModal('addCompetitorModal', 'competitorForm')">Annulla</button>
                                <button type="submit" id="btnSubmitComp" class="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-bold transition-colors">Analizza Link</button>
                            </div>
                        </form>
                    </div>
                </div>

                <div id="compDashboardModal" class="hidden fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center backdrop-blur-sm p-4">
                    <div class="bg-[#1a1a1a] border border-[#333] rounded-2xl w-full max-w-[1200px] max-h-full flex flex-col shadow-2xl overflow-hidden relative">
                        <button class="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors text-2xl z-20 bg-black/50 w-8 h-8 rounded-full flex items-center justify-center" onclick="closeModal('compDashboardModal')">✖</button>
                        
                        <div class="flex-1 overflow-y-auto custom-scrollbar p-6">
                            <div class="flex flex-col lg:flex-row gap-6 mb-4">
                                <div class="w-full lg:w-1/3 shrink-0 flex flex-col gap-4">
                                    <div class="rounded-xl overflow-hidden aspect-video border border-[#333] relative bg-[#111]">
                                        <img id="compDashThumb" class="w-full h-full object-cover">
                                        <div class="absolute bottom-2 right-2 bg-black/80 px-2 py-0.5 rounded text-[10px] font-bold text-white border border-[#444]" id="compDashDuration">0:00</div>
                                    </div>
                                    <h2 id="compDashTitle" class="text-xl font-bold text-white leading-tight"></h2>
                                    <div class="flex items-center gap-3 bg-[#222] p-3 rounded-xl border border-[#333]">
                                        <div id="compDashAvatar" class="w-10 h-10 rounded-full overflow-hidden shrink-0 border border-[#444] bg-[#111]"></div>
                                        <div class="flex flex-col">
                                            <span id="compDashAuthor" class="text-sm font-bold text-gray-200"></span>
                                            <span id="compDashViews" class="text-xs text-gray-400"></span>
                                        </div>
                                    </div>
                                    <button id="compDashLinkBtn" class="w-full py-2 bg-[#2a2a2a] hover:bg-[#333] border border-[#444] text-white rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-2">Apri su YouTube ↗</button>
                                    <button id="compDashDeleteBtn" class="w-full py-2 bg-red-900/30 hover:bg-red-900/60 border border-red-500/30 text-red-400 rounded-lg text-sm font-bold transition-colors mt-auto">Elimina Analisi</button>
                                </div>
                                
                                <div class="w-full lg:w-2/3 flex flex-col gap-6">
                                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <div class="bg-[#222] p-3 rounded-xl border border-[#333] flex flex-col">
                                            <label class="text-[10px] text-gray-500 uppercase font-bold mb-1">Video Length</label>
                                            <input type="text" id="compInpVideoLength" class="bg-transparent text-white font-bold outline-none w-full text-sm" placeholder="es. 10:05">
                                        </div>
                                        <div class="bg-[#222] p-3 rounded-xl border border-[#333] flex flex-col">
                                            <label class="text-[10px] text-gray-500 uppercase font-bold mb-1">Script (Parole)</label>
                                            <input type="number" id="compInpScriptLen" class="bg-transparent text-white font-bold outline-none w-full text-sm" placeholder="es. 1500">
                                        </div>
                                        <div class="bg-[#222] p-3 rounded-xl border border-[#333] flex flex-col">
                                            <label class="text-[10px] text-gray-500 uppercase font-bold mb-1">Minuti Musica</label>
                                            <input type="text" id="compInpMusicMin" class="bg-transparent text-white font-bold outline-none w-full text-sm" placeholder="es. 8:30">
                                        </div>
                                        <div class="bg-[#222] p-3 rounded-xl border border-[#333] flex flex-col">
                                            <label class="text-[10px] text-gray-500 uppercase font-bold mb-1">% Musica su Video</label>
                                            <input type="text" id="compInpMusicPerc" class="bg-transparent text-white font-bold outline-none w-full text-sm" placeholder="es. 85%">
                                        </div>
                                        <div class="bg-[#222] p-3 rounded-xl border border-[#333] flex flex-col">
                                            <label class="text-[10px] text-gray-500 uppercase font-bold mb-1">Cambi Musica</label>
                                            <input type="number" id="compInpMusicChanges" class="bg-transparent text-white font-bold outline-none w-full text-sm" placeholder="0">
                                        </div>
                                        <div class="bg-[#222] p-3 rounded-xl border border-[#333] flex flex-col">
                                            <label class="text-[10px] text-gray-500 uppercase font-bold mb-1">Durata Media</label>
                                            <input type="text" id="compInpAvgMusic" class="bg-transparent text-white font-bold outline-none w-full text-sm" placeholder="es. 0:45">
                                        </div>
                                        <div class="bg-[#222] p-3 rounded-xl border border-[#333] flex flex-col">
                                            <label class="text-[10px] text-gray-500 uppercase font-bold mb-1">Tagli Netti Musica</label>
                                            <select id="compInpHardCuts" class="bg-transparent text-white font-bold outline-none w-full cursor-pointer appearance-none text-sm"><option value="No">No</option><option value="Si">Si</option></select>
                                        </div>
                                        <div class="bg-[#222] p-3 rounded-xl border border-[#333] flex flex-col">
                                            <label class="text-[10px] text-gray-500 uppercase font-bold mb-1">Immagini Still</label>
                                            <input type="number" id="compInpStill" class="bg-transparent text-white font-bold outline-none w-full text-sm" placeholder="0">
                                        </div>
                                        <div class="bg-[#222] p-3 rounded-xl border border-[#333] flex flex-col md:col-span-2">
                                            <label class="text-[10px] text-gray-500 uppercase font-bold mb-1">Immagini con Edits</label>
                                            <input type="number" id="compInpEdited" class="bg-transparent text-white font-bold outline-none w-full text-sm" placeholder="0">
                                        </div>
                                    </div>
                                    
                                    <div class="bg-[#222] p-4 rounded-xl border border-[#333]">
                                        <h3 class="text-sm font-bold text-white mb-3 flex items-center gap-2"><span>🎨</span> Timeline Color Code (DaVinci)</h3>
                                        <div class="flex flex-col gap-2">
                                            <div class="flex items-center gap-3"><span class="w-4 h-4 rounded-sm bg-yellow-500 shrink-0"></span><span class="text-xs text-gray-300 w-24">Musica</span><input type="text" id="compColorMusic" class="flex-1 bg-[#111] px-2 py-1 rounded border border-[#444] text-sm text-white" placeholder="Note sulla traccia musicale..."></div>
                                            <div class="flex items-center gap-3"><span class="w-4 h-4 rounded-sm bg-green-500 shrink-0"></span><span class="text-xs text-gray-300 w-24">Immagine</span><input type="text" id="compColorImg" class="flex-1 bg-[#111] px-2 py-1 rounded border border-[#444] text-sm text-white" placeholder="Note sulle immagini fisse..."></div>
                                            <div class="flex items-center gap-3"><span class="w-4 h-4 rounded-sm bg-blue-500 shrink-0"></span><span class="text-xs text-gray-300 w-24">Video</span><input type="text" id="compColorVid" class="flex-1 bg-[#111] px-2 py-1 rounded border border-[#444] text-sm text-white" placeholder="Note sui video/clip b-roll..."></div>
                                            <div class="flex items-center gap-3"><span class="w-4 h-4 rounded-sm bg-purple-500 shrink-0"></span><span class="text-xs text-gray-300 w-24">Img (Zoom/FX)</span><input type="text" id="compColorFX" class="flex-1 bg-[#111] px-2 py-1 rounded border border-[#444] text-sm text-white" placeholder="Note su effetti, keyframes, zoom..."></div>
                                            <div class="flex items-center gap-3"><span class="w-4 h-4 rounded-sm bg-amber-700 shrink-0"></span><span class="text-xs text-gray-300 w-24">SFX</span><input type="text" id="compColorSFX" class="flex-1 bg-[#111] px-2 py-1 rounded border border-[#444] text-sm text-white" placeholder="Note sugli effetti sonori (riser, chiusure, chiacchiericcio)..."></div>
                                        </div>
                                    </div>
                                    
                                    <div class="bg-[#222] p-4 rounded-xl border border-[#333]">
                                        <div class="flex justify-between items-center mb-3">
                                            <h3 class="text-sm font-bold text-white flex items-center gap-2"><span>🖼️</span> Screen di Analisi</h3>
                                            <label class="cursor-pointer text-xs bg-blue-600/30 hover:bg-blue-600/50 text-blue-400 font-bold border border-blue-500/30 px-3 py-1.5 rounded transition-colors">
                                                + Aggiungi Screen
                                                <input type="file" id="compAddImage" class="hidden" accept="image/*">
                                            </label>
                                        </div>
                                        <div id="compImagesGrid" class="flex gap-4 overflow-x-auto pb-2 custom-scrollbar"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="p-4 bg-[#111] border-t border-[#333] flex justify-end gap-4 shrink-0">
                            <span id="compSaveStatus" class="text-sm text-gray-400 self-center"></span>
                            <button id="compSaveBtn" class="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-bold transition-colors shadow">Salva Analisi</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalsHtml);

            // --- BINDING LOGICA COMPETITORS ---
            window.handleCompSubmit = async (e) => {
                e.preventDefault();
                const submitBtn = document.getElementById('btnSubmitComp');
                const link = document.getElementById('inputCompLink').value.trim();
                const ytId = window.getYouTubeID(link);

                if (!ytId) { alert("Link YouTube non valido."); return; }
                submitBtn.disabled = true; submitBtn.textContent = '🔄 Analisi in corso...';

                let title = "Video Competitor", author = "Sconosciuto", avatar = "", views = "N/A views", durationStr = "0:00", thumbnail = `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg`;
                
                try {
                    const html = await fetchYTProxy(`https://www.youtube.com/watch?v=${ytId}`);
                    let playerRes = null; let ytData = null;
                    
                    const playerStart = html.indexOf('var ytInitialPlayerResponse = ');
                    if (playerStart !== -1) {
                        const jsonStart = playerStart + 30; let end = html.indexOf(';</script>', jsonStart);
                        if (end === -1) end = html.indexOf(';var ', jsonStart);
                        if (end !== -1) try { playerRes = JSON.parse(html.substring(jsonStart, end)); } catch(err) {}
                    }
                    
                    const dataStart = html.indexOf('var ytInitialData = ');
                    if (dataStart !== -1) {
                        const jsonStart = dataStart + 20; let end = html.indexOf(';</script>', jsonStart);
                        if (end === -1) end = html.indexOf(';var ', jsonStart);
                        if (end !== -1) try { ytData = JSON.parse(html.substring(jsonStart, end)); } catch(err) {}
                    }

                    if (playerRes && playerRes.videoDetails) {
                        const details = playerRes.videoDetails;
                        title = details.title || title; author = details.author || author;
                        if (details.lengthSeconds) {
                            const sec = parseInt(details.lengthSeconds);
                            durationStr = `${Math.floor(sec/60)}:${(sec%60).toString().padStart(2,'0')}`;
                        }
                        if (details.viewCount) views = formatViewsCount(details.viewCount);
                    }
                    if (ytData) {
                        try {
                            const secondary = ytData.contents?.twoColumnWatchNextResults?.results?.results?.contents?.find(c => c.videoSecondaryInfoRenderer)?.videoSecondaryInfoRenderer;
                            if (secondary?.owner?.videoOwnerRenderer) {
                                const owner = secondary.owner.videoOwnerRenderer;
                                if (!author || author === "Sconosciuto") author = owner.title?.runs[0]?.text || author;
                                if (owner.thumbnail?.thumbnails?.length > 0) avatar = owner.thumbnail.thumbnails[0].url;
                            }
                        } catch(e) {}
                    }
                } catch(err) { console.warn(err); }
                
                if(!state.competitorsAnalysis) state.competitorsAnalysis = [];
                state.competitorsAnalysis.push({ 
                    id: Date.now().toString(), ytId, title, author, avatar, views, duration: durationStr, thumbnail, link,
                    analysis: { videoLength: durationStr, scriptLength: '', musicMin: '', musicPerc: '', musicChanges: '', avgMusic: '', hardCuts: 'No', stillImages: '', editedImages: '', colorMusic: '', colorImg: '', colorVid: '', colorFX: '', colorSFX: '', images: [] }
                });
                
                if(window.renderCompetitors) window.renderCompetitors();
                closeModal('addCompetitorModal', 'competitorForm');
                autoSaveToCloud();
                submitBtn.disabled = false; submitBtn.textContent = 'Analizza Link'; document.getElementById('inputCompLink').value = '';
            };

            window.saveCompAnalysis = async () => {
                const comp = state.competitorsAnalysis.find(c => c.id === state.currentCompId);
                if(!comp) return;
                
                const btn = document.getElementById('compSaveBtn'); const status = document.getElementById('compSaveStatus');
                btn.disabled = true; btn.textContent = '🔄...'; status.textContent = "Salvataggio...";

                if(!comp.analysis) comp.analysis = {};
                comp.analysis.videoLength = document.getElementById('compInpVideoLength').value; comp.analysis.scriptLength = document.getElementById('compInpScriptLen').value; comp.analysis.musicMin = document.getElementById('compInpMusicMin').value; comp.analysis.musicPerc = document.getElementById('compInpMusicPerc').value; comp.analysis.musicChanges = document.getElementById('compInpMusicChanges').value; comp.analysis.avgMusic = document.getElementById('compInpAvgMusic').value; comp.analysis.hardCuts = document.getElementById('compInpHardCuts').value; comp.analysis.stillImages = document.getElementById('compInpStill').value; comp.analysis.editedImages = document.getElementById('compInpEdited').value; comp.analysis.colorMusic = document.getElementById('compColorMusic').value; comp.analysis.colorImg = document.getElementById('compColorImg').value; comp.analysis.colorVid = document.getElementById('compColorVid').value; comp.analysis.colorFX = document.getElementById('compColorFX').value; comp.analysis.colorSFX = document.getElementById('compColorSFX').value;

                await autoSaveToCloud();
                btn.disabled = false; btn.textContent = 'Salva Analisi'; status.textContent = "Salvato ✓";
                setTimeout(() => { if(status.textContent === "Salvato ✓") status.textContent = ""; }, 2500);
            };

            window.handleCompImageAdd = async (e) => {
                const file = e.target.files[0]; if(!file) return;
                const comp = state.competitorsAnalysis.find(c => c.id === state.currentCompId); if(!comp) return;
                const compressed = await compressImage(file, 800, 0.8, 'image/webp');
                if(compressed.sizeKB > 1500) { alert("L'immagine è troppo pesante."); return; }
                if(!comp.analysis.images) comp.analysis.images = [];
                comp.analysis.images.push(compressed.dataUrl);
                window.renderCompImages(comp.analysis.images); await autoSaveToCloud(); e.target.value = '';
            };

            document.getElementById('competitorForm')?.addEventListener('submit', window.handleCompSubmit);
            document.getElementById('compSaveBtn')?.addEventListener('click', window.saveCompAnalysis);
            document.getElementById('compAddImage')?.addEventListener('change', window.handleCompImageAdd);

            clearInterval(compInterval);
        }
    }, 1000);

    // --- INJECT SCHEDULE VIEW & NAV (Dinamico) ---
    const scheduleInterval = setInterval(() => {
        const statsNav = document.getElementById('navStats') || document.getElementById('navDatabase') || document.getElementById('navIdee');
        const mainContent = document.getElementById('viewIdeeWrapper')?.parentNode;
        
        if (statsNav && mainContent && !document.getElementById('navSchedule')) {
            const schedNav = statsNav.cloneNode(true);
            schedNav.id = 'navSchedule';
            
            const textWalker = document.createTreeWalker(schedNav, NodeFilter.SHOW_TEXT, null, false);
            let node;
            while ((node = textWalker.nextNode())) {
                if (node.nodeValue.includes('Dashboard') || node.nodeValue.includes('Statistiche') || node.nodeValue.includes('Idee')) node.nodeValue = node.nodeValue.replace(/Dashboard & Statistiche|Dashboard|Statistiche|Idee Video|Idee/g, 'Tabella Orari');
                if (node.nodeValue.includes('📊') || node.nodeValue.includes('💡') || node.nodeValue.includes('🗄️')) node.nodeValue = node.nodeValue.replace(/📊|💡|🗄️/g, '📅');
            }
            
            statsNav.parentNode.insertBefore(schedNav, statsNav.nextSibling);
            schedNav.classList.remove('active');
            schedNav.addEventListener('click', (e) => { e.preventDefault(); window.switchView('schedule'); });

            const schedView = document.createElement('div');
            schedView.id = 'viewScheduleWrapper';
            schedView.className = 'hidden flex flex-col h-[calc(100vh-140px)] gap-4 overflow-y-auto custom-scrollbar pr-2 pb-6';
            schedView.innerHTML = `
                <div class="flex flex-col sm:flex-row gap-4 mb-1">
                    <div class="flex bg-[#222] p-1 rounded-xl border border-[#333] w-fit">
                        <button id="btnTabPersonal" class="px-5 py-2 rounded-lg text-sm font-bold bg-[#333] text-white shadow">Calendario Singolo</button>
                        <button id="btnTabOverview" class="px-5 py-2 rounded-lg text-sm font-bold text-gray-400 hover:text-white transition-colors">Panoramica Team</button>
                    </div>
                </div>

                <div id="schedPersonalContainer" class="flex flex-col gap-4">
                    <div class="flex flex-col sm:flex-row justify-between items-center bg-[#1a1a1a] p-4 rounded-xl border border-[#333] shadow-md gap-4">
                        <div class="flex items-center gap-3 w-full sm:w-auto">
                            <span class="text-2xl">👥</span>
                            <select id="schedMemberSelect" class="bg-[#222] text-white px-4 py-2 rounded-lg border border-[#444] outline-none focus:border-blue-500 flex-1 sm:w-48 text-sm font-bold shadow-sm cursor-pointer appearance-none">
                            </select>
                        </div>
                        <div class="flex items-center gap-4 bg-[#222] px-4 py-1.5 rounded-lg border border-[#333]">
                            <button id="schedPrevMonth" class="text-gray-400 hover:text-white transition-colors p-2 text-lg">◀</button>
                            <h2 id="schedMonthLabel" class="text-[15px] font-black text-white w-32 text-center uppercase tracking-widest">Mese Anno</h2>
                            <button id="schedNextMonth" class="text-gray-400 hover:text-white transition-colors p-2 text-lg">▶</button>
                        </div>
                        <button id="btnSchedDefaults" class="w-full sm:w-auto px-5 py-2.5 bg-[#2a2a2a] hover:bg-[#333] border border-[#444] text-gray-200 rounded-lg font-bold text-sm transition-colors shadow flex items-center justify-center gap-2">
                            <span>⚙️</span> Regole Predefinite
                        </button>
                    </div>

                    <div class="bg-[#1a1a1a] rounded-xl border border-[#333] shadow-md overflow-hidden flex flex-col mt-2">
                        <div class="grid grid-cols-7 bg-[#222] border-b border-[#333]">
                            <div class="py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-widest">Lun</div>
                            <div class="py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-widest">Mar</div>
                            <div class="py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-widest">Mer</div>
                            <div class="py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-widest">Gio</div>
                            <div class="py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-widest">Ven</div>
                            <div class="py-3 text-center text-[10px] font-black text-blue-400/70 uppercase tracking-widest">Sab</div>
                            <div class="py-3 text-center text-[10px] font-black text-red-400/70 uppercase tracking-widest">Dom</div>
                        </div>
                        <div id="schedCalendarGrid" class="grid grid-cols-7 auto-rows-[minmax(100px,auto)] gap-[1px] bg-[#333]">
                        </div>
                    </div>
                </div>

                <div id="schedOverviewContainer" class="hidden flex-col gap-4">
                    <div class="flex flex-col sm:flex-row justify-between items-center bg-[#1a1a1a] p-4 rounded-xl border border-[#333] shadow-md gap-4">
                        <div class="flex items-center gap-4 bg-[#222] px-4 py-1.5 rounded-lg border border-[#333]">
                            <button id="schedOverPrevWeek" class="text-gray-400 hover:text-white transition-colors p-2 text-lg">◀</button>
                            <h2 id="schedWeekLabel" class="text-[15px] font-black text-white w-48 text-center uppercase tracking-widest">Settimana ...</h2>
                            <button id="schedOverNextWeek" class="text-gray-400 hover:text-white transition-colors p-2 text-lg">▶</button>
                        </div>
                        <button id="schedOverCurrentWeek" class="px-4 py-2 bg-[#2a2a2a] hover:bg-[#333] text-gray-300 rounded font-bold transition-colors text-sm border border-[#444]">Torna a Oggi</button>
                    </div>
                    <div class="bg-[#1a1a1a] rounded-xl border border-[#333] shadow-md overflow-x-auto flex flex-col mt-2 flex-1 relative custom-scrollbar pb-2">
                        <table class="w-full text-left border-collapse min-w-[800px]">
                            <thead>
                                <tr class="bg-[#222] border-b border-[#333]" id="schedOverviewHeader">
                                </tr>
                            </thead>
                            <tbody id="schedOverviewBody" class="bg-[#1e1e1e]">
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
            mainContent.appendChild(schedView);

            const schedModalsHtml = `
                <div id="schedDefaultsModal" class="hidden fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center backdrop-blur-sm p-4">
                    <div class="bg-[#1a1a1a] border border-[#333] rounded-2xl p-6 w-[90%] max-w-lg shadow-2xl flex flex-col relative">
                        <button class="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors text-2xl z-20" onclick="closeModal('schedDefaultsModal')">✖</button>
                        <h2 class="text-xl font-black text-white mb-2 flex items-center gap-2"><span>⚙️</span> Regole Predefinite</h2>
                        <p class="text-sm text-gray-400 mb-6">Imposta la disponibilità standard di <span id="schedDefMemberName" class="text-white font-bold"></span> per ogni giorno della settimana.</p>
                        
                        <div id="schedDefDaysContainer" class="flex flex-col gap-3 mb-6 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
                        </div>

                        <div class="flex justify-end gap-3 mt-auto pt-4 border-t border-[#333]">
                            <button class="px-4 py-2 bg-[#2a2a2a] hover:bg-[#333] text-gray-300 rounded font-bold transition-colors" onclick="closeModal('schedDefaultsModal')">Annulla</button>
                            <button id="btnSaveSchedDefaults" class="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-bold transition-colors">Salva Regole</button>
                        </div>
                    </div>
                </div>

                <div id="schedOverrideModal" class="hidden fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center backdrop-blur-sm p-4">
                    <div class="bg-[#1a1a1a] border border-[#333] rounded-2xl p-6 w-[90%] max-w-sm shadow-2xl flex flex-col relative">
                        <button class="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors text-2xl z-20" onclick="closeModal('schedOverrideModal')">✖</button>
                        <h2 class="text-lg font-black text-white mb-1 flex items-center gap-2"><span>✏️</span> Modifica Giorno</h2>
                        <p class="text-sm text-gray-400 mb-6">Giorno: <span id="schedOverrideDateLabel" class="text-white font-bold"></span></p>
                        
                        <div class="flex flex-col gap-4 mb-6">
                            <label class="flex items-center gap-3 cursor-pointer bg-[#222] p-3 rounded-lg border border-[#444]">
                                <input type="checkbox" id="schedOverAvailable" class="w-5 h-5 accent-blue-500 cursor-pointer">
                                <span class="text-white font-bold text-sm">Disponibile</span>
                            </label>
                            
                            <div id="schedOverDetails" class="flex flex-col gap-2 transition-opacity">
                            </div>
                        </div>

                        <div class="flex justify-between items-center mt-auto pt-4 border-t border-[#333]">
                            <button id="btnResetSchedOverride" class="text-xs text-red-400 hover:text-red-300 font-bold underline">Ripristina Default</button>
                            <div class="flex gap-2">
                                <button class="px-4 py-2 bg-[#2a2a2a] hover:bg-[#333] text-gray-300 rounded font-bold transition-colors text-sm" onclick="closeModal('schedOverrideModal')">Annulla</button>
                                <button id="btnSaveSchedOverride" class="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-bold transition-colors text-sm shadow">Salva</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', schedModalsHtml);

            let schedCurrentDate = new Date();
            schedCurrentDate.setDate(1);

            let schedOverviewDate = new Date();

            document.getElementById('btnTabPersonal').addEventListener('click', (e) => {
                e.target.classList.add('bg-[#333]', 'text-white', 'shadow');
                e.target.classList.remove('text-gray-400');
                const btnO = document.getElementById('btnTabOverview');
                btnO.classList.remove('bg-[#333]', 'text-white', 'shadow');
                btnO.classList.add('text-gray-400');
                
                document.getElementById('schedPersonalContainer').classList.remove('hidden');
                document.getElementById('schedPersonalContainer').classList.add('flex');
                document.getElementById('schedOverviewContainer').classList.add('hidden');
                document.getElementById('schedOverviewContainer').classList.remove('flex');
            });

            document.getElementById('btnTabOverview').addEventListener('click', (e) => {
                e.target.classList.add('bg-[#333]', 'text-white', 'shadow');
                e.target.classList.remove('text-gray-400');
                const btnP = document.getElementById('btnTabPersonal');
                btnP.classList.remove('bg-[#333]', 'text-white', 'shadow');
                btnP.classList.add('text-gray-400');
                
                document.getElementById('schedPersonalContainer').classList.add('hidden');
                document.getElementById('schedPersonalContainer').classList.remove('flex');
                document.getElementById('schedOverviewContainer').classList.remove('hidden');
                document.getElementById('schedOverviewContainer').classList.add('flex');
                window.renderScheduleOverview();
            });

            const getMember = () => document.getElementById('schedMemberSelect').value;

            window.renderScheduleCalendar = () => {
                const member = getMember();
                if (!member) return;

                if(!state.scheduleData) state.scheduleData = { defaults: {}, overrides: {} };
                if(!state.scheduleData.defaults) state.scheduleData.defaults = {};
                if(!state.scheduleData.overrides) state.scheduleData.overrides = {};

                const year = schedCurrentDate.getFullYear();
                const month = schedCurrentDate.getMonth();
                const monthNames = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
                document.getElementById('schedMonthLabel').textContent = `${monthNames[month]} ${year}`;

                const grid = document.getElementById('schedCalendarGrid');
                grid.innerHTML = '';

                const firstDayIndex = (new Date(year, month, 1).getDay() + 6) % 7; 
                const daysInMonth = new Date(year, month + 1, 0).getDate();
                const daysInPrevMonth = new Date(year, month, 0).getDate();

                const memDefaults = state.scheduleData.defaults[member] || {};
                const memOverrides = state.scheduleData.overrides[member] || {};

                for (let i = 0; i < firstDayIndex; i++) {
                    const dayNum = daysInPrevMonth - firstDayIndex + i + 1;
                    grid.innerHTML += `<div class="bg-[#1a1a1a] p-2 opacity-40 border-r border-[#333] last:border-r-0"><span class="text-xs text-gray-600">${dayNum}</span></div>`;
                }

                for (let i = 1; i <= daysInMonth; i++) {
                    const d = new Date(year, month, i);
                    const dayOfWeek = (d.getDay() + 6) % 7;
                    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
                    
                    let isAvailable = false, periods = {}, isOverridden = false;
                    const def = memDefaults[dayOfWeek];
                    if (def) { 
                        isAvailable = def.available; periods = def.periods || {}; 
                        if (!def.periods && def.period) { let oldP = Array.isArray(def.period) ? def.period : [def.period]; let oldS = Array.isArray(def.subPeriod) ? def.subPeriod : [def.subPeriod || 'Intero']; if(oldP.includes('Tutto il giorno')) oldP = ['Mattina','Pomeriggio','Sera']; oldP.forEach(p => periods[p] = oldS); }
                    }
                    const over = memOverrides[dateStr];
                    if (over) { 
                        isAvailable = over.available; periods = over.periods || {}; 
                        if (!over.periods && over.period) { let oldP = Array.isArray(over.period) ? over.period : [over.period]; let oldS = Array.isArray(over.subPeriod) ? over.subPeriod : [over.subPeriod || 'Intero']; if(oldP.includes('Tutto il giorno')) oldP = ['Mattina','Pomeriggio','Sera']; oldP.forEach(p => periods[p] = oldS); }
                        isOverridden = true; 
                    }

                    const isToday = (new Date().toDateString() === d.toDateString());
                    let contentHtml = `<div class="mt-1.5"><span class="text-[10px] text-red-500/70 font-semibold px-1 py-0.5 rounded leading-none bg-red-900/10 border border-red-900/30 w-fit block">Assente</span></div>`;
                    if (isAvailable) {
                        let tags = [];
                        for (let [p, subs] of Object.entries(periods)) {
                            if (!subs || subs.length === 0) subs = ['Intero'];
                            let sFull = subs.join(' + ');
                            tags.push(`<span class="bg-green-500/20 text-green-400 text-[10px] px-1.5 py-1 rounded leading-tight font-bold border border-green-500/30 block w-full whitespace-normal break-words mb-1 shadow-sm" title="${p}: ${subs.join(', ')}">${p}: ${sFull}</span>`);
                        }
                        if(tags.length === 0) tags.push(`<span class="bg-green-500/20 text-green-400 text-[10px] px-1.5 py-1 rounded leading-tight font-bold border border-green-500/30 block w-fit mb-1 shadow-sm">✔️ Disponibile</span>`);
                        contentHtml = `<div class="mt-1 flex flex-col gap-0.5">${tags.join('')}</div>`;
                    }

                    const todayClass = isToday ? 'ring-2 ring-inset ring-blue-500 bg-[#262626] z-10' : 'bg-[#1e1e1e] hover:bg-[#2a2a2a] border-r border-b border-[#333] last:border-r-0';
                    const indicatorClass = isOverridden ? 'absolute top-2.5 right-2.5 w-1.5 h-1.5 bg-yellow-500 rounded-full shadow-[0_0_5px_rgba(234,179,8,0.5)]' : '';

                    const cell = document.createElement('div');
                    cell.className = `p-2.5 flex flex-col cursor-pointer transition-colors relative group min-h-[100px] ${todayClass}`;
                    cell.innerHTML = `<span class="text-xs font-bold ${isToday ? 'text-blue-400' : 'text-gray-300'} mb-1">${i}</span>${indicatorClass ? `<div class="${indicatorClass}" title="Regola modificata"></div>` : ''}${contentHtml}`;
                    cell.onclick = () => window.openSchedOverrideModal(dateStr, dayOfWeek);
                    grid.appendChild(cell);
                }

                const totalCells = firstDayIndex + daysInMonth;
                const nextDays = (7 - (totalCells % 7)) % 7;
                for (let i = 1; i <= nextDays; i++) {
                    grid.innerHTML += `<div class="bg-[#1a1a1a] p-2 opacity-40 border-r border-[#333] last:border-r-0"><span class="text-xs text-gray-600">${i}</span></div>`;
                }
            };

            const populateSchedMembers = () => {
                const select = document.getElementById('schedMemberSelect');
                if(!select) return;
                const prevVal = select.value;
                select.innerHTML = '';
                if(state.TEAM_MEMBERS && state.TEAM_MEMBERS.length > 0) {
                    state.TEAM_MEMBERS.forEach(m => { select.innerHTML += `<option value="${m}">${m}</option>`; });
                    if(prevVal && state.TEAM_MEMBERS.includes(prevVal)) select.value = prevVal;
                } else {
                    select.innerHTML = '<option value="">Nessun Membro Team</option>';
                }
            };

            document.getElementById('schedMemberSelect').addEventListener('change', window.renderScheduleCalendar);
            document.getElementById('schedPrevMonth').addEventListener('click', () => { schedCurrentDate.setMonth(schedCurrentDate.getMonth() - 1); window.renderScheduleCalendar(); });
            document.getElementById('schedNextMonth').addEventListener('click', () => { schedCurrentDate.setMonth(schedCurrentDate.getMonth() + 1); window.renderScheduleCalendar(); });
            
            const getStartOfWeek = (date) => {
                const d = new Date(date);
                const day = d.getDay();
                const diff = d.getDate() - day + (day === 0 ? -6 : 1);
                return new Date(d.setDate(diff));
            };

            window.renderScheduleOverview = () => {
                if(!state.scheduleData) state.scheduleData = { defaults: {}, overrides: {} };
                
                const startOfWeek = getStartOfWeek(schedOverviewDate);
                const endOfWeek = new Date(startOfWeek);
                endOfWeek.setDate(startOfWeek.getDate() + 6);
                
                const months = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
                document.getElementById('schedWeekLabel').textContent = `${startOfWeek.getDate()} ${months[startOfWeek.getMonth()]} - ${endOfWeek.getDate()} ${months[endOfWeek.getMonth()]} ${endOfWeek.getFullYear()}`;

                const thead = document.getElementById('schedOverviewHeader');
                let headHtml = `<th class="p-3 text-[10px] font-black text-gray-500 uppercase tracking-widest w-32 border-r border-[#333] bg-[#222] sticky left-0 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.2)]">Team</th>`;
                
                const dayNames = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
                const weekDates = [];
                for(let i=0; i<7; i++) {
                    const d = new Date(startOfWeek);
                    d.setDate(startOfWeek.getDate() + i);
                    weekDates.push(d);
                    const isToday = d.toDateString() === new Date().toDateString();
                    const colorClass = isToday ? 'text-blue-400' : (i >= 5 ? 'text-purple-400/70' : 'text-gray-500');
                    headHtml += `<th class="p-3 text-center text-[10px] font-black ${colorClass} uppercase tracking-widest border-r border-[#333] last:border-r-0 w-[calc(100%/7)] min-w-[80px]"><div class="flex flex-col gap-1"><span>${dayNames[i]}</span><span class="text-xs ${isToday?'bg-blue-500/20 px-1.5 py-0.5 rounded text-blue-300 w-fit mx-auto':''}">${d.getDate()}</span></div></th>`;
                }
                thead.innerHTML = headHtml;

                const tbody = document.getElementById('schedOverviewBody');
                tbody.innerHTML = '';

                if(!state.TEAM_MEMBERS || state.TEAM_MEMBERS.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-gray-500 text-sm">Nessun membro nel team.</td></tr>';
                    return;
                }

                state.TEAM_MEMBERS.forEach(member => {
                    const memDefaults = state.scheduleData.defaults[member] || {};
                    const memOverrides = state.scheduleData.overrides[member] || {};

                    let rowHtml = `<td class="p-3 border-r border-b border-[#333] bg-[#1e1e1e] sticky left-0 z-10 font-bold text-white shadow-[2px_0_5px_rgba(0,0,0,0.2)] text-sm">${member}</td>`;

                    weekDates.forEach((d, idx) => {
                        const dayOfWeek = (d.getDay() + 6) % 7;
                        const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

                        let isAvailable = false, periods = {};
                        const def = memDefaults[dayOfWeek];
                        if (def) { isAvailable = def.available; periods = def.periods || {}; if (!def.periods && def.period) { let oldP = Array.isArray(def.period) ? def.period : [def.period]; let oldS = Array.isArray(def.subPeriod) ? def.subPeriod : [def.subPeriod || 'Intero']; if(oldP.includes('Tutto il giorno')) oldP = ['Mattina','Pomeriggio','Sera']; oldP.forEach(p => periods[p] = oldS); } }
                        const over = memOverrides[dateStr];
                        if (over) { isAvailable = over.available; periods = over.periods || {}; if (!over.periods && over.period) { let oldP = Array.isArray(over.period) ? over.period : [over.period]; let oldS = Array.isArray(over.subPeriod) ? over.subPeriod : [over.subPeriod || 'Intero']; if(oldP.includes('Tutto il giorno')) oldP = ['Mattina','Pomeriggio','Sera']; oldP.forEach(p => periods[p] = oldS); } }

                        let cellHtml = `<div class="w-full h-full min-h-[60px] flex flex-col justify-center items-center text-center opacity-30"><span class="text-[10px] text-red-500 bg-red-900/10 px-1.5 py-0.5 rounded border border-red-900/30">Assente</span></div>`;
                        
                        if (isAvailable) {
                            let tags = [];
                            for (let [p, subs] of Object.entries(periods)) {
                                if (!subs || subs.length === 0) subs = ['Intero'];
                                let sFull = subs.join(' + ');
                                tags.push(`<span class="bg-green-500/20 text-green-400 text-[10px] px-1.5 py-1 rounded leading-tight font-bold border border-green-500/30 block mb-1 w-full mx-auto text-center whitespace-normal break-words shadow-sm" title="${p}: ${subs.join(', ')}">${p}: ${sFull}</span>`);
                            }
                            if(tags.length === 0) tags.push(`<span class="bg-green-500/20 text-green-400 text-[10px] px-1.5 py-1 rounded leading-tight font-bold border border-green-500/30 block mb-1 w-fit mx-auto text-center shadow-sm">✔️ Disponibile</span>`);
                            cellHtml = `<div class="w-full h-full min-h-[60px] flex flex-col justify-center p-1">${tags.join('')}</div>`;
                        }

                        const isToday = d.toDateString() === new Date().toDateString();
                        const bgClass = isToday ? 'bg-[#2a2a2a]' : 'hover:bg-[#222] transition-colors';

                        rowHtml += `<td class="p-0 border-r border-b border-[#333] last:border-r-0 ${bgClass}">${cellHtml}</td>`;
                    });
                    tbody.innerHTML += `<tr>${rowHtml}</tr>`;
                });
            };

            document.getElementById('schedOverPrevWeek').addEventListener('click', () => { schedOverviewDate.setDate(schedOverviewDate.getDate() - 7); window.renderScheduleOverview(); });
            document.getElementById('schedOverNextWeek').addEventListener('click', () => { schedOverviewDate.setDate(schedOverviewDate.getDate() + 7); window.renderScheduleOverview(); });
            document.getElementById('schedOverCurrentWeek').addEventListener('click', () => { schedOverviewDate = new Date(); window.renderScheduleOverview(); });

            document.getElementById('btnSchedDefaults').addEventListener('click', () => {
                const member = getMember();
                if(!member) { alert("Seleziona un membro del team."); return; }
                document.getElementById('schedDefMemberName').textContent = member;
                
                const container = document.getElementById('schedDefDaysContainer');
                container.innerHTML = '';
                
                if(!state.scheduleData.defaults[member]) state.scheduleData.defaults[member] = {};
                const memDef = state.scheduleData.defaults[member];
                const days = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
                
                days.forEach((dayName, idx) => {
                    const def = memDef[idx] || { available: false };
                    let periodsObj = def.periods || {};
                    if (!def.periods && def.period) { let oldP = Array.isArray(def.period) ? def.period : [def.period || 'Mattina']; let oldS = Array.isArray(def.subPeriod) ? def.subPeriod : [def.subPeriod || 'Intero']; if(oldP.includes('Tutto il giorno')) oldP = ['Mattina','Pomeriggio','Sera']; oldP.forEach(p => periodsObj[p] = oldS); }
                    
                    const genPHtml = (pName) => {
                        const checked = !!periodsObj[pName];
                        const subs = periodsObj[pName] || [];
                        return `<div class="flex flex-col bg-[#111] p-2 rounded border border-[#555] gap-1.5 period-block" data-pname="${pName}"><label class="flex items-center gap-2 cursor-pointer text-[11px] font-bold text-gray-300 hover:text-white transition-colors uppercase tracking-widest"><input type="checkbox" class="period-main-chk accent-blue-500 w-3.5 h-3.5 cursor-pointer" value="${pName}" ${checked?'checked':''}> ${pName}</label><div class="flex flex-wrap gap-2 ml-5 subperiod-container transition-opacity ${checked?'':'opacity-30 pointer-events-none'}"><label class="cursor-pointer flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-300"><input type="checkbox" class="subperiod-chk accent-blue-500 w-3 h-3 cursor-pointer" value="Presto" ${subs.includes('Presto')?'checked':''}> Presto</label><label class="cursor-pointer flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-300"><input type="checkbox" class="subperiod-chk accent-blue-500 w-3 h-3 cursor-pointer" value="Tardi" ${subs.includes('Tardi')?'checked':''}> Tardi</label><label class="cursor-pointer flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-300"><input type="checkbox" class="subperiod-chk accent-blue-500 w-3 h-3 cursor-pointer" value="Intero" ${subs.includes('Intero')?'checked':''}> Intero</label></div></div>`;
                    };

                    const row = document.createElement('div');
                    row.className = 'flex flex-col bg-[#222] p-3 rounded-xl border border-[#444] gap-2.5 transition-colors hover:border-[#555]';
                    row.innerHTML = `
                        <div class="flex items-center justify-between">
                            <label class="flex items-center gap-3 cursor-pointer group">
                                <input type="checkbox" class="w-4 h-4 accent-blue-500 day-avail-chk cursor-pointer" data-day="${idx}" ${def.available ? 'checked' : ''}>
                                <span class="text-white font-bold text-sm w-20 group-hover:text-blue-400 transition-colors">${dayName}</span>
                            </label>
                        </div>
                        <div class="flex flex-col gap-2 day-details mt-1 transition-opacity ${def.available ? '' : 'opacity-30 pointer-events-none'}" data-day="${idx}">
                            ${genPHtml('Mattina')}${genPHtml('Pomeriggio')}${genPHtml('Sera')}
                        </div>
                    `;
                    const chk = row.querySelector('.day-avail-chk');
                    const details = row.querySelector('.day-details');
                    chk.addEventListener('change', (e) => { e.target.checked ? details.classList.remove('opacity-30', 'pointer-events-none') : details.classList.add('opacity-30', 'pointer-events-none'); });
                    details.querySelectorAll('.period-main-chk').forEach(c => c.addEventListener('change', (e) => { const subC = e.target.closest('.period-block').querySelector('.subperiod-container'); if(e.target.checked) subC.classList.remove('opacity-30', 'pointer-events-none'); else subC.classList.add('opacity-30', 'pointer-events-none'); }));
                    container.appendChild(row);
                });
                document.getElementById('schedDefaultsModal').classList.remove('hidden'); document.getElementById('schedDefaultsModal').classList.add('flex');
            });

            document.getElementById('btnSaveSchedDefaults').addEventListener('click', async () => {
                const member = getMember(); if(!member) return;
                const container = document.getElementById('schedDefDaysContainer');
                const newDefs = {};
                for(let i=0; i<7; i++) {
                    const chk = container.querySelector(`.day-avail-chk[data-day="${i}"]`);
                    const details = container.querySelector(`.day-details[data-day="${i}"]`);
                    if(chk && details) { 
                        const periods = {};
                        details.querySelectorAll('.period-block').forEach(pb => {
                            const mainChk = pb.querySelector('.period-main-chk');
                            if(mainChk.checked) { const subs = Array.from(pb.querySelectorAll('.subperiod-chk:checked')).map(cb => cb.value); periods[mainChk.value] = subs.length > 0 ? subs : ['Intero']; }
                        });
                        newDefs[i] = { 
                            available: chk.checked, 
                            periods
                        }; 
                    }
                }
                state.scheduleData.defaults[member] = newDefs;
                window.closeModal('schedDefaultsModal'); window.renderScheduleCalendar(); await autoSaveToCloud();
            });

            let currentOverrideDate = null;
            let currentOverrideDayOfWeek = null;

            window.openSchedOverrideModal = (dateStr, dayOfWeek) => {
                const member = getMember(); if(!member) return;
                currentOverrideDate = dateStr; currentOverrideDayOfWeek = dayOfWeek;
                const [y, m, d] = dateStr.split('-');
                document.getElementById('schedOverrideDateLabel').textContent = `${d}/${m}/${y}`;
                const over = (state.scheduleData.overrides[member] || {})[dateStr];
                const chk = document.getElementById('schedOverAvailable');
                const details = document.getElementById('schedOverDetails');
                
                let periodsObj = {};
                if (over) { 
                    chk.checked = over.available; 
                    periodsObj = over.periods || {};
                    if (!over.periods && over.period) { let oldP = Array.isArray(over.period) ? over.period : [over.period]; let oldS = Array.isArray(over.subPeriod) ? over.subPeriod : [over.subPeriod || 'Intero']; if(oldP.includes('Tutto il giorno')) oldP = ['Mattina','Pomeriggio','Sera']; oldP.forEach(p => periodsObj[p] = oldS); }
                } else {
                    const def = (state.scheduleData.defaults[member] || {})[dayOfWeek] || { available: false };
                    chk.checked = def.available; 
                    periodsObj = def.periods || {};
                    if (!def.periods && def.period) { let oldP = Array.isArray(def.period) ? def.period : [def.period || 'Mattina']; let oldS = Array.isArray(def.subPeriod) ? def.subPeriod : [def.subPeriod || 'Intero']; if(oldP.includes('Tutto il giorno')) oldP = ['Mattina','Pomeriggio','Sera']; oldP.forEach(p => periodsObj[p] = oldS); }
                }

                const genPHtml = (pName) => {
                    const checked = !!periodsObj[pName]; const subs = periodsObj[pName] || [];
                    return `<div class="flex flex-col bg-[#111] p-3 rounded border border-[#444] gap-2 period-block" data-pname="${pName}"><label class="flex items-center gap-2 cursor-pointer text-xs font-bold text-gray-200 hover:text-white transition-colors uppercase tracking-widest"><input type="checkbox" class="period-main-chk accent-blue-500 w-4 h-4 cursor-pointer" value="${pName}" ${checked?'checked':''}> ${pName}</label><div class="flex flex-wrap gap-3 ml-6 subperiod-container transition-opacity ${checked?'':'opacity-30 pointer-events-none'}"><label class="cursor-pointer flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-200"><input type="checkbox" class="subperiod-chk accent-blue-500 w-3.5 h-3.5 cursor-pointer" value="Presto" ${subs.includes('Presto')?'checked':''}> Presto</label><label class="cursor-pointer flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-200"><input type="checkbox" class="subperiod-chk accent-blue-500 w-3.5 h-3.5 cursor-pointer" value="Tardi" ${subs.includes('Tardi')?'checked':''}> Tardi</label><label class="cursor-pointer flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-200"><input type="checkbox" class="subperiod-chk accent-blue-500 w-3.5 h-3.5 cursor-pointer" value="Intero" ${subs.includes('Intero')?'checked':''}> Intero</label></div></div>`;
                };
                details.innerHTML = genPHtml('Mattina') + genPHtml('Pomeriggio') + genPHtml('Sera');

                chk.checked ? details.classList.remove('opacity-30', 'pointer-events-none') : details.classList.add('opacity-30', 'pointer-events-none');
                chk.onchange = (e) => { e.target.checked ? details.classList.remove('opacity-30', 'pointer-events-none') : details.classList.add('opacity-30', 'pointer-events-none'); };
                details.querySelectorAll('.period-main-chk').forEach(c => c.addEventListener('change', (e) => { const subC = e.target.closest('.period-block').querySelector('.subperiod-container'); if(e.target.checked) subC.classList.remove('opacity-30', 'pointer-events-none'); else subC.classList.add('opacity-30', 'pointer-events-none'); }));
                document.getElementById('schedOverrideModal').classList.remove('hidden'); document.getElementById('schedOverrideModal').classList.add('flex');
            };

            document.getElementById('btnSaveSchedOverride').addEventListener('click', async () => {
                const member = getMember(); if(!member || !currentOverrideDate) return;
                if(!state.scheduleData.overrides[member]) state.scheduleData.overrides[member] = {};
                
                const periods = {};
                document.querySelectorAll('#schedOverDetails .period-block').forEach(pb => {
                    const mainChk = pb.querySelector('.period-main-chk');
                    if(mainChk.checked) { const subs = Array.from(pb.querySelectorAll('.subperiod-chk:checked')).map(cb => cb.value); periods[mainChk.value] = subs.length > 0 ? subs : ['Intero']; }
                });

                state.scheduleData.overrides[member][currentOverrideDate] = { 
                    available: document.getElementById('schedOverAvailable').checked, 
                    periods
                };
                window.closeModal('schedOverrideModal'); window.renderScheduleCalendar(); await autoSaveToCloud();
            });

            document.getElementById('btnResetSchedOverride').addEventListener('click', async () => {
                const member = getMember(); if(!member || !currentOverrideDate) return;
                if(state.scheduleData.overrides[member] && state.scheduleData.overrides[member][currentOverrideDate]) {
                    delete state.scheduleData.overrides[member][currentOverrideDate];
                    window.closeModal('schedOverrideModal'); window.renderScheduleCalendar(); await autoSaveToCloud();
                } else { window.closeModal('schedOverrideModal'); }
            });

            const schedObserver = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'class' && !schedView.classList.contains('hidden')) {
                        populateSchedMembers(); window.renderScheduleCalendar(); window.renderScheduleOverview();
                    }
                });
            });
            schedObserver.observe(schedView, { attributes: true });
            
            clearInterval(scheduleInterval);
        }
    }, 1000);

    // --- LAB SWITCHER (MODAL & DROPDOWN LOGIC) ---
    const switcherHtml = `
        <div id="labSwitchModal" class="hidden fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center backdrop-blur-sm transition-opacity">
            <div class="bg-[#1a1a1a] border border-[#333] rounded-2xl p-6 w-[90%] max-w-sm shadow-2xl flex flex-col gap-4 relative">
                <button id="closeLabSwitchBtn" class="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors text-xl">✖</button>
                <h2 class="text-xl font-black text-white mb-2 uppercase tracking-widest text-center">Cambia Dashboard</h2>
                <button id="btnSwitchYTLab" class="w-full px-6 py-4 bg-gradient-to-br from-blue-600 to-blue-800 hover:from-blue-500 hover:to-blue-700 text-white rounded-xl font-black text-lg transition-all shadow-lg hover:scale-[1.02] border border-blue-400/30 flex items-center gap-3 justify-center">
                    <span class="text-2xl">🎥</span> TMS YT Lab
                </button>
                <button id="btnSwitch3DLab" class="w-full px-6 py-4 bg-gradient-to-br from-purple-600 to-purple-800 hover:from-purple-500 hover:to-purple-700 text-white rounded-xl font-black text-lg transition-all shadow-lg hover:scale-[1.02] border border-purple-400/30 flex flex-col items-center gap-1 justify-center relative">
                    <div class="flex items-center gap-3">
                        <span class="text-2xl">🧊</span> TMS 3D Lab
                    </div>
                    <span class="absolute right-4 text-xs font-normal bg-black/40 px-2 py-0.5 rounded-full">🔒</span>
                </button>
                <div id="switchLabPasswordSection" class="hidden flex-col items-center gap-3 mt-2 pt-4 border-t border-[#333]">
                    <p class="text-gray-300 text-xs font-semibold uppercase tracking-widest text-center">Accesso TMS 3D Lab</p>
                    <input type="password" id="switchLabPasswordInput" placeholder="Inserisci Password..." class="w-full px-4 py-3 bg-[#111] text-white rounded-lg border border-[#444] outline-none focus:border-purple-500 text-center font-mono">
                    <button id="switchLabPasswordConfirm" class="w-full px-6 py-3 bg-purple-600 text-white rounded-lg font-bold hover:bg-purple-500 transition-colors">Conferma ed Entra</button>
                    <p id="switchLabPasswordError" class="text-red-500 text-sm hidden font-bold text-center">Password errata!</p>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', switcherHtml);

    document.getElementById('closeLabSwitchBtn').addEventListener('click', () => {
        document.getElementById('labSwitchModal').classList.add('hidden');
        document.getElementById('labSwitchModal').classList.remove('flex');
        document.getElementById('switchLabPasswordSection').classList.add('hidden');
        document.getElementById('switchLabPasswordSection').classList.remove('flex');
        document.getElementById('switchLabPasswordInput').value = '';
        document.getElementById('switchLabPasswordError').classList.add('hidden');
    });

    document.getElementById('btnSwitchYTLab').addEventListener('click', () => {
        window.setLabContext('yt');
        document.getElementById('closeLabSwitchBtn').click();
    });

    document.getElementById('btnSwitch3DLab').addEventListener('click', () => {
        document.getElementById('switchLabPasswordSection').classList.remove('hidden');
        document.getElementById('switchLabPasswordSection').classList.add('flex');
        document.getElementById('switchLabPasswordInput').focus();
    });

    const handleSwitchLabPass = () => {
        const pass = document.getElementById('switchLabPasswordInput').value;
        if (pass === "TMSLAB69") {
            window.setLabContext('3d');
            document.getElementById('closeLabSwitchBtn').click();
        } else {
            document.getElementById('switchLabPasswordError').classList.remove('hidden');
            document.getElementById('switchLabPasswordInput').value = '';
        }
    };
    
    document.getElementById('switchLabPasswordConfirm').addEventListener('click', handleSwitchLabPass);
    document.getElementById('switchLabPasswordInput').addEventListener('keydown', (e) => { if(e.key === 'Enter') handleSwitchLabPass(); });

    window.openLabSwitcher = () => {
        document.getElementById('labSwitchModal').classList.remove('hidden');
        document.getElementById('labSwitchModal').classList.add('flex');
    };

    // Auto-hook click sulla scritta in alto a sinistra della sidebar
    setTimeout(() => {
        const sidebars = document.querySelectorAll('#sidebar, header, nav, .sidebar');
        sidebars.forEach(container => {
            const textWalker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
            let node;
            while ((node = textWalker.nextNode())) {
                const text = node.nodeValue.trim().toUpperCase();
                if (text === 'TMS LAB' || text === 'TMS YT LAB' || text === 'TMS 3D LAB') {
                    const parent = node.parentElement;
                    if(parent && !parent.classList.contains('lab-switch-target') && parent.tagName !== 'BUTTON') {
                        parent.classList.add('lab-switch-target');
                        parent.style.cursor = 'pointer';
                        parent.title = 'Cambia Dashboard';
                        parent.innerHTML = `${text} <span class="text-[10px] opacity-50 ml-1 relative -top-0.5">▼</span>`;
                        parent.addEventListener('click', (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            window.openLabSwitcher();
                        });
                    }
                }
            }
        });
    }, 500);


    // --- CONSOLE DEV E TO-DO LIST ---
    document.getElementById('openDevTodoBtn')?.addEventListener('click', () => {
        requirePin("Accesso alla To-Do List di Sviluppo", () => {
            document.getElementById('devTodoModal').classList.remove('hidden');
            document.getElementById('devTodoModal').classList.add('flex');
            renderDevTodo();
        });
    });

    document.getElementById('devTodoForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('devTodoInput');
        if (!input.value.trim()) return;
        if (!state.devTodoList) state.devTodoList = [];
        state.devTodoList.unshift({ id: Date.now().toString(), text: input.value.trim(), done: false });
        input.value = '';
        renderDevTodo();
        await autoSaveToCloud();
    });

    const devConsoleModal = document.getElementById('devConsoleModal');
    const consoleOutput = document.getElementById('consoleOutput');
    document.getElementById('openConsoleBtn')?.addEventListener('click', () => {
        devConsoleModal?.classList.remove('hidden'); devConsoleModal?.classList.add('flex');
    });
    document.getElementById('closeConsoleBtn')?.addEventListener('click', () => {
        devConsoleModal?.classList.add('hidden'); devConsoleModal?.classList.remove('flex');
    });
    document.getElementById('clearConsoleBtn')?.addEventListener('click', () => {
        if(consoleOutput) consoleOutput.innerHTML = ''; devLog('[SISTEMA] Console pulita.', 'info');
    });
    
    document.getElementById('trainingForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = document.getElementById('btnSubmitTraining');
        const id = document.getElementById('inputTrainingId').value;
        const title = document.getElementById('inputTrainingTitle').value.trim();
        const link = document.getElementById('inputTrainingLink').value.trim();
        const type = document.querySelector('input[name="trainingType"]:checked').value;
        
        let thumbnail = ''; let ytId = null;
        submitBtn.disabled = true; submitBtn.textContent = '🔄 Salvataggio...';

        if (type === 'youtube') {
            ytId = window.getYouTubeID(link);
            if (!ytId) {
                alert("Link YouTube non valido.");
                submitBtn.disabled = false; submitBtn.textContent = 'Salva Risorsa';
                return;
            }
        } else {
            if (!id && !state.files.training) {
                alert("Carica un'immagine per la risorsa.");
                submitBtn.disabled = false; submitBtn.textContent = 'Salva Risorsa';
                return;
            }
            if (state.files.training) {
                const compressedImg = await compressImage(state.files.training, 800, 0.8, 'image/webp');
                if (compressedImg.sizeKB > 800) {
                     alert("L'immagine è troppo pesante.");
                     submitBtn.disabled = false; submitBtn.textContent = 'Salva Risorsa';
                     return;
                }
                thumbnail = compressedImg.dataUrl;
            }
        }

        if (id) {
            let tr = state.trainingData.find(t => t.id === id);
            if (tr) {
                tr.title = title; tr.link = link;
                if (type === 'youtube') { tr.ytId = ytId; tr.thumbnail = ''; } 
                else { tr.ytId = null; if (thumbnail) tr.thumbnail = thumbnail; }
            }
        } else {
            state.trainingData.push({ id: Date.now().toString(), title, link, ytId, thumbnail });
        }

        renderTraining(); closeModal('addTrainingModal', 'trainingForm');
        state.files.training = null;
        submitBtn.disabled = false; submitBtn.textContent = 'Salva Risorsa';
        autoSaveToCloud();
    });

    // --- LOGIN GATE SYSTEM ---
    document.getElementById('loginForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const user = document.getElementById('loginUserSelect').value;
        const pass = document.getElementById('loginPasswordInput').value;
        
        if (pass === "TMSLAB69") {
            localStorage.setItem('tmslab_logged_in_user', user);
            const loginOverlay = document.getElementById('loginOverlay');
            if (loginOverlay) { loginOverlay.classList.add('hidden'); loginOverlay.classList.remove('flex'); }
            const adminBtn = document.getElementById('adminBtn');
            if (adminBtn) adminBtn.textContent = user.substring(0, 2).toUpperCase();
            
            if (state.SCRIPT_URL) loadDataFromCloud();
            else {
                switchView('idee');
                devLog("[SISTEMA] Nessun link Database configurato. Clicca l'icona ingranaggio per impostarlo.", "warning");
            }
        } else {
            document.getElementById('loginError')?.classList.remove('hidden');
            const passInput = document.getElementById('loginPasswordInput');
            if(passInput) { passInput.value = ''; passInput.focus(); }
        }
    });

    document.getElementById('logoutBtn')?.addEventListener('click', () => {
        if(confirm("Sei sicuro di voler uscire da TMS Lab?")) {
            localStorage.removeItem('tmslab_logged_in_user');
            location.reload(); 
        }
    });

    // --- HEADER E SIDEBAR ---
    document.getElementById('sidebarToggle')?.addEventListener('click', () => {
        state.sidebarOpen = !state.sidebarOpen;
        const sidebar = document.getElementById('sidebar');
        if (sidebar) { sidebar.classList.toggle('w-64', state.sidebarOpen); sidebar.classList.toggle('w-20', !state.sidebarOpen); }
        document.querySelectorAll('.sidebar-label').forEach(el => el.style.display = state.sidebarOpen ? '' : 'none');
    });

    document.getElementById('searchInput')?.addEventListener('input', () => {
        if (state.currentView === 'idee') renderVideos(getFilteredIdeas());
        if (state.currentView === 'inspirations') {
            if(state.currentInspTab === 'channels') renderInspChannels();
            else { state.feedDisplayIndex = 0; document.getElementById('inspFeedGrid').innerHTML = ''; renderNextFeedBatch(); }
        }
            if (state.currentView === 'formazione') renderTraining();
        if (state.currentView === 'editorshub') renderEditorsHub();
    });

    document.getElementById('settingsBtn')?.addEventListener('click', () => {
        const urlInput = document.getElementById('scriptUrlInput');
        if(urlInput) urlInput.value = state.SCRIPT_URL;
        document.getElementById('settingsModal')?.classList.remove('hidden'); 
        document.getElementById('settingsModal')?.classList.add('flex');
    });

    document.getElementById('closeSettingsBtn')?.addEventListener('click', () => { 
        document.getElementById('settingsModal')?.classList.add('hidden'); 
        document.getElementById('settingsModal')?.classList.remove('flex'); 
    });
    
    document.getElementById('saveSettingsBtn')?.addEventListener('click', () => {
        const urlInput = document.getElementById('scriptUrlInput');
        state.SCRIPT_URL = urlInput ? urlInput.value.trim() : ''; 
        localStorage.setItem('creatorhub_script_url', state.SCRIPT_URL);
        document.getElementById('settingsModal')?.classList.add('hidden'); 
        document.getElementById('settingsModal')?.classList.remove('flex');
        loadDataFromCloud(); 
    });

    document.getElementById('adminBtn')?.addEventListener('click', () => {
        requirePin("Accesso al Pannello di Amministrazione di TMS Lab", () => {
            document.getElementById('adminModal').classList.remove('hidden'); 
            document.getElementById('adminModal').classList.add('flex');
            renderAdminChannelList();
        });
    });

    // --- FORM: CREAZIONE IDEA ---
    document.getElementById('inputThumbFile')?.addEventListener('change', (e) => {
        const file = e.target.files[0]; if (!file) return;
        state.files.addThumb = file;
        const reader = new FileReader();
        reader.onload = (ev) => {
            document.getElementById('thumbPreview').src = ev.target.result;
            document.getElementById('thumbPreview').classList.remove('hidden');
            document.getElementById('thumbDropHint').classList.add('hidden');
            document.getElementById('thumbFileName').textContent = '📎 ' + file.name;
            document.getElementById('thumbFileName').classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    });

    document.getElementById('ideaForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = e.target.querySelector('button[type=submit]');
        if (!state.files.addThumb) { alert("Carica un'immagine."); return; }
        submitBtn.disabled = true;

        const title = document.getElementById('inputTitle').value.trim();
        const channelId = document.getElementById('inputChannel').value || '';
        const ch = state.channels.find(c => c.id === channelId);
        
        const sourcesText = document.getElementById('inputSources')?.value || '';
        const sourcesArr = sourcesText.split('\n').map(l => l.trim()).filter(l => l !== '');

        let ideaFolderId = ''; let ideaFolderLink = ''; let thumbnailUrl = '';
        devLog(`[IDEA] Avvio creazione nuova idea: "${title}"...`, "info");

        if (ch && ch.driveFolderId && state.SCRIPT_URL) {
            try {
                submitBtn.textContent = '🔄 Preparazione File...';
                
                const getOrigBase64 = new Promise(r => { const fr = new FileReader(); fr.onload = ev => r(ev.target.result.split(',')[1]); fr.readAsDataURL(state.files.addThumb); });
                const compressLowRes = compressImage(state.files.addThumb, 900, 0.8, 'image/webp');
                
                const [originalBase64, compressedImg, resF] = await Promise.all([
                    getOrigBase64,
                    compressLowRes,
                    callScriptAction({ action: 'createIdeaFolder', name: title, channelFolderId: ch.driveFolderId })
                ]);

                ideaFolderId = resF.folderId || '';
                if (ideaFolderId) {
                    ideaFolderLink = `https://drive.google.com/drive/folders/${ideaFolderId}`;
                    submitBtn.textContent = '🚀 Upload Originale su Drive...';
                    const origExt = state.files.addThumb.name.split('.').pop().toLowerCase();
                    
                    const resI = await callScriptAction({ 
                        action: 'uploadThumbnail', 
                        folderId: ideaFolderId, 
                        base64: originalBase64, 
                        mimeType: state.files.addThumb.type || 'image/jpeg', 
                        ext: origExt,
                        fileName: `thumbnail_HighRes.${origExt}`
                    });
                    
                    if (resI.fileId) thumbnailUrl = `https://drive.google.com/thumbnail?id=${resI.fileId}&sz=w1000`;
                }
            } catch(err) {}
        }

        if (!thumbnailUrl && state.files.addThumb) {
            const compressedImg = await compressImage(state.files.addThumb, 900, 0.8, 'image/webp');
            if(compressedImg.sizeKB > 1500) {
                 submitBtn.disabled = false; submitBtn.textContent = 'Aggiungi e Salva ⚡';
                 alert("L'immagine è troppo pesante."); return;
            }
            thumbnailUrl = compressedImg.dataUrl;
        }

        const newIdea = {
            id: Date.now().toString(),
            createdAt: Date.now(), 
            title, thumbnail: thumbnailUrl, driveLink: ideaFolderLink, ideaFolderId, channelId, author: "Tu", timeAgo: new Date().toLocaleDateString('it-IT'),
            assignee: null, assignedAt: null, completedAt: null,
            sources: sourcesArr,
            checklist: { script: false, audio: false, video: false, music: false, sfx: false, final: false }
        };

        devLog(`[IDEA] Nuova idea salvata in stato locale`, 'success', newIdea);
        state.videoIdeas.unshift(newIdea);
        renderChannelList(); 
        renderVideos(getFilteredIdeas()); 
        closeModal('addModal', 'ideaForm');
        submitBtn.disabled = false; submitBtn.textContent = 'Aggiungi e Salva ⚡';
        
        autoSaveToCloud();
    });

    // --- FORM: MODIFICA IDEA ---
    document.getElementById('editIdeaThumbFile')?.addEventListener('change', (e) => {
        const file = e.target.files[0]; if (!file) return;
        state.files.editIdeaThumb = file;
        const reader = new FileReader();
        reader.onload = (ev) => {
            document.getElementById('editIdeaThumbPreview').src = ev.target.result;
            document.getElementById('editIdeaThumbPreview').classList.remove('hidden');
            document.getElementById('editIdeaThumbDropHint').classList.add('hidden');
            document.getElementById('editIdeaThumbFileName').textContent = '📎 ' + file.name;
            document.getElementById('editIdeaThumbFileName').classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    });

    document.getElementById('editIdeaForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = e.target.querySelector('button[type=submit]') || document.getElementById('btnSubmitEditIdea');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '🔄 Salvataggio...'; }

        const id = document.getElementById('editIdeaId').value;
        const title = document.getElementById('editIdeaTitle').value.trim();
        const driveLink = document.getElementById('editIdeaDriveLink').value.trim();
        const assigneeEl = document.getElementById('editIdeaAssignee');
        
        const sourcesText = document.getElementById('editIdeaSources')?.value || '';
        const sourcesArr = sourcesText.split('\n').map(l => l.trim()).filter(l => l !== '');

        const idea = state.videoIdeas.find(v => v.id === id);
        if (idea) {
            idea.title = title;
            idea.driveLink = driveLink;
            idea.sources = sourcesArr;
            const channelEl = document.getElementById('editIdeaChannel');
            if (channelEl) idea.channelId = channelEl.value;
            if (assigneeEl && !assigneeEl.parentElement.classList.contains('hidden')) {
                const newAssignee = assigneeEl.value || null;
                if (idea.assignee && !newAssignee) {
                    idea.checklist = { script: false, audio: false, video: false, music: false, sfx: false, final: false };
                    idea.taskAssignees = null;
                    idea.assignedAt = null;
                    idea.completedAt = null;
                }
                idea.assignee = newAssignee;
            }

            if (state.files.editIdeaThumb) {
                const compressedImg = await compressImage(state.files.editIdeaThumb, 900, 0.8, 'image/webp');
                if (compressedImg.sizeKB > 1500) {
                     alert("L'immagine è troppo pesante.");
                     if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Salva Modifiche'; }
                     return;
                }
                idea.thumbnail = compressedImg.dataUrl;
            }
        }

        renderChannelList();
        renderVideos(getFilteredIdeas());
        closeModal('editIdeaModal', 'editIdeaForm');
        state.files.editIdeaThumb = null;
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Salva Modifiche'; }
        
        autoSaveToCloud();
    });

    // --- SCRIPT ANALYSIS ---
    setInterval(() => {
        const txtArea = document.getElementById('scriptInput') || document.querySelector('#viewScriptWrapper textarea');
        if (txtArea && !txtArea.dataset.scriptHooked) {
            txtArea.dataset.scriptHooked = "true";
            
            const updateStats = () => {
                const text = txtArea.value.trim();
                const chars = text.length;
                const words = text === '' ? 0 : text.split(/\s+/).length;
                const timeSecs = Math.ceil(words / 2.5); // Stima di lettura: ~150 parole al minuto
                
                // Ricerca super-robusta per gli elementi delle statistiche
                const wrapper = document.getElementById('viewScriptWrapper') || document;
                const allElsWithId = Array.from(wrapper.querySelectorAll('[id]'));
                
                const charsEl = document.getElementById('scriptChars') || document.getElementById('scriptCharCount') || allElsWithId.find(el => el.id.toLowerCase().includes('char'));
                const wordsEl = document.getElementById('scriptWords') || document.getElementById('scriptWordCount') || allElsWithId.find(el => el.id.toLowerCase().includes('word'));
                const timeEl = document.getElementById('scriptTime') || document.getElementById('scriptTimeCount') || allElsWithId.find(el => el.id.toLowerCase().includes('time'));
                
                if (charsEl) charsEl.textContent = chars;
                if (wordsEl) wordsEl.textContent = words;
                if (timeEl) timeEl.textContent = timeSecs > 60 ? `${Math.floor(timeSecs/60)}m ${timeSecs%60}s` : `${timeSecs}s`;
            };
            
            txtArea.addEventListener('input', updateStats);
            txtArea.addEventListener('keyup', updateStats);
            txtArea.addEventListener('paste', () => setTimeout(updateStats, 50));
        }
    }, 1500);
    
    // Genera eventi globali per le checkbox della checklist in modo che non si perdano
    document.addEventListener('change', async (e) => {
        const match = e.target.id?.match(/^chk(Script|Audio|Video|Music|Sfx|Final)$/);
        if (match && state.currentlyOpenIdeaId) {
            const key = match[1].toLowerCase();
            const idea = state.videoIdeas.find(v => v.id === state.currentlyOpenIdeaId);
            if(idea) {
                idea.checklist[key] = e.target.checked;
                
                const assigneesArr = idea.assignee ? idea.assignee.split(',').map(s=>s.trim()) : [];
                if (assigneesArr.length > 0) {
                    if (!idea.taskAssignees) {
                        idea.taskAssignees = { script: [], audio: [], video: [], music: [], sfx: [], final: [] };
                        if (assigneesArr.length > 0) {
                            ['script', 'audio', 'video', 'music', 'sfx', 'final'].forEach(k => {
                                if (k !== key && idea.checklist[k]) idea.taskAssignees[k] = [...assigneesArr];
                            });
                        }
                    }
                    if (!e.target.checked) {
                        idea.taskAssignees[key] = [];
                    } else {
                        idea.taskAssignees[key] = [...assigneesArr]; // Assegna a tutti per default
                    }
                    const selectContainer = document.getElementById(`collab_select_${key}`);
                    if (selectContainer) {
                        selectContainer.querySelectorAll('.task-collab-btn').forEach(b => {
                            const isC = idea.taskAssignees[key].includes(b.dataset.name);
                            const btnClass = isC 
                                ? 'bg-blue-600 text-white border-blue-400 ring-2 ring-blue-500/50 shadow-[0_0_10px_rgba(59,130,246,0.4)]' 
                                : 'bg-[#222] text-gray-500 border-[#333] hover:border-gray-400';
                            b.className = `task-collab-btn px-3 py-1 rounded text-[11px] font-bold transition-all border ${btnClass}`;
                            b.innerHTML = isC ? `✓ ${b.dataset.name}` : b.dataset.name;
                        });
                    }
                }

                if(window.updateChecklistProgress) window.updateChecklistProgress(idea);
                renderVideos(getFilteredIdeas());
                await autoSaveToCloud();
            }
        }
    });

    // --- FORM: TOOL E RISORSE ---
    document.getElementById('inputToolFile')?.addEventListener('change', (e) => {
        const file = e.target.files[0]; if (!file) return;
        state.files.tool = file;
        const reader = new FileReader();
        reader.onload = (ev) => {
            document.getElementById('toolPreview').src = ev.target.result;
            document.getElementById('toolPreview').classList.remove('hidden');
            document.getElementById('toolDropHint').classList.add('hidden');
        };
        reader.readAsDataURL(file);
    });

    document.getElementById('toolForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = e.target.querySelector('button[type=submit]');
        const id = document.getElementById('inputToolId').value;
        const title = document.getElementById('inputToolTitle').value.trim();
        const description = document.getElementById('inputToolDesc').value.trim();
        const link = document.getElementById('inputToolLink').value.trim();

        if (!id && !state.files.tool) { alert("Carica un logo o un'immagine per lo strumento."); return; }
        
        submitBtn.disabled = true; submitBtn.textContent = '🔄 Salvataggio...';
        let finalImageUrl = "";
        
        if (state.files.tool) {
            const ext = state.files.tool.name.split('.').pop().toLowerCase();
            const compressedImg = await compressImage(state.files.tool, 500, 0.85, 'image/webp');

            if (state.SCRIPT_URL) {
                try {
                    submitBtn.textContent = '🚀 Upload Logo su Drive...';
                    const res = await callScriptAction({ 
                        action: 'uploadEHFile', 
                        base64: compressedImg.base64, 
                        mimeType: 'image/webp', 
                        fileName: `tool_logo_${Date.now()}.${ext}` 
                    });
                    if(res.fileId) {
                        finalImageUrl = `https://drive.google.com/thumbnail?id=${res.fileId}&sz=w400`;
                    }
                } catch(err) { devLog(`[TOOL] Errore upload Drive. Fallback locale.`, "warning"); }
            }

            if(!finalImageUrl) {
                 if(compressedImg.sizeKB > 500) {
                         submitBtn.disabled = false; submitBtn.textContent = 'Salva Strumento';
                         alert("L'immagine è troppo pesante per il salvataggio offline."); return;
                 }
                 finalImageUrl = compressedImg.dataUrl;
            }
        }

        if (id) {
            let tool = state.toolsData.find(t => t.id === id);
            if (tool) {
                tool.title = title; tool.description = description; tool.link = link;
                if (finalImageUrl) tool.image = finalImageUrl;
            }
        } else {
            state.toolsData.push({ id: Date.now().toString(), title, description, link, image: finalImageUrl });
        }

        renderTools();
        closeModal('addToolModal', 'toolForm');
        state.files.tool = null;
        document.getElementById('inputToolFile').required = true;
        submitBtn.disabled = false; submitBtn.textContent = 'Salva Strumento';
        autoSaveToCloud();
    });

    // --- FORM: FORMAZIONE ---
    document.getElementById('inputTrainingFile')?.addEventListener('change', (e) => {
        const file = e.target.files[0]; if (!file) return;
        state.files.training = file;
        const reader = new FileReader();
        reader.onload = (ev) => {
            document.getElementById('trainingPreview').src = ev.target.result;
            document.getElementById('trainingPreview').classList.remove('hidden');
            document.getElementById('trainingDropHint').classList.add('hidden');
        };
        reader.readAsDataURL(file);
    });

    // --- FORM: EDITORS HUB ---
    document.getElementById('inputEHFile')?.addEventListener('change', (e) => {
        const file = e.target.files[0]; if (!file) return;
        state.files.eh = file;
        document.getElementById('ehDropHint').classList.add('hidden');
        
        const category = document.getElementById('inputEHCategory').value;
        if(category === 'icons' && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                document.getElementById('ehIconPreview').src = ev.target.result;
                document.getElementById('ehIconPreview').classList.remove('hidden');
            };
            reader.readAsDataURL(file);
        } else {
            document.getElementById('ehFileName').textContent = '📎 Selezionato: ' + file.name;
            document.getElementById('ehFileName').classList.remove('hidden');
        }
    });
    
    document.getElementById('inputEHCategory')?.addEventListener('change', (e) => {
        state.files.eh = null;
        document.getElementById('inputEHFile').value = '';
        document.getElementById('ehDropHint').classList.remove('hidden');
        document.getElementById('ehIconPreview').classList.add('hidden');
        document.getElementById('ehFileName').classList.add('hidden');
    });

    // --- STATS TEAM SORT ---
    document.getElementById('teamSortSelect')?.addEventListener('change', renderStats);

    // --- DASHBOARD CHIUSURA ---
    const ideaDashboardModal = document.getElementById('ideaDashboardModal');
    const closeDashBtn = document.getElementById('closeDashBtn');
    
    function closeDashModal() {
        ideaDashboardModal.classList.add('hidden');
        ideaDashboardModal.classList.remove('flex');
        state.currentlyOpenIdeaId = null;
    }
    closeDashBtn?.addEventListener('click', closeDashModal);
    ideaDashboardModal?.addEventListener('click', (e) => { if (e.target === ideaDashboardModal) closeDashModal(); });

    // --- GESTIONE DASHBOARD TMS PICKS ---
    window.openPickDashboard = function(pick) {
        document.getElementById('pickDashThumb').src = `https://img.youtube.com/vi/${pick.ytId}/hqdefault.jpg`;
        document.getElementById('pickDashTitle').textContent = pick.title;
        document.getElementById('pickDashAuthor').innerHTML = pick.avatar ? `<img src="${pick.avatar}" class="w-5 h-5 rounded-full object-cover"> ${pick.author}` : `📺 ${pick.author}`;
        document.getElementById('pickDashViews').textContent = `👀 ${pick.views}`;
        document.getElementById('pickDashDuration').textContent = `⏱️ ${pick.duration}`;
        document.getElementById('pickDashLink').onclick = () => window.open(pick.link, '_blank');
        
        const txtArea = document.getElementById('pickTranscriptInput');
        txtArea.value = pick.transcript || "Trascrizione non presente. Aggiorna o reinserisci il link.";
        
        const updateStats = () => {
            const text = txtArea.value.trim();
            const chars = text.length; const words = text === '' ? 0 : text.split(/\s+/).length;
            const timeSecs = Math.ceil(words / 3);
            document.getElementById('pickStatChars').textContent = chars;
            document.getElementById('pickStatWords').textContent = words;
            document.getElementById('pickStatTime').textContent = timeSecs > 60 ? `${Math.floor(timeSecs/60)}m ${timeSecs%60}s` : `${timeSecs}s`;
        };
        updateStats(); txtArea.oninput = updateStats;
        
        document.getElementById('pickDashDeleteBtn').onclick = () => { requirePin(`Eliminare "${pick.title}"?`, async () => { state.tmsPicks = state.tmsPicks.filter(p => p.id !== pick.id); closeModal('pickDashboardModal'); renderTMSPicks(); await autoSaveToCloud(); }); };
        
        document.getElementById('pickDashboardModal').classList.remove('hidden'); document.getElementById('pickDashboardModal').classList.add('flex');
    };

    // --- INSPIRATIONS BUTTONS ---
    document.getElementById('btnRefreshFeed')?.addEventListener('click', () => {
        const btn = document.getElementById('btnRefreshFeed');
        btn.innerHTML = '<span class="animate-spin inline-block">🔄</span> Aggiornamento...';
        btn.disabled = true;
        state.globalFeed = []; 
        state.feedDisplayIndex = 0;
        document.getElementById('inspFeedGrid').innerHTML = '';
        document.getElementById('loadMoreFeedBtn').classList.add('hidden');
        
        loadInspFeed().then(() => {
            btn.innerHTML = '<span>🔄</span> Ricarica Feed';
            btn.disabled = false;
        });
    });

    document.getElementById('loadMoreFeedBtn')?.addEventListener('click', renderNextFeedBatch);

    // --- FORM: TMS PICKS ---
    document.getElementById('pickForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = document.getElementById('btnSubmitPick');
        const link = document.getElementById('inputPickLink').value.trim();
        const ytId = window.getYouTubeID(link);

        if (!ytId) {
            alert("Link YouTube non valido.");
            return;
        }

        submitBtn.disabled = true; submitBtn.textContent = '🔄 Recupero info...';

        let title = "Video YouTube", author = "Sconosciuto", avatar = "", views = "N/A views", durationStr = "0:00", transcript = "Trascrizione in elaborazione...";
        
        try {
            devLog(`[PICKS] Analisi video tramite sistema interno Proxy...`, 'info');
            const html = await fetchYTProxy(`https://www.youtube.com/watch?v=${ytId}`);
            
            let playerRes = null;
            let ytData = null;
            
            const playerStart = html.indexOf('var ytInitialPlayerResponse = ');
            if (playerStart !== -1) {
                const jsonStart = playerStart + 30;
                let end = html.indexOf(';</script>', jsonStart);
                if (end === -1) end = html.indexOf(';var ', jsonStart);
                if (end !== -1) try { playerRes = JSON.parse(html.substring(jsonStart, end)); } catch(e) {}
            }
            
            const dataStart = html.indexOf('var ytInitialData = ');
            if (dataStart !== -1) {
                const jsonStart = dataStart + 20;
                let end = html.indexOf(';</script>', jsonStart);
                if (end === -1) end = html.indexOf(';var ', jsonStart);
                if (end !== -1) try { ytData = JSON.parse(html.substring(jsonStart, end)); } catch(e) {}
            }

            if (playerRes) {
                const details = playerRes.videoDetails;
                if (details) {
                    title = details.title || title;
                    author = details.author || author;
                    if (details.lengthSeconds) {
                        const sec = parseInt(details.lengthSeconds);
                        durationStr = `${Math.floor(sec/60)}:${(sec%60).toString().padStart(2,'0')}`;
                    }
                    if (details.viewCount) views = formatViewsCount(details.viewCount);
                }
                
                const captionTracks = playerRes.captions?.playerCaptionsTracklistRenderer?.captionTracks;
                if (captionTracks && captionTracks.length > 0) {
                    let track = captionTracks.find(t => t.languageCode.startsWith('it')) || captionTracks.find(t => t.languageCode.startsWith('en')) || captionTracks[0];
                    try {
                        let subXml;
                        try {
                            const subRes = await fetch(track.baseUrl);
                            if(!subRes.ok) throw new Error("CORS limit");
                            subXml = await subRes.text();
                        } catch(netErr) {
                            subXml = await fetchYTProxy(track.baseUrl);
                        }
                        transcript = subXml.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s{2,}/g, ' ').trim();
                        devLog(`[PICKS] Trascrizione generata con successo!`, 'success');
                    } catch(subErr) {
                        transcript = "Errore durante la decodifica dei sottotitoli.";
                        devLog(`[PICKS] Impossibile estrarre XML: ${subErr.message}`, 'warning');
                    }
                } else {
                    transcript = "Nessun sottotitolo disponibile per questo video.";
                }
            } else {
                throw new Error("Dati Player non trovati nella pagina.");
            }

            if (ytData) {
                try {
                    const secondary = ytData.contents?.twoColumnWatchNextResults?.results?.results?.contents?.find(c => c.videoSecondaryInfoRenderer)?.videoSecondaryInfoRenderer;
                    if (secondary?.owner?.videoOwnerRenderer) {
                        const owner = secondary.owner.videoOwnerRenderer;
                        if (!author || author === "Sconosciuto") author = owner.title?.runs[0]?.text || author;
                        if (owner.thumbnail?.thumbnails?.length > 0) avatar = owner.thumbnail.thumbnails[0].url;
                    }
                } catch(e) {}
            }
            
        } catch(err) {
            devLog(`[PICKS] Errore di scraping: ${err.message}. Uso fallback base.`, 'warning');
            try {
                const res = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${ytId}`);
                const json = await res.json();
                if(json && json.title) {
                    title = json.title;
                    author = json.author_name || author;
                }
            } catch(e) {}
            transcript = "Impossibile scaricare la trascrizione (YouTube ha bloccato la richiesta).";
        }
        
        if(!state.tmsPicks) state.tmsPicks = [];
        state.tmsPicks.push({ 
            id: Date.now().toString(), ytId, title, author, avatar, views, duration: durationStr, transcript,
            link: `https://www.youtube.com/watch?v=${ytId}`, addedAt: Date.now() 
        });
        
        renderTMSPicks(); closeModal('addPickModal', 'pickForm'); autoSaveToCloud();
        
        submitBtn.disabled = false; submitBtn.textContent = 'Aggiungi Video';
        document.getElementById('inputPickLink').value = '';
    });

    document.getElementById('btnSyncChannel')?.addEventListener('click', async () => {
        // ... (Questa logica corposa di scraping è identica a prima ma usa state.inspChannels, 
        // è consigliabile averla spostata in api.js o renderers.js, ma per compatibilità totale
        // la leghiamo al bottone qui. Siccome è lunga, se la ometto si rompe. Te la scrivo abbreviata)
        let url = document.getElementById('inputSyncChannelUrl').value.trim();
        if(!url) { alert("Inserisci un link YouTube valido."); return; }
        
        const btn = document.getElementById('btnSyncChannel');
        btn.disabled = true; btn.innerHTML = '⏳ Analisi in corso...';
        
        try {
            let handle = null; let channelId = null;
            const handleMatch = url.match(/@([\w\-\.]+)/); if (handleMatch) handle = handleMatch[1];
            const idMatch = url.match(/(?:channel\/|c\/)(UC[\w-]+)/); if (idMatch) channelId = idMatch[1];
            if (!handle && !channelId) {
                const customMatch = url.match(/youtube\.com\/([\w\-\.]+)/);
                if(customMatch && !['watch', 'playlist', 'shorts', 'feed'].includes(customMatch[1])) handle = customMatch[1];
                else throw new Error("Formato link non riconosciuto.");
            }

            const fetchUrl = handle ? `https://www.youtube.com/@${handle}/videos` : `https://www.youtube.com/channel/${channelId}/videos`;
            const html = await fetchYTProxy(fetchUrl);
            const ytDataStr = html.match(/var ytInitialData = (\{.*?\});<\/script>/);
            if (!ytDataStr) throw new Error("Dati non trovati.");
            const ytData = JSON.parse(ytDataStr[1]);
            
            // Estrazione Base
            let name = "Canale"; let avatar = ""; let finalId = channelId;
            const header = ytData.header?.c4TabbedHeaderRenderer || ytData.header?.pageHeaderRenderer;
            if(header) {
                 name = header.title || header.pageTitle || name;
                 if(!finalId && header.channelId) finalId = header.channelId;
            }
            
            if (state.inspChannels.some(c => (finalId && c.ytId === finalId) || c.name === name)) {
                alert(`Il canale "${name}" è già presente nella dashboard!`);
                closeModal('addInspChannelModal'); document.getElementById('inputSyncChannelUrl').value = '';
                return;
            }

            state.inspChannels.push({
                id: Date.now().toString(), ytId: finalId, name: name, avatar: avatar,
                url: handle ? `https://www.youtube.com/@${handle}` : `https://www.youtube.com/channel/${channelId}`,
                subs: "N/A", views: "N/A", frequency: "N/A", trend: "Stabile"
            });
            
            renderInspChannels(); autoSaveToCloud();
            closeModal('addInspChannelModal'); document.getElementById('inputSyncChannelUrl').value = '';
        } catch(err) { alert(`Errore: ${err.message}`); } 
        finally { btn.disabled = false; btn.innerHTML = '⚡ Estrai Dati Canale'; }
    });

    // --- CHANNEL MODALS ---
    document.getElementById('inputChannelAvatar')?.addEventListener('change', (e) => {
        state.files.channelAvatar = e.target.files[0];
        if(state.files.channelAvatar) {
            const reader = new FileReader(); 
            reader.onload = ev => { document.getElementById('channelAvatarPreview').innerHTML = `<img src="${ev.target.result}" class="w-full h-full object-cover rounded-full">`; }; 
            reader.readAsDataURL(state.files.channelAvatar);
        }
    });

    document.getElementById('addChannelBtn')?.addEventListener('click', () => {
        requirePin("Per creare un nuovo canale devi essere autorizzato.", () => {
            document.getElementById('addChannelModal').classList.remove('hidden'); 
            document.getElementById('addChannelModal').classList.add('flex');
        });
    });

    const closeAddChannelModal = () => { document.getElementById('addChannelModal').classList.add('hidden'); document.getElementById('addChannelModal').classList.remove('flex'); };
    document.getElementById('closeChannelModalBtn')?.addEventListener('click', closeAddChannelModal); 
    document.getElementById('cancelChannelBtn')?.addEventListener('click', closeAddChannelModal);

    document.getElementById('saveChannelBtn')?.addEventListener('click', async () => {
        const name = document.getElementById('inputChannelName').value.trim();
        if (!name) return; // Permette di creare canali anche se non c'è l'URL API impostato!
        const btn = document.getElementById('saveChannelBtn'); btn.disabled = true;

        let driveFolderId = '', profilePicUrl = '';

        try {
            btn.textContent = '📁 Creazione Cartella...';
            const compressionPromise = state.files.channelAvatar ? compressImage(state.files.channelAvatar, 400, 0.7, 'image/jpeg') : null;
            const folderRes = await callScriptAction({ action: 'createChannelFolder', name }); 
            driveFolderId = folderRes.folderId || '';
            
            if(state.files.channelAvatar && driveFolderId) {
                btn.textContent = '🚀 Upload Logo...';
                const compressedImg = await compressionPromise;
                const resI = await callScriptAction({ action: 'uploadProfilePicture', folderId: driveFolderId, base64: compressedImg.base64, mimeType: compressedImg.mimeType, ext: compressedImg.ext });
                if(resI.fileId) profilePicUrl = `https://drive.google.com/thumbnail?id=${resI.fileId}&sz=w400`;
            }
        } catch(e) {}

        state.channels.push({ id: Date.now().toString(), name, color: state.CHANNEL_COLORS[state.channels.length % state.CHANNEL_COLORS.length], driveFolderId, profilePicUrl });
        renderChannelList(); closeAddChannelModal(); btn.disabled = false; btn.textContent = 'Crea Canale'; 
        autoSaveToCloud();
    });

    // Edit Channel
    document.getElementById('editChannelAvatar')?.addEventListener('change', (e) => {
        state.files.editChannelAvatar = e.target.files[0];
        if(state.files.editChannelAvatar) {
            const reader = new FileReader(); 
            reader.onload = ev => { 
                document.getElementById('editChannelAvatarPreview').innerHTML = `<img src="${ev.target.result}" class="w-full h-full object-cover rounded-full">`; 
                document.getElementById('editChannelAvatarName').textContent = '📎 ' + state.files.editChannelAvatar.name;
                document.getElementById('editChannelAvatarName').classList.remove('hidden');
            }; 
            reader.readAsDataURL(state.files.editChannelAvatar);
        }
    });

    document.getElementById('closeEditChannelBtn')?.addEventListener('click', () => closeModal('editChannelModal'));
    document.getElementById('cancelEditChannelBtn')?.addEventListener('click', () => closeModal('editChannelModal'));

    const handleEditChannelSave = async (e) => {
        if (e) e.preventDefault();
        const id = document.getElementById('editChannelId')?.value;
        const name = document.getElementById('editChannelName')?.value.trim();
        if (!name || !id) return;
        
        const btn = document.getElementById('saveEditChannelBtn') || document.querySelector('#editChannelForm button[type="submit"]');
        if (btn) { btn.disabled = true; btn.textContent = '🔄...'; }

        const ch = state.channels.find(c => c.id === id);
        if (ch) {
            ch.name = name;
            if (state.files.editChannelAvatar) {
                try {
                    const compressedImg = await compressImage(state.files.editChannelAvatar, 400, 0.7, 'image/jpeg');
                    if (state.SCRIPT_URL && ch.driveFolderId) {
                        if (btn) btn.textContent = '🚀...';
                        const resI = await callScriptAction({ action: 'uploadProfilePicture', folderId: ch.driveFolderId, base64: compressedImg.base64, mimeType: compressedImg.mimeType, ext: compressedImg.ext });
                        if(resI.fileId) ch.profilePicUrl = `https://drive.google.com/thumbnail?id=${resI.fileId}&sz=w400`;
                        else ch.profilePicUrl = compressedImg.dataUrl;
                    } else {
                        ch.profilePicUrl = compressedImg.dataUrl;
                    }
                } catch(err) { devLog(`[ADMIN] Errore upload avatar: ${err.message}`, "error"); }
            }
        }

        renderChannelList(); 
        renderAdminChannelList();
        if (state.currentView === 'idee') renderVideos(getFilteredIdeas());
        closeModal('editChannelModal'); 
        if (btn) { btn.disabled = false; btn.textContent = 'Salva Modifiche'; }
        state.files.editChannelAvatar = null;
        autoSaveToCloud();
    };

    document.getElementById('saveEditChannelBtn')?.addEventListener('click', handleEditChannelSave);
    const editChannelForm = document.getElementById('editChannelForm');
    if (editChannelForm) editChannelForm.addEventListener('submit', handleEditChannelSave);

    // --- FORM: FINANZA (EARNINGS) ---
    document.getElementById('finChartRange')?.addEventListener('change', () => { renderFinanceDashboard(); });

    document.getElementById('formRevenue')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const amount = document.getElementById('revAmount').value;
        const source = document.getElementById('revSource').value.trim();
        const date = document.getElementById('revDate').value;
        state.finance.revenues.push({ id: Date.now().toString(), amount, source, date });
        renderFinanceDashboard(); closeModal('addRevenueModal', 'formRevenue'); autoSaveToCloud();
    });

    document.getElementById('formSub')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        
        let finalPrice = parseFloat(document.getElementById('subPrice').value);
        const currency = document.getElementById('subCurrency').value;

        if (currency === 'USD') {
            submitBtn.disabled = true; submitBtn.textContent = '🔄 Conversione in corso...';
            try {
                const res = await fetch('https://open.er-api.com/v6/latest/USD');
                const data = await res.json();
                if (data && data.rates && data.rates.EUR) finalPrice = finalPrice * data.rates.EUR;
                else throw new Error("Tasso non trovato");
            } catch (err) {
                devLog("[FINANCE] Impossibile recuperare tasso di cambio dal server. Uso fallback stimato (0.92).", "warning");
                finalPrice = finalPrice * 0.92;
            }
        }

        state.finance.subscriptions.push({ 
            id: Date.now().toString(), 
            name: document.getElementById('subName').value.trim(), 
            site: document.getElementById('subSite').value.trim(), 
            price: finalPrice.toFixed(2), 
            cycle: document.getElementById('subCycle').value, 
            nextRenewal: document.getElementById('subRenewal').value
        });
        submitBtn.disabled = false; submitBtn.textContent = originalText;
        renderFinanceDashboard(); closeModal('addSubModal', 'formSub'); autoSaveToCloud();
    });

    document.getElementById('formEditorCost')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const ideaId = document.getElementById('edCostIdea').value;
        const editor = document.getElementById('edCostName').value;
        if(!ideaId) { alert("Devi selezionare un'idea per poter associare un costo."); return; }
        
        state.finance.editorCosts.push({ 
            id: Date.now().toString(), 
            ideaId, 
            editor, 
            amount: document.getElementById('edCostAmount').value, 
            date: document.getElementById('edCostDate').value 
        });
        renderFinanceDashboard(); closeModal('addEditorCostModal', 'formEditorCost'); autoSaveToCloud();
    });

});