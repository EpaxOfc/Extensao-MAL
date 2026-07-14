const criteriosPadrao = ["Direção", "Animação", "Complexidade", "Enredo", "Originalidade", "Design", 
    "Coreografia de luta", "Personagens Principais", "Antagonista", "Direção de fotografia", "Trilha Sonora", 
    "Efeitos Sonoros"];

let criteriosOriginais = [];
let criteriosTemporarios = [];
let sitesCustomizados = [];
let dicionarioCustom = {};
let currentEditingSimId = null;

function obterTokenDoBackground() {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'obterTokenValido' }, (response) => {
            if (chrome.runtime.lastError || !response || !response.success) {
                resolve(null);
            } else {
                resolve(response.token);
            }
        });
    });
}

// Mapeamento dos painéis do Simulador com os Inputs Reais
const elConfigMap = {
    'sim-toast-exp': { title: 'Toast Expandido', toggleId: 'enableToastExp', sizeId: 'sizeToastExp', discreetId: null, discreetClass: null },
    'sim-toast-micro': { title: 'Barra Colapsada', toggleId: 'enableToastMicro', sizeId: 'sizeToastMicro', discreetId: 'discreetProgressFs', discreetClass: 'fs-discreet-prog' },
    'sim-toast-flash': { title: 'Aviso de Concluído', toggleId: 'enableToastFlash', sizeId: 'sizeToastFlash', discreetId: 'discreetFlashFs', discreetClass: 'fs-discreet-flash-enabled' },
    'sim-overlay': { title: 'Painel de Avaliação', toggleId: 'enableOverlay', sizeId: 'sizeOverlay', discreetId: 'discreetOverlayFs', discreetClass: 'fs-discreet' }
};

document.addEventListener('DOMContentLoaded', () => {
    carregarConfig();
    carregarCriterios();
    
    obterTokenDoBackground().then(token => {
        if (token) {
            buscarPerfilMAL(token);
        } else {
            atualizarInterfaceLogin(false);
        }
    });

    // Ouvintes de Login / Logout / Biblioteca
    const btnLogin = document.getElementById('btnLogin');
    if (btnLogin) {
        btnLogin.addEventListener('click', () => {
            const loginStatus = document.getElementById('loginStatus');
            if (loginStatus) loginStatus.innerText = "Aguardando login...";
            
            chrome.runtime.sendMessage({ action: 'loginMAL' }, (response) => {
                if (response && response.success) {
                    chrome.storage.local.get(['mal_access_token'], (res) => {
                        if (res.mal_access_token) buscarPerfilMAL(res.mal_access_token);
                    });
                } else {
                    if (loginStatus) loginStatus.innerText = "Erro: " + (response ? response.error : 'Desconhecido');
                }
            });
        });
    }

    const btnLogout = document.getElementById('btnLogout');
    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            if (confirm("Deseja realmente desconectar sua conta do MyAnimeList?")) {
                chrome.storage.local.remove(['mal_access_token', 'mal_token_data'], () => {
                    atualizarInterfaceLogin(false);
                    verificarExibicaoBotoesBatch();
                });
            }
        });
    }

    const btnVerBiblioteca = document.getElementById('btnVerBibliotecaOptions');
    if (btnVerBiblioteca) {
        btnVerBiblioteca.addEventListener('click', () => {
            chrome.tabs.create({ url: 'lista.html' });
        });
    }

    ['officialScore', 'syncMal', 'autoUpdateProgress'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', verificarExibicaoBotoesBatch);
    });

    // SALVAMENTO AUTOMÁTICO DAS PREFERÊNCIAS E ELEMENTOS VISUAIS
    const liveKeys = ['autoOpen', 'syncMal', 'officialScore', 'autoUpdateProgress', 'autoUpdateTrigger', 
        'autoCompleteOnLast', 'blockRegressionOnComplete', 'autoOpenOverlayIfNoScore', 'allowInFullscreen', 
        'discreetOverlayFs', 'discreetProgressFs', 'discreetFlashFs', 'enableToastExp', 'enableToastMicro', 
        'enableToastFlash', 'enableOverlay', 'sizeToastExp', 'sizeToastMicro', 'sizeToastFlash', 'sizeOverlay', 
        'enablePrimeBasic', 'enablePrimeAdvanced', 'forceSidePanel', 'autoCloseCorrection', 'netflixCrSubs', 'enableGoogleDrive'];    
    liveKeys.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('change', (e) => {
            const config = {};
            config[id] = el.tagName === 'SELECT' ? e.target.value : e.target.checked;
            chrome.storage.local.set(config, () => verificarExibicaoBotoesBatch());
            
            if (id.startsWith('enable') && !id.includes('Prime')) syncElementState(id, e.target.checked);
            
            if (id === 'discreetOverlayFs') document.getElementById('sim-overlay')?.classList.toggle('fs-discreet', e.target.checked);
            if (id === 'discreetProgressFs') document.getElementById('sim-toast-micro')?.classList.toggle('fs-discreet-prog', e.target.checked);
            if (id === 'discreetFlashFs') document.getElementById('sim-toast-flash')?.classList.toggle('fs-discreet-flash-enabled', e.target.checked);
            
            if (id === 'netflixCrSubs') {
                const subSizeContainer = document.getElementById('netflixSubSizeContainer');
                if (subSizeContainer) subSizeContainer.style.display = e.target.checked ? 'block' : 'none';
            }

            if (id.startsWith('size')) {
                let mapSizeId = { 'sizeToastExp': 'sim-toast-exp', 'sizeToastMicro': 'sim-toast-micro', 'sizeToastFlash': 'sim-toast-flash', 'sizeOverlay': 'sim-overlay' };
                let simEl = document.getElementById(mapSizeId[id]);
                if (simEl) simEl.className = `sim-element ${mapSizeId[id] === 'sim-toast-exp' ? 'sim-toast' : mapSizeId[id].replace('sim-', 'sim-')} size-${e.target.value} ${document.getElementById(id.replace('size', 'enable')).checked ? '' : 'sim-disabled'} ${simEl.className.includes('fs-discreet') ? simEl.className.match(/fs-discreet[a-z-]*/)[0] : ''}`;
            }
            syncPanelIfOpen(id, config[id]);
        });
    });

    const netflixSubSizeInput = document.getElementById('netflixSubSize');
    if (netflixSubSizeInput) {
        netflixSubSizeInput.addEventListener('input', (e) => {
            const val = e.target.value;
            const lblSubSize = document.getElementById('lblNetflixSubSize');
            if (lblSubSize) lblSubSize.innerText = `${val}px`;
            
            const simSubtitleEx = document.getElementById('sim-subtitle-example');
            if (simSubtitleEx) simSubtitleEx.style.fontSize = `${val}px`;
            
            chrome.storage.local.set({ netflixSubSize: parseInt(val) });
        });
    }

    // INTERRUPTORES DO SIMULADOR
    const simTogglePopups = document.getElementById('simTogglePopups');
    if (simTogglePopups) {
        simTogglePopups.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            ['sim-toast-exp', 'sim-toast-micro', 'sim-toast-flash', 'sim-overlay'].forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.style.opacity = isChecked ? (el.classList.contains('sim-disabled') ? '0.3' : '1') : '0';
                    el.style.pointerEvents = isChecked ? 'auto' : 'none';
                }
            });
        });
    }

    const simToggleSubtitle = document.getElementById('simToggleSubtitle');
    if (simToggleSubtitle) {
        simToggleSubtitle.addEventListener('change', (e) => {
            const simSubtitleEx = document.getElementById('sim-subtitle-example');
            if (simSubtitleEx) {
                simSubtitleEx.style.opacity = e.target.checked ? '1' : '0';
            }
        });
    }

    // Critérios Temporários
    const btnAddCriterio = document.getElementById('btnAddCriterio');
    if (btnAddCriterio) {
        btnAddCriterio.addEventListener('click', () => {
            let nomeEl = document.getElementById('novoCriterio');
            let nome = nomeEl ? nomeEl.value.trim() : "";
            if (nome) {
                criteriosTemporarios.push(nome);
                if (nomeEl) nomeEl.value = "";
                renderizarCriteriosTemporarios();
                verificarAlteracoesCriterios();
            }
        });
    }

    const btnSalvarCriterios = document.getElementById('btnSalvarCriterios');
    if (btnSalvarCriterios) btnSalvarCriterios.addEventListener('click', salvarCriteriosNoStorage);
    const btnDescartarCriterios = document.getElementById('btnDescartarCriterios');
    if (btnDescartarCriterios) btnDescartarCriterios.addEventListener('click', descartarAlteracoesCriterios);
    const btnBatchUpdate = document.getElementById('btnBatchUpdate');
    if (btnBatchUpdate) btnBatchUpdate.addEventListener('click', executarAtualizacaoEmMassa);
    const btnRestoreBackup = document.getElementById('btnRestoreBackup');
    if (btnRestoreBackup) btnRestoreBackup.addEventListener('click', restaurarNotasOriginais);
    const btnLocalSync = document.getElementById('btnLocalSync');
    if (btnLocalSync) btnLocalSync.addEventListener('click', executarSincronizacaoLocalParaMAL);

    const btnAddUrl = document.getElementById('btnAddUrl');
    if (btnAddUrl) {
        btnAddUrl.addEventListener('click', () => {
            let inputUrl = document.getElementById('novaUrl');
            let url = inputUrl.value.trim().toLowerCase();
            if (url && !sitesCustomizados.includes(url)) {
                url = url.replace(/(^\w+:|^)\/\//, '').replace(/^www\./, '').split('/')[0];
                sitesCustomizados.push(url);
                chrome.storage.local.set({ customUrls: sitesCustomizados }, renderizarUrls);
                inputUrl.value = "";
            }
        });
    }

    const btnAddDic = document.getElementById('btnAddDic');
    if (btnAddDic) {
        btnAddDic.addEventListener('click', () => {
            let inputPt = document.getElementById('dicPt');
            let inputEn = document.getElementById('dicEn');
            let nomePt = inputPt.value.trim().toLowerCase();
            let nomeEn = inputEn.value.trim().toLowerCase();
            if (nomePt && nomeEn) {
                let ptLimpo = nomePt.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, "").trim();
                dicionarioCustom[ptLimpo] = nomeEn;
                chrome.storage.local.set({ customDict: dicionarioCustom }, renderizarDicionario);
                inputPt.value = ""; inputEn.value = "";
            }
        });
    }

    configurarPainelSimulador();
});

// --- FUNÇÕES DE SINCRONIZAÇÃO DA UI ---

function syncElementState(toggleId, isEnabled) {
    let sizeId = toggleId.replace('enable', 'size');
    if (toggleId === 'enableOverlay') sizeId = 'sizeOverlay';
    
    let sizeSelect = document.getElementById(sizeId);
    if (sizeSelect) sizeSelect.disabled = !isEnabled;

    let simIdMap = {
        'enableToastExp': 'sim-toast-exp',
        'enableToastMicro': 'sim-toast-micro',
        'enableToastFlash': 'sim-toast-flash',
        'enableOverlay': 'sim-overlay'
    };
    let simEl = document.getElementById(simIdMap[toggleId]);
    if (simEl) {
        // Se os popups globais do simulador estiverem ativados, muda o estilo
        const simTogglePopups = document.getElementById('simTogglePopups');
        if (simTogglePopups && !simTogglePopups.checked) {
            simEl.style.opacity = '0';
        } else {
            simEl.classList.toggle('sim-disabled', !isEnabled);
            simEl.style.opacity = isEnabled ? '1' : '0.3';
        }
    }
}

function syncPanelIfOpen(changedId, newValue) {
    if (!currentEditingSimId) return;
    let config = elConfigMap[currentEditingSimId];
    if (!config) return;

    if (changedId === config.toggleId) {
        document.getElementById('sim-edit-toggle').checked = newValue;
        document.getElementById('sim-edit-size').disabled = !newValue;
        let discToggle = document.getElementById('sim-edit-discreet');
        if (discToggle) discToggle.disabled = !newValue;
    }
    if (changedId === config.sizeId) {
        document.getElementById('sim-edit-size').value = newValue;
    }
    if (changedId === config.discreetId) {
        let discToggle = document.getElementById('sim-edit-discreet');
        if (discToggle) discToggle.checked = newValue;
    }
}

// --- FUNÇÕES DO SIMULADOR ---

function configurarPainelSimulador() {
    let simPanel = document.getElementById('sim-edit-panel');
    let btnClose = document.getElementById('sim-edit-close');
    let toggleInput = document.getElementById('sim-edit-toggle');
    let sizeInput = document.getElementById('sim-edit-size');
    let discreetInput = document.getElementById('sim-edit-discreet');

    btnClose.addEventListener('click', () => {
        simPanel.style.display = 'none';
        currentEditingSimId = null;
    });

    toggleInput.addEventListener('change', (e) => {
        if (!currentEditingSimId) return;
        let realToggle = document.getElementById(elConfigMap[currentEditingSimId].toggleId);
        if (realToggle) { realToggle.checked = e.target.checked; realToggle.dispatchEvent(new Event('change')); }
    });

    sizeInput.addEventListener('change', (e) => {
        if (!currentEditingSimId) return;
        let realSize = document.getElementById(elConfigMap[currentEditingSimId].sizeId);
        if (realSize) { realSize.value = e.target.value; realSize.dispatchEvent(new Event('change')); }
    });

    discreetInput.addEventListener('change', (e) => {
        if (!currentEditingSimId) return;
        let config = elConfigMap[currentEditingSimId];
        if (config && config.discreetId) {
            let realDiscreet = document.getElementById(config.discreetId);
            if (realDiscreet) { realDiscreet.checked = e.target.checked; realDiscreet.dispatchEvent(new Event('change')); }
        }
    });

    ['sim-toast-exp', 'sim-toast-micro', 'sim-toast-flash', 'sim-overlay'].forEach(id => {
        let el = document.getElementById(id);
        if (el) makeDraggable(el);
    });
}

function abrirPainelSimulador(simId) {
    let config = elConfigMap[simId];
    currentEditingSimId = simId;
    let el = document.getElementById(simId);
    let panel = document.getElementById('sim-edit-panel');
    
    document.getElementById('sim-edit-title').innerText = config.title;
    
    let realToggle = document.getElementById(config.toggleId);
    let realSize = document.getElementById(config.sizeId);
    
    document.getElementById('sim-edit-toggle').checked = realToggle.checked;
    document.getElementById('sim-edit-size').value = realSize.value;
    document.getElementById('sim-edit-size').disabled = !realToggle.checked;

    let discreetWrapper = document.getElementById('sim-discreet-wrapper');
    let discreetInput = document.getElementById('sim-edit-discreet');
    if (config.discreetId) {
        discreetWrapper.style.display = 'block';
        discreetInput.checked = document.getElementById(config.discreetId).checked;
        discreetInput.disabled = !realToggle.checked;
    } else {
        discreetWrapper.style.display = 'none';
    }

    let elLeft = el.offsetLeft;
    let elTop = el.offsetTop;
    let panelWidth = 230; 
    let panelHeight = 160;
    
    let newLeft = elLeft > 640 ? (elLeft - panelWidth - 20) : (elLeft + el.offsetWidth + 20);
    let newTop = elTop;
    
    if (newLeft < 10) newLeft = 10;
    if (newLeft + panelWidth > 1270) newLeft = 1270 - panelWidth;
    if (newTop + panelHeight > 710) newTop = 710 - panelHeight;
    
    panel.style.left = newLeft + 'px';
    panel.style.top = newTop + 'px';
    panel.style.right = 'auto'; 
    panel.style.bottom = 'auto';

    panel.style.display = 'block';
}

function makeDraggable(el) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    let isDragging = false;

    el.oncontextmenu = function(e) {
        e.preventDefault(); 
        abrirPainelSimulador(el.id);
    };

    el.onmousedown = function(e) {
        if (e.button === 2) return;

        e.preventDefault();
        isDragging = false;
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
        
        if (el.style.bottom !== 'auto' || el.style.transform !== 'none') {
            let rect = el.getBoundingClientRect();
            let parentRect = el.parentElement.getBoundingClientRect();
            let scale = window.innerWidth / 1280;
            if (!document.fullscreenElement) {
                scale = document.getElementById('simulator-container').clientWidth / 1280;
            }
            el.style.top = (rect.top - parentRect.top) / scale + "px";
            el.style.left = (rect.left - parentRect.left) / scale + "px";
            el.style.bottom = 'auto';
            el.style.right = 'auto';
            el.style.transform = 'none'; 
        }
    };

    function elementDrag(e) {
        isDragging = true;
        e.preventDefault();
        let scale = window.innerWidth / 1280;
        if (!document.fullscreenElement) {
            let container = document.getElementById('simulator-container');
            scale = container.clientWidth / 1280;
        }
        pos1 = (pos3 - e.clientX) / scale;
        pos2 = (pos4 - e.clientY) / scale;
        pos3 = e.clientX;
        pos4 = e.clientY;
        el.style.top = (el.offsetTop - pos2) + "px";
        el.style.left = (el.offsetLeft - pos1) + "px";
    }

    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
        if (!isDragging) {
            abrirPainelSimulador(el.id);
        }
    }
}

document.getElementById('sim-edit-panel').onmousedown = function(e) {
    e.stopPropagation();
};

function ajustarMonitorVirtual() {
    let container = document.getElementById('simulator-container');
    let virtualScreen = document.getElementById('virtual-screen');
    if (container && virtualScreen) {
        let scale = container.clientWidth / 1280;
        let isFs = document.fullscreenElement;
        if (isFs) scale = window.innerWidth / 1280;
        virtualScreen.style.transform = `scale(${scale})`;
    }
}
window.addEventListener('resize', ajustarMonitorVirtual);

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(ajustarMonitorVirtual, 100);
    const btnFullscreen = document.getElementById('btnSimFullscreen');
    if (btnFullscreen) {
        btnFullscreen.addEventListener('click', () => {
            let container = document.getElementById('simulator-container');
            if (!document.fullscreenElement) container.requestFullscreen().catch(e => {});
            else document.exitFullscreen();
        });
    }
    document.addEventListener('fullscreenchange', () => {
        const btn = document.getElementById('btnSimFullscreen');
        if (!btn) return;
        
        const iconEnter = btn.querySelector('.fs-icon-enter');
        const iconExit = btn.querySelector('.fs-icon-exit');
        const textSpan = btn.querySelector('.fs-text');
        
        if (document.fullscreenElement) {
            if (iconEnter) iconEnter.style.display = 'none';
            if (iconExit) iconExit.style.display = 'inline-block';
            if (textSpan) textSpan.textContent = "Sair";
        } else {
            if (iconEnter) iconEnter.style.display = 'inline-block';
            if (iconExit) iconExit.style.display = 'none';
            if (textSpan) textSpan.textContent = "Tela Cheia";
        }
        setTimeout(ajustarMonitorVirtual, 50); 
    });
});

function carregarConfig() {
    chrome.storage.local.get([
        'autoOpen', 'syncMal', 'officialScore', 'viewMode', 
        'autoUpdateProgress', 'autoUpdateTrigger', 'autoCompleteOnLast', 
        'blockRegressionOnComplete', 'autoOpenOverlayIfNoScore', 
        'mal_access_token', 'customUrls', 'customDict',
        'allowInFullscreen', 'enableToastExp', 'enableToastMicro', 'enableToastFlash', 'enableOverlay',
        'sizeToastExp', 'sizeToastMicro', 'sizeToastFlash', 'sizeOverlay',
        'enablePrimeBasic', 'enablePrimeAdvanced', 'netflixCrSubs', 'netflixSubSize', 'enableGoogleDrive'
    ], (res) => {
        
        const viewModeEl = document.getElementById('viewMode');
        if (viewModeEl) {
            viewModeEl.addEventListener('change', (e) => {
                chrome.storage.local.set({ viewMode: e.target.value }, () => aplicarModoDeExibicao(e.target.value));
            });

            const isOpera = navigator.userAgent.includes("OPR") || navigator.userAgent.includes("Opera");
            if (isOpera) {
                const optSidepanel = document.querySelector('#viewMode option[value="sidepanel"]');
                if (optSidepanel) {
                    optSidepanel.disabled = true;
                    optSidepanel.textContent = "Barra Lateral (Não suportado no Opera)";
                }
                const helpText = document.getElementById('viewModeHelp');
                if (helpText) {
                    helpText.style.display = 'block';
                    helpText.innerHTML = "⚠️ No Opera GX, a barra lateral já funciona pelo ícone roxo na <b>esquerda</b>. Deixe esta opção em 'Popup' para o botão do topo direito também funcionar.";
                }
                if (res.viewMode === 'sidepanel') {
                    chrome.storage.local.set({ viewMode: 'popup' });
                    aplicarModoDeExibicao('popup');
                    res.viewMode = 'popup';
                }
            }
            viewModeEl.value = res.viewMode || 'popup';
        }

        if (document.getElementById('autoOpen')) document.getElementById('autoOpen').checked = res.autoOpen ?? true;
        if (document.getElementById('syncMal')) document.getElementById('syncMal').checked = res.syncMal ?? (res.mal_access_token ? true : false);
        if (document.getElementById('officialScore')) document.getElementById('officialScore').checked = res.officialScore ?? false;
        if (document.getElementById('autoUpdateProgress')) document.getElementById('autoUpdateProgress').checked = res.autoUpdateProgress ?? true;
        if (document.getElementById('autoUpdateTrigger')) document.getElementById('autoUpdateTrigger').value = res.autoUpdateTrigger ?? '80percent';
        if (document.getElementById('autoCompleteOnLast')) document.getElementById('autoCompleteOnLast').checked = res.autoCompleteOnLast ?? true;
        if (document.getElementById('blockRegressionOnComplete')) document.getElementById('blockRegressionOnComplete').checked = res.blockRegressionOnComplete ?? true;
        if (document.getElementById('autoOpenOverlayIfNoScore')) document.getElementById('autoOpenOverlayIfNoScore').checked = res.autoOpenOverlayIfNoScore ?? true;

        const checkDrive = document.getElementById('enableGoogleDrive');
        if (checkDrive) checkDrive.checked = res.enableGoogleDrive ?? false; 

        // INICIALIZAÇÃO DOS BOTÕES DO PRIME VIDEO (Desativados por padrão)
        const checkPrimeBasic = document.getElementById('enablePrimeBasic');
        if (checkPrimeBasic) checkPrimeBasic.checked = res.enablePrimeBasic ?? false;
        
        const checkPrimeAdv = document.getElementById('enablePrimeAdvanced');
        if (checkPrimeAdv) {
            checkPrimeAdv.checked = res.enablePrimeAdvanced ?? false;
            checkPrimeAdv.disabled = !(res.enablePrimeBasic ?? false);
        }
        
        // Listener exclusivo para a interação entre os dois botões do Prime
        if (checkPrimeBasic) {
            checkPrimeBasic.addEventListener('change', (e) => {
                if (checkPrimeAdv) {
                    checkPrimeAdv.disabled = !e.target.checked;
                    if (!e.target.checked) {
                        checkPrimeAdv.checked = false;
                        chrome.storage.local.set({ enablePrimeAdvanced: false });
                    }
                }
            });
        }


        // INICIALIZADOR DOS NOVOS CONTROLES
        const checks = {
            'forceSidePanel': res.forceSidePanel ?? true,
            'autoCloseCorrection': res.autoCloseCorrection ?? true,
            'allowInFullscreen': res.allowInFullscreen ?? true,
            'discreetProgressFs': res.discreetProgressFs ?? false,
            'discreetFlashFs': res.discreetFlashFs ?? false,
            'discreetOverlayFs': res.discreetOverlayFs ?? false,
            'enableToastExp': res.enableToastExp ?? true,
            'enableToastMicro': res.enableToastMicro ?? true,
            'enableToastFlash': res.enableToastFlash ?? true,
            'enableOverlay': res.enableOverlay ?? true,
            'netflixCrSubs': res.netflixCrSubs ?? true
        };
        if (checks['discreetOverlayFs']) document.getElementById('sim-overlay')?.classList.add('fs-discreet');
        if (checks['discreetProgressFs']) document.getElementById('sim-toast-micro')?.classList.add('fs-discreet-prog');
        if (checks['discreetFlashFs']) document.getElementById('sim-toast-flash')?.classList.add('fs-discreet-flash-enabled');

        for (let key in checks) {
            let el = document.getElementById(key);
            if (el) {
                el.checked = checks[key];
                if (key.startsWith('enable')) syncElementState(key, checks[key]);
            }
        }

        const checkFs = document.getElementById('allowInFullscreen');
        const fsSubOptions = document.getElementById('fsSubOptions');
        if (checkFs && fsSubOptions) {
            fsSubOptions.style.display = checkFs.checked ? 'flex' : 'none';
            checkFs.addEventListener('change', (e) => {
                fsSubOptions.style.display = e.target.checked ? 'flex' : 'none';
            });
        }

        const subSizeContainer = document.getElementById('netflixSubSizeContainer');
        if (subSizeContainer) {
            subSizeContainer.style.display = checks['netflixCrSubs'] ? 'block' : 'none';
        }

        const savedSubSize = res.netflixSubSize || 28;
        const netflixSubSizeInput = document.getElementById('netflixSubSize');
        if (netflixSubSizeInput) {
            netflixSubSizeInput.value = savedSubSize;
            document.getElementById('lblNetflixSubSize').innerText = `${savedSubSize}px`;
            const simSubtitleEx = document.getElementById('sim-subtitle-example');
            if (simSubtitleEx) simSubtitleEx.style.fontSize = `${savedSubSize}px`;
        }

        const sizes = {
            'sizeToastExp': { val: res.sizeToastExp || 'medium', cssClass: 'sim-toast' },
            'sizeToastMicro': { val: res.sizeToastMicro || 'medium', cssClass: 'sim-micro' },
            'sizeToastFlash': { val: res.sizeToastFlash || 'medium', cssClass: 'sim-flash' },
            'sizeOverlay': { val: res.sizeOverlay || 'medium', cssClass: 'sim-overlay' }
        };

        for (let key in sizes) {
            let el = document.getElementById(key);
            if (el) {
                el.value = sizes[key].val;
                let simEl = document.getElementById(key.replace('size', 'sim').replace(/([A-Z])/g, "-$1").toLowerCase());
                if (simEl) {
                    let toggleName = key.replace('size', 'enable');
                    simEl.className = `sim-element ${sizes[key].cssClass} size-${sizes[key].val} ${checks[toggleName] ? '' : 'sim-disabled'}`;
                }
            }
        }

        sitesCustomizados = res.customUrls || [];
        dicionarioCustom = res.customDict || {};
        renderizarUrls();
        renderizarDicionario();
        verificarExibicaoBotoesBatch();
    });
}

function carregarCriterios() {
    chrome.storage.local.get(['meusCriterios'], (res) => {
        criteriosOriginais = res.meusCriterios || [...criteriosPadrao];
        criteriosTemporarios = [...criteriosOriginais];
        renderizarCriteriosTemporarios();
    });
}

function renderizarCriteriosTemporarios() {
    let container = document.getElementById('listaCriterios');
    if (!container) return;
    container.innerHTML = "";
    
    criteriosTemporarios.forEach((crit, index) => {
        let item = document.createElement('div');
        item.className = "setting-card";
        item.style.marginBottom = "6px";
        item.style.padding = "8px 12px";
        
        let span = document.createElement('span');
        span.textContent = crit;
        span.style.fontSize = "13px";
        span.style.fontWeight = "500";
        span.style.color = "#e0e0e0";
        
        let btnRemover = document.createElement('button');
        btnRemover.textContent = "🗑️";
        btnRemover.style.background = "none"; 
        btnRemover.style.border = "none"; 
        btnRemover.style.cursor = "pointer";
        btnRemover.style.fontSize = "14px";
        btnRemover.addEventListener('click', () => {
            criteriosTemporarios.splice(index, 1);
            renderizarCriteriosTemporarios();
            verificarAlteracoesCriterios();
        });
        
        item.appendChild(span); 
        item.appendChild(btnRemover); 
        container.appendChild(item);
    });
}

function renderizarUrls() {
    let container = document.getElementById('listaUrls');
    if (!container) return;
    container.innerHTML = "";
    if (sitesCustomizados.length === 0) { container.innerHTML = "<div style='color: #aaa; font-size: 13px; font-style: italic;'>Nenhum site adicionado.</div>"; return; }
    sitesCustomizados.forEach((site, index) => {
        let item = document.createElement('div');
        item.style.cssText = "display: flex; justify-content: space-between; align-items: center; background: #202024; padding: 8px 12px; margin-bottom: 5px; border-radius: 4px; border: 1px solid #444;";
        let span = document.createElement('span'); span.textContent = "🌍 " + site; span.style.fontSize = "13px";
        let btn = document.createElement('button'); btn.textContent = "Remover"; btn.style.cssText = "background: #ff7675; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 11px;";
        btn.addEventListener('click', () => { sitesCustomizados.splice(index, 1); chrome.storage.local.set({ customUrls: sitesCustomizados }, renderizarUrls); });
        item.appendChild(span); item.appendChild(btn); container.appendChild(item);
    });
}

function renderizarDicionario() {
    let container = document.getElementById('listaDicionario');
    if (!container) return;
    container.innerHTML = "";
    let chaves = Object.keys(dicionarioCustom);
    if (chaves.length === 0) { 
        container.innerHTML = "<div style='color: #aaa; font-size: 13px; font-style: italic;'>Nenhuma correção manual cadastrada.</div>"; 
        return; 
    }
    
    chaves.forEach((chave) => {
        let valor = dicionarioCustom[chave];
        let item = document.createElement('div');
        item.style.cssText = "display: flex; justify-content: space-between; align-items: center; background: #202024; padding: 8px 12px; margin-bottom: 5px; border-radius: 4px; border: 1px solid #444;";
        
        let span = document.createElement('span'); 
        span.style.fontSize = "13px";
        span.style.fontWeight = "bold";
        
        let sChave = document.createElement('span');
        sChave.style.color = "#ff7675";
        sChave.textContent = chave;
        
        let arrow = document.createTextNode(" ➔ ");
        
        let sValor = document.createElement('span');
        sValor.style.color = "#00b894";
        sValor.textContent = valor;
        
        span.appendChild(sChave);
        span.appendChild(arrow);
        span.appendChild(sValor);
        
        let btn = document.createElement('button'); 
        btn.textContent = "Remover"; 
        btn.style.cssText = "background: #ff7675; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 11px;";
        btn.addEventListener('click', () => { 
            delete dicionarioCustom[chave]; 
            chrome.storage.local.set({ customDict: dicionarioCustom }, renderizarDicionario); 
        });
        
        item.appendChild(span); 
        item.appendChild(btn); 
        container.appendChild(item);
    });
}

function verificarAlteracoesCriterios() {
    const bar = document.getElementById('discordSaveBar');
    if (!bar) return;
    const saoIguais = criteriosOriginais.length === criteriosTemporarios.length && criteriosOriginais.every((val, index) => val === criteriosTemporarios[index]);
    bar.style.bottom = !saoIguais ? "20px" : "-85px";
}

function salvarCriteriosNoStorage() {
    chrome.storage.local.set({ meusCriterios: criteriosTemporarios }, () => {
        criteriosOriginais = [...criteriosTemporarios];
        verificarAlteracoesCriterios();
        const textElement = document.getElementById('discordBarText');
        if (textElement) {
            const textOriginal = textElement.innerText;
            textElement.innerText = "Alterações de critérios salvas com sucesso!";
            textElement.style.color = "#00b894";
            setTimeout(() => { textElement.innerText = textOriginal; textElement.style.color = "#ffffff"; }, 1500);
        }
    });
}

function descartarAlteracoesCriterios() { criteriosTemporarios = [...criteriosOriginais]; renderizarCriteriosTemporarios(); verificarAlteracoesCriterios(); }

async function buscarPerfilMAL(token) {
    try {
        let resp = await fetch('https://api.myanimelist.net/v2/users/@me?fields=picture', { headers: { 'Authorization': `Bearer ${token}` } });
        if (resp.ok) {
            let user = await resp.json();
            atualizarInterfaceLogin(true, user);
            chrome.storage.local.get(['syncMal'], (res) => {
                if (res.syncMal !== true) {
                    chrome.storage.local.set({ syncMal: true }, () => {
                        const syncMalEl = document.getElementById('syncMal');
                        if (syncMalEl) syncMalEl.checked = true;
                        verificarExibicaoBotoesBatch();
                    });
                } else { verificarExibicaoBotoesBatch(); }
            });
        } else { atualizarInterfaceLogin(false); }
    } catch (e) { atualizarInterfaceLogin(false); }
}

function atualizarInterfaceLogin(conectado, dadosUser = null) {
    const perfilArea = document.getElementById('perfilArea'); const loginContainer = document.getElementById('loginContainer');
    const loginStatus = document.getElementById('loginStatus'); const userName = document.getElementById('userName'); const userImg = document.getElementById('userImg');
    if (conectado && dadosUser) {
        if (perfilArea) perfilArea.style.display = 'flex'; if (loginContainer) loginContainer.style.display = 'none';
        if (userName) userName.innerText = dadosUser.name; if (userImg) userImg.src = dadosUser.picture || "";
        if (loginStatus) { loginStatus.innerText = "CONECTADO!"; loginStatus.className = "status logged-in"; }
    } else {
        if (perfilArea) perfilArea.style.display = 'none'; if (loginContainer) loginContainer.style.display = 'block';
        if (loginStatus) { loginStatus.innerText = "Desconectado"; loginStatus.className = "status logged-out"; }
    }
}

function verificarExibicaoBotoesBatch() {
    const officialScoreEl = document.getElementById('officialScore'); const syncMalEl = document.getElementById('syncMal'); const autoUpdateProgressEl = document.getElementById('autoUpdateProgress');
    if (!officialScoreEl || !syncMalEl || !autoUpdateProgressEl) return;
    const isOfficialScoreChecked = officialScoreEl.checked; const isSyncMalChecked = syncMalEl.checked; const isAutoProgressChecked = autoUpdateProgressEl.checked;
    
    chrome.storage.local.get(['mal_access_token', 'mal_backup_scores'], (res) => {
        const batchArea = document.getElementById('batchUpdateArea'); 
        const btnRestore = document.getElementById('btnRestoreBackup');
        const progress = document.getElementById('batchProgress'); 
        
        const localSyncArea = document.getElementById('localSyncArea');
        const localSyncProgress = document.getElementById('localSyncProgress');

        const malSyncContainer = document.getElementById('malSyncContainer');
        const progressSettingsContainer = document.getElementById('progressSettingsContainer');
        
        if (malSyncContainer) {
            if (isSyncMalChecked) {
                malSyncContainer.style.display = 'flex';
                if (progressSettingsContainer) progressSettingsContainer.style.display = isAutoProgressChecked ? 'flex' : 'none';
            } else {
                malSyncContainer.style.display = 'none';
                if (progressSettingsContainer) progressSettingsContainer.style.display = 'none';
            }
        }
        
        if (batchArea) {
            if (isOfficialScoreChecked && res.mal_access_token) batchArea.style.display = 'block';
            else { batchArea.style.display = 'none'; if (progress) progress.innerText = ""; }
        }

        if (localSyncArea) {
            if (isSyncMalChecked && res.mal_access_token) localSyncArea.style.display = 'block';
            else { localSyncArea.style.display = 'none'; if (localSyncProgress) localSyncProgress.innerText = ""; }
        }

        if (btnRestore) { btnRestore.style.display = (res.mal_backup_scores && Object.keys(res.mal_backup_scores.scores || {}).length > 0) ? 'inline-block' : 'none'; }
    });
}

function verificarExibicaoTriggerRow() {
    const activeEl = document.getElementById('autoUpdateProgress'); const active = activeEl ? activeEl.checked : false;
    const triggerRow = document.getElementById('progressSettingsContainer');
    if (triggerRow) triggerRow.style.display = active ? 'flex' : 'none';
}

async function executarAtualizacaoEmMassa() {
    const progress = document.getElementById('batchProgress');
    if (progress) progress.innerText = "Carregando chave de acesso...";
    
    const token = await obterTokenDoBackground();
    if (!token) {
        if (progress) progress.innerText = "Erro: Usuário não está autenticado ou o token expirou.";
        return;
    }
    if (!token) {
        if (progress) progress.innerText = "Erro: Usuário não está autenticado no MAL.";
        return;
    }

    if (!confirm("Isso irá analisar os animes do seu MyAnimeList. Se houver notas de avaliação técnica nos seus comentários de review da extensão, a nota oficial do MAL será atualizada para essa média técnica arredondada.\n\nUm backup das notas atuais será criado. Deseja continuar?")) {
        if (progress) progress.innerText = "";
        return;
    }

    if (progress) progress.innerText = "Buscando a sua lista de animes do MyAnimeList (isso pode levar alguns segundos)...";
    
    try {
        let url = 'https://api.myanimelist.net/v2/users/@me/animelist?fields=list_status{score,comments,status}&limit=1000';
        let response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        let data = await response.json();

        if (!data || !data.data) {
            if (progress) progress.innerText = "Falha ao obter lista do MyAnimeList.";
            return;
        }

        let animes = data.data;
        let animesParaAtualizar = [];
        let backupScores = {};

        animes.forEach(item => {
            let animeId = item.node.id;
            let notaOficialAtual = item.list_status.score || 0;
            let comentarios = item.list_status.comments || "";

            let resultadoCalculo = recalcularMediaDoComentario(comentarios);
            if (resultadoCalculo !== null) {
                let notaArredondada = Math.round(resultadoCalculo.media);
                
                let comentariosAtualizados = atualizarLinhaDeMediaNoComentario(comentarios, resultadoCalculo.mediaFormatada);

                if (notaArredondada > 0 && (notaArredondada !== notaOficialAtual || comentariosAtualizados !== comentarios)) {
                    animesParaAtualizar.push({
                        id: animeId,
                        titulo: item.node.title,
                        novaNota: notaArredondada,
                        comentarios: comentariosAtualizados
                    });
                    
                    backupScores[animeId] = {
                        score: notaOficialAtual,
                        comments: comentarios
                    };
                }
            }
        });

        if (animesParaAtualizar.length === 0) {
            if (progress) progress.innerText = "Sua lista está em dia! Todos os animes que possuem notas técnicas já correspondem à nota oficial do MAL.";
            return;
        }

        if (!confirm(`Identificamos ${animesParaAtualizar.length} anime(s) que precisam ser atualizados ou corrigidos. Deseja iniciar a atualização e criar o backup agora?`)) {
            if (progress) progress.innerText = "Ação cancelada pelo usuário.";
            return;
        }

        await chrome.storage.local.set({
            mal_backup_scores: {
                timestamp: Date.now(),
                scores: backupScores
            }
        });

        if (progress) progress.innerText = `Atualizando animes... (Aguarde o processo concluir)`;

        for (let i = 0; i < animesParaAtualizar.length; i++) {
            let anime = animesParaAtualizar[i];
            if (progress) progress.innerText = `[${i + 1}/${animesParaAtualizar.length}] Atualizando "${anime.titulo}" para nota ${anime.novaNota}...`;

            let body = new URLSearchParams();
            body.append('score', anime.novaNota.toString());
            body.append('comments', anime.comentarios);

            try {
                await fetch(`https://api.myanimelist.net/v2/anime/${anime.id}/my_list_status`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    body: body
                });
            } catch (err) {
                console.error(`Erro ao salvar ID ${anime.id}`, err);
            }

            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        if (progress) progress.innerText = "Suas notas foram atualizadas com sucesso para a média técnica!";
        verificarExibicaoBotoesBatch();

    } catch (e) {
        console.error(e);
        if (progress) progress.innerText = "Erro durante a sincronização em lote.";
    }
}

// --- RESTAURAR NOTAS DO BACKUP ---
async function restaurarNotasOriginais() {
    const progress = document.getElementById('batchProgress');
    if (progress) progress.innerText = "Carregando backup...";
    
    const res = await chrome.storage.local.get(['mal_access_token', 'mal_backup_scores']);
    const token = res.mal_access_token;
    const backup = res.mal_backup_scores;

    if (!token || !backup || !backup.scores) {
        if (progress) progress.innerText = "Erro: Dados de backup ou token ausentes.";
        return;
    }

    const ids = Object.keys(backup.scores);
    if (ids.length === 0) {
        if (progress) progress.innerText = "Nenhum anime encontrado no histórico de backup.";
        return;
    }

    if (!confirm(`Deseja restaurar as notas originais de ${ids.length} animes? Isso reverterá a nota oficial do MAL para os valores anteriores à atualização em lote.`)) {
        return;
    }

    if (progress) progress.innerText = "Revertendo notas oficiais no MyAnimeList...";

    for (let i = 0; i < ids.length; i++) {
        let id = ids[i];
        let dadosOriginais = backup.scores[id];
        if (progress) progress.innerText = `[${i + 1}/${ids.length}] Restaurando ID ${id} para nota original ${dadosOriginais.score}...`;

        let body = new URLSearchParams();
        body.append('score', dadosOriginais.score.toString());
        body.append('comments', dadosOriginais.comments);

        try {
            await fetch(`https://api.myanimelist.net/v2/anime/${id}/my_list_status`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: body
            });
        } catch (err) {
            console.error(`Falha ao reverter ID ${id}`, err);
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    chrome.storage.local.remove(['mal_backup_scores'], () => {
        if (progress) progress.innerText = "Notas originais restauradas! O backup foi limpo.";
        verificarExibicaoBotoesBatch();
    });
}

function recalcularMediaDoComentario(texto) {
    if (!texto) return null;

    const txtArea = document.createElement('textarea');
    txtArea.innerHTML = texto;
    const textoDecodificado = txtArea.value;

    const linhas = textoDecodificado.split('\n');
    let soma = 0;
    let qtd = 0;

    linhas.forEach(linha => {
        linha = inlineTrim(linha);
        
        if (!linha || inlineTrim(linha).toLowerCase().includes("review") || inlineTrim(linha).toLowerCase().match(/^(média|media|average|meacutedia):/i)) {
            return;
        }

        const match = inlineTrim(linha).match(/^(.+?):\s*(\d+(?:[.,]\d+)?)/);
        if (match) {
            let valor = parseFloat(match[2].replace(',', '.'));
            if (valor > 0 && valor <= 10) {
                soma += valor;
                qtd++;
            }
        }
    });

    if (qtd === 0) return null;

    const mediaCalculada = soma / qtd;
    return {
        media: mediaCalculada,
        mediaFormatada: mediaCalculada.toFixed(2)
    };
}

function atualizarLinhaDeMediaNoComentario(comentarioOriginal, novaMediaFormatada) {
    const linhas = comentarioOriginal.split('\n');
    let indiceMedia = -1;

    for (let i = 0; i < linhas.length; i++) {
        if (linhas[i].toLowerCase().match(/^(média|media|average|meacutedia):/i)) {
            indiceMedia = i;
            break;
        }
    }

    if (indiceMedia !== -1) {
        const partes = linhas[indiceMedia].split(':');
        linhas[indiceMedia] = `${partes[0]}: ${novaMediaFormatada}`;
    } else {
        linhas.push(`Média: ${novaMediaFormatada}`);
    }

    return linhas.join('\n');
}

function inlineTrim(str) {
    return str ? str.trim() : "";
}

function normalizarCriterio(nome) {
    if (!nome) return "";
    let n = nome.trim().toLowerCase();

    let nLimpo = n.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

    if (nLimpo.includes("dire") && (nLimpo.includes("o") || nLimpo.includes("ced") || nLimpo.includes("amp") || nLimpo.includes("dil"))) {
        return "Direção";
    }
    if (nLimpo.includes("anim") && (nLimpo.includes("o") || nLimpo.includes("ced") || nLimpo.includes("amp") || nLimpo.includes("dil"))) {
        return "Animação";
    }
    if (nLimpo.startsWith("m") && (nLimpo.includes("dia") || nLimpo.includes("acute") || nLimpo.includes("eacut"))) {
        return "Média";
    }
    if (nLimpo.includes("complexidade")) return "Complexidade";
    if (nLimpo.includes("enredo")) return "Enredo";
    if (nLimpo.includes("originalidade")) return "Originalidade";
    if (nLimpo.includes("design")) return "Design";
    if (nLimpo.includes("coreografia") || nLimpo.includes("luta")) return "Coreografia de luta";
    if (nLimpo.includes("personagem") || nLimpo.includes("principal")) return "Personagens Principais";
    if (nLimpo.includes("antagonista")) return "Antagonista";
    if (nLimpo.includes("fotografia")) return "Direção de fotografia";
    if (nLimpo.includes("trilha")) return "Trilha Sonora";
    if (nLimpo.includes("efeito")) return "Efeitos Sonoros"; 
    return nome.trim();
}

function aplicarModoDeExibicao(mode) {
    chrome.runtime.sendMessage({ action: 'mudarModoExibicao', mode: mode });
}

// SINCRONIZAÇÃO LOCAL PARA O MAL
async function executarSincronizacaoLocalParaMAL() {
    const progress = document.getElementById('localSyncProgress');
    if (progress) progress.innerText = "Analisando memória local...";
    
    const res = await chrome.storage.local.get(null);
    const token = res.mal_access_token;
    
    if (!token) {
        if (progress) progress.innerText = "Erro: Usuário não está autenticado no MAL.";
        return;
    }

    let animesParaEnviar = [];
    const isOfficialScore = res.officialScore === true;

    for (let key in res) {
        let dado = res[key];
        if (typeof dado === 'object' && dado !== null && dado.mal_id && dado.media) {
            animesParaEnviar.push({
                titulo: key,
                dados: dado
            });
        }
    }

    if (animesParaEnviar.length === 0) {
        if (progress) progress.innerText = "Nenhuma review local encontrada na sua biblioteca.";
        return;
    }

    if (!confirm(`Foram encontradas ${animesParaEnviar.length} reviews na sua memória local.\n\nDeseja fazer o upload delas para o seu MyAnimeList agora? (Isso pode sobrescrever as notas antigas desses animes na sua conta oficial).`)) {
        if (progress) progress.innerText = "Upload cancelado.";
        return;
    }

    if (progress) progress.innerText = "Iniciando upload... (Por favor, não feche esta aba)";

    for (let i = 0; i < animesParaEnviar.length; i++) {
        let item = animesParaEnviar[i];
        let dados = item.dados;
        if (progress) progress.innerText = `[${i + 1}/${animesParaEnviar.length}] Enviando "${item.titulo}"...`;

        let listStr = "";
        for (let k in dados) {
            if (!['media', 'mal_id', 'capa', 'nome_oficial', 'nota_mal'].includes(k) && dados[k] > 0) {
                let cleanKey = normalizarCriterio(k);
                listStr += `\n${cleanKey}: ${dados[k]}`;
            }
        }
        let coment = `Review Técnica:${listStr}\nMédia: ${dados.media}`;

        let body = new URLSearchParams();
        body.append('comments', coment);
        
        let notaCalculada = Math.round(parseFloat(dados.media));
        if (isOfficialScore && notaCalculada > 0) {
            body.append('score', notaCalculada.toString());
        }

        try {
            await fetch(`https://api.myanimelist.net/v2/anime/${dados.mal_id}/my_list_status`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: body
            });
        } catch (err) {
            console.error(`MAL Reviewer: Erro ao fazer upload de ${item.titulo}`, err);
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (progress) progress.innerText = "Upload concluído com sucesso! Suas avaliações locais estão no MAL.";
}