// Sanifica testo destinato a essere inserito come HTML (contro XSS).
// Usare SEMPRE su dati che arrivano da input utente o da contenuti scrapati
// prima di interpolarli in innerHTML.
export function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Valida un URL per uso in href/src/window.open. Ammette solo http(s), dati
// immagine e mailto; altrimenti torna stringa vuota (blocca javascript:, ecc.).
export function safeUrl(value) {
    if (!value) return '';
    const s = String(value).trim();
    if (/^https?:\/\//i.test(s)) return s;
    if (/^data:image\//i.test(s)) return s;
    if (/^mailto:/i.test(s)) return s;
    return '';
}

// Come safeUrl ma già escaped per inserimento sicuro dentro un attributo HTML.
export function safeAttrUrl(value) {
    return escapeHtml(safeUrl(value));
}

export function getBase64SizeInKB(base64Str) {
    if(!base64Str) return 0;
    return ((base64Str.length * 3 / 4) / 1024).toFixed(2);
}

export function getStringSizeInKB(str) {
    if(!str) return 0;
    return (new Blob([str]).size / 1024).toFixed(2);
}

export function timeSince(dateValue) {
    const date = new Date(dateValue);
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return "pochi secondi fa";
    let interval = seconds / 31536000;
    if (interval >= 1) return Math.floor(interval) + (Math.floor(interval) === 1 ? " anno fa" : " anni fa");
    interval = seconds / 2592000;
    if (interval >= 1) return Math.floor(interval) + (Math.floor(interval) === 1 ? " mese fa" : " mesi fa");
    interval = seconds / 604800;
    if (interval >= 1) return Math.floor(interval) + (Math.floor(interval) === 1 ? " settimana fa" : " settimane fa");
    interval = seconds / 86400;
    if (interval >= 1) return Math.floor(interval) + (Math.floor(interval) === 1 ? " giorno fa" : " giorni fa");
    interval = seconds / 3600;
    if (interval >= 1) return Math.floor(interval) + (Math.floor(interval) === 1 ? " ora fa" : " ore fa");
    interval = seconds / 60;
    if (interval >= 1) return Math.floor(interval) + (Math.floor(interval) === 1 ? " minuto fa" : " minuti fa");
    return "pochi secondi fa";
}

export function formatViewsCount(num) {
    if (!num || num == 0 || num === "0") return "N/A views";
    let n = parseInt(num);
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M views';
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K views';
    return n.toString() + ' views';
}

export function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

export function compressImage(file, maxWidth = 1280, quality = 0.7, targetFormat = 'image/jpeg') {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const scaleSize = maxWidth / img.width;
                const w = img.width > maxWidth ? maxWidth : img.width;
                const h = img.width > maxWidth ? img.height * scaleSize : img.height;
                canvas.width = w; canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                const base64Full = canvas.toDataURL(targetFormat, quality);
                const base64 = base64Full.split(',')[1];
                const ext = targetFormat === 'image/webp' ? 'webp' : 'jpg';
                const compressedKB = getBase64SizeInKB(base64);
                resolve({ base64, mimeType: targetFormat, ext: ext, dataUrl: base64Full, sizeKB: compressedKB });
            };
        };
    });
}