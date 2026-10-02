// O "(() => { ... })();" isola este código para não dar conflito de variáveis com o popup.js do MAL
(() => {
    const defaultDesc = `✨ Minhas Redes Sociais
---------------------------------
🎬  Assista minhas Lives: https://twitch.tv/seucanal
🎥  Canal Principal: https://www.youtube.com/@seucanal
📸  Instagram: @seuinstagram`;

    let settings = {};
    let originalSettings = {}; 

    document.addEventListener('DOMContentLoaded', () => {
        chrome.storage.local.get(['appSettings'], (data) => {
            settings = data.appSettings || {};
            
            // Valores Padrão
            if (settings.delayObra === undefined) settings.delayObra = 2000;
            if (settings.delayMenu === undefined) settings.delayMenu = 600;
            if (settings.delayPlaylist === undefined) settings.delayPlaylist = 1000;
            if (settings.retryOnFail === undefined) settings.retryOnFail = true;
            if (settings.enableRating === undefined) settings.enableRating = true;
            if (settings.copyVis === undefined) settings.copyVis = false;
            if (settings.useObraAsTitle === undefined) settings.useObraAsTitle = true; 
            
            if (!settings.shSave) settings.shSave = { altKey: true, ctrlKey: false, shiftKey: false, key: 's', display: 'Alt + S' };
            if (!settings.shFill) settings.shFill = { altKey: true, ctrlKey: false, shiftKey: false, key: 'b', display: 'Alt + B' };
            if (!settings.titleTemplate) settings.titleTemplate = "Nome Anime | T1 Ep. 01";
            if (!settings.titleNoTemp) settings.titleNoTemp = "{obra} | Ep. {ep}";
            if (!settings.titleTemp) settings.titleTemp = "{obra} | T{temp} Ep. {ep}";
            if (!settings.descTemplate) settings.descTemplate = defaultDesc;

            originalSettings = JSON.parse(JSON.stringify(settings)); 
            preencherCampos();
        });

        const textInputs = document.querySelectorAll('#view-cinefy input[type="text"]:not(.key-recorder), #view-cinefy input[type="number"], #view-cinefy textarea');
        textInputs.forEach(input => input.addEventListener('input', showUnsavedBar));

        const switches = document.querySelectorAll('#view-cinefy input[type="checkbox"]');
        switches.forEach(sw => sw.addEventListener('change', () => saveSettings(true)));

        document.getElementById('btn-save-bar').addEventListener('click', () => saveSettings(false));
        document.getElementById('btn-reset').addEventListener('click', () => {
            settings = JSON.parse(JSON.stringify(originalSettings));
            preencherCampos();
            hideUnsavedBar();
        });

        document.getElementById('key-save').addEventListener('keydown', (e) => recordKeystroke(e, 'shSave'));
        document.getElementById('key-fill').addEventListener('keydown', (e) => recordKeystroke(e, 'shFill'));

        document.getElementById('reset-key-save').addEventListener('click', () => {
            settings.shSave = { altKey: true, ctrlKey: false, shiftKey: false, key: 's', display: 'Alt + S' };
            document.getElementById('key-save').value = settings.shSave.display;
            saveSettings(true);
        });
        document.getElementById('reset-key-fill').addEventListener('click', () => {
            settings.shFill = { altKey: true, ctrlKey: false, shiftKey: false, key: 'b', display: 'Alt + B' };
            document.getElementById('key-fill').value = settings.shFill.display;
            saveSettings(true);
        });
    });

    function preencherCampos() {
        document.getElementById('key-save').value = settings.shSave.display;
        document.getElementById('key-fill').value = settings.shFill.display;
        document.getElementById('delay-obra').value = settings.delayObra;
        document.getElementById('delay-menu').value = settings.delayMenu;
        document.getElementById('delay-playlist').value = settings.delayPlaylist;
        document.getElementById('retry-on-fail').checked = settings.retryOnFail;
        document.getElementById('enable-rating').checked = settings.enableRating;
        document.getElementById('copy-vis').checked = settings.copyVis;
        document.getElementById('use-obra-as-title').checked = settings.useObraAsTitle;
        document.getElementById('title-template').value = settings.titleTemplate;
        document.getElementById('title-no-temp').value = settings.titleNoTemp;
        document.getElementById('title-temp').value = settings.titleTemp;
        document.getElementById('desc-template').value = settings.descTemplate;
    }

    function showUnsavedBar() { document.getElementById('unsaved-bar').classList.add('visible'); }
    function hideUnsavedBar() { document.getElementById('unsaved-bar').classList.remove('visible'); }

    function saveSettings(silent = false) {
        settings.delayObra = parseInt(document.getElementById('delay-obra').value, 10) || 2000;
        settings.delayMenu = parseInt(document.getElementById('delay-menu').value, 10) || 600;
        settings.delayPlaylist = parseInt(document.getElementById('delay-playlist').value, 10) || 1000;
        settings.retryOnFail = document.getElementById('retry-on-fail').checked;
        settings.enableRating = document.getElementById('enable-rating').checked;
        settings.copyVis = document.getElementById('copy-vis').checked;
        settings.useObraAsTitle = document.getElementById('use-obra-as-title').checked;
        settings.titleTemplate = document.getElementById('title-template').value;
        settings.titleNoTemp = document.getElementById('title-no-temp').value;
        settings.titleTemp = document.getElementById('title-temp').value;
        settings.descTemplate = document.getElementById('desc-template').value;

        chrome.storage.local.set({ 'appSettings': settings }, () => {
            originalSettings = JSON.parse(JSON.stringify(settings)); 
            if (!silent) hideUnsavedBar();
        });
    }

    function recordKeystroke(e, objKey) {
        e.preventDefault();
        let keys = [];
        if (e.ctrlKey) keys.push('Ctrl'); if (e.altKey) keys.push('Alt'); if (e.shiftKey) keys.push('Shift');
        let keyName = e.key.toLowerCase();
        if (['control', 'alt', 'shift', 'meta'].includes(keyName)) return; 
        keys.push(keyName.toUpperCase());
        
        let display = keys.join(' + ');
        e.target.value = display;
        settings[objKey] = { altKey: e.altKey, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, key: keyName, display: display };
        saveSettings(true); 
    }
})();