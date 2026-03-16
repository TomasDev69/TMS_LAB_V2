import { state } from './state.js';
import { renderVideos, renderInspChannels, renderTools, renderTraining, renderEditorsHub, renderStats, renderDatabaseStats, getFilteredIdeas, loadInspFeed, renderTMSPicks, renderFinanceDashboard } from './renderers.js';

export function devLog(message, type = 'info') {
    const consoleOutput = document.getElementById('consoleOutput');
    if (!consoleOutput) return; // Evita crash se la console non c'è
    const time = new Date().toLocaleTimeString('it-IT');
    const el = document.createElement('div');
    let colorClass = 'text-gray-300'; let prefix = '[INFO]';
    if (type === 'success') { colorClass = 'text-green-400'; prefix = '[SUCCESS]'; }
    if (type === 'warning') { colorClass = 'text-yellow-400'; prefix = '[WARN]'; }
    if (type === 'error') { colorClass = 'text-red-500'; prefix = '[ERROR]'; }
    el.className = `flex gap-2 py-0.5 border-b border-white/5 ${colorClass}`;
    el.innerHTML = `<span class="text-gray-500 shrink-0">[${time}]</span> <span class="font-bold shrink-0">${prefix}</span> <span class="break-all">${message}</span>`;
    consoleOutput.appendChild(el);
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

export function updateStatus(text, type) {
    const dbStatusBadge = document.getElementById('dbStatusBadge');
    const mainActionBtn = document.getElementById('mainActionBtn');
    if (dbStatusBadge) {
        dbStatusBadge.textContent = text;
        dbStatusBadge.className = `text-xs px-2 py-0.5 rounded border ${type === 'success' ? 'bg-green-900/40 text-green-400 border-green-500/30' : type === 'error' ? 'bg-red-900/40 text-red-400 border-red-500/30' : 'bg-yellow-900/40 text-yellow-400 border-yellow-500/30'}`;
    }
    if (mainActionBtn) mainActionBtn.disabled = (type !== 'success');
}

export function closeModal(modalId, formId) {
    document.getElementById(modalId).classList.add('hidden');
    document.getElementById(modalId).classList.remove('flex');
    if(formId) document.getElementById(formId).reset();
    if(modalId === 'addModal') { document.getElementById('thumbPreview').classList.add('hidden'); document.getElementById('thumbDropHint').classList.remove('hidden'); }
    if(modalId === 'addToolModal') { document.getElementById('toolPreview').classList.add('hidden'); document.getElementById('toolDropHint').classList.remove('hidden'); }
    if(modalId === 'addTrainingModal') { document.getElementById('trainingPreview').classList.add('hidden'); document.getElementById('trainingDropHint').classList.remove('hidden'); }
    if(modalId === 'editChannelModal') { document.getElementById('editChannelAvatarPreview').innerHTML = '📺'; document.getElementById('editChannelAvatarName').classList.add('hidden'); }
    if(modalId === 'addEHModal') { document.getElementById('ehFileName').classList.add('hidden'); document.getElementById('ehDropHint').classList.remove('hidden'); document.getElementById('ehIconPreview').classList.add('hidden'); state.files.eh = null; }
    if(modalId === 'editIdeaModal') { document.getElementById('editIdeaThumbPreview').src = ''; document.getElementById('editIdeaThumbFileName').classList.add('hidden'); state.files.editIdeaThumb = null; }
    if(modalId === 'devTodoModal') { document.getElementById('devTodoModal').classList.add('hidden'); document.getElementById('devTodoModal').classList.remove('flex'); }
    if(modalId === 'wipEarningsModal') { document.getElementById('wipEarningsModal').classList.add('hidden'); document.getElementById('wipEarningsModal').classList.remove('flex'); }
    if(modalId === 'addRevenueModal') { document.getElementById('addRevenueModal').classList.add('hidden'); document.getElementById('addRevenueModal').classList.remove('flex'); }
    if(modalId === 'addSubModal') { document.getElementById('addSubModal').classList.add('hidden'); document.getElementById('addSubModal').classList.remove('flex'); }
    if(modalId === 'addEditorCostModal') { document.getElementById('addEditorCostModal').classList.add('hidden'); document.getElementById('addEditorCostModal').classList.remove('flex'); }
}

export function closePinModal() {
    document.getElementById('pinModal').classList.add('hidden');
    document.getElementById('pinModal').classList.remove('flex');
}

export function requirePin(actionMessage, callback) {
    document.getElementById('pinActionMsg').textContent = actionMessage;
    document.getElementById('pinInput').value = '';
    document.getElementById('pinError').classList.add('hidden');
    document.getElementById('pinModal').classList.remove('hidden');
    document.getElementById('pinModal').classList.add('flex');
    setTimeout(() => document.getElementById('pinInput').focus(), 100);
    
    const confirmBtn = document.getElementById('pinConfirmBtn');
    const newBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);
    
    const handleConfirm = () => {
        if (document.getElementById('pinInput').value === '18456') {
            closePinModal(); callback();
        } else {
            document.getElementById('pinError').classList.remove('hidden');
            document.getElementById('pinInput').value = ''; document.getElementById('pinInput').focus();
        }
    };
    newBtn.addEventListener('click', handleConfirm);
    document.getElementById('pinInput').onkeydown = (e) => { if(e.key === 'Enter') handleConfirm(); };
}

export function switchView(view) {
    state.currentView = view;
    ['navIdee', 'navInspirations', 'navTmsPicks', 'navStrumenti', 'navFormazione', 'navEditorsHub', 'navScript', 'navStats', 'navDatabase'].forEach(id => document.getElementById(id).classList.remove('active'));
    document.getElementById('navEarnings').classList.remove('bg-green-900/40');
    ['viewIdeeWrapper', 'viewInspirationsWrapper', 'viewTMSPicksWrapper', 'viewStrumentiWrapper', 'viewFormazioneWrapper', 'viewEditorsHubWrapper', 'viewScriptWrapper', 'viewStatsWrapper', 'viewDatabaseWrapper', 'viewEarningsWrapper'].forEach(id => document.getElementById(id).classList.add('hidden'));
    
    if(!state.globalAudioPlayer.paused) { state.globalAudioPlayer.pause(); state.currentlyPlayingEHId = null; }

    const pageTitle = document.getElementById('pageTitle');
    const pageSubtitle = document.getElementById('pageSubtitle');
    const mainActionBtn = document.getElementById('mainActionBtn');
    const mainActionText = document.getElementById('mainActionText');

    if (view === 'idee') {
        document.getElementById('navIdee').classList.add('active'); document.getElementById('viewIdeeWrapper').classList.remove('hidden');
        pageTitle.textContent = 'Le tue Idee Video'; pageSubtitle.textContent = 'Sviluppa e traccia i tuoi prossimi contenuti.';
        mainActionBtn.classList.remove('hidden'); mainActionText.textContent = 'Crea Idea';
        mainActionBtn.onclick = () => { document.getElementById('addModal').classList.remove('hidden'); document.getElementById('addModal').classList.add('flex'); };
        renderVideos(getFilteredIdeas());
    } else if (view === 'inspirations') {
        document.getElementById('navInspirations').classList.add('active'); document.getElementById('viewInspirationsWrapper').classList.remove('hidden');
        pageTitle.textContent = 'Inspirations'; pageSubtitle.textContent = 'Studia e analizza i canali dei competitor per prendere spunto.';
        if (state.currentInspTab === 'channels') {
            mainActionBtn.classList.remove('hidden'); mainActionText.textContent = 'Aggiungi Canale';
            mainActionBtn.onclick = () => { document.getElementById('addInspChannelModal').classList.remove('hidden'); document.getElementById('addInspChannelModal').classList.add('flex'); };
            renderInspChannels();
        } else {
            mainActionBtn.classList.add('hidden');
            if(state.globalFeed.length === 0) loadInspFeed();
        }
    } else if (view === 'tmspicks') {
        document.getElementById('navTmsPicks').classList.add('active'); document.getElementById('viewTMSPicksWrapper').classList.remove('hidden');
        pageTitle.textContent = 'TMS Picks'; pageSubtitle.textContent = 'I tuoi video YouTube preferiti salvati e monitorati.';
        mainActionBtn.classList.remove('hidden'); mainActionText.textContent = 'Aggiungi Pick';
        mainActionBtn.onclick = () => { document.getElementById('addPickModal').classList.remove('hidden'); document.getElementById('addPickModal').classList.add('flex'); };
        renderTMSPicks();
    } else if (view === 'strumenti') {
        document.getElementById('navStrumenti').classList.add('active'); document.getElementById('viewStrumentiWrapper').classList.remove('hidden');
        pageTitle.textContent = 'Strumenti & Risorse'; pageSubtitle.textContent = 'Tutti i tool utili al tuo flusso di lavoro.';
        mainActionBtn.classList.remove('hidden'); mainActionText.textContent = 'Aggiungi Strumento';
        mainActionBtn.onclick = () => { 
            document.getElementById('toolModalTitle').textContent = 'Aggiungi Strumento/Risorsa'; document.getElementById('inputToolId').value = '';
            document.getElementById('toolForm').reset(); document.getElementById('toolPreview').classList.add('hidden'); document.getElementById('toolDropHint').classList.remove('hidden');
            document.getElementById('btnSubmitTool').textContent = 'Salva Strumento';
            document.getElementById('addToolModal').classList.remove('hidden'); document.getElementById('addToolModal').classList.add('flex'); 
        };
        renderTools();
    } else if (view === 'formazione') {
        document.getElementById('navFormazione').classList.add('active'); document.getElementById('viewFormazioneWrapper').classList.remove('hidden');
        pageTitle.textContent = 'Video Formazione'; pageSubtitle.textContent = 'Lezioni e tutorial da studiare.';
        mainActionBtn.classList.remove('hidden'); mainActionText.textContent = 'Aggiungi Risorsa';
        mainActionBtn.onclick = () => { 
            document.getElementById('trainingModalTitle').textContent = 'Aggiungi Video Formazione'; document.getElementById('inputTrainingId').value = '';
            document.getElementById('trainingForm').reset(); document.querySelector('input[name="trainingType"][value="youtube"]').checked = true; window.toggleTrainingType();
            document.getElementById('btnSubmitTraining').textContent = 'Salva Risorsa';
            document.getElementById('addTrainingModal').classList.remove('hidden'); document.getElementById('addTrainingModal').classList.add('flex'); 
        };
        renderTraining();
    } else if (view === 'editorshub') {
        document.getElementById('navEditorsHub').classList.add('active'); document.getElementById('viewEditorsHubWrapper').classList.remove('hidden');
        pageTitle.textContent = 'Editors Hub'; pageSubtitle.textContent = 'Libreria centralizzata per Effetti Sonori, Musica e Immagini.';
        mainActionBtn.classList.remove('hidden'); mainActionText.textContent = 'Aggiungi File';
        mainActionBtn.onclick = () => { 
            document.getElementById('addEHModal').classList.remove('hidden'); document.getElementById('addEHModal').classList.add('flex'); 
            document.getElementById('ehIconPreview').classList.add('hidden'); document.getElementById('ehIconPreview').src = ''; document.getElementById('ehDropHint').classList.remove('hidden');
        };
        renderEditorsHub();
    } else if (view === 'script') {
        document.getElementById('navScript').classList.add('active'); document.getElementById('viewScriptWrapper').classList.remove('hidden');
        pageTitle.textContent = 'Analisi Script Video'; pageSubtitle.textContent = 'Scrivi o incolla il tuo script per ottenere stime sui tempi.';
        mainActionBtn.classList.remove('hidden'); mainActionText.textContent = 'Svuota Testo';
        mainActionBtn.onclick = () => { const t = document.getElementById('scriptInput'); t.value = ''; t.dispatchEvent(new Event('input')); };
    } else if (view === 'stats') {
        document.getElementById('navStats').classList.add('active'); document.getElementById('viewStatsWrapper').classList.remove('hidden');
        pageTitle.textContent = 'Dashboard & Statistiche'; pageSubtitle.textContent = 'Analisi delle performance e andamento del canale.';
        mainActionBtn.classList.remove('hidden'); mainActionText.textContent = 'Crea Idea'; 
        mainActionBtn.onclick = () => { document.getElementById('addModal').classList.remove('hidden'); document.getElementById('addModal').classList.add('flex'); };
        renderStats();
    } else if (view === 'database') {
        document.getElementById('navDatabase').classList.add('active'); document.getElementById('viewDatabaseWrapper').classList.remove('hidden');
        pageTitle.textContent = 'Analisi Database'; pageSubtitle.textContent = 'Monitora e pulisci il database.';
        mainActionBtn.classList.remove('hidden'); mainActionText.textContent = 'Pulisci Sistema'; 
        mainActionBtn.onclick = () => { alert("Consiglio: elimina manualmente gli elementi pesanti listati qui sotto."); };
        renderDatabaseStats();
    } else if (view === 'earnings') {
        document.getElementById('navEarnings').classList.add('bg-green-900/40'); document.getElementById('viewEarningsWrapper').classList.remove('hidden');
        pageTitle.textContent = 'Earnings & Finance'; pageSubtitle.textContent = 'Dati finanziari privati del network.';
        mainActionBtn.classList.add('hidden');
        
        if (!sessionStorage.getItem('tmslab_wip_earnings_seen')) {
            document.getElementById('wipEarningsModal').classList.remove('hidden'); document.getElementById('wipEarningsModal').classList.add('flex');
            sessionStorage.setItem('tmslab_wip_earnings_seen', 'true');
        }
        renderFinanceDashboard();
    }
}