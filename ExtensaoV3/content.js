let monitorando = false;
let lastCorrectionClickTime = 0;
let netflixSubSizeSalvo = 28;
let currentSessionToken = 0;
let animeDetectado = null;
let totalEpisodiosAnime = 0;
let overlayCriado = false;
let urlAtual = window.location.href; 
let videoIdAtual = null;          
let numeroEpisodioAtual = null;   
let ultimoTextoLido = ""; 
let malProgressoSincronizado = false; 
let listaTemporadasDetectadas = [];
let toastTimeout = null;
let isToastMicro = false;
let isToastDismissed = false;
let isHoverMode = false; 
let verificandoNota = false;
let overlayTimeoutTimer = null;
let isOverlayMicro = false;
let isOverlayHover = false;
let isOverlayDismissed = false;
let netflixTituloSalvo = "";
let netflixTemporadaSalva = null;
let netflixEpisodioSalvo = null;
let sondaNetflixSolicitada = false;
let termoBuscaOriginal = "";
let isCorrecaoManual = false;
let episodioRelativoAtual = 1;
let netflixUniqueIdSalvo = null;
let idPlataformaAtual = null; 
let netflixTitleTrap = "";
let netflixTrapObserver = null;
let netflixEpisodeTrap = null;
let lastUrlTrap = window.location.href;
let netflixPredicaoSeason = null;
let netflixPredicaoEpisode = null;
let ultimaTemporadaAssistida = null;
let ultimoEpisodioAssistido = null;
let ultimoTotalEpisodios = null;
let netflixSeasonTrap = null;
let offsetManualFix = 0;
let cfgEnableGoogleDrive = false;

let cfgAutoUpdateProgress = true;      
let cfgAutoUpdateTrigger = '80percent'; 
let cfgAutoCompleteOnLast = true;      
let cfgBlockRegressionOnComplete = true;
let cfgAutoOpenOverlayIfNoScore = true;
let cfgEnablePrimeBasic = false;
let cfgEnablePrimeAdvanced = false;

const HABILITAR_LOGS_DESENVOLVEDOR = true;

function devLog(...args) {
    if (HABILITAR_LOGS_DESENVOLVEDOR) {
        console.log(...args);
    }
}

if (window === window.top) {
    window.addEventListener("message", async (event) => {
        if (event.data && event.data.action === "MAL_REQUEST_INFO") {
            let nome = await detectarNomeAnime();
            let ep = detectarEpisodioAtual();
            if (event.source) {
                event.source.postMessage({ action: "MAL_RESPONSE_INFO", nome: nome, ep: ep }, event.origin);
            }
        }
    });
}

// Helper de escape para evitar injeção DOM XSS
function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function solicitarInfoDaPaginaPrincipal() {
    return new Promise((resolve) => {
        if (window === window.top) return resolve(null);
        
        const listener = (event) => {
            if (event.data && event.data.action === "MAL_RESPONSE_INFO") {
                window.removeEventListener("message", listener);
                resolve(event.data);
            }
        };
        window.addEventListener("message", listener);
        window.top.postMessage({ action: "MAL_REQUEST_INFO" }, "*");
        
        // Timeout de segurança para não travar a extensão
        setTimeout(() => { window.removeEventListener("message", listener); resolve(null); }, 2000);
    });
}

chrome.storage.local.get(['enablePrimeBasic', 'enablePrimeAdvanced', 'enableGoogleDrive'], (res) => {
    if (res.enablePrimeBasic !== undefined) cfgEnablePrimeBasic = res.enablePrimeBasic;
    if (res.enablePrimeAdvanced !== undefined) cfgEnablePrimeAdvanced = res.enablePrimeAdvanced;
    if (res.enableGoogleDrive !== undefined) cfgEnableGoogleDrive = res.enableGoogleDrive;
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
        if (changes.enablePrimeBasic) cfgEnablePrimeBasic = changes.enablePrimeBasic.newValue;
        if (changes.enablePrimeAdvanced) cfgEnablePrimeAdvanced = changes.enablePrimeAdvanced.newValue;
        if (changes.enableGoogleDrive) cfgEnableGoogleDrive = changes.enableGoogleDrive.newValue;

        if (changes.netflixSubSize || changes.netflixCrSubs) {
            chrome.storage.local.get(['netflixCrSubs', 'netflixSubSize'], (res) => {
                netflixSubSizeSalvo = res.netflixSubSize || 28; 
                let crSubs = res.netflixCrSubs ?? true;
                if (crSubs) {
                    document.documentElement.classList.add('mal-netflix-cr-subs');
                    injetarCSSDiscreto(); 
                } else {
                    document.documentElement.classList.remove('mal-netflix-cr-subs');
                }
            });
        }
    }
});




// PREDITOR DE CLIQUES
document.addEventListener('click', (e) => {
    let url = window.location.href;
    
    // PREDITOR AMAZON PRIME VIDEO
    if (cfgEnablePrimeBasic && (url.includes("primevideo.com") || url.includes("amazon."))) {
        let btnPlayAmazon = e.target.closest('[data-testid="dp-atf-play-button"], .fbl-play-btn, .atvwebplayersdk-playpause-button');
        if (btnPlayAmazon) {
            devLog("MAL Reviewer: 🔮 [PRIME VIDEO] Clique no Play detectado. Forçando busca pelo player...");
            resetarMonitoramento(); 
        }
    }

    if (!url.includes("netflix.com")) return;

    let target = e.target;
    let epNum = null;
    let seasonNum = null;

    let miniModal = target.closest('.previewModal--info-container, .mini-modal-container');
    if (miniModal) {
        let epDetails = miniModal.querySelector('.previewModal-episodeDetails, .previewModal-episode-title');
        if (epDetails) {
            let txt = epDetails.innerText || ""; 
            let matchTE = txt.match(/[TS]\s*(\d+)\s*:\s*E\s*(\d+)/i);
            if (matchTE) {
                seasonNum = parseInt(matchTE[1]);
                epNum = parseInt(matchTE[2]);
            }
        }
    }

    let isPrime = window.location.href.includes("primevideo.com") || window.location.href.includes("amazon.");
    if (isPrime) {
        let btnPlayAmazon = target.closest('[data-testid="dp-atf-play-button"], .fbl-play-btn, .atvwebplayersdk-playpause-button');
        if (btnPlayAmazon) {
            devLog("MAL Reviewer: 🔮 [PRIME VIDEO] Clique no Play detectado. Forçando busca pelo player...");
            resetarMonitoramento();
        }
    }

    let isEpisodePaneItem = target.closest('[data-uia="episode-pane-item"]');
    if (!seasonNum && isEpisodePaneItem) {
        let numEl = isEpisodePaneItem.querySelector('[data-uia="episode-pane-item-number"]');
        if (numEl) epNum = parseInt(numEl.innerText.trim());
        
        let headerEl = document.querySelector('[data-uia="selector-episode-header"], [data-uia="season-pane-title"]');
        if (headerEl) {
            let match = headerEl.innerText.match(/(\d+)[a-zªº]*\s*(?:Temporada|Season|Parte|Part)|(?:Temporada|Season|Parte|Part)\s*(\d+)/i);
            if (match) seasonNum = parseInt(match[1] || match[2]);
        }
    } 

    let cardEpisodio = target.closest('[data-uia^="episode-"], .episode-list-item, .titleCardList--container div, [role="button"]');
    if (!seasonNum && cardEpisodio && !miniModal && !isEpisodePaneItem) {
        let txt = cardEpisodio.innerText || "";
        let matchTE = txt.match(/[TS]\s*(\d+)\s*:\s*E\s*(\d+)/i);
        if (matchTE) {
            seasonNum = parseInt(matchTE[1]);
            epNum = parseInt(matchTE[2]);
        } else {
            let matchEp = txt.match(/(?:Epis[óo]dio|Episode|Ep\.|E)\s*(\d+)/i) || txt.match(/^\s*(\d+)\s*\./);
            if (matchEp) epNum = parseInt(matchEp[1]);
            
            let dropdownSeason = document.querySelector('[data-uia="season-selector"], [data-uia="dropdown-toggle"], .season-selector');
            if (dropdownSeason) {
                let matchSeason = dropdownSeason.innerText.match(/(\d+)[a-zªº]*\s*(?:Temporada|Season|Parte|Part)|(?:Temporada|Season|Parte|Part)\s*(\d+)/i);
                if (matchSeason) seasonNum = parseInt(matchSeason[1] || matchSeason[2]);
            }
        }
    }
    
    if (seasonNum) netflixPredicaoSeason = seasonNum;
    if (epNum) netflixPredicaoEpisode = epNum;

    if (seasonNum || epNum) {
        devLog(`MAL Reviewer: 🔮 [PREDIÇÃO POR CLIQUE] Detectado: T${netflixPredicaoSeason || '?'} E${netflixPredicaoEpisode || '?'}`);
    }

    let btnProximo = target.closest('[data-uia="next-episode-seamless-button"], [data-uia="next-episode-button"]');
    if (btnProximo && ultimaTemporadaAssistida && ultimoEpisodioAssistido && !seasonNum) {
        let limiteEps = totalEpisodiosAnime || 99; 
        
        if (ultimoEpisodioAssistido >= limiteEps) {
            netflixPredicaoSeason = ultimaTemporadaAssistida + 1;
            netflixPredicaoEpisode = 1;
        } else {
            netflixPredicaoSeason = ultimaTemporadaAssistida;
            netflixPredicaoEpisode = ultimoEpisodioAssistido + 1;
        }
        devLog(`MAL Reviewer: 🔮 [PREDIÇÃO MATEMÁTICA] Próximo EP clicado. Previsão: T${netflixPredicaoSeason} E${netflixPredicaoEpisode}`);
    }
}, true);



// SALVAMENTO EM LOTE DE IDs
function salvarCorrecaoGeral(anime, offset, epAbs) {
    if (!idPlataformaAtual) return;
    
    if (idPlataformaAtual.startsWith("NETFLIX_")) {
        let vId = idPlataformaAtual.split("_")[1];
        let baseId = parseInt(vId);
        if (!isNaN(baseId)) {
            let totalEps = anime.episodes || 30;
            let startId = baseId - epAbs + 1;
            let obj = {};
            for (let i = 1; i <= totalEps + 5; i++) { 
                obj["CORRECAO_NETFLIX_" + (startId + i - 1)] = { anime: anime, offset: offset, forcedOffset: offset };
            }
            chrome.storage.local.set(obj);
            devLog(`MAL Reviewer: 💾 Salvo em lote Netflix! Base ID gerada: ${startId}`);
            return;
        }
    }
    
    // Fallback para Crunchyroll ou outros
    let obj = {};
    obj["CORRECAO_" + idPlataformaAtual] = { anime: anime, offset: offset, forcedOffset: offset };
    chrome.storage.local.set(obj);
}

function removerCorrecaoGeral(epAbs, callback) {
    if (!idPlataformaAtual) { if(callback) callback(); return; }
    
    if (idPlataformaAtual.startsWith("NETFLIX_")) {
        let vId = idPlataformaAtual.split("_")[1];
        let baseId = parseInt(vId);
        if (!isNaN(baseId)) {
            let totalEps = totalEpisodiosAnime || 30;
            let startId = baseId - epAbs + 1;
            let keys = [];
            for (let i = 1; i <= totalEps + 5; i++) {
                keys.push("CORRECAO_NETFLIX_" + (startId + i - 1));
            }
            chrome.storage.local.remove(keys, callback);
            devLog(`MAL Reviewer: 🗑️ Removido lote de Correção Netflix!`);
            return;
        }
    }
    chrome.storage.local.remove("CORRECAO_" + idPlataformaAtual, () => { if(callback) callback(); });
}

// GERENCIADOR DE MUDANÇA DE URL
setInterval(() => {
    if (window.location.href !== lastUrlTrap) {
        lastUrlTrap = window.location.href;
        
        netflixTitleTrap = ""; 
        netflixEpisodeTrap = null; 
        netflixSeasonTrap = null;
        ultimaTemporadaAssistida = null;
        ultimoEpisodioAssistido = null;

        chrome.storage.local.set({ isCorrectionMode: false });
        let btn = document.getElementById('btnWrongAnime');
        if (btn && btn.textContent.includes("extensão")) {
            btn.textContent = "Anime/Episódio errado?";
            btn.style.color = "#ff7675";
        }
    }
}, 1000);


// COMUNICAÇÃO COM O POPUP E SONDA
if (window.location.href.includes("netflix.com")) {
    sondaNetflixSolicitada = true;
    chrome.runtime.sendMessage({ action: 'INJETAR_SONDA_NETFLIX' });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "SOLICITAR_NOME_ANIME") {
        if (Date.now() - lastCorrectionClickTime > 5000) {
            chrome.storage.local.set({ isCorrectionMode: false });
        }
        
        let epAbsVal = detectarEpisodioAtual();
        let epAbs = epAbsVal || 1;
        if (animeDetectado && animeDetectado.title) {
            sendResponse({ nome: animeDetectado.title, epAtual: episodioRelativoAtual, animeExato: animeDetectado });
        } else {
            detectarNomeAnime().then(nomeEncontrado => { sendResponse({ nome: nomeEncontrado, epAtual: epAbs }); });
            return true;
        }
    }
    
    if (request.action === "FORCAR_CORRECAO_ANIME" && request.animeExato) {
        if (Date.now() - lastCorrectionClickTime > 600000) {
            devLog("MAL Reviewer: 🛑 Correção bloqueada. Sessão expirada. (Abra pelo botão do player)");
            chrome.storage.local.set({ isCorrectionMode: false });
            return sendResponse({success: false});
        }
        chrome.storage.local.set({ isCorrectionMode: false });

        devLog("MAL Reviewer: Correção manual recebida! Alterando rastreio para:", request.animeExato.title);
        animeDetectado = request.animeExato;
        totalEpisodiosAnime = animeDetectado.episodes || 1;
        isCorrecaoManual = true; 
        let epAbs = detectarEpisodioAtual() || 1;
        malProgressoSincronizado = false; 
        
        let offset = 0;
        let nomeLimpoBusca = animeDetectado.title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
        const dicionarioManualOffsets = [ 
            { titulo: "oshi no ko", temporadaFiltro: 2, subtrair: 11 },
            { titulo: "sword art online alicization war of underworld part 2", temporadaFiltro: null, subtrair: 12 }
        ];
        
        for (let regra of dicionarioManualOffsets) {
            let tituloRegra = regra.titulo.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
            let checkTemporada = !regra.temporadaFiltro || netflixPredicaoSeason === regra.temporadaFiltro || netflixTemporadaSalva === regra.temporadaFiltro;
            
            if (nomeLimpoBusca.includes(tituloRegra) && checkTemporada) {
                offset = regra.subtrair; break;
            }
        }

        offsetManualFix = offset;
        let epRel = epAbs - offsetManualFix;
        if (epRel <= 0) epRel = epAbs;
        episodioRelativoAtual = epRel;

        salvarCorrecaoGeral(animeDetectado, offsetManualFix, epAbs);
        mostrarToastRastreio(animeDetectado, epRel, totalEpisodiosAnime, animeDetectado.season || 1);
        sendResponse({success: true});
    }
    
    if (request.action === "FORCAR_EPISODIO") {
        if (Date.now() - lastCorrectionClickTime > 600000) return sendResponse({success: false});
        chrome.storage.local.set({ isCorrectionMode: false });

        let epAbs = detectarEpisodioAtual() || 1;
        offsetManualFix = epAbs - request.ep; 
        
        salvarCorrecaoGeral(animeDetectado, offsetManualFix, epAbs);
        
        episodioRelativoAtual = request.ep;
        isCorrecaoManual = true; 
        malProgressoSincronizado = false;
        mostrarToastRastreio(animeDetectado, request.ep, totalEpisodiosAnime, animeDetectado.season || 1);
        sendResponse({success: true});
    }
    
    if (request.action === "CANCELAR_CORRECAO") {
        chrome.storage.local.set({ isCorrectionMode: false });
        let btn = document.getElementById('btnWrongAnime');
        if (btn && !isCorrecaoManual && offsetManualFix === 0) {
            btn.textContent = "Anime/Episódio errado?";
            btn.style.color = "#ff7675";
        }
        sendResponse({success: true});
    }

    if (request.action === "RENDERIZAR_TOAST_DELEGADO") {
        if (window === window.top) {
            animeDetectado = request.anime; 
            totalEpisodiosAnime = request.epTotal;
            mostrarToastRastreio(request.anime, request.epAtual, request.epTotal, request.seasonNum);
        }
        return;
    }
    if (request.action === "RENDERIZAR_OVERLAY_DELEGADO") {
        if (window === window.top) {
            animeDetectado = request.anime;
            mostrarOverlay();
        }
        return;
    }
    if (request.action === "ATUALIZAR_PROGRESSO_DELEGADO") {
        if (window === window.top) {
            let pct = request.pct;
            let microFill = document.getElementById('micro-progress-fill');
            if (microFill) microFill.style.width = `${pct}%`;
            let hoverFill = document.querySelector('.hover-episode-fill');
            if (hoverFill) hoverFill.style.width = `${pct}%`;
        }
        return;
    }
    if (request.action === "FLASH_TOAST_DELEGADO") {
        if (window === window.top) {
            forcarFlashLocal();
        }
        return;
    }
    if (request.action === "REDEFINIR_TOAST_DELEGADO") {
        if (window === window.top) {
            resetarMonitoramentoLocalOnly();
        }
        return;
    }
});


// LOOP DE MONITORAMENTO PRINCIPAL
const intervaloCheck = setInterval(() => {
    let url = window.location.href;

    // Lógica Netflix
    if (url.includes("netflix.com")) {
        if (!url.includes("/watch/") && !url.includes("/title/")) {
            if (monitorando) resetarMonitoramento();
            return; 
        }
        let playerContainer = document.querySelector('[data-videoid]');
        let videoIdDetectado = playerContainer ? playerContainer.getAttribute('data-videoid') : null;

        if (videoIdDetectado && videoIdDetectado !== videoIdAtual) {
            videoIdAtual = videoIdDetectado;
            resetarMonitoramento();
            chrome.runtime.sendMessage({ action: 'INJETAR_SONDA_NETFLIX' });
        }
    }

    if (monitorando) {
        let video = window.videoSendoMonitorado;
        let videoAindaExiste = Array.from(document.querySelectorAll('video')).some(v => v === video && v.isConnected);

        let baseOldUrl = window.lastUrlMonitorada ? window.lastUrlMonitorada.split('?')[0].split('#')[0] : "";
        let baseNewUrl = url.split('?')[0].split('#')[0];
        let urlMudou = (baseOldUrl && baseOldUrl !== baseNewUrl);

        let epAtualNaTela = detectarEpisodioAtual();
        let epMudou = false;
        if (epAtualNaTela && window.lastEpisodioDetectado && epAtualNaTela !== window.lastEpisodioDetectado) {
            epMudou = true;
        }

        if (!videoAindaExiste || urlMudou || epMudou) {
            devLog("MAL Reviewer: Mudança real detectada (Vídeo/URL/Episódio). Resetando rastreio...");
            resetarMonitoramento();
        } else {
            window.lastUrlMonitorada = url;
            if (epAtualNaTela) window.lastEpisodioDetectado = epAtualNaTela;
            return; 
        }
    }

    let videosNaTela = document.querySelectorAll('video');
    let videoValido = null;
    let urlAtualCheck = window.location.href;
    let isPrimeCheck = urlAtualCheck.includes("primevideo.com") || urlAtualCheck.includes("amazon.");
    
    if (isPrimeCheck) {
        if (cfgEnablePrimeBasic) {
            let titleUI = document.querySelector('.atvwebplayersdk-title-text');
            let episodeUI = document.querySelector('.atvwebplayersdk-episode-info, .atvwebplayersdk-subtitle-text');
            
            if (titleUI || episodeUI) {
                let videoAmazon = document.querySelector('.atvwebplayersdk-player video, .webPlayerSDK-Container video, video');
                if (videoAmazon) {
                    videoValido = videoAmazon;
                }
            }
        }
    } else {
        // Lógica normal para Crunchyroll, Netflix e outros
        for (let v of videosNaTela) {
            if (!isNaN(v.duration) && v.duration > 150 && (v.src || v.currentSrc || v.querySelector('source'))) {
                videoValido = v;
                break; 
            }
        }
    }

    if (videoValido) {
        chrome.storage.local.get(['customUrls'], (res) => {
            const urlsPermitidas = ["netflix.com", "crunchyroll.com", "primevideo.com", "amazon.", "youtube.com/embed", "youtube-nocookie.com/embed", "animefire.io", "animesonlinecc.to", "meusanimes.blog", "goyabu.io", "betteranime.io", "drive.google.com"];
            let driveAtivo = res.enableGoogleDrive ?? false;
            if (driveAtivo) {
                urlsPermitidas.push("drive.google.com");
            }

            const sitesCustomizados = res.customUrls || [];
            urlsPermitidas.push(...sitesCustomizados);

            const urlObj = new URL(window.location.href);
            const hostname = urlObj.hostname;
            const pathname = urlObj.pathname;

            const siteEhMonitorado = urlsPermitidas.some(site => {
                if (site.includes('/')) {
                    const partes = site.split('/');
                    const dominio = partes[0];
                    const caminho = partes.slice(1).join('/');
                    return (hostname === dominio || hostname.endsWith('.' + dominio)) && pathname.includes(caminho);
                }
                
                if (site === "amazon.") {
                    return hostname.includes("amazon.");
                }
                
                return hostname === site || hostname.endsWith('.' + site);
            });

            if (siteEhMonitorado) {
                monitorando = true;
                window.videoSendoMonitorado = videoValido;
                iniciarMonitoramento(videoValido);
            }
        });
    }
}, 3000);

function resetarMonitoramento() {
    resetarMonitoramentoLocalOnly();
    if (window !== window.top) {
        chrome.runtime.sendMessage({ action: "REDEFINIR_TOAST_AO_TOPO" });
    }
}

function iniciarMonitoramento(video) {
    let epAbsValInicial = detectarEpisodioAtual();
    if (epAbsValInicial === -1) {
        devLog("MAL Reviewer: 🛑 Episódio de Recap/Resumo detectado. O rastreio foi ignorado para este vídeo.");
        return;
    }

    // Registra a nova sessão ativa e reseta sinalizadores
    currentSessionToken++;
    let mySessionToken = currentSessionToken;
    isToastDismissed = false; 

    devLog("MAL Reviewer: Vídeo detectado. Monitorando...");
    
    chrome.storage.local.get([
        'autoUpdateProgress', 'autoUpdateTrigger', 'autoCompleteOnLast', 
        'blockRegressionOnComplete', 'autoOpenOverlayIfNoScore', 
        'allowInFullscreen', 'discreetOverlayFs', 'discreetProgressFs', 'discreetFlashFs', 
        'enableToastExp', 'enableToastMicro', 'enableToastFlash', 'enableOverlay',
        'sizeToastExp', 'sizeToastMicro', 'sizeToastFlash', 'sizeOverlay', 'netflixCrSubs', 'netflixSubSize'
    ], (res) => {
        cfgAutoUpdateProgress = res.autoUpdateProgress ?? true;
        cfgAutoUpdateTrigger = res.autoUpdateTrigger ?? '80percent';
        cfgAutoCompleteOnLast = res.autoCompleteOnLast ?? true;
        cfgBlockRegressionOnComplete = res.blockRegressionOnComplete ?? true;
        cfgAutoOpenOverlayIfNoScore = res.autoOpenOverlayIfNoScore ?? true;
        window.cfgAllowInFullscreen = res.allowInFullscreen ?? true;
        window.cfgDiscreetOverlayFs = res.discreetOverlayFs ?? false;
        window.cfgDiscreetProgressFs = res.discreetProgressFs ?? false;
        window.cfgDiscreetFlashFs = res.discreetFlashFs ?? false;
        window.cfgEnableToastExp = res.enableToastExp ?? true;
        window.cfgEnableToastMicro = res.enableToastMicro ?? true;
        window.cfgEnableToastFlash = res.enableToastFlash ?? true;
        window.cfgEnableOverlay = res.enableOverlay ?? true;
        window.cfgNetflixCrSubs = res.netflixCrSubs ?? true;
        window.cfgSizeToastExp = res.sizeToastExp || 'medium';
        window.cfgSizeToastMicro = res.sizeToastMicro || 'medium';
        window.cfgSizeToastFlash = res.sizeToastFlash || 'medium';
        window.cfgSizeOverlay = res.sizeOverlay || 'medium';

        netflixSubSizeSalvo = res.netflixSubSize || 28;

        if (window.location.href.includes("netflix.com")) {
            if (window.cfgNetflixCrSubs) {
                document.documentElement.classList.add('mal-netflix-cr-subs'); 
                injetarCSSDiscreto();
                forcarLegendasCrunchyrollNetflix(); 
            } else {
                document.documentElement.classList.remove('mal-netflix-cr-subs');
            }
        }

        const executarRastreio = (tentativa = 1) => {
            detectarNomeAnime().then(nome => {
                if (mySessionToken !== currentSessionToken || !monitorando) {
                    devLog("MAL Reviewer: 🛑 Sessão antiga abortada.");
                    return;
                }

                let epAbs = detectarEpisodioAtual() || 1;
                devLog(`MAL Reviewer: Episódio detectado no player (Tentativa ${tentativa}):`, epAbs);
                
                if (nome) {
                    termoBuscaOriginal = nome;
                    
                    if (idPlataformaAtual) {
                        chrome.storage.local.get(["CORRECAO_" + idPlataformaAtual], (res) => {
                            if (mySessionToken !== currentSessionToken || !monitorando) return;
                            
                            if (res["CORRECAO_" + idPlataformaAtual]) {
                                devLog("MAL Reviewer: Memória de ID Exclusivo ativada para:", idPlataformaAtual);
                                let dadosSalvos = res["CORRECAO_" + idPlataformaAtual];
                                
                                animeDetectado = dadosSalvos.anime;
                                totalEpisodiosAnime = animeDetectado.episodes || 1;
                                isCorrecaoManual = true;
                                
                                offsetManualFix = dadosSalvos.forcedOffset !== undefined ? dadosSalvos.forcedOffset : (dadosSalvos.offset || 0);

                                let epRel = epAbs - offsetManualFix;
                                if (epRel <= 0) epRel = epAbs;
                                episodioRelativoAtual = epRel;

                                mostrarToastRastreio(animeDetectado, epRel, totalEpisodiosAnime);
                            } else {
                                buscarDadosNoJikan(nome);
                            }
                        });
                    } else {
                        buscarDadosNoJikan(nome);
                    }
                } else if (tentativa < 3 && monitorando) {
                    devLog("MAL Reviewer: ⚠️ Nome do anime não detectado nesta tentativa. Agendando retry em 2s...");
                    setTimeout(() => executarRastreio(tentativa + 1), 2000);
                }
            });
        };
        executarRastreio();
    });

    let isPrime = window.location.href.includes("primevideo.com") || window.location.href.includes("amazon.");
    
    if (isPrime) {
        if (!cfgEnablePrimeAdvanced) {
            devLog("MAL Reviewer: 🛒 Prime Video operando no Modo Básico. Rastreio de tempo desativado.");
            return; 
        }

        if (window.primeTimerInjetado) clearInterval(window.primeTimerInjetado);
        window.primeTimerInjetado = setInterval(() => {
            if (monitorando && video && !video.paused) video.dispatchEvent(new Event('timeupdate'));
        }, 1000);
    }

    if (!video.dataset.malListenerInjetado) {
        video.dataset.malListenerInjetado = "true";
        video.addEventListener('timeupdate', () => {
            let currentT = video.currentTime || 0;
            let totalT = video.duration || 0;

            if (isPrime) {
                let timeUI = document.querySelector('.atvwebplayersdk-timeindicator-text');
                if (timeUI && timeUI.innerText.includes('/')) {
                    let parts = timeUI.innerText.split('/');
                    let parseTime = (str) => str.trim().split(':').reduce((acc, time) => (60 * acc) + +time, 0);
                    let pCur = parseTime(parts[0]);
                    let pTot = parseTime(parts[1]);
                    if (pTot > 0) { currentT = pCur; totalT = pTot; } 
                }
            }

            if (!totalT || isNaN(totalT) || totalT === Infinity || totalT < 180) return;

            const isCompleted = animeDetectado && animeDetectado.my_list_status && animeDetectado.my_list_status.status === 'completed';
            const bloquearEnvio = cfgBlockRegressionOnComplete && isCompleted;

            if (!isToastDismissed && totalT > 0) {
                let pct = (currentT / totalT) * 100;
                let microFill = document.getElementById('micro-progress-fill');
                if (microFill) microFill.style.width = `${pct}%`;
                let hoverFill = document.querySelector('.hover-episode-fill');
                if (hoverFill) hoverFill.style.width = `${pct}%`;

                if (window !== window.top) {
                    let agora = Date.now();
                    if (!window.ultimoEnvioProgresso || agora - window.ultimoEnvioProgresso > 1500) {
                        window.ultimoEnvioProgresso = agora;
                        chrome.runtime.sendMessage({ action: "ATUALIZAR_PROGRESSO_TOAST", pct: pct });
                    }
                }
            }

            if (!totalEpisodiosAnime || totalEpisodiosAnime === 0) return;

            let epAbsVal = detectarEpisodioAtual();
            let epAbsolute = epAbsVal || 1;
            
            if (window.ultimoEpProcessadoOTM !== epAbsolute) {
                window.ultimoEpProcessadoOTM = epAbsolute; 
                
                let ehFilme = epAbsVal === null; 
                let duracaoMinutos = totalT > 0 ? (totalT / 60) : 0;

                if (!isCorrecaoManual) {
                    let analise = selecionarTemporadaAdequada(epAbsolute, duracaoMinutos, ehFilme, termoBuscaOriginal);
                    if (analise && totalEpisodiosAnime > 0) {
                        episodioRelativoAtual = analise.relativo;
                    }
                } else {
                    episodioRelativoAtual = epAbsolute - offsetManualFix;
                    if (episodioRelativoAtual <= 0) episodioRelativoAtual = epAbsolute;
                }
            }

            let epRelativo = episodioRelativoAtual;

            // LÓGICA DOS INDICADORES VISUAIS NA BARRA
            let markerSync = document.getElementById('marker-sync');
            let microMarkerSync = document.getElementById('micro-marker-sync');
            let markerRate = document.getElementById('marker-rate');
            let microMarkerRate = document.getElementById('micro-marker-rate');
            
            if ((markerSync || microMarkerSync) && totalT > 0) {
                let syncPct = 80;
                if (cfgAutoUpdateTrigger === '15min') syncPct = (900 / totalT) * 100;
                else if (cfgAutoUpdateTrigger === '5min_left') syncPct = ((totalT - 300) / totalT) * 100;
                else if (cfgAutoUpdateTrigger === '85percent') syncPct = 85;
                else if (cfgAutoUpdateTrigger === '90percent') syncPct = 90;
                
                syncPct = Math.max(0, Math.min(100, syncPct));
                if (markerSync) markerSync.style.left = `${syncPct}%`;
                if (microMarkerSync) microMarkerSync.style.left = `${syncPct}%`;
                
                let pctAtual = (currentT / totalT) * 100;
                if (pctAtual >= syncPct) {
                    if (markerSync) { markerSync.style.background = '#00b894'; markerSync.style.boxShadow = '0 0 4px #00b894'; }
                    if (microMarkerSync) { microMarkerSync.style.background = '#00b894'; microMarkerSync.style.boxShadow = '0 0 4px #00b894'; }
                } else {
                    if (markerSync) { markerSync.style.background = '#fdcb6e'; markerSync.style.boxShadow = '0 0 4px #fdcb6e'; }
                    if (microMarkerSync) { microMarkerSync.style.background = '#fdcb6e'; microMarkerSync.style.boxShadow = '0 0 4px #fdcb6e'; }
                }
            }

            if ((markerRate || microMarkerRate) && totalT > 0) {
                if (epRelativo === totalEpisodiosAnime && cfgAutoOpenOverlayIfNoScore) {
                    if (markerRate) markerRate.style.display = 'block';
                    if (microMarkerRate) microMarkerRate.style.display = 'block';
                    
                    let ratePct = ((totalT - 120) / totalT) * 100;
                    ratePct = Math.max(0, Math.min(100, ratePct));
                    
                    if (markerRate) markerRate.style.left = `${ratePct}%`;
                    if (microMarkerRate) microMarkerRate.style.left = `${ratePct}%`;
                    
                    if (totalT - currentT <= 120) {
                        if (markerRate) { markerRate.style.background = '#6c5ce7'; markerRate.style.boxShadow = '0 0 6px #6c5ce7'; }
                        if (microMarkerRate) { microMarkerRate.style.background = '#6c5ce7'; microMarkerRate.style.boxShadow = '0 0 6px #6c5ce7'; }
                    } else {
                        if (markerRate) { markerRate.style.background = '#a29bfe'; markerRate.style.boxShadow = '0 0 4px #a29bfe'; }
                        if (microMarkerRate) { microMarkerRate.style.background = '#a29bfe'; microMarkerRate.style.boxShadow = '0 0 4px #a29bfe'; }
                    }
                } else {
                    if (markerRate) markerRate.style.display = 'none';
                    if (microMarkerRate) microMarkerRate.style.display = 'none';
                }
            }

            if (cfgAutoUpdateProgress && !malProgressoSincronizado && !bloquearEnvio && animeDetectado && animeDetectado.mal_id && totalT > 0) {
                let alcancouGatilho = false;
                if (cfgAutoUpdateTrigger === '15min') { alcancouGatilho = currentT >= 900; } 
                else if (cfgAutoUpdateTrigger === '5min_left') { alcancouGatilho = (totalT - currentT <= 300) && totalT > 300; } 
                else { 
                    let syncPctReal = 0.8;
                    if (cfgAutoUpdateTrigger === '85percent') syncPctReal = 0.85;
                    if (cfgAutoUpdateTrigger === '90percent') syncPctReal = 0.90;
                    alcancouGatilho = (currentT / totalT) >= syncPctReal; 
                }

                if (alcancouGatilho) {
                    malProgressoSincronizado = true;
                    let statusParaEnviar = 'watching';
                    let epParaEnviar = epRelativo;

                    if (animeDetectado.is_split_movie) {
                        if (epRelativo < totalEpisodiosAnime) epParaEnviar = 0;
                        else { epParaEnviar = 1; statusParaEnviar = 'completed'; }
                    } else if (cfgAutoCompleteOnLast && epRelativo === totalEpisodiosAnime) {
                        statusParaEnviar = 'completed';
                    }

                    if (statusParaEnviar === 'completed') {
                        if (!animeDetectado.my_list_status) animeDetectado.my_list_status = {};
                        animeDetectado.my_list_status.status = 'completed';
                    }

                    sincronizarProgressoNoMAL(animeDetectado.mal_id, epParaEnviar, statusParaEnviar);

                    if (!isToastDismissed && window.cfgEnableToastFlash !== false) {
                        if (window !== window.top) {
                            chrome.runtime.sendMessage({ action: "FLASH_TOAST_AO_TOPO" });
                        } else {
                            forcarFlashLocal();
                        }
                    }
                }
            }
            
            if (epRelativo === totalEpisodiosAnime) {
                let ehFim = (currentT / totalT) >= 0.90; 
                if (ehFim && !overlayCriado) {
                    overlayCriado = true;
                    verificarSeJaTemNotaEExibir();
                }
            }
        });
    }
}

function sincronizarProgressoNoMAL(animeId, ep, status = 'watching') {
    devLog(`MAL Reviewer: Enviando atualização de progresso automática para o MAL. Status: ${status}, Episódio: ${ep}`);
    chrome.runtime.sendMessage({ action: 'sincronizarEpisodioMAL', animeId: animeId, episodio: ep, status: status }, (response) => {
        if (chrome.runtime.lastError) return;
        if (response && response.success) {
            devLog(`MAL Reviewer: Progresso (${status}) atualizado com sucesso no MAL!`);
        }
    });
}

// FUNÇÕES DE EXTRAÇÃO
function detectarEpisodioAtual() {
    let url = window.location.href;
    let numeroEncontrado = null;
    let isRecap = false;

    if (window !== window.top && window.epAbsDoIframe !== undefined) {
        return window.epAbsDoIframe;
    }

    // EXTRAÇÃO DEDICADA DE EPISÓDIO PARA GOOGLE DRIVE
    if (url.includes("drive.google.com")) {
        if (!cfgEnableGoogleDrive) return null;
        let spanTitle = document.querySelector('span[data-is-tooltip-wrapper="true"] span');
        let txt = spanTitle ? spanTitle.textContent : document.title;
        if (txt) {
            let match = txt.match(/(?:[Ee]pis[oó]dio|[Ee]pisode|[Ee]p\.|[Ee]p|[Ee])[-.\s]*(\d+)/i);
            if (match) {
                return parseInt(match[1]);
            }
            let matchFormat2 = txt.match(/[-_\s](\d+)\.(?:mp4|mkv|avi|mov|webm)/i);
            if (matchFormat2) {
                return parseInt(matchFormat2[1]);
            }
        }
        return 1; // Fallback caso não ache nenhuma numeração
    }

    // Verificação de Palavras-Chave no título da página
    let pageTitle = document.title.toLowerCase();
    if (pageTitle.includes("recap") || pageTitle.includes("resumo") || pageTitle.includes("intermission") || pageTitle.includes("recapitul")) {
        isRecap = true;
    }

    if (url.includes("netflix.com")) {
        let metaNetflix = extrairMetadadosNetflix();
        if (metaNetflix && metaNetflix.episode) {
            if (metaNetflix.title && (metaNetflix.title.toLowerCase().includes("recap") || metaNetflix.title.toLowerCase().includes("resumo"))) {
                isRecap = true;
            }
            numeroEpisodioAtual = metaNetflix.episode;
            return isRecap ? -1 : numeroEpisodioAtual;
        }
        return isRecap ? -1 : numeroEpisodioAtual;
    }
    else if (url.includes("crunchyroll.com")) {
        let meta = extrairMetadadosCrunchyroll();
        if (meta.success && meta.numEpisodio !== undefined && meta.numEpisodio !== null) {
            let epFloat = parseFloat(meta.numEpisodio);
            if (epFloat % 1 !== 0) isRecap = true;
            numeroEncontrado = Math.floor(epFloat);
        } else {
            let tituloAba = document.title;
            let match = tituloAba.match(/Epis[óo]dio\s*(\d+(?:[.,]\d+)?)/i) || tituloAba.match(/Episode\s*(\d+(?:[.,]\d+)?)/i) || tituloAba.match(/E(\d+(?:[.,]\d+)?)/i);
            if (match) {
                let epFloat = parseFloat(match[1].replace(',', '.'));
                if (epFloat % 1 !== 0) isRecap = true;
                numeroEncontrado = Math.floor(epFloat);
            }
        }
        return isRecap ? -1 : numeroEncontrado;
    } 
    else if (url.includes("primevideo.com") || url.includes("amazon.")) {
        let episodeInfo = document.querySelector('.atvwebplayersdk-episode-info, .atvwebplayersdk-subtitle-text, .atvwebplayersdk-title-text');
        if (episodeInfo && episodeInfo.innerText) {
            let txt = episodeInfo.innerText;
            let match = txt.match(/(?:Epis[óo]dio|Episode|Ep\.|E)\s*(\d+(?:[.,]\d+)?)/i) || txt.match(/T\d+\s*Ep\.\s*(\d+(?:[.,]\d+)?)/i);
            
            if (!match) {
                let rangeMatch = txt.match(/(\d+)\s*-\s*\d+/);
                if (rangeMatch) match = [null, rangeMatch[1]];
            }
            
            if (match) {
                let epFloat = parseFloat(match[1].replace(',', '.'));
                if (epFloat % 1 !== 0) isRecap = true;
                numeroEncontrado = Math.floor(epFloat);
            }
            if (txt.toLowerCase().includes("recap") || txt.toLowerCase().includes("resumo")) isRecap = true;
        }
        return isRecap ? -1 : numeroEncontrado;
    }
    else {
        // Genérico (Sites Alternativos)
        let parts = url.replace(/\/$/, '').split('/');
        let lastPart = parts[parts.length - 1];
        
        if (lastPart.match(/^\d+(?:[.,]\d+)?$/) && lastPart.length > 0 && lastPart.length <= 5) {
            let epFloat = parseFloat(lastPart.replace(',', '.'));
            if (epFloat % 1 !== 0) isRecap = true;
            numeroEncontrado = Math.floor(epFloat);
        } else {
            let textosParaBuscar = [document.title];
            try {
                let scripts = document.querySelectorAll('script[type="application/ld+json"]');
                for (let script of scripts) {
                    let data = JSON.parse(script.textContent);
                    let items = Array.isArray(data) ? data : [data];
                    items.forEach(item => {
                        if (item.name) textosParaBuscar.push(item.name);
                        if (item.description) textosParaBuscar.push(item.description);
                    });
                }
            } catch(e) {}
            
            for (let t of textosParaBuscar) {
                let match = t.match(/Epis[óo]dio\s*(\d+(?:[.,]\d+)?)/i) || t.match(/Episode\s*(\d+(?:[.,]\d+)?)/i) || t.match(/Ep\.\s*(\d+(?:[.,]\d+)?)/i) || t.match(/Ep\s*(\d+(?:[.,]\d+)?)/i);
                if (match) { 
                    let epFloat = parseFloat(match[1].replace(',', '.'));
                    if (epFloat % 1 !== 0) isRecap = true;
                    numeroEncontrado = Math.floor(epFloat); 
                    break; 
                }
            }
        }
        return isRecap ? -1 : numeroEncontrado;
    }
}

async function detectarNomeAnime() {
    let url = window.location.href;

    if (window !== window.top) {
        let infoTop = await solicitarInfoDaPaginaPrincipal();
        if (infoTop && infoTop.nome) {
            idPlataformaAtual = "GENERIC_IFRAME";
            window.epAbsDoIframe = infoTop.ep;
            return infoTop.nome;
        }
    }

    // EXTRAÇÃO DE NOME PARA GOOGLE DRIVE
    if (url.includes("drive.google.com")) {
        if (!cfgEnableGoogleDrive) return null;
        let spanTitle = document.querySelector('span[data-is-tooltip-wrapper="true"] span');
        if (spanTitle && spanTitle.textContent) {
            let rawName = spanTitle.textContent.trim();
            
            rawName = rawName.replace(/\.(mp4|mkv|avi|mov|wmv|flv|webm)$/i, '');
            
            let cleanedName = rawName
                .replace(/\s*[-_]?\s*(?:[Ee]pis[oó]dio|[Ee]pisode|[Ee]p\.|[Ee]p|[Ee])[-_\s]*\d+.*$/i, "")
                .replace(/[-_]\s*\d+\s*$/i, "")
                .replace(/[-_]/g, ' ')
                .replace(/\s{2,}/g, ' ')
                .trim();

            idPlataformaAtual = "DRIVE_" + btoa(encodeURIComponent(cleanedName)).substring(0, 15);
            devLog(`MAL Reviewer: 📂 [GOOGLE DRIVE] Nome extraído do span: "${cleanedName}"`);
            return cleanedName;
        }
    }
    
    if (url.includes("netflix.com")) {
        let matchId = document.location.pathname.match(/\/watch\/(\d+)/);
        let videoId = matchId ? matchId[1] : null;
        
        if (videoId) {
            for (let i = 0; i < 20; i++) {
                let metaTemporaria = extrairMetadadosNetflix();
                
                let memoriaConfirmada = (metaTemporaria && metaTemporaria.title && metaTemporaria.uniqueId === videoId);
                let predicaoAtiva = (metaTemporaria && metaTemporaria.title && netflixPredicaoSeason);
                if (memoriaConfirmada || predicaoAtiva) break; 
                await new Promise(resolve => setTimeout(resolve, 250)); 
            }
        }

        let metaNetflix = extrairMetadadosNetflix();
        if (!metaNetflix || !metaNetflix.title) return null;
        
        if (metaNetflix.uniqueId) { idPlataformaAtual = "NETFLIX_" + metaNetflix.uniqueId; }

        let nomeFinal = metaNetflix.title;
        
        nomeFinal = nomeFinal.replace(/come[çc]a ap[óo]s os an[úu]ncios/ig, "").replace(/starts after ads/ig, "").replace(/-\s*$/, "").trim();
        
        if (metaNetflix.type === 'episode') {
            let nomeLimpo = nomeFinal.replace(/T\d+:?|Temporada \d+|Season \d+|Parte \d+/ig, "").replace(/-$/, "").trim();
            nomeFinal = nomeLimpo;
        }

        ultimaTemporadaAssistida = metaNetflix.season;
        ultimoEpisodioAssistido = metaNetflix.episode;
        ultimoTotalEpisodios = totalEpisodiosAnime || ultimoTotalEpisodios; 

        netflixPredicaoSeason = null;
        netflixPredicaoEpisode = null;

        let tipoParaLog = metaNetflix.type ? metaNetflix.type.toUpperCase() : "PREDIÇÃO/TIMEOUT";
        devLog(`MAL Reviewer: [NETFLIX] Nome resolvido: "${nomeFinal}" | Status: ${tipoParaLog}`);
        return nomeFinal;
    }

    if (url.includes("crunchyroll.com")) {
        let matchId = url.match(/\/watch\/([A-Z0-9]+)/i);
        if (matchId) idPlataformaAtual = "CR_" + matchId[1];

        let meta = extrairMetadadosCrunchyroll();
        if (meta.success && meta.nomeSerie) {
            let nomeShow = meta.nomeSerie;
            let seasonNum = meta.numTemporada;
            let nomeTemporadaLimpo = meta.nomeTemporada ? meta.nomeTemporada.replace(/\(.*Dub.*\)/i, "").trim() : "";

            if (nomeShow.toLowerCase().trim() === "sword art online" && parseInt(seasonNum) === 5) {
                let epAbs = detectarEpisodioAtual() || 1;
                if (epAbs <= 12) {
                    return "Sword Art Online: Alicization - War of Underworld";
                } else {
                    return "Sword Art Online: Alicization - War of Underworld Part 2";
                }
            }

            if (nomeTemporadaLimpo) {
                let nomeTempBaixo = nomeTemporadaLimpo.toLowerCase();
                if (nomeTempBaixo.includes("ova") || nomeTempBaixo.includes("oad") || nomeTempBaixo.includes("special")) {
                    let urlSlug = window.location.href.split('/').pop().split('?')[0].replace(/-/g, " ").trim();
                    return `${nomeShow} ${urlSlug}`;
                }
                let matchTexto = nomeTemporadaLimpo.match(/(?:Season|Temporada)\s*(\d+)|(\d+)[ªaºo]?\s*(?:Season|Temporada)/i);
                if (matchTexto) { seasonNum = parseInt(matchTexto[1] || matchTexto[2]); } 
                else if (!nomeTempBaixo.includes(nomeShow.toLowerCase()) && nomeTemporadaLimpo.length > 3) { return `${nomeShow} ${nomeTemporadaLimpo}`; } 
                else if (nomeTemporadaLimpo !== nomeShow && nomeTemporadaLimpo.length > nomeShow.length) { return nomeTemporadaLimpo; }
            }
            if (seasonNum && parseInt(seasonNum) > 1) {
                let num = parseInt(seasonNum);
                let sufixo = num === 2 ? "2nd Season" : num === 3 ? "3rd Season" : num + "th Season";
                return `${nomeShow} ${sufixo}`;
            }
            return nomeShow;
        }

        let linkSerie = document.querySelector('.show-title-link') || document.querySelector('h4 a.parent-link');
        if (linkSerie && linkSerie.innerText) return linkSerie.innerText.replace(/\(.*Dub.*\)/i, "").trim();
        return document.title.split(' - ')[0].replace(" - Assista na Crunchyroll", "").trim();
    }

    if (url.includes("primevideo.com") || url.includes("amazon.")) {
        let titleEl = document.querySelector('.atvwebplayersdk-title-text');
        let infoEl = document.querySelector('.atvwebplayersdk-episode-info, .atvwebplayersdk-subtitle-text');
        
        let nomeShow = "";
        let seasonNum = null;

        if (titleEl && titleEl.textContent) {
            nomeShow = titleEl.textContent.trim();
        } 
        
        if (!nomeShow || nomeShow.toLowerCase().match(/^season \d+$/i) || nomeShow.toLowerCase().match(/^temporada \d+$/i)) {
            let tituloAba = document.title.split(' - ')[0].replace("Prime Video:", "").trim();
            if (tituloAba.toLowerCase().match(/^season \d+$/i) || tituloAba.toLowerCase().match(/^temporada \d+$/i)) {
                return null;
            }
            nomeShow = tituloAba;
        }

        if (infoEl && infoEl.innerText) {
            let matchSeason = infoEl.innerText.match(/(?:Temporada|Season|T)\s*(\d+)/i);
            if (matchSeason) seasonNum = parseInt(matchSeason[1]);
        }

        nomeShow = nomeShow.replace(/\s*\d+\s*-\s*\d+$/, "").trim();

        let safeName = nomeShow.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
        idPlataformaAtual = "AMZN_" + safeName.substring(0, 30);

        if (seasonNum && seasonNum > 1) {
            let sufixo = seasonNum === 2 ? "2nd Season" : seasonNum === 3 ? "3rd Season" : seasonNum + "th Season";
            return `${nomeShow} ${sufixo}`;
        }

        return nomeShow;
    }
    let titleRaw = document.title;
    try {
        let scripts = document.querySelectorAll('script[type="application/ld+json"]');
        for (let script of scripts) {
            let data = JSON.parse(script.textContent);
            let items = Array.isArray(data) ? data : [data];
            for (let item of items) {
                if (item["@type"] === "WebPage" || item["@type"] === "VideoObject" || item["@type"] === "TVEpisode") {
                    if (item.name) { titleRaw = item.name; break; }
                }
            }
        }
    } catch(e) {}

    let nomeLimpo = titleRaw;

    nomeLimpo = nomeLimpo.replace(/\s*[-|]?\s*(?:Epis[óo]dio|Episode|Ep\.|Ep)\s*\d+.*$/i, "");

    if (/\b(?:Movie|Filme)\b/i.test(nomeLimpo)) {
        window.isMovieFromTitle = true;
        nomeLimpo = nomeLimpo.replace(/\b(?:Movie|Filme)\b/ig, ""); 
    } else {
        window.isMovieFromTitle = false;
    }

    nomeLimpo = nomeLimpo
        .replace(/(?:[-|]\s*)\bOnline\b/ig, "")
        .replace(/\bOnline\b(?=\s*[-|])/ig, "")
        .replace(/\b(?:Assistir|Ver)\s+Online\b/ig, "")
        .replace(/\bOnline\s+(?:HD|Gr[áa]tis)\b/ig, "")
        .replace(/\b(?:HD|Gr[áa]tis)\s+Online\b/ig, "");

    nomeLimpo = nomeLimpo
        .replace(/\bAssistir\b/ig, "")
        .replace(/\bWatch\b/ig, "")
        .replace(/\(?\bDublado\b\)?/ig, "")
        .replace(/\(?\bLegendado\b\)?/ig, "")
        .replace(/\bEm Portugu[êe]s(?: Brasileiro)?\b/ig, "")
        .replace(/\bHD\b/ig, "")
        .replace(/\bGr[áa]tis\b/ig, "")
        .replace(/\bAnimeFire\b/ig, "") 
        .replace(/\bAnimesVision\b/ig, "")
        .replace(/\bBetterAnime\b/ig, "");

    nomeLimpo = nomeLimpo.replace(/\s{2,}/g, " "); 
    nomeLimpo = nomeLimpo.replace(/\s+-\s+-/g, " - ").replace(/:\s+-/g, ": "); 
    nomeLimpo = nomeLimpo.replace(/^[-|:]\s*/, "").replace(/\s*[-|:]$/, "").trim(); 

    if (nomeLimpo.includes(" - ")) {
        let partes = nomeLimpo.split(" - ");
        if (partes[partes.length - 1].length < 15 && !partes[partes.length - 1].toLowerCase().includes("part")) {
            partes.pop();
            nomeLimpo = partes.join(" - ");
        }
    }

    idPlataformaAtual = "GENERIC_" + btoa(encodeURIComponent(nomeLimpo)).substring(0, 15);
    devLog(`MAL Reviewer: 🌐 [EXTRATOR GENÉRICO] Nome extraído e limpo: "${nomeLimpo}"`);
    return nomeLimpo;
}

function extrairMetadadosCrunchyroll() {
    try {
        let scripts = document.querySelectorAll('script[type="application/ld+json"]');
        for (let script of scripts) {
            let text = script.textContent;
            if (text.includes('"TVEpisode"')) {
                let data = JSON.parse(text);
                let item = Array.isArray(data) ? data.find(x => x["@type"] === "TVEpisode" || (x["@type"] && x["@type"].includes("TVEpisode"))) : (data["@type"] === "TVEpisode" ? data : null);
                if (item) {
                    let nomeLimpo = item.partOfSeries ? item.partOfSeries.name.replace(/\(.*Dub.*\)/i, "").trim() : null;
                    return { success: true, nomeSerie: nomeLimpo, numTemporada: item.partOfSeason ? item.partOfSeason.seasonNumber : null, nomeTemporada: item.partOfSeason ? item.partOfSeason.name : null, numEpisodio: item.episodeNumber };
                }
            }
        }
    } catch (e) { console.error("MAL Reviewer: Erro ao interpretar metadados JSON-LD da Crunchyroll", e); }
    return { success: false };
}

function armarArmadilhaNetflix() {
    const capturarDados = () => {
        let h4 = document.querySelector('[data-uia="video-title"] h4');
        let h2 = document.querySelector('[data-uia="evidence-overlay"] h2');
        let txt = "";
        
        if (h4) txt = h4.textContent;
        else if (h2) txt = h2.textContent;
        else {
            let container = document.querySelector('[data-uia="video-title"]');
            if (container && container.childNodes.length > 0) txt = container.childNodes[0].textContent;
        }
        
        if (txt) {
            txt = txt.replace(/[【】]/g, "")
                     .replace(/come[çc]a ap[óo]s os an[úu]ncios/ig, "")
                     .replace(/starts after ads/ig, "")
                     .trim();
                     
            txt = txt.replace(/-\s*$/, "").trim();

            if (txt.length > 0 && txt !== netflixTitleTrap) { 
                netflixTitleTrap = txt; 
                devLog("MAL Reviewer: 🪤 Armadilha de Nome disparou:", netflixTitleTrap); 
            }
        }
        
        let seasonEl = document.querySelector('[data-uia="evidence-overlay-season-title"]');
        let pauseTitleEl = document.querySelector('[data-uia="pause-ad-title-display-info-container"] span');
        let tempSeason = null;
        
        if (seasonEl) {
            let sMatch = seasonEl.textContent.match(/\d+/);
            if (sMatch) tempSeason = parseInt(sMatch[0]);
        } else if (pauseTitleEl) {
            let sMatch = pauseTitleEl.textContent.match(/T(\d+):/i) || pauseTitleEl.textContent.match(/S(\d+):/i);
            if (sMatch) tempSeason = parseInt(sMatch[1]);
        }
        
        if (tempSeason && tempSeason !== netflixSeasonTrap) { netflixSeasonTrap = tempSeason; devLog("MAL Reviewer: 🪤 Armadilha de Temporada disparou:", netflixSeasonTrap); }

        let tempEpisode = null;
        let epEl = document.querySelector('[data-uia="evidence-overlay-episode-title"]');
        
        if (epEl) {
            let match = epEl.textContent.match(/E:\s*(\d+)/i) || epEl.textContent.match(/Epis[óo]dio\s*(\d+)/i);
            if (match) tempEpisode = parseInt(match[1]);
        }
        if (!tempEpisode && pauseTitleEl) {
            let match = pauseTitleEl.textContent.match(/E(\d+)\s/i) || pauseTitleEl.textContent.match(/E:?\s*(\d+)/i) || pauseTitleEl.textContent.match(/T\d+:E(\d+)/i);
            if (match) tempEpisode = parseInt(match[1]);
        }
        if (!tempEpisode) {
            let tituloContainer = document.querySelector('[data-uia="video-title"]');
            if (tituloContainer) {
                let spans = tituloContainer.querySelectorAll('span');
                for (let span of spans) {
                    let match = span.innerText.match(/E\s*:?\s*(\d+)/i) || span.innerText.match(/Epis[óo]dio\s*(\d+)/i) || span.innerText.match(/Episode\s*(\d+)/i) || span.innerText.match(/Ep\.\s*(\d+)/i);
                    if (match) { tempEpisode = parseInt(match[1]); break; }
                }
            }
        }
        
        if (tempEpisode && tempEpisode !== netflixEpisodeTrap) { netflixEpisodeTrap = tempEpisode; devLog("MAL Reviewer: 🪤 Armadilha de Episódio disparou:", netflixEpisodeTrap); }
    };
    
    capturarDados(); 
    if (netflixTrapObserver) netflixTrapObserver.disconnect();
    let netflixTrapTimeout = null;
    netflixTrapObserver = new MutationObserver(() => { 
        if (window.location.pathname.includes('/watch/')) {
            clearTimeout(netflixTrapTimeout);
            netflixTrapTimeout = setTimeout(capturarDados, 500); 
        }
    });
    netflixTrapObserver.observe(document.body, { childList: true, subtree: true });
}
armarArmadilhaNetflix();

function extrairMetadadosNetflix() {
    let matchId = document.location.pathname.match(/\/watch\/(\d+)/);
    let videoId = matchId ? matchId[1] : null;
    if (!videoId) return null;

    let cacheData = null;
    let sondaDiv = document.getElementById('mal-reviewer-netflix-data');
    if (sondaDiv && sondaDiv.getAttribute('data-video') === videoId) {
        try { cacheData = JSON.parse(sondaDiv.innerText); } catch(e) {}
    }

    let nomeExtraido = netflixTitleTrap;
    if (cacheData) {
        if (cacheData.type === 'movie' && cacheData.movieTitle) nomeExtraido = cacheData.movieTitle;
        else if ((cacheData.type === 'show' || cacheData.type === 'episode') && cacheData.showTitle) nomeExtraido = cacheData.showTitle;
    }

    netflixTituloSalvo = nomeExtraido || netflixTituloSalvo;
    let tempEncontrada = (cacheData && cacheData.season) || netflixPredicaoSeason || netflixSeasonTrap;
    let epEncontrado = (cacheData && cacheData.episode) || netflixPredicaoEpisode || netflixEpisodeTrap;

    if (!tempEncontrada && netflixTemporadaSalva && epEncontrado) {
        if (netflixEpisodioSalvo && epEncontrado < netflixEpisodioSalvo) {
            devLog(`MAL Reviewer: 🧠 [SISTEMA DE MEMÓRIA] Episódio resetou de ${netflixEpisodioSalvo} para ${epEncontrado}. Avançando temporada!`);
            netflixTemporadaSalva += 1;
            tempEncontrada = netflixTemporadaSalva;
        } else { tempEncontrada = netflixTemporadaSalva; }
    }

    netflixTemporadaSalva = tempEncontrada || netflixTemporadaSalva;
    netflixEpisodioSalvo = epEncontrado || netflixEpisodioSalvo;
    netflixUniqueIdSalvo = cacheData ? cacheData.uniqueId : null;

    let tipoSalvo = (cacheData && cacheData.type) ? cacheData.type : (netflixEpisodioSalvo ? 'episode' : null);

    return { title: netflixTituloSalvo, type: tipoSalvo, season: netflixTemporadaSalva, episode: netflixEpisodioSalvo, uniqueId: netflixUniqueIdSalvo };
}


// BUSCA E MATEMÁTICA ANILIST
function buscarDadosNoJikan(termo) {
    if(!termo) return;
    
    let epAbsVal = detectarEpisodioAtual();
    let isOvaOrMovie = termo.toLowerCase().includes("ova") || termo.toLowerCase().includes("movie") || window.isMovieFromTitle;
    let ehFilme = epAbsVal === null || isOvaOrMovie; 

    chrome.runtime.sendMessage({ 
        action: 'buscarJikan', 
        termo: termo, 
        isAuto: true, 
        isMovie: false 
    }, (response) => {
        if (chrome.runtime.lastError || !response || !response.success) return;
        
        listaTemporadasDetectadas = response.data || [];
        devLog("MAL Reviewer: Lista de obras recebida do AniList (Auto):", listaTemporadasDetectadas);
        
        setTimeout(() => {
            let video = document.querySelector('video');
            let duracaoMinutos = (video && video.duration && !isNaN(video.duration)) ? (video.duration / 60) : 0;
            devLog(`MAL Reviewer: [Análise de Mídia] Modo Filme: ${ehFilme ? "ATIVADO" : "DESATIVADO"} | Duração Capturada: ${duracaoMinutos.toFixed(2)} minutos.`);

            let analise = selecionarTemporadaAdequada(epAbsVal || 1, duracaoMinutos, ehFilme, termo);
            if (analise) {
                devLog(`MAL Reviewer: ✅ Mapeado com SUCESSO para: "${analise.anime.title}" (ID: ${analise.anime.mal_id}) | EP Relativo: ${analise.relativo}/${analise.total}`);
                
                mostrarToastRastreio(analise.anime, analise.relativo, analise.total, analise.season);
                
                if (cfgBlockRegressionOnComplete && analise.anime.my_list_status && analise.anime.my_list_status.status === 'completed') {
                    malProgressoSincronizado = true;
                }
                const hasNoScore = !analise.anime.my_list_status || !analise.anime.my_list_status.score || analise.anime.my_list_status.score === 0;
                const isCompleted = analise.anime.my_list_status && analise.anime.my_list_status.status === 'completed';
                if (cfgAutoUpdateProgress && cfgAutoOpenOverlayIfNoScore && isCompleted && hasNoScore && analise.relativo === analise.total) {
                    if (!overlayCriado) verificarSeJaTemNotaEExibir(); 
                }
            }
        }, 1000);
    });
}

function selecionarTemporadaAdequada(epAbsolute, duracaoVideoEmMinutos = 0, ehFilme = false, termoBusca = "") {
    if (!listaTemporadasDetectadas || listaTemporadasDetectadas.length === 0) return null;

    if (listaTemporadasDetectadas.length === 1 && listaTemporadasDetectadas[0].is_direct_id) {
        let anime = listaTemporadasDetectadas[0];
        animeDetectado = anime;
        totalEpisodiosAnime = anime.episodes || 1;
        let epRelativo = anime.is_split_movie ? epAbsolute : 1; 
        return { anime: anime, total: totalEpisodiosAnime, relativo: epRelativo, season: 1 };
    }

    if (ehFilme) {
        let candidatos = listaTemporadasDetectadas;
        let melhorFilme = null; let maiorPontuacao = -1;
        const limpaString = (s) => s ? (typeof s === 'string' ? s : '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "") : "";
        const nomeAlvo = limpaString(termoBusca);

        const obterTitulosSeguros = (temp) => {
            let alternativos = (temp.alternative_titles || []).map(t => typeof t === 'object' ? t.title : t);
            return [temp.title, ...alternativos].filter(Boolean);
        };

        let candidatosFiltrados = candidatos.filter(temp => {
            let mType = (temp.media_type || '').toLowerCase();
            let eps = temp.episodes || 0;
            return mType === 'movie' || (['ona', 'special', 'ova'].includes(mType) && eps <= 2);
        });

        for (let temp of candidatosFiltrados) {
            let pontuacao = 0;
            pontuacao += 200;

            if (duracaoVideoEmMinutos > 0 && temp.duration > 0) {
                let proporcao = duracaoVideoEmMinutos / temp.duration;
                if (proporcao >= 0.8 && proporcao <= 1.25) pontuacao += 150; 
            }

            let titulos = obterTitulosSeguros(temp);
            let nomeParcialAplicado = false;
            for (let t of titulos) {
                let nomeTemp = limpaString(t);
                if (nomeTemp === nomeAlvo) { 
                    pontuacao += 1000;
                    break; 
                } else if (!nomeParcialAplicado && (nomeTemp.includes(nomeAlvo) || nomeAlvo.includes(nomeTemp))) { 
                    pontuacao += 30; 
                    nomeParcialAplicado = true; 
                }
            }
            if (pontuacao > maiorPontuacao) { maiorPontuacao = pontuacao; melhorFilme = temp; }
        }
        if (melhorFilme && maiorPontuacao > 0) { 
            animeDetectado = melhorFilme; 
            totalEpisodiosAnime = melhorFilme.episodes || 1;
            return { anime: melhorFilme, total: totalEpisodiosAnime, relativo: 1, season: 1 }; 
        } else if (candidatos.length > 0) { 
            animeDetectado = candidatos[0]; 
            totalEpisodiosAnime = candidatos[0].episodes || 1;
            return { anime: candidatos[0], total: totalEpisodiosAnime, relativo: 1, season: 1 }; 
        }
    }

    let series = listaTemporadasDetectadas.filter(t => ['tv', 'ona'].includes(t.media_type));
    if (series.length === 0) series = listaTemporadasDetectadas; 
    
    const cleanStr = (s) => s ? s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "") : "";
    const qStr = cleanStr(termoBusca);

    series.sort((a, b) => {
        const aExact = [a.title, ...(a.alternative_titles || [])].some(t => cleanStr(t) === qStr);
        const bExact = [b.title, ...(b.alternative_titles || [])].some(t => cleanStr(t) === qStr);
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        if (aExact && bExact) return (b.popularity || 0) - (a.popularity || 0);

        const aFranchise = [a.title, ...(a.alternative_titles || [])].some(t => cleanStr(t).startsWith(qStr));
        const bFranchise = [b.title, ...(b.alternative_titles || [])].some(t => cleanStr(t).startsWith(qStr));
        if (aFranchise && !bFranchise) return -1;
        if (!aFranchise && bFranchise) return 1;

        const anoA = a.year === 0 ? 9999 : a.year;
        const anoB = b.year === 0 ? 9999 : b.year;
        if (anoA !== anoB) return anoA - anoB;
        return a.mal_id - b.mal_id;
    });

    let temporadaSelecionada = series[0];
    let numBuscado = null;

    const dicionarioTemporadasFranquia = [
        { termo: "war of underworld", season: 3 },
        { termo: "alicization", season: 3 },
        { termo: "final season", season: 4 },
        { termo: "season 2", season: 2 },
        { termo: "season 3", season: 3 },
        { termo: "season 4", season: 4 }
    ];
    
    let nomeBaixo = termoBusca.toLowerCase();
    for (let regra of dicionarioTemporadasFranquia) {
        if (nomeBaixo.includes(regra.termo)) {
            numBuscado = regra.season;
            break;
        }
    }

    if (!numBuscado) {
        let mTemp = termoBusca.toLowerCase().match(/(\d+)[a-zªº]*\s*(?:temporada|season|parte|part|st)|(?:temporada|season|parte|part)\s*(\d+)/i);
        if (mTemp) numBuscado = parseInt(mTemp[1] || mTemp[2]);
    }

    if (!numBuscado && window.location.href.includes("netflix.com") && netflixTemporadaSalva > 1) { 
        numBuscado = netflixTemporadaSalva; 
    }
    
    if (termoBusca.includes("∬") || termoBusca.includes("∫∫")) numBuscado = 2;

    if (termoBusca.toLowerCase().includes("one piece")) {
        numBuscado = null;
    }

    const extrairTemporadaDeAlgarismoRomano = (titulo) => {
        if (!titulo) return null;
        let t = titulo.toUpperCase();
        if (t.endsWith(" II") || t.includes(" II ") || t.includes(" II:")) return 2;
        if (t.endsWith(" III") || t.includes(" III ") || t.includes(" III:")) return 3;
        if (t.endsWith(" IV") || t.includes(" IV ") || t.includes(" IV:")) return 4;
        if (t.endsWith(" V") || t.includes(" V ") || t.includes(" V:")) return 5;
        if (t.endsWith(" VI") || t.includes(" VI ") || t.includes(" VI:")) return 6;
        return null;
    };

    if (!numBuscado && temporadaSelecionada) {
        numBuscado = extrairTemporadaDeAlgarismoRomano(temporadaSelecionada.title) || 
                     extrairTemporadaDeAlgarismoRomano(termoBusca);
    }

    let offsetSelecionado = 0;

    if (numBuscado > 1) {
        const romanMap = { 2: " ii", 3: " iii", 4: " iv", 5: " v", 6: " vi", 7: " vii", 8: " viii", 9: " ix" };
        const wordMap = { 2: "second", 3: "third", 4: "fourth", 5: "fifth" };
        let roman = romanMap[numBuscado] || "";
        let word = wordMap[numBuscado] || "";

        let foundIdx = series.findIndex(temp => {
            let titulos = [temp.title, ...(temp.alternative_titles || [])].map(t => t.toLowerCase());
            return titulos.some(t => {
                let limpo = t.replace(/[^a-z0-9]/g, "");
                let endWithRoman = roman ? (t.endsWith(roman) || t.includes(roman + " ") || t.includes(roman + ":")) : false;
                let hasWord = word ? (t.includes(`${word} season`) || t.includes(`season ${word}`)) : false;
                
                let isGotoubunS2 = (numBuscado === 2 && t.includes("∬"));
                let isSAO3 = (numBuscado === 3 && t.includes("alicization"));

                return limpo.includes(`${numBuscado}ndseason`) || 
                       limpo.includes(`${numBuscado}rdseason`) || 
                       limpo.includes(`${numBuscado}thseason`) || 
                       t.includes(`season ${numBuscado}`) || 
                       t.includes(`season${numBuscado}`) || 
                       t.includes(`part ${numBuscado}`) || 
                       endWithRoman || 
                       hasWord || 
                       isGotoubunS2 ||
                       isSAO3;
            });
        });

        if (foundIdx === -1 && series.length >= numBuscado) { foundIdx = numBuscado - 1; }
        if (foundIdx !== -1) {
            temporadaSelecionada = series[foundIdx];
            for (let i = 0; i < foundIdx; i++) { offsetSelecionado += series[i].episodes || 12; }
        }
    }

    if (!numBuscado) {
        let acumuladorEps = 0;
        for (let i = 0; i < series.length; i++) {
            let temp = series[i];
            let limiteInferior = acumuladorEps + 1;
            let limiteSuperior = acumuladorEps + (temp.episodes || 12);
            if (epAbsolute >= limiteInferior && epAbsolute <= limiteSuperior) {
                temporadaSelecionada = temp;
                offsetSelecionado = acumuladorEps;
                break;
            }
            acumuladorEps = limiteSuperior;
        }
    }

    animeDetectado = temporadaSelecionada;
    totalEpisodiosAnime = temporadaSelecionada ? (temporadaSelecionada.episodes || 0) : 0;
    let epRelativo = epAbsolute;

    const dicionarioManualOffsets = [ 
        { titulo: "oshi no ko", temporadaFiltro: 2, subtrair: 11 },
        { titulo: "sword art online alicization war of underworld part 2", temporadaFiltro: null, subtrair: 12 }
    ];
    
    let offsetManual = null;
    let nomeLimpoBusca = termoBusca.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

    for (let regra of dicionarioManualOffsets) {
        let tituloRegra = regra.titulo.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
        if (nomeLimpoBusca.includes(tituloRegra) && (!regra.temporadaFiltro || numBuscado === regra.temporadaFiltro)) { 
            offsetManual = regra.subtrair; break; 
        }
    }

    let isAlreadyRelative = false;
    let urlParaCheck = window.location.href;
    let maxEpsTemporada = temporadaSelecionada ? (temporadaSelecionada.episodes || 24) : 24;

    if (urlParaCheck.includes("netflix.com") && netflixTemporadaSalva > 1) {
        isAlreadyRelative = true;
        if (epAbsolute > maxEpsTemporada && epAbsolute > offsetSelecionado) isAlreadyRelative = false;
    }
    if ((urlParaCheck.includes("primevideo.com") || urlParaCheck.includes("amazon.")) && numBuscado > 1) {
        isAlreadyRelative = true;
        if (epAbsolute > maxEpsTemporada && epAbsolute > offsetSelecionado) isAlreadyRelative = false;
    }

    if (offsetManual !== null) {
        devLog(`MAL Reviewer: 🧰 Dicionário Manual acionado! Subtraindo ${offsetManual} episódios.`);
        epRelativo = epAbsolute - offsetManual;
    } else if (!isAlreadyRelative && epAbsolute > offsetSelecionado && offsetSelecionado > 0) {
        epRelativo = epAbsolute - offsetSelecionado;
    } 

    if (epRelativo <= 0) epRelativo = 1;
    
    let calculatedSeason = numBuscado || (series.indexOf(temporadaSelecionada) + 1);
    if (calculatedSeason <= 0) calculatedSeason = 1;

    return { anime: animeDetectado, total: totalEpisodiosAnime, relativo: epRelativo, season: calculatedSeason };
}



// TOAST E INTERFACES VISUAIS
function injetarCSSDiscreto() {
    if (document.getElementById('mal-reviewer-css')) return;
    let oldStyle = document.getElementById('mal-reviewer-css');
    if (oldStyle) oldStyle.remove();

    let style = document.createElement('style');
    style.id = 'mal-reviewer-css';
    style.textContent = `
        #mal-overlay-container { position: fixed; bottom: 30px; right: 30px; width: 320px; background: linear-gradient(145deg, rgba(20, 20, 25, 0.95), rgba(30, 30, 40, 0.95)); backdrop-filter: blur(10px); border: 1px solid rgba(108, 92, 231, 0.3); border-top: 4px solid #6c5ce7; border-radius: 12px; padding: 16px; box-shadow: 0 15px 35px rgba(0,0,0,0.5), 0 0 15px rgba(108, 92, 231, 0.2); z-index: 2147483647 !important; font-family: 'Segoe UI', sans-serif; color: white; visibility: hidden; opacity: 0; transform: translateY(40px) scale(0.95); transition: all 0.4s cubic-bezier(0.25, 1, 0.5, 1); box-sizing: border-box; overflow: hidden; pointer-events: auto !important; }
        #mal-overlay-container.mostrar { visibility: visible; opacity: 1; transform: translateY(0) scale(1); pointer-events: auto; }
        #mal-overlay-container.micro-mode { width: 6px; height: 80px; padding: 0; right: 0; bottom: 40px; border-radius: 8px 0 0 8px; border: none; background: #6c5ce7; cursor: pointer; pointer-events: auto; opacity: 0.6; visibility: visible; transform: none; }
        #mal-overlay-container.micro-mode:hover { opacity: 1; width: 10px; }
        #mal-overlay-container.micro-mode > * { opacity: 0; pointer-events: none; display: none; }
        #mal-overlay-container.hover-mode { visibility: visible; opacity: 1; transform: translateY(0) scale(1); pointer-events: auto; width: 320px; height: auto; right: 30px; bottom: 30px; padding: 16px; border-radius: 12px; border: 1px solid rgba(108, 92, 231, 0.3); border-top: 4px solid #6c5ce7; background: linear-gradient(145deg, rgba(20, 20, 25, 0.95), rgba(30, 30, 40, 0.95)); }
        #mal-overlay-container.hover-mode > * { opacity: 1; pointer-events: auto; display: flex; }
        .overlay-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px; margin-bottom: 12px; }
        .overlay-header span { font-size: 14px; font-weight: 800; color: #a29bfe; text-transform: uppercase; letter-spacing: 0.5px; }
        .overlay-controls { display: flex; gap: 10px; }
        .close-btn, .collapse-btn { background: none; border: none; color: #888; cursor: pointer; font-size: 16px; font-weight: bold; transition: color 0.2s; padding: 0; line-height: 1; }
        .close-btn:hover { color: #ff7675; } .collapse-btn:hover { color: #a29bfe; }
        .overlay-body { display: flex; flex-direction: column; gap: 12px; }
        .overlay-info { display: flex; gap: 12px; align-items: center; }
        .overlay-info img { width: 45px; height: 65px; object-fit: cover; border-radius: 6px; box-shadow: 0 4px 10px rgba(0,0,0,0.4); }
        .btn-rate { width: 100%; background: linear-gradient(135deg, #6c5ce7, #5649c0); color: white; border: none; padding: 10px; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 13px; text-shadow: 0 1px 2px rgba(0,0,0,0.5); transition: all 0.2s; box-shadow: 0 4px 15px rgba(108, 92, 231, 0.3); }
        .btn-rate:hover { background: linear-gradient(135deg, #5649c0, #483a99); transform: translateY(-2px); box-shadow: 0 6px 20px rgba(108, 92, 231, 0.4); }
        .btn-rate:active { transform: translateY(1px); box-shadow: 0 2px 10px rgba(108, 92, 231, 0.3); }

        #mal-tracking-toast { position: fixed; bottom: 25px; left: 25px; width: 290px; background: rgba(20, 20, 25, 0.95); backdrop-filter: blur(8px); border-left: 4px solid #00b894; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.6); z-index: 2147483647 !important; color: white; font-family: 'Segoe UI', sans-serif; opacity: 0; transform: translateX(-40px); transition: left 0.5s cubic-bezier(0.25, 1, 0.5, 1), transform 0.5s cubic-bezier(0.25, 1, 0.5, 1), width 0.4s ease, height 0.4s ease, bottom 0.4s ease, opacity 0.4s ease, padding 0.4s ease, border-radius 0.4s ease, background 0.4s ease; pointer-events: none; overflow: hidden; box-sizing: border-box; }
        #toast-timer-bar { position: absolute; top: 0; left: 0; height: 3px; background: #a29bfe; width: 100%; transform-origin: left; transition: transform linear; }
        .toast-controls { position: absolute; top: 6px; right: 10px; display: flex; gap: 8px; }
        .toast-btn-top { background: none; border: none; color: #aaa; cursor: pointer; font-size: 14px; font-weight: bold; line-height: 1; padding: 0 4px; transition: color 0.15s; }
        .toast-btn-top:hover { color: white; }
        .toast-close-x { display: none; }
        .toast-collapse-btn { display: block; }

        #mal-tracking-toast.mostrar { left: 25px; transform: translateX(0); opacity: 1; pointer-events: auto !important; padding: 12px; }
        #mal-tracking-toast.hover-mode { width: 250px; padding: 12px; bottom: 25px; left: 50%; transform: translateX(-50%); border-left: 4px solid #00b894; opacity: 1; pointer-events: auto !important; height: auto; }        .season-progress-container { display: block; } .episode-progress-container { display: none; }
        #mal-tracking-toast.micro-mode { width: 120px; height: 4px; padding: 0; bottom: 20px; left: 50%; transform: translateX(-50%); border-left-width: 0; border-radius: 4px; background: rgba(0,0,0,0.5); cursor: pointer; opacity: 1; pointer-events: auto; }
        #mal-tracking-toast.micro-mode .toast-content, #mal-tracking-toast.micro-mode #toast-timer-bar { opacity: 0; pointer-events: none; visibility: hidden; }
        #mal-tracking-toast.micro-mode .micro-marker { opacity: 1 !important; }
        #mal-tracking-toast.hover-mode { width: 250px; padding: 12px; bottom: 25px; left: 50%; transform: translateX(-50%); border-left: 4px solid #00b894; opacity: 1; pointer-events: auto; height: auto; }
        #mal-tracking-toast.hover-mode .toast-content { opacity: 1; pointer-events: auto; visibility: visible; }
        #mal-tracking-toast.hover-mode .season-progress-container { display: none; }
        #mal-tracking-toast.hover-mode .episode-progress-container { display: block; }
        #mal-tracking-toast.hover-mode #toast-timer-bar { display: none; } 
        #mal-tracking-toast.hover-mode .toast-collapse-btn { display: none; }
        #mal-tracking-toast.hover-mode .toast-close-x { display: block; } 
        #mal-tracking-toast.flash-mode { width: auto; height: auto; padding: 8px 15px; border-left-width: 0; border-radius: 20px; background: rgba(0, 184, 148, 0.9); left: 25px; transform: translateX(0); opacity: 1; }
        #mal-tracking-toast.flash-mode .toast-content, #mal-tracking-toast.flash-mode #toast-timer-bar { display: none; }
        #mal-tracking-toast.flash-mode::after { content: '✔️ Episódio Marcado!'; font-weight: bold; font-size: 13px; color: white; }

        .toast-progress-bg { background: #333; height: 3px; border-radius: 2px; overflow: hidden; margin-top: 10px; }
        .toast-progress-fill-season { background: #6c5ce7; height: 100%; transition: width 0.5s ease; }
        .toast-progress-fill-ep { background: #00b894; height: 100%; width: 0%; transition: width 0.2s linear; }
        #micro-progress-fill { position: absolute; top: 0; left: 0; height: 100%; width: 0%; background: #00b894; transition: width 0.2s linear; opacity: 0; pointer-events: none; }
        #mal-tracking-toast.micro-mode #micro-progress-fill { opacity: 1; }
        .btn-wrong-anime { background: transparent; color: #ff8484; border: none; font-size: 11px; cursor: pointer; padding: 0; margin-top: 8px; transition: color 0.2s; font-weight: bold;}
        .btn-wrong-anime:hover { text-decoration: underline; color: #d63031; }
        #overlay-timer-bar { position: absolute; top: 0; left: 0; height: 4px; background: #00b894; width: 100%; transform-origin: left; transition: transform linear; z-index: 5; }

        /* CLASSES DINAMICAS TOAST */
        #mal-tracking-toast.size-exp-small.mostrar { width: 240px !important; padding: 10px !important; }
        #mal-tracking-toast.size-exp-small .toast-img-capa { width: 28px !important; height: 40px !important; }
        #mal-tracking-toast.size-exp-small .toast-text-title { font-size: 11px !important; }
        #mal-tracking-toast.size-exp-small .toast-text-sub { font-size: 9px !important; }
        #mal-tracking-toast.size-exp-small .toast-monitor-label { font-size: 8px !important; }
        #mal-tracking-toast.size-exp-small .btn-wrong-anime { font-size: 9px !important; margin-top: 5px !important; }
        #mal-tracking-toast.size-exp-small .toast-progress-bg { height: 1px !important; margin-top: 6px !important; }

        #mal-tracking-toast.size-exp-large.mostrar { width: 360px !important; padding: 18px !important; }
        #mal-tracking-toast.size-exp-large .toast-img-capa { width: 45px !important; height: 65px !important; }
        #mal-tracking-toast.size-exp-large .toast-text-title { font-size: 16px !important; }
        #mal-tracking-toast.size-exp-large .toast-text-sub { font-size: 13px !important; }
        #mal-tracking-toast.size-exp-large .toast-monitor-label { font-size: 12px !important; }
        #mal-tracking-toast.size-exp-large .btn-wrong-anime { font-size: 13px !important; margin-top: 12px !important; }
        #mal-tracking-toast.size-exp-large .toast-progress-bg { height: 5px !important; margin-top: 14px !important; }

        /* CLASSES DINAMICAS OVERLAY */
        #mal-overlay-container.size-ov-small { width: 250px !important; padding: 12px !important; }
        #mal-overlay-container.size-ov-small img { width: 35px !important; height: 50px !important; }
        #mal-overlay-container.size-ov-small .overlay-header span { font-size: 12px !important; }
        #mal-overlay-container.size-ov-small #mal-overlay-title { font-size: 12px !important; margin-bottom: 2px !important; }
        #mal-overlay-container.size-ov-small .overlay-info-text div:nth-child(2) { font-size: 10px !important; }
        #mal-overlay-container.size-ov-small .btn-rate { font-size: 11px !important; padding: 8px !important; }

        #mal-overlay-container.size-ov-large { width: 400px !important; padding: 22px !important; }
        #mal-overlay-container.size-ov-large img { width: 55px !important; height: 80px !important; }
        #mal-overlay-container.size-ov-large .overlay-header span { font-size: 16px !important; }
        #mal-overlay-container.size-ov-large #mal-overlay-title { font-size: 18px !important; margin-bottom: 8px !important; }
        #mal-overlay-container.size-ov-large .overlay-info-text div:nth-child(2) { font-size: 13px !important; }
        #mal-overlay-container.size-ov-large .btn-rate { font-size: 15px !important; padding: 14px !important; }

        
        /* 1. Painel de Avaliação */
        #mal-overlay-container.fs-discreet:not(.micro-mode) {
            width: auto !important; min-width: 0 !important; max-width: none !important;
            height: auto !important; padding: 6px 14px 6px 20px !important; border-radius: 50px !important; 
            bottom: 35px; right: 35px; display: flex !important; flex-direction: row !important; 
            align-items: center !important; justify-content: center !important; gap: 12px !important;
        }
        #mal-overlay-container.fs-discreet:not(.micro-mode) #overlay-timer-bar { top: auto; bottom: 0; height: 3px; border-radius: 0 0 50px 50px; }
        
        #mal-overlay-container.fs-discreet:not(.micro-mode) .overlay-header { margin: 0 !important; padding: 0 !important; border: none !important; width: auto !important; }
        #mal-overlay-container.fs-discreet:not(.micro-mode) .overlay-header span { font-size: 13px !important; margin: 0 !important; white-space: nowrap !important; }
        
        #mal-overlay-container.fs-discreet:not(.micro-mode) .overlay-body { margin: 0 !important; padding: 0 !important; width: auto !important; display: block !important; }
        #mal-overlay-container.fs-discreet:not(.micro-mode) .btn-rate { padding: 6px 14px !important; font-size: 11px !important; width: auto !important; border-radius: 20px !important; box-shadow: none !important; margin: 0 !important; white-space: nowrap !important; }
        
        #mal-overlay-container.fs-discreet:not(.micro-mode) .overlay-controls { display: flex !important; gap: 8px !important; margin-left: 2px !important; }
        #mal-overlay-container.fs-discreet:not(.micro-mode) .overlay-info { display: none !important; }

        /* 2. Barra Colapsada Enterrada no Chão */
        #mal-tracking-toast.fs-discreet-prog.micro-mode {
            /* 💡 COMO PUXAR MAIS PRA CIMA: Mude este valor de "8px" para "15px" ou mais se quiser ela mais alta! */
            bottom: 8px !important; 
            transform: translateX(-50%) !important; 
            opacity: 0.4 !important;
            border-radius: 4px !important; 
        }
        #mal-tracking-toast.fs-discreet-prog.micro-mode:hover {
            bottom: 25px !important;
            transform: translateX(-50%) !important;
            opacity: 1 !important;
        }

        /* 3. Pílula de Concluído "✔️" */
        #mal-tracking-toast.fs-discreet-flash-enabled.flash-mode {
            padding: 0 !important; border-radius: 50% !important; width: 36px !important; height: 36px !important; display: flex !important; justify-content: center !important; align-items: center !important; box-sizing: border-box;
        }
        #mal-tracking-toast.fs-discreet-flash-enabled.flash-mode .toast-content { display: none !important; }
        #mal-tracking-toast.fs-discreet-flash-enabled.flash-mode::after {
            content: '✔️' !important; font-size: 16px !important; margin: 0 !important; display: block !important;
        }

        /* LEGENDAS DA NETFLIX (ESTILO CRUNCHYROLL) */

        .mal-netflix-cr-subs .player-timedtext *,
        .mal-netflix-cr-subs .player-timedtext-text-container * {
            font-family: "Trebuchet MS", "Arial", sans-serif !important;
            font-weight: 900 !important;
            font-size: ${netflixSubSizeSalvo}px !important;
            color: #ffffff !important;
            background-color: transparent !important;
            text-shadow: none !important;
            -webkit-text-stroke: unset !important;
        }
        
        .mal-netflix-cr-subs .player-timedtext span:not(:has(span)) {
            letter-spacing: 0.6px !important;
            text-shadow:
                -2px -2px 0 #000,  0px -2px 0 #000,  2px -2px 0 #000,
                -2px  0px 0 #000,                    2px  0px 0 #000,
                -2px  2px 0 #000,  0px  2px 0 #000,  2px  2px 0 #000,
                 2px  3px 3px rgba(0, 0, 0, 0.8) !important;
        }


        #mal-tracking-toast *, #mal-overlay-container * {
            pointer-events: auto !important;
        }
    `;
    document.head.appendChild(style);
}

function startTimerBar(duration) {
    let bar = document.getElementById('toast-timer-bar');
    if (!bar) return;
    bar.style.transition = 'none'; bar.style.transform = 'scaleX(1)';
    requestAnimationFrame(() => { requestAnimationFrame(() => {
        bar.style.transition = `transform ${duration}ms linear`; bar.style.transform = 'scaleX(0)';
    });});
}
function pauseTimerBar() {
    let bar = document.getElementById('toast-timer-bar');
    if (!bar) return;
    bar.style.transition = 'none'; bar.style.transform = window.getComputedStyle(bar).getPropertyValue('transform');
}
function startOverlayTimerBar(duration) {
    let bar = document.getElementById('overlay-timer-bar');
    if (!bar) return;
    bar.style.transition = 'none'; bar.style.transform = 'scaleX(1)';
    requestAnimationFrame(() => { requestAnimationFrame(() => {
        bar.style.transition = `transform ${duration}ms linear`; bar.style.transform = 'scaleX(0)';
    });});
}
function pauseOverlayTimerBar() {
    let bar = document.getElementById('overlay-timer-bar');
    if (!bar) return;
    bar.style.transition = 'none'; bar.style.transform = window.getComputedStyle(bar).getPropertyValue('transform');
}

// Substitua o início de mostrarToastRastreio por este:
function mostrarToastRastreio(anime, epAtual, epTotal, seasonNum) { 
    if (window !== window.top) {
        chrome.runtime.sendMessage({
            action: "DELEGAR_TOAST_AO_TOPO",
            anime: anime,
            epAtual: epAtual,
            epTotal: epTotal,
            seasonNum: seasonNum
        });
        return;
    }

    if (window.cfgEnableToastExp === false) return;

    let toastAntigo = document.getElementById('mal-tracking-toast');
    if (toastAntigo) toastAntigo.remove(); 
    
    isToastMicro = false;
    isHoverMode = false;
    isToastDismissed = false;

    let pctTemporada = (epTotal > 0 && epAtual <= epTotal) ? (epAtual / epTotal) * 100 : 100;

    let anoToast = anime.year || (anime.aired && anime.aired.prop && anime.aired.prop.from && anime.aired.prop.from.year) || "TBA";
    let nomeEstudio = anime.studio || (anime.studios && anime.studios.length > 0 ? anime.studios[0].name : "");
    let estudioToast = nomeEstudio ? ` • ${nomeEstudio}` : "";
    let formatoToast = anime.media_type ? anime.media_type.toUpperCase() : "TV";
    let infoExtra = `${anoToast}${estudioToast} • ${formatoToast}`;
    let finalSeason = seasonNum || netflixTemporadaSalva;
    let txtTemporada = (finalSeason && finalSeason > 0) ? `T${finalSeason} • ` : "";

    injetarCSSDiscreto();
    let div = document.createElement('div');
    div.id = 'mal-tracking-toast';
    
    // Escapa as variáveis de configuração de classes de forma preventiva
    div.className = `size-exp-${escapeHTML(window.cfgSizeToastExp || 'medium')} size-micro-${escapeHTML(window.cfgSizeToastMicro || 'medium')} size-flash-${escapeHTML(window.cfgSizeToastFlash || 'medium')}`;
    
    div.innerHTML = `   
        <div id="toast-timer-bar"></div>
        <div class="toast-content">
            <div class="toast-controls">
                <button class="toast-btn-top toast-collapse-btn" title="Ocultar (Colapsar)">&#x25BC;</button>
                <button class="toast-btn-top toast-close-x" title="Fechar Rastreio">X</button>
            </div>
            <div style="display: flex; gap: 10px; align-items: center; margin-top: 4px;">
                <img class="toast-img-capa" src="${escapeHTML(anime.images?.jpg?.small_image_url || '')}" style="width: 35px; height: 50px; border-radius: 4px; object-fit: cover;">
                <div style="flex-grow: 1; min-width: 0; padding-right: 40px;">
                    <div class="toast-monitor-label" style="font-size: 10px; color: #00b894; font-weight: bold; text-transform: uppercase;">Monitorando Anime</div>
                    <div class="toast-text-title" style="font-size: 13px; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHTML(anime.title)}</div>
                    <div class="toast-text-sub" style="font-size: 11px; color: #aaa;">${escapeHTML(txtTemporada)}Episódio ${escapeHTML(epAtual)} / ${escapeHTML(epTotal || '?')}</div>
                </div>
            </div>
            
            <div class="toast-progress-bg" style="position: relative;">
                <div class="toast-progress-fill-season season-progress-container" style="width: ${pctTemporada}%; position: absolute; top: 0; left: 0;"></div>
                
                <div class="episode-progress-container" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;">
                    <div class="toast-progress-fill-ep hover-episode-fill"></div>
                    <div id="marker-sync" title="Ponto de sincronização no MAL" style="position: absolute; top: 0; bottom: 0; width: 2px; background: #fdcb6e; left: 80%; z-index: 2; transition: background 0.3s; box-shadow: 0 0 4px #fdcb6e; border-radius: 2px;"></div>
                    <div id="marker-rate" title="Ponto de Avaliação da Obra" style="position: absolute; top: 0; bottom: 0; width: 2px; background: #a29bfe; left: 90%; z-index: 2; transition: background 0.3s; box-shadow: 0 0 4px #a29bfe; border-radius: 2px; display: none;"></div>
                </div>
            </div>
            
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
                <span style="font-size: 10px; color: #888; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px;" title="${escapeHTML(infoExtra)}">${escapeHTML(infoExtra)}</span>
                <button id="btnWrongAnime" class="btn-wrong-anime">Anime/Episódio errado?</button>
            </div>
        </div>
        
        <div id="micro-progress-fill"></div>
        <div id="micro-marker-sync" class="micro-marker" style="position: absolute; top: 0; bottom: 0; width: 2px; background: #fdcb6e; left: 80%; z-index: 2; transition: background 0.3s; box-shadow: 0 0 4px #fdcb6e; opacity: 0; pointer-events: none; border-radius: 2px;"></div>
        <div id="micro-marker-rate" class="micro-marker" style="position: absolute; top: 0; bottom: 0; width: 2px; background: #a29bfe; left: 90%; z-index: 2; transition: background 0.3s; box-shadow: 0 0 4px #a29bfe; display: none; opacity: 0; pointer-events: none; border-radius: 2px;"></div>
    `;
    
    const fixarNoContainerCerto = () => {
        let currentFs = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
        if (currentFs && window.cfgAllowInFullscreen !== false) {
            let targetAppend = currentFs;
            if (targetAppend.tagName === 'VIDEO' && targetAppend.parentElement) {
                targetAppend = targetAppend.parentElement;
            }
            targetAppend.appendChild(div);
            
            if (window.cfgDiscreetProgressFs) div.classList.add('fs-discreet-prog');
            else div.classList.remove('fs-discreet-prog');
            if (window.cfgDiscreetFlashFs) div.classList.add('fs-discreet-flash-enabled');
            else div.classList.remove('fs-discreet-flash-enabled');
        } else {
            // 🔥 CORREÇÃO: Aplica a fixação interna no player APENAS no Google Drive. 
            // Todos os outros sites (Netflix, Crunchyroll, etc.) continuam usando o document.body padrão.
            if (window.location.href.includes("drive.google.com")) {
                let playerContainer = obterPlayerContainer();
                playerContainer.appendChild(div);
            } else {
                document.body.appendChild(div);
            }
            div.classList.remove('fs-discreet-prog', 'fs-discreet-flash-enabled');
        }
    };

    fixarNoContainerCerto();
    
    const listenerTelaCheia = () => {
        if (!div || !div.parentElement) { 
            document.removeEventListener('fullscreenchange', listenerTelaCheia); 
            return; 
        }
        fixarNoContainerCerto();
    };
    document.addEventListener('fullscreenchange', listenerTelaCheia);

    const collapse = () => {
        if (isToastDismissed) return;
        isToastMicro = true;
        isHoverMode = false;
        div.classList.remove('mostrar', 'hover-mode');
        div.classList.add('micro-mode');
    };

    setTimeout(() => {
        div.classList.add('mostrar');
        startTimerBar(6000);
        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(collapse, 6000);
    }, 50);

    div.querySelector('.toast-close-x').addEventListener('click', () => {
        isToastDismissed = true;
        clearTimeout(toastTimeout);
        div.classList.remove('mostrar', 'micro-mode', 'hover-mode', 'flash-mode');
        setTimeout(() => div.remove(), 400);
    });
    
    div.querySelector('.toast-collapse-btn').addEventListener('click', () => {
        clearTimeout(toastTimeout);
        collapse();
    });
    
    let btnWrong = div.querySelector('#btnWrongAnime');
    if (isCorrecaoManual || offsetManualFix !== 0) {
        btnWrong.textContent = "Desfazer Correção";
        btnWrong.style.color = "#a29bfe"; 
        btnWrong.addEventListener('click', () => {
            let epAbs = detectarEpisodioAtual() || 1;
            removerCorrecaoGeral(epAbs, () => {
                devLog("MAL Reviewer: Correção manual removida.");
                isCorrecaoManual = false;
                offsetManualFix = 0;
                isToastDismissed = true;
                div.remove();
                resetarMonitoramento(); 
            });
        });
    } else {
        btnWrong.addEventListener('click', () => {
            lastCorrectionClickTime = Date.now(); 
            chrome.storage.local.set({ isCorrectionMode: true }, () => {
                chrome.storage.local.get(['viewMode', 'forceSidePanel'], (res) => {
                    let force = res.forceSidePanel ?? true;
                    if (res.viewMode === 'sidepanel' || force) {
                        chrome.runtime.sendMessage({ action: 'openSidePanel' }, (response) => {
                            if (!response || !response.success) {
                                btnWrong.textContent = "Abra a extensão lá em cima ↗️";
                                btnWrong.style.color = "#a29bfe"; btnWrong.style.textDecoration = "none";
                                clearTimeout(toastTimeout); startTimerBar(5000); toastTimeout = setTimeout(collapse, 5000);
                            } else {
                                isToastDismissed = true; div.remove();
                            }
                        });
                    } else {
                        btnWrong.textContent = "Abra a extensão lá em cima ↗️";
                        btnWrong.style.color = "#a29bfe"; btnWrong.style.textDecoration = "none";
                        clearTimeout(toastTimeout); startTimerBar(5000); toastTimeout = setTimeout(collapse, 5000);
                    }
                });
            });
        });
    }

    div.addEventListener('mouseenter', () => {
        clearTimeout(toastTimeout);
        pauseTimerBar();
        if (isToastMicro) {
            div.classList.remove('micro-mode');
            div.classList.add('hover-mode');
            isHoverMode = true;
            isToastMicro = false;
        }
    });

    div.addEventListener('mouseleave', () => {
        if (isHoverMode) {
            startTimerBar(1000);
            toastTimeout = setTimeout(collapse, 1000);
        } else if (!isToastMicro && div.classList.contains('mostrar')) {
            startTimerBar(3000);
            toastTimeout = setTimeout(collapse, 3000);
        }
    });
}

function verificarSeJaTemNotaEExibir() {
    if (!animeDetectado) return;
    chrome.storage.local.get([animeDetectado.title], (res) => {
        if (res[animeDetectado.title] && res[animeDetectado.title].media) {
            devLog("MAL Reviewer: Obra já avaliada. Ocultando aviso de fim de temporada.");
            return;
        }
        verificarEExibirOverlay();
    });
}

function verificarEExibirOverlay() {
    let isFullscreen = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
    
    if (isFullscreen && window.cfgAllowInFullscreen === false) {
        const exitHandler = () => {
            let nowFs = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
            if (!nowFs) {
                mostrarOverlay();
                ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(e => document.removeEventListener(e, exitHandler));
            }
        };
        ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(e => document.addEventListener(e, exitHandler));
    } else {
        mostrarOverlay();
    }
}

function mostrarOverlay() {
    if (window !== window.top) {
        chrome.runtime.sendMessage({
            action: "DELEGAR_OVERLAY_AO_TOPO",
            anime: animeDetectado
        });
        return;
    }

    if (!animeDetectado || isOverlayDismissed || window.cfgEnableOverlay === false) return; 
    if (document.getElementById('mal-overlay-container')) return; 
    
    injetarCSSDiscreto(); 
    isOverlayMicro = false; isOverlayHover = false; isOverlayDismissed = false;

    let div = document.createElement('div');
    div.id = 'mal-overlay-container';
    div.className = `size-ov-${escapeHTML(window.cfgSizeOverlay || 'medium')}`;
    
    div.innerHTML = `
        <div id="overlay-timer-bar"></div>
        <div class="overlay-header">
            <span>Fim de Temporada!</span>
            <div class="overlay-controls">
                <button class="collapse-btn" title="Ocultar (Colapsar)">&#x25BC;</button>
                <button class="close-btn" title="Fechar">✖</button>
            </div>
        </div>
        <div class="overlay-body">
            <div class="overlay-info">
                <img id="mal-overlay-img" src="${escapeHTML(animeDetectado.images?.jpg?.small_image_url || "")}" alt="Capa">
                <div class="overlay-info-text">
                    <div id="mal-overlay-title" style="font-weight:800; font-size:14px; line-height: 1.2; margin-bottom: 6px;">${escapeHTML(animeDetectado.title || "")}</div>
                    <div style="font-size:11px; color:#aaa">Deseja avaliar a parte técnica?</div>
                </div>
            </div>
            <button class="btn-rate" id="btnOpenExtension">AVALIAR OBRA</button>
        </div>
    `;

    const fixarNoContainerCerto = () => {
        let currentFs = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
        
        if (currentFs && window.cfgAllowInFullscreen !== false) {
            let targetAppend = currentFs;
            if (targetAppend.tagName === 'VIDEO' && targetAppend.parentElement) {
                targetAppend = targetAppend.parentElement;
            }
            targetAppend.appendChild(div);
            if (window.cfgDiscreetOverlayFs) div.classList.add('fs-discreet');
            else div.classList.remove('fs-discreet');
        } else {
            if (window.location.href.includes("drive.google.com")) {
                let playerContainer = obterPlayerContainer();
                playerContainer.appendChild(div);
            } else {
                document.body.appendChild(div);
            }
            div.classList.remove('fs-discreet');
        }
    };

    fixarNoContainerCerto();

    const listenerTelaCheia = () => {
        if (!div || !div.parentElement) { 
            document.removeEventListener('fullscreenchange', listenerTelaCheia); 
            return; 
        }
        fixarNoContainerCerto();
    };
    document.addEventListener('fullscreenchange', listenerTelaCheia);

    const fecharTotalmente = () => { isOverlayDismissed = true; div.classList.remove('mostrar', 'hover-mode', 'micro-mode'); setTimeout(() => div.remove(), 400); };
    const colapsarParaBorda = () => {
        if (!isOverlayDismissed) { isOverlayMicro = true; isOverlayHover = false; div.classList.remove('mostrar', 'hover-mode'); div.classList.add('micro-mode'); }
    };

    div.querySelector('.close-btn').addEventListener('click', fecharTotalmente);
    div.querySelector('.collapse-btn').addEventListener('click', () => { clearTimeout(overlayTimeoutTimer); colapsarParaBorda(); });

    div.addEventListener('mouseenter', () => {
        clearTimeout(overlayTimeoutTimer); pauseOverlayTimerBar();
        if (isOverlayMicro) { div.classList.remove('micro-mode'); div.classList.add('hover-mode'); isOverlayHover = true; isOverlayMicro = false; }
    });

    div.addEventListener('mouseleave', () => {
        let currentFs = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
        let tempoSaida = (currentFs && window.cfgAllowInFullscreen !== false) ? 5000 : 5000;

        if (isOverlayHover || div.classList.contains('mostrar')) { 
            startOverlayTimerBar(tempoSaida); 
            overlayTimeoutTimer = setTimeout(colapsarParaBorda, tempoSaida); 
        }
    });

    let currentFs = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
    let tempoExibicao = (currentFs && window.cfgAllowInFullscreen !== false) ? 5000 : 20000;

    setTimeout(() => { div.classList.add('mostrar'); startOverlayTimerBar(tempoExibicao); }, 50);
    overlayTimeoutTimer = setTimeout(colapsarParaBorda, tempoExibicao);

    div.querySelector('#btnOpenExtension').addEventListener('click', () => {
        chrome.storage.local.set({ 'ultimoAnimeDetectado': animeDetectado.title, 'ultimoAnimeDetectadoExato': animeDetectado });
        
        const exibirMensagemDeClique = () => {
            div.querySelector('.overlay-body').innerHTML = `
                <div style="text-align: center; padding: 15px 5px; animation: fadeIn 0.4s;">
                    <div style="font-size: 30px; margin-bottom: 10px;">🧩</div>
                    <div style="font-size: 14px; color: #fff; font-weight: bold;">Abra a extensão</div>
                    <div style="font-size: 12px; color: #a29bfe; margin-top: 6px;">Clique no ícone na barra superior!</div>
                </div>`;
            setTimeout(fecharTotalmente, 4500);
        };

        chrome.storage.local.get(['viewMode', 'forceSidePanel'], (res) => {
            let force = res.forceSidePanel ?? true;
            if (res.viewMode === 'sidepanel' || force) {
                chrome.runtime.sendMessage({ action: 'openSidePanel' }, (response) => {
                    if (response && response.success) fecharTotalmente(); else exibirMensagemDeClique();
                });
            } else { 
                exibirMensagemDeClique(); 
            }
        });
    });
}


// OBSERVADOR DE LEGENDAS NETFLIX

let netflixSubObserver = null;
let netflixParentObserver = null;

function forcarLegendasCrunchyrollNetflix() {
    if (!window.location.href.includes("netflix.com")) return;
    
    if (netflixSubObserver || netflixParentObserver) return;

    devLog("MAL Reviewer: 👁️ Observador de Legendas Ativado (Otimizado).");

    const aplicarEstiloSpan = (span) => {
        if (span.getAttribute('data-legenda-modificada') !== 'true') {
            span.style.setProperty('font-family', '"Trebuchet MS", "Arial", sans-serif', 'important');
            span.style.setProperty('font-weight', '900', 'important');
            span.style.setProperty('color', '#ffffff', 'important');
            span.style.setProperty('background-color', 'transparent', 'important');
            span.style.setProperty('text-shadow', '-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000, -3px 0 0 #000, 3px 0 0 #000, 0 -3px 0 #000, 0 3px 0 #000', 'important');
            span.setAttribute('data-legenda-modificada', 'true');
        }
    };

    const iniciarObservadorLegendas = (container) => {
        if (netflixSubObserver) netflixSubObserver.disconnect();

        netflixSubObserver = new MutationObserver((mutations) => {
            for (let mutation of mutations) {
                if (mutation.addedNodes.length > 0) {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.tagName === 'SPAN') {
                                aplicarEstiloSpan(node);
                            }
                            let nestedSpans = node.querySelectorAll('span');
                            nestedSpans.forEach(aplicarEstiloSpan);
                        }
                    });
                }
            }
        });

        netflixSubObserver.observe(container, {
            childList: true,
            subtree: true
        });

        container.querySelectorAll('span').forEach(aplicarEstiloSpan);
    };

    let subtitleContainer = document.querySelector('.player-timedtext, .player-timedtext-text-container');
    if (subtitleContainer) {
        iniciarObservadorLegendas(subtitleContainer);
        return;
    }

    netflixParentObserver = new MutationObserver((mutations, obs) => {
        let targetContainer = document.querySelector('.player-timedtext, .player-timedtext-text-container');
        if (targetContainer) {
            iniciarObservadorLegendas(targetContainer);
            obs.disconnect();
            netflixParentObserver = null;
        }
    });

    netflixParentObserver.observe(document.body, {
        childList: true,
        subtree: true
    });
}

function obterPlayerContainer() {
let video = window.videoSendoMonitorado || document.querySelector('video');
if (!video) return document.body;

let el = video;
while (el && el !== document.body) {
    if (el.tagName === 'SECTION' && el.getAttribute('aria-label') === 'Player de vídeo') {
        return el;
    }
    if (el.tagName === 'DIV' && (el.classList.contains('html5-video-player') || el.classList.contains('drive-viewer-video-player'))) {
        return el;
    }
    if (el.hasAttribute('data-fullscreen-control-supported')) {
        return el;
    }
    el = el.parentElement;
}

return video.parentElement || document.body;
}

// Executa o flash de confirmação de conclusão de forma isolada
function forcarFlashLocal() {
    let toast = document.getElementById('mal-tracking-toast');
    if (!toast) {
        if (animeDetectado) {
            mostrarToastRastreio(animeDetectado, episodioRelativoAtual, totalEpisodiosAnime);
            toast = document.getElementById('mal-tracking-toast');
        }
    }
    if (!toast || isToastDismissed) return;

    clearTimeout(toastTimeout); 
    toast.style.display = 'block';

    let extraClasses = [];
    let isFs = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
    if (isFs && window.cfgAllowInFullscreen !== false) {
        if (window.cfgDiscreetProgressFs) extraClasses.push('fs-discreet-prog');
        if (window.cfgDiscreetFlashFs) extraClasses.push('fs-discreet-flash-enabled');
    }

    toast.className = `mostrar flash-mode size-flash-${window.cfgSizeToastFlash || 'medium'} ${extraClasses.join(' ')}`;
    
    setTimeout(() => { 
        if (isToastDismissed) return;
        toast.className = `mostrar micro-mode size-micro-${window.cfgSizeToastMicro || 'medium'} size-exp-${window.cfgSizeToastExp || 'medium'} ${extraClasses.join(' ')}`;
        isToastMicro = true;
        isHoverMode = false;
    }, 3000);
}

// Reseta o monitoramento localmente no topo sem gerar disparos em loop
function resetarMonitoramentoLocalOnly() {
    if (netflixSubObserver) { netflixSubObserver.disconnect(); netflixSubObserver = null; }
    if (netflixParentObserver) { netflixParentObserver.disconnect(); netflixParentObserver = null; }

    monitorando = false;
    animeDetectado = null;
    overlayCriado = false;
    totalEpisodiosAnime = 0;
    numeroEpisodioAtual = null; 
    malProgressoSincronizado = false;
    verificandoNota = false;  
    termoBuscaOriginal = "";
    isCorrecaoManual = false;
    episodioRelativoAtual = 1;
    netflixTituloSalvo = "";
    netflixTemporadaSalva = null;
    netflixEpisodioSalvo = null;
    netflixUniqueIdSalvo = null;
    idPlataformaAtual = null;
    offsetManualFix = 0;
        
    window.ultimoEpProcessadoOTM = null;
    window.videoSendoMonitorado = null;
    window.lastUrlMonitorada = null;
    window.lastEpisodioDetectado = null;
    
    let sondaDiv = document.getElementById('mal-reviewer-netflix-data');
    if (sondaDiv) { sondaDiv.innerText = ""; sondaDiv.removeAttribute('data-video'); }
    
    const overlayAntigo = document.getElementById('mal-overlay-container');
    if (overlayAntigo) overlayAntigo.remove();

    const toastAntigo = document.getElementById('mal-tracking-toast');
    if (toastAntigo) {
        isToastDismissed = true; 
        clearTimeout(toastTimeout);
        toastAntigo.remove();
    }
}