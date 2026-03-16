import { state } from './state.js';
import { devLog, updateStatus } from './ui.js';

export async function callScriptAction(bodyObj) {
    const reqSizeKB = (((JSON.stringify(bodyObj).length * 3) / 4) / 1024).toFixed(2);
    devLog(`[API] 📡 Invio POST per azione: <span class="text-blue-400 font-bold">${bodyObj.action}</span> (Grandezza: ~${reqSizeKB} KB)`, "info");
    const startTime = performance.now();
    try {
        const res = await fetch(state.SCRIPT_URL, { method: 'POST', body: JSON.stringify(bodyObj), headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
        const endTime = performance.now();
        devLog(`[API] ✅ Server Google ha risposto in ${((endTime - startTime) / 1000).toFixed(2)}s`, "success");
        const data = await res.json();
        if(data.status === 'error') throw new Error(data.message);
        return data;
    } catch(e) { 
        devLog(`[API ERROR] ❌ Errore durante ${bodyObj.action}: ${e.message}`, "error");
        throw e; 
    }
}

export async function fetchYTProxy(url) {
    const encodedUrl = encodeURIComponent(url);
    const proxy = `https://api.allorigins.win/get?url=${encodedUrl}`;
    devLog(`[YT-PROXY] Contatto server per: ${url.split('.com/')[1] || url}`, 'info');
    try {
        const res = await fetch(proxy, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
        if(res.ok) {
            const data = await res.json();
            if(data.contents) return data.contents;
        }
    } catch(e) { devLog(`[YT-PROXY] Errore di rete: ${e.message}`, 'warning'); }
    throw new Error("Impossibile connettersi al proxy.");
}

export async function autoSaveToCloud() {
    if (!state.SCRIPT_URL) return;
    updateStatus("Salvataggio...", "warning");
    const payload = { 
        ideas: state.videoIdeas, channels: state.channels, tools: state.toolsData, 
        training: state.trainingData, editorsHub: state.editorsHubData, inspChannels: state.inspChannels,
        tmsPicks: state.tmsPicks,
        finance: state.finance
    };
    try {
        callScriptAction({ action: 'saveDB', data: payload }).then(() => {
            updateStatus("💾 Salvato!", "success");
            setTimeout(() => updateStatus("🟢 Sincronizzato", "success"), 2000);
        }).catch(e => { throw e; });
    } catch (error) { updateStatus("Errore Auto-Save", "error"); }
}

export async function loadDataFromCloud() {
    if (!state.SCRIPT_URL) return;
    
    updateStatus("Caricamento DB...", "warning");
    
    try {
        const res = await fetch(state.SCRIPT_URL, { cache: 'no-store' });
        const rawText = await res.text();
        
        if (rawText.startsWith('<!DOCTYPE html>') || rawText.includes('<html')) {
            throw new Error("Ricevuta pagina web HTML. Assicurati che lo Script sia impostato su 'Chiunque (Anyone)' e che il link termini per /exec");
        }
        
        let data;
        try {
            data = JSON.parse(rawText);
        } catch (e) {
            throw new Error("Il file su Drive non è in formato JSON testuale. Assicurati che non sia un Documento Google.");
        }
        
        if (data.status === 'error') {
            throw new Error(data.message);
        }
        
        if (Array.isArray(data)) {
            state.videoIdeas = data;
            devLog("[API] Rilevato database V1 (solo idee). Retrocompatibilità attivata.", "warning");
        } else {
            if (data.ideas) state.videoIdeas = data.ideas;
            if (data.channels) state.channels = data.channels;
            if (data.tools) state.toolsData = data.tools;
            if (data.training) state.trainingData = data.training;
            if (data.editorsHub) state.editorsHubData = data.editorsHub;
            if (data.inspChannels) state.inspChannels = data.inspChannels;
            if (data.tmsPicks) state.tmsPicks = data.tmsPicks;
            
            if (data.finance) {
                state.finance = data.finance;
                if(!state.finance.revenues) state.finance.revenues = [];
                if(!state.finance.editorCosts) state.finance.editorCosts = [];
                if(!state.finance.subscriptions) state.finance.subscriptions = [];
            }
        }

        updateStatus("🟢 Sincronizzato", "success");
        devLog("[API] Dati caricati dal cloud con successo.", "success");
        
        if (window.renderChannelList) window.renderChannelList();
        if (window.switchView) window.switchView(state.currentView || 'idee');

    } catch (error) {
        updateStatus("Errore Caricamento", "error");
        devLog(`[API ERROR] Caricamento fallito: ${error.message}`, "error");
    }
}