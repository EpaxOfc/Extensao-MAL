const criteriosPadrao = ["Direção", "Animação", "Complexidade", "Enredo", "Originalidade", "Design", "Coreografia de luta", "Personagens Principais", "Antagonista", "Direção de fotografia"];

let criteriosOriginais = [];
let criteriosTemporarios = [];
let sitesCustomizados = [];
let dicionarioCustom = {};

document.addEventListener('DOMContentLoaded', () => {
    carregarConfig();
    carregarCriterios();
    
    // Verifica conexão do MAL
    chrome.storage.local.get(['mal_access_token'], (res) => {
        if (res.mal_access_token) {
            buscarPerfilMAL(res.mal_access_token);
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
                    alert("Conta desconectada com sucesso!");
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

    // Monitora as caixinhas em tempo real
    ['officialScore', 'syncMal', 'autoUpdateProgress'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', verificarExibicaoBotoesBatch);
    });

    // SALVAMENTO AUTOMÁTICO DAS PREFERÊNCIAS
    ['autoOpen', 'syncMal', 'officialScore', 'autoUpdateProgress', 'autoUpdateTrigger', 'autoCompleteOnLast', 'blockRegressionOnComplete', 'autoOpenOverlayIfNoScore', 'enableTrackingToast', 'showFlashInFullscreen', 'enableRatingOverlay', 'sizeToastExp', 'sizeToastMicro', 'sizeToastFlash', 'sizeOverlay'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('change', (e) => {
            const config = {};
            config[id] = el.tagName === 'SELECT' ? e.target.value : e.target.checked;
            chrome.storage.local.set(config, () => verificarExibicaoBotoesBatch());
            
            // ATUALIZA O SIMULADOR AO VIVO
            if (id === 'sizeToastExp') document.getElementById('sim-toast-exp').className = `sim-toast size-${e.target.value}`;
            if (id === 'sizeToastMicro') document.getElementById('sim-toast-micro').className = `sim-micro size-${e.target.value}`;
            if (id === 'sizeToastFlash') document.getElementById('sim-toast-flash').className = `sim-flash size-${e.target.value}`;
            if (id === 'sizeOverlay') document.getElementById('sim-overlay').className = `sim-overlay size-${e.target.value}`;
        });
    });

    // Ouvinte para Critérios Temporários
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

    // --- OUVINTES DAS CONFIGURAÇÕES AVANÇADAS ---
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
                inputPt.value = "";
                inputEn.value = "";
            }
        });
    }
});

function renderizarUrls() {
    let container = document.getElementById('listaUrls');
    if (!container) return;
    container.innerHTML = "";

    if (sitesCustomizados.length === 0) {
        container.innerHTML = "<div style='color: #aaa; font-size: 13px; font-style: italic;'>Nenhum site adicionado.</div>";
        return;
    }

    sitesCustomizados.forEach((site, index) => {
        let item = document.createElement('div');
        item.style.cssText = "display: flex; justify-content: space-between; align-items: center; background: #202024; padding: 8px 12px; margin-bottom: 5px; border-radius: 4px; border: 1px solid #444;";
        
        let span = document.createElement('span');
        span.textContent = "🌍 " + site;
        span.style.fontSize = "13px";
        
        let btn = document.createElement('button');
        btn.textContent = "Remover";
        btn.style.cssText = "background: #ff7675; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 11px;";
        btn.addEventListener('click', () => {
            sitesCustomizados.splice(index, 1);
            chrome.storage.local.set({ customUrls: sitesCustomizados }, renderizarUrls);
        });

        item.appendChild(span);
        item.appendChild(btn);
        container.appendChild(item);
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
        span.innerHTML = `<span style="color:#ff7675;">${chave}</span> ➔ <span style="color:#00b894;">${valor}</span>`;
        span.style.fontSize = "13px";
        span.style.fontWeight = "bold";
        
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

// Carrega preferências salvas
// Carrega preferências salvas
function carregarConfig() {
    // A CORREÇÃO ESTÁ AQUI: Adicionei TODAS as chaves de interface e tamanho na lista de requisição!
    chrome.storage.local.get([
        'autoOpen', 'syncMal', 'officialScore', 'viewMode', 
        'autoUpdateProgress', 'autoUpdateTrigger', 'autoCompleteOnLast', 
        'blockRegressionOnComplete', 'autoOpenOverlayIfNoScore', 
        'mal_access_token', 'customUrls', 'customDict',
        'enableTrackingToast', 'showFlashInFullscreen', 'enableRatingOverlay',
        'sizeToastExp', 'sizeToastMicro', 'sizeToastFlash', 'sizeOverlay'
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

        const autoOpenEl = document.getElementById('autoOpen');
        if (autoOpenEl) autoOpenEl.checked = res.autoOpen ?? true;
        
        const syncMalEl = document.getElementById('syncMal');
        if (syncMalEl) syncMalEl.checked = res.syncMal ?? (res.mal_access_token ? true : false);
        
        const officialScoreEl = document.getElementById('officialScore');
        if (officialScoreEl) officialScoreEl.checked = res.officialScore ?? false;
        
        const autoUpdateProgressEl = document.getElementById('autoUpdateProgress');
        if (autoUpdateProgressEl) autoUpdateProgressEl.checked = res.autoUpdateProgress ?? true;

        const autoUpdateTriggerEl = document.getElementById('autoUpdateTrigger');
        if (autoUpdateTriggerEl) autoUpdateTriggerEl.value = res.autoUpdateTrigger ?? '80percent';

        const autoCompleteOnLastEl = document.getElementById('autoCompleteOnLast');
        if (autoCompleteOnLastEl) autoCompleteOnLastEl.checked = res.autoCompleteOnLast ?? true;

        const blockRegressionOnCompleteEl = document.getElementById('blockRegressionOnComplete');
        if (blockRegressionOnCompleteEl) blockRegressionOnCompleteEl.checked = res.blockRegressionOnComplete ?? true;

        const autoOpenOverlayIfNoScoreEl = document.getElementById('autoOpenOverlayIfNoScore');
        if (autoOpenOverlayIfNoScoreEl) autoOpenOverlayIfNoScoreEl.checked = res.autoOpenOverlayIfNoScore ?? true;

        // CARREGAMENTO DOS CONTROLES DE INTERFACE
        const enableTrackingToastEl = document.getElementById('enableTrackingToast');
        if (enableTrackingToastEl) enableTrackingToastEl.checked = res.enableTrackingToast ?? true;

        const showFlashInFullscreenEl = document.getElementById('showFlashInFullscreen');
        if (showFlashInFullscreenEl) showFlashInFullscreenEl.checked = res.showFlashInFullscreen ?? true;

        const enableRatingOverlayEl = document.getElementById('enableRatingOverlay');
        if (enableRatingOverlayEl) enableRatingOverlayEl.checked = res.enableRatingOverlay ?? true;

        // CARREGAMENTO DOS TAMANHOS NO SIMULADOR
        const sizeToastExpEl = document.getElementById('sizeToastExp');
        if (sizeToastExpEl) { 
            sizeToastExpEl.value = res.sizeToastExp || 'medium'; 
            let simExp = document.getElementById('sim-toast-exp');
            if (simExp) simExp.className = `sim-toast size-${sizeToastExpEl.value}`; 
        }
        
        const sizeToastMicroEl = document.getElementById('sizeToastMicro');
        if (sizeToastMicroEl) { 
            sizeToastMicroEl.value = res.sizeToastMicro || 'medium'; 
            let simMicro = document.getElementById('sim-toast-micro');
            if (simMicro) simMicro.className = `sim-micro size-${sizeToastMicroEl.value}`; 
        }
        
        const sizeToastFlashEl = document.getElementById('sizeToastFlash');
        if (sizeToastFlashEl) { 
            sizeToastFlashEl.value = res.sizeToastFlash || 'medium'; 
            let simFlash = document.getElementById('sim-toast-flash');
            if (simFlash) simFlash.className = `sim-flash size-${sizeToastFlashEl.value}`; 
        }
        
        const sizeOverlayEl = document.getElementById('sizeOverlay');
        if (sizeOverlayEl) { 
            sizeOverlayEl.value = res.sizeOverlay || 'medium'; 
            let simOverlay = document.getElementById('sim-overlay');
            if (simOverlay) simOverlay.className = `sim-overlay size-${sizeOverlayEl.value}`; 
        }

        // Configurações Avançadas
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

// --- FUNÇÕES DE RENDERIZAÇÃO ---
function renderizarCriteriosTemporarios() {
    let container = document.getElementById('listaCriterios');
    if (!container) return;
    container.innerHTML = "";

    criteriosTemporarios.forEach((crit, index) => {
        let item = document.createElement('div');
        item.className = "row";
        
        let span = document.createElement('span');
        span.textContent = crit;
        
        let btnRemover = document.createElement('button');
        btnRemover.textContent = "🗑️";
        btnRemover.style.background = "none";
        btnRemover.style.border = "none";
        btnRemover.style.cursor = "pointer";
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

    if (sitesCustomizados.length === 0) {
        container.innerHTML = "<div style='color: #aaa; font-size: 13px; font-style: italic;'>Nenhum site adicionado.</div>";
        return;
    }

    sitesCustomizados.forEach((site, index) => {
        let item = document.createElement('div');
        item.style.cssText = "display: flex; justify-content: space-between; align-items: center; background: #202024; padding: 8px 12px; margin-bottom: 5px; border-radius: 4px; border: 1px solid #444;";
        
        let span = document.createElement('span');
        span.textContent = "🌍 " + site;
        span.style.fontSize = "13px";
        
        let btn = document.createElement('button');
        btn.textContent = "Remover";
        btn.style.cssText = "background: #ff7675; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 11px;";
        btn.addEventListener('click', () => {
            sitesCustomizados.splice(index, 1);
            chrome.storage.local.set({ customUrls: sitesCustomizados }, renderizarUrls);
        });

        item.appendChild(span);
        item.appendChild(btn);
        container.appendChild(item);
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
        span.innerHTML = `<span style="color:#ff7675;">${chave}</span> ➔ <span style="color:#00b894;">${valor}</span>`;
        span.style.fontSize = "13px";
        span.style.fontWeight = "bold";
        
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
    const saoIguais = criteriosOriginais.length === criteriosTemporarios.length && 
                      criteriosOriginais.every((val, index) => val === criteriosTemporarios[index]);
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
            setTimeout(() => {
                textElement.innerText = textOriginal;
                textElement.style.color = "#ffffff";
            }, 1500);
        }
    });
}

function descartarAlteracoesCriterios() {
    criteriosTemporarios = [...criteriosOriginais];
    renderizarCriteriosTemporarios();
    verificarAlteracoesCriterios();
}

// Busca o perfil do usuário na API do MAL e força a ativação do syncMal
async function buscarPerfilMAL(token) {
    try {
        let resp = await fetch('https://api.myanimelist.net/v2/users/@me?fields=picture', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
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
                } else {
                    verificarExibicaoBotoesBatch();
                }
            });
        } else {
            atualizarInterfaceLogin(false);
        }
    } catch (e) { 
        console.error("Erro perfil:", e); 
        atualizarInterfaceLogin(false);
    }
}

function atualizarInterfaceLogin(conectado, dadosUser = null) {
    const perfilArea = document.getElementById('perfilArea');
    const loginContainer = document.getElementById('loginContainer');
    const loginStatus = document.getElementById('loginStatus');
    const userName = document.getElementById('userName');
    const userImg = document.getElementById('userImg');

    if (conectado && dadosUser) {
        if (perfilArea) perfilArea.style.display = 'flex';
        if (loginContainer) loginContainer.style.display = 'none';
        if (userName) userName.innerText = dadosUser.name;
        if (userImg) userImg.src = dadosUser.picture || "";
        if (loginStatus) {
            loginStatus.innerText = "CONECTADO!";
            loginStatus.className = "status logged-in";
        }
    } else {
        if (perfilArea) perfilArea.style.display = 'none';
        if (loginContainer) loginContainer.style.display = 'block';
        if (loginStatus) {
            loginStatus.innerText = "Desconectado";
            loginStatus.className = "status logged-out";
        }
    }
}

// Controla a exibição aninhada e lógica dos submenus de sincronização
function verificarExibicaoBotoesBatch() {
    const officialScoreEl = document.getElementById('officialScore');
    const syncMalEl = document.getElementById('syncMal');
    const autoUpdateProgressEl = document.getElementById('autoUpdateProgress');
    
    if (!officialScoreEl || !syncMalEl || !autoUpdateProgressEl) return;

    const isOfficialScoreChecked = officialScoreEl.checked;
    const isSyncMalChecked = syncMalEl.checked;
    const isAutoProgressChecked = autoUpdateProgressEl.checked;
    
    chrome.storage.local.get(['mal_access_token', 'mal_backup_scores'], (res) => {
        const batchArea = document.getElementById('batchUpdateArea');
        const btnRestore = document.getElementById('btnRestoreBackup');
        const progress = document.getElementById('batchProgress');
        const malSyncContainer = document.getElementById('malSyncContainer');
        const progressSettingsContainer = document.getElementById('progressSettingsContainer');

        if (malSyncContainer) {
            if (isSyncMalChecked) {
                malSyncContainer.style.display = 'flex';
                if (progressSettingsContainer) {
                    progressSettingsContainer.style.display = isAutoProgressChecked ? 'flex' : 'none';
                }
            } else {
                malSyncContainer.style.display = 'none';
                if (progressSettingsContainer) progressSettingsContainer.style.display = 'none';
            }
        }

        if (batchArea) {
            if (isOfficialScoreChecked && res.mal_access_token) {
                batchArea.style.display = 'block';
            } else {
                batchArea.style.display = 'none';
                if (progress) progress.innerText = "";
            }
        }

        if (btnRestore) {
            if (res.mal_backup_scores && Object.keys(res.mal_backup_scores.scores || {}).length > 0) {
                btnRestore.style.display = 'inline-block';
            } else {
                btnRestore.style.display = 'none';
            }
        }
    });
}

function verificarExibicaoTriggerRow() {
    const activeEl = document.getElementById('autoUpdateProgress');
    const active = activeEl ? activeEl.checked : false;
    const triggerRow = document.getElementById('progressSettingsContainer');
    if (triggerRow) {
        triggerRow.style.display = active ? 'flex' : 'none';
    }
}

async function executarAtualizacaoEmMassa() {
    const progress = document.getElementById('batchProgress');
    if (progress) progress.innerText = "Carregando chave de acesso...";
    
    const res = await chrome.storage.local.get(['mal_access_token']);
    const token = res.mal_access_token;
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

            await new Promise(resolve => setTimeout(resolve, 250));
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

        await new Promise(resolve => setTimeout(resolve, 250));
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

        const match = linha.match(/^(.+?):\s*(\d+(?:[.,]\d+)?)/);
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

    return nome.trim();
}

function aplicarModoDeExibicao(mode) {
    chrome.runtime.sendMessage({ action: 'mudarModoExibicao', mode: mode });
}

// =========================================================
// MÁGICA DO SIMULADOR PROPORCIONAL E TELA CHEIA
// =========================================================

function ajustarMonitorVirtual() {
    let container = document.getElementById('simulator-container');
    let virtualScreen = document.getElementById('virtual-screen');
    
    if (container && virtualScreen) {
        // Pega a largura atual da telinha preta e divide por 1280 (A resolução do Monitor Virtual)
        let scale = container.clientWidth / 1280;
        
        // Se estiver em tela cheia, garante que ele expanda preenchendo a tela real!
        let isFs = document.fullscreenElement;
        if (isFs) {
            scale = window.innerWidth / 1280;
        }

        // Aplica o encolhimento perfeitamente
        virtualScreen.style.transform = `scale(${scale})`;
    }
}

// Ouve quando você redimensiona a janela do navegador para ajustar a simulação
window.addEventListener('resize', ajustarMonitorVirtual);

// Ouve o clique do botão Tela Cheia
document.addEventListener('DOMContentLoaded', () => {
    // Garante o ajuste no momento em que a página carrega
    setTimeout(ajustarMonitorVirtual, 100);

    const btnFullscreen = document.getElementById('btnSimFullscreen');
    if (btnFullscreen) {
        btnFullscreen.addEventListener('click', () => {
            let container = document.getElementById('simulator-container');
            if (!document.fullscreenElement) {
                container.requestFullscreen().catch(err => {
                    console.error("Erro ao tentar entrar em tela cheia:", err);
                });
            } else {
                document.exitFullscreen();
            }
        });
    }

    // Muda o texto do botão quando entra/sai da tela cheia
    document.addEventListener('fullscreenchange', () => {
        let btn = document.getElementById('btnSimFullscreen');
        if (document.fullscreenElement) {
            btn.textContent = "❌ Sair da Tela Cheia";
        } else {
            btn.textContent = "🔲 Tela Cheia";
        }
        setTimeout(ajustarMonitorVirtual, 50); // Recalcula a escala
    });
});