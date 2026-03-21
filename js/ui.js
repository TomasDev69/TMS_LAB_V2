import { state } from './state.js';
import { renderVideos, renderInspChannels, renderTools, renderTraining, renderEditorsHub, renderStats, renderDatabaseStats, getFilteredIdeas, loadInspFeed, renderTMSPicks, renderFinanceDashboard } from './renderers.js';

export function devLog(message, type = 'info', extraData = null) {
    // --- BROWSER DEV CONSOLE LOGGING ---
    const plainMsg = message.replace(/<[^>]*>?/gm, '');
    const css = { info: 'color:#3ea6ff;font-weight:bold', success: 'color:#4ade80;font-weight:bold', warning: 'color:#facc15;font-weight:bold', error: 'color:#f87171;font-weight:bold' }[type] || 'color:#ccc';
    const clog = type === 'error' ? console.error : type === 'warning' ? console.warn : console.info;
    if (extraData) clog(`%c[TMS DEBUG] ${plainMsg}`, css, extraData);
    else clog(`%c[TMS DEBUG] ${plainMsg}`, css);
    // -----------------------------------

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
    const m = document.getElementById(modalId);
    if(m) { m.classList.add('hidden'); m.classList.remove('flex'); }
    if(formId) { const f = document.getElementById(formId); if(f) f.reset(); }
    
    if(modalId === 'addModal') { document.getElementById('thumbPreview')?.classList.add('hidden'); document.getElementById('thumbDropHint')?.classList.remove('hidden'); }
    if(modalId === 'addToolModal') { document.getElementById('toolPreview')?.classList.add('hidden'); document.getElementById('toolDropHint')?.classList.remove('hidden'); }
    if(modalId === 'addTrainingModal') { document.getElementById('trainingPreview')?.classList.add('hidden'); document.getElementById('trainingDropHint')?.classList.remove('hidden'); }
    if(modalId === 'editChannelModal') { const eCA = document.getElementById('editChannelAvatarPreview'); if(eCA) eCA.innerHTML = '📺'; document.getElementById('editChannelAvatarName')?.classList.add('hidden'); }
    if(modalId === 'addEHModal') { document.getElementById('ehFileName')?.classList.add('hidden'); document.getElementById('ehDropHint')?.classList.remove('hidden'); document.getElementById('ehIconPreview')?.classList.add('hidden'); state.files.eh = null; }
    if(modalId === 'editIdeaModal') { const eIT = document.getElementById('editIdeaThumbPreview'); if(eIT) eIT.src = ''; document.getElementById('editIdeaThumbFileName')?.classList.add('hidden'); state.files.editIdeaThumb = null; }
}

export function closePinModal() {
    document.getElementById('pinModal')?.classList.add('hidden');
    document.getElementById('pinModal')?.classList.remove('flex');
}

export function requirePin(actionMessage, callback) {
    const msg = document.getElementById('pinActionMsg'); if(msg) msg.textContent = actionMessage;
    const inp = document.getElementById('pinInput'); if(inp) inp.value = '';
    const err = document.getElementById('pinError'); if(err) err.classList.add('hidden');
    const mod = document.getElementById('pinModal'); if(mod) { mod.classList.remove('hidden'); mod.classList.add('flex'); }
    setTimeout(() => { if(inp) inp.focus(); }, 100);
    
    const confirmBtn = document.getElementById('pinConfirmBtn');
    if (confirmBtn) {
        const newBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);
        
        const handleConfirm = () => {
            const v = document.getElementById('pinInput')?.value;
            if (v === '18456') {
                closePinModal(); callback();
            } else {
                const e2 = document.getElementById('pinError'); if(e2) e2.classList.remove('hidden');
                const i2 = document.getElementById('pinInput'); if(i2) { i2.value = ''; i2.focus(); }
            }
        };
        newBtn.addEventListener('click', handleConfirm);
        const pi = document.getElementById('pinInput'); if(pi) pi.onkeydown = (e) => { if(e.key === 'Enter') handleConfirm(); };
    }
}

export function switchView(view) {
    devLog(`Cambio vista in corso: -> ${view.toUpperCase()}`, 'info');
    console.time(`[PERF RENDER] View: ${view}`);
    state.currentView = view;
    ['navIdee', 'navInspirations', 'navStrumenti', 'navFormazione', 'navEditorsHub', 'navScript', 'navStats', 'navDatabase', 'navBrainstorming', 'navCompetitors', 'navSchedule'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('active');
    });
    const navEarn = document.getElementById('navEarnings');
    if (navEarn) navEarn.classList.remove('bg-green-900/40');
    ['viewIdeeWrapper', 'viewInspirationsWrapper', 'viewStrumentiWrapper', 'viewFormazioneWrapper', 'viewEditorsHubWrapper', 'viewScriptWrapper', 'viewStatsWrapper', 'viewDatabaseWrapper', 'viewEarningsWrapper', 'viewBrainstormingWrapper', 'viewCompetitorsWrapper', 'viewScheduleWrapper'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    
    if(!state.globalAudioPlayer.paused) { state.globalAudioPlayer.pause(); state.currentlyPlayingEHId = null; }

    const pageTitle = document.getElementById('pageTitle');
    const pageSubtitle = document.getElementById('pageSubtitle');
    const mainActionBtn = document.getElementById('mainActionBtn');
    const mainActionText = document.getElementById('mainActionText');

    const safeSetText = (el, text) => { if(el) el.textContent = text; };
    const safeShowBtn = (text, action) => { if(mainActionBtn) { mainActionBtn.classList.remove('hidden'); mainActionBtn.onclick = action; } if(mainActionText) mainActionText.textContent = text; };
    const safeHideBtn = () => { if(mainActionBtn) mainActionBtn.classList.add('hidden'); };
    const safeActive = (navId, viewId) => { 
        const n = document.getElementById(navId); if(n) n.classList.add('active'); 
        const v = document.getElementById(viewId); if(v) v.classList.remove('hidden'); 
    };

    if (view === 'idee') {
        safeActive('navIdee', 'viewIdeeWrapper');
        safeSetText(pageTitle, 'Le tue Idee Video'); safeSetText(pageSubtitle, 'Sviluppa e traccia i tuoi prossimi contenuti.');
        safeShowBtn('Crea Idea', () => { document.getElementById('addModal')?.classList.remove('hidden'); document.getElementById('addModal')?.classList.add('flex'); });
        renderVideos(getFilteredIdeas());
    } else if (view === 'inspirations') {
        safeActive('navInspirations', 'viewInspirationsWrapper');
        safeSetText(pageTitle, 'Inspirations'); safeSetText(pageSubtitle, 'Studia e analizza i canali dei competitor per prendere spunto.');
        window.switchInspTab(state.currentInspTab);
    } else if (view === 'strumenti') {
        safeActive('navStrumenti', 'viewStrumentiWrapper');
        safeSetText(pageTitle, 'Strumenti & Risorse'); safeSetText(pageSubtitle, 'Tutti i tool utili al tuo flusso di lavoro.');
        safeShowBtn('Aggiungi Strumento', () => { 
            const t = document.getElementById('toolModalTitle'); if(t) t.textContent = 'Aggiungi Strumento/Risorsa'; 
            const id = document.getElementById('inputToolId'); if(id) id.value = '';
            document.getElementById('toolForm')?.reset(); document.getElementById('toolPreview')?.classList.add('hidden'); document.getElementById('toolDropHint')?.classList.remove('hidden');
            const b = document.getElementById('btnSubmitTool'); if(b) b.textContent = 'Salva Strumento';
            document.getElementById('addToolModal')?.classList.remove('hidden'); document.getElementById('addToolModal')?.classList.add('flex'); 
        });
        renderTools();
    } else if (view === 'formazione') {
        safeActive('navFormazione', 'viewFormazioneWrapper');
        safeSetText(pageTitle, 'Video Formazione'); safeSetText(pageSubtitle, 'Lezioni e tutorial da studiare.');
        safeShowBtn('Aggiungi Risorsa', () => { 
            const t = document.getElementById('trainingModalTitle'); if(t) t.textContent = 'Aggiungi Video Formazione'; 
            const id = document.getElementById('inputTrainingId'); if(id) id.value = '';
            document.getElementById('trainingForm')?.reset(); 
            const r = document.querySelector('input[name="trainingType"][value="youtube"]'); if(r) r.checked = true; 
            window.toggleTrainingType();
            const b = document.getElementById('btnSubmitTraining'); if(b) b.textContent = 'Salva Risorsa';
            document.getElementById('addTrainingModal')?.classList.remove('hidden'); document.getElementById('addTrainingModal')?.classList.add('flex'); 
        });
        renderTraining();
    } else if (view === 'editorshub') {
        safeActive('navEditorsHub', 'viewEditorsHubWrapper');
        safeSetText(pageTitle, 'Editors Hub'); safeSetText(pageSubtitle, 'Libreria centralizzata per Effetti Sonori, Musica e Immagini.');
        safeShowBtn('Aggiungi File', () => { 
            document.getElementById('addEHModal')?.classList.remove('hidden'); document.getElementById('addEHModal')?.classList.add('flex'); 
            document.getElementById('ehIconPreview')?.classList.add('hidden'); const ic = document.getElementById('ehIconPreview'); if(ic) ic.src = ''; 
            document.getElementById('ehDropHint')?.classList.remove('hidden');
        });
        renderEditorsHub();
    } else if (view === 'script') {
        safeActive('navScript', 'viewScriptWrapper');
        safeSetText(pageTitle, 'Analisi Script Video'); safeSetText(pageSubtitle, 'Scrivi o incolla il tuo script per ottenere stime sui tempi.');
        safeShowBtn('Svuota Testo', () => { const t = document.getElementById('scriptInput'); if(t) { t.value = ''; t.dispatchEvent(new Event('input')); } });
    } else if (view === 'stats') {
        safeActive('navStats', 'viewStatsWrapper');
        safeSetText(pageTitle, 'Dashboard & Statistiche'); safeSetText(pageSubtitle, 'Analisi delle performance e andamento del canale.');
        safeShowBtn('Crea Idea', () => { document.getElementById('addModal')?.classList.remove('hidden'); document.getElementById('addModal')?.classList.add('flex'); });
        renderStats();
    } else if (view === 'database') {
        safeActive('navDatabase', 'viewDatabaseWrapper');
        safeSetText(pageTitle, 'Analisi Database'); safeSetText(pageSubtitle, 'Monitora e pulisci il database.');
        safeShowBtn('Pulisci Sistema', () => { alert("Consiglio: elimina manualmente gli elementi pesanti listati qui sotto."); });
        renderDatabaseStats();
    } else if (view === 'earnings') {
        if(navEarn) navEarn.classList.add('bg-green-900/40'); 
        const vE = document.getElementById('viewEarningsWrapper'); if(vE) vE.classList.remove('hidden');
        safeSetText(pageTitle, 'Earnings & Finance'); safeSetText(pageSubtitle, 'Dati finanziari privati del network.');
        safeHideBtn();
        
        if (!sessionStorage.getItem('tmslab_wip_earnings_seen')) {
            document.getElementById('wipEarningsModal')?.classList.remove('hidden'); document.getElementById('wipEarningsModal')?.classList.add('flex');
            sessionStorage.setItem('tmslab_wip_earnings_seen', 'true');
        }
        renderFinanceDashboard();
    } else if (view === 'brainstorming') {
        safeActive('navBrainstorming', 'viewBrainstormingWrapper');
        safeSetText(pageTitle, 'Brainstorming & Idee'); safeSetText(pageSubtitle, 'Prendi spunto dai format virali e butta giù le tue intuizioni.');
        safeHideBtn();
        const bsInput = document.getElementById('brainstormingInput');
        if (bsInput) bsInput.value = state.brainstormingText || '';
    } else if (view === 'competitors') {
        safeActive('navCompetitors', 'viewCompetitorsWrapper');
        safeSetText(pageTitle, 'Competitors Analysis'); safeSetText(pageSubtitle, 'Analisi dettagliata della struttura e montaggio dei video per prendere spunto.');
        safeShowBtn('Aggiungi Video', () => { document.getElementById('addCompetitorModal')?.classList.remove('hidden'); document.getElementById('addCompetitorModal')?.classList.add('flex'); });
        if(window.renderCompetitors) window.renderCompetitors();
    } else if (view === 'schedule') {
        safeActive('navSchedule', 'viewScheduleWrapper');
        safeSetText(pageTitle, 'Tabella Orari'); safeSetText(pageSubtitle, 'Gestisci la disponibilità e gli orari del team.');
        safeHideBtn();
        if(window.renderScheduleCalendar) window.renderScheduleCalendar();
    }
    console.timeEnd(`[PERF RENDER] View: ${view}`);
}