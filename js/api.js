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
        training: state.trainingData, editorsHub: state.editorsHubData, inspChannels: state.inspChannels
    };
    try {
        callScriptAction({ action: 'saveDB', data: payload }).then(() => {
            updateStatus("💾 Salvato!", "success");
            setTimeout(() => updateStatus("🟢 Sincronizzato", "success"), 2000);
        }).catch(e => { throw e; });
    } catch (error) { updateStatus("Errore Auto-Save", "error"); }
}