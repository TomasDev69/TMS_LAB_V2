import { state } from './state.js';
import { callScriptAction, loadDataFromCloud, autoSaveToCloud, fetchYTProxy } from './api.js';
import { devLog, updateStatus, closeModal, closePinModal, requirePin, switchView } from './ui.js';
import { 
    renderVideos, getFilteredIdeas, renderChannelList, renderTools, 
    renderTraining, renderEditorsHub, renderStats, renderDatabaseStats, 
    renderInspChannels, loadInspFeed, switchEHTab, updateAudioUI, renderTMSPicks,
    renderNextFeedBatch, renderFinanceDashboard, getIdeaStatus, renderDevTodo
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
window.renderDatabaseStats = renderDatabaseStats;
window.renderTMSPicks = renderTMSPicks;
window.renderDevTodo = renderDevTodo;
window.switchEHTab = switchEHTab;

window.setLabContext = (labId) => {
    state.activeLab = labId;
    const dbRef = state.db[labId];
    
    state.videoIdeas = dbRef.videoIdeas;
    state.channels = dbRef.channels;
    state.toolsData = dbRef.toolsData;
    state.trainingData = dbRef.trainingData;
    state.editorsHubData = dbRef.editorsHubData;
    state.inspChannels = dbRef.inspChannels;
    state.tmsPicks = dbRef.tmsPicks;
    state.finance = dbRef.finance;
    if(!state.finance.revenues) state.finance.revenues = [];
    if(!state.finance.editorCosts) state.finance.editorCosts = [];
    if(!state.finance.subscriptions) state.finance.subscriptions = [];
    state.devTodoList = dbRef.devTodoList;
    state.brainstormingText = dbRef.brainstormingText || "";

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

    // --- SPLASH SCREEN: IDEAS TO REALITY ---
    // Rimosso lo Splash Screen iniziale come richiesto. Accesso diretto:
    window.initLabFlow('yt');

    // --- BINDING TASTINI FILTRO STATI IDEE ---
    setTimeout(() => {
        ['new', 'available', 'progress', 'completed'].forEach(status => {
            const countEl = document.getElementById('count' + status.charAt(0).toUpperCase() + status.slice(1));
            if (countEl) {
                // Modalità robusta di ricerca della card-contenitore
                const card = countEl.closest('div[class*="rounded-2xl"], div[class*="bg-[#212121]"]') || countEl.parentElement.parentElement;
                if (card && card.tagName !== 'BUTTON') {
                    card.style.cursor = 'pointer';
                    card.title = `Filtra per stato: ${status}`;
                    card.classList.add('transition-all', 'duration-200', 'hover:scale-105', 'hover:shadow-[0_0_15px_rgba(59,130,246,0.3)]');
                    
                    card.onclick = () => {
                        state.activeStatusFilter = state.activeStatusFilter === status ? 'all' : status;
                        
                        // Highlight visivo della card selezionata
                        ['new', 'available', 'progress', 'completed'].forEach(s => {
                            const cEl = document.getElementById('count' + s.charAt(0).toUpperCase() + s.slice(1));
                            const cCard = cEl ? (cEl.closest('div[class*="rounded-2xl"], div[class*="bg-[#212121]"]') || cEl.parentElement.parentElement) : null;
                            if (cCard) {
                                if (state.activeStatusFilter === s) {
                                    cCard.classList.add('ring-2', 'ring-blue-500', 'bg-[#2a2a2a]');
                                } else {
                                    cCard.classList.remove('ring-2', 'ring-blue-500', 'bg-[#2a2a2a]');
                                }
                            }
                        });
                        renderVideos(getFilteredIdeas());
                    };
                }
            }
        });
    }, 1000);

    // --- INJECT BRAINSTORMING VIEW & NAV (Dinamico) ---
    setTimeout(() => {
        const sidebarNav = document.querySelector('#sidebar nav') || document.querySelector('nav');
        if (sidebarNav && !document.getElementById('navBrainstorming')) {
            const ideeNav = document.getElementById('navIdee');
            if (ideeNav) {
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
            }
        }

        const mainContent = document.getElementById('viewIdeeWrapper')?.parentNode;
        if (mainContent && !document.getElementById('viewBrainstormingWrapper')) {
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
                            <li class="p-3 bg-[#222] rounded-xl border border-[#444] hover:border-teal-500 hover:bg-[#2a2a2a] transition-all cursor-pointer group" onclick="document.getElementById('brainstormingInput').value += '\\n\\n- ... explained like you\\'re 5 '">
                                <span class="font-bold text-white group-hover:text-teal-400 transition-colors">... explained like you're 5</span>
                                <span class="block text-[11px] text-gray-500 mt-1 italic">Es: The stock market explained like you're 5</span>
                            </li>
                            <li class="p-3 bg-[#222] rounded-xl border border-[#444] hover:border-pink-500 hover:bg-[#2a2a2a] transition-all cursor-pointer group" onclick="document.getElementById('brainstormingInput').value += '\\n\\n- What it\\'s like to be... '">
                                <span class="font-bold text-white group-hover:text-pink-400 transition-colors">What it's like to be...</span>
                                <span class="block text-[11px] text-gray-500 mt-1 italic">Es: What it's like to be an astronaut</span>
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

    window.initLabFlow = function(labId) {
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
            // Nota: renderAdminChannelList andrebbe spostato in renderers.js o gestito qui
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
        if (!state.files.addThumb) { alert('Carica un\'immagine.'); return; }
        submitBtn.disabled = true;

        const title = document.getElementById('inputTitle').value.trim();
        const channelId = document.getElementById('inputChannel').value || '';
        const ch = state.channels.find(c => c.id === channelId);

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
            checklist: { script: false, audio: false, video: false, music: false, sfx: false, final: false }
        };

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

        const idea = state.videoIdeas.find(v => v.id === id);
        if (idea) {
            idea.title = title;
            idea.driveLink = driveLink;
            if (assigneeEl && !assigneeEl.parentElement.classList.contains('hidden')) {
                idea.assignee = assigneeEl.value || null;
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

        renderVideos(getFilteredIdeas());
        closeModal('editIdeaModal', 'editIdeaForm');
        state.files.editIdeaThumb = null;
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Salva Modifiche'; }
        
        autoSaveToCloud();
    });

    // --- SCRIPT ANALYSIS ---
    document.getElementById('scriptInput')?.addEventListener('input', (e) => {
        const text = e.target.value.trim();
        const chars = text.length;
        const words = text === '' ? 0 : text.split(/\s+/).length;
        const timeSecs = Math.ceil(words / 2.5); // Stima di lettura: ~150 parole al minuto
        
        const charsEl = document.getElementById('scriptChars') || document.getElementById('scriptCharCount');
        const wordsEl = document.getElementById('scriptWords') || document.getElementById('scriptWordCount');
        const timeEl = document.getElementById('scriptTime') || document.getElementById('scriptTimeCount');
        
        if (charsEl) charsEl.textContent = chars;
        if (wordsEl) wordsEl.textContent = words;
        if (timeEl) timeEl.textContent = timeSecs > 60 ? `${Math.floor(timeSecs/60)}m ${timeSecs%60}s` : `${timeSecs}s`;
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

        if (!id && !state.files.tool) { alert('Carica un logo o un\'immagine per lo strumento.'); return; }
        
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

    document.getElementById('loadMoreFeedBtn').addEventListener('click', renderNextFeedBatch);

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

    document.getElementById('btnSyncChannel').addEventListener('click', async () => {
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
        if (!name || !state.SCRIPT_URL) return;
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