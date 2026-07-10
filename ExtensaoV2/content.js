let monitorando = false;
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

let cfgAutoUpdateProgress = true;      
let cfgAutoUpdateTrigger = '80percent'; 
let cfgAutoCompleteOnLast = true;      
let cfgBlockRegressionOnComplete = true;
let cfgAutoOpenOverlayIfNoScore = true;



const intervaloCheck = setInterval(() => {
    let url = window.location.href;

    if (url.includes("netflix.com")) {
        // Se estiver na Netflix e não for a URL /watch/ ou /title/, mata o rastreio!
        if (!url.includes("/watch/") && !url.includes("/title/")) {
            if (monitorando) resetarMonitoramento();
            return; 
        }

        // 👉 A CORREÇÃO ESTÁ AQUI: Avisa o background para injetar a sonda na Netflix
        if (!sondaNetflixSolicitada) {
            sondaNetflixSolicitada = true;
            chrome.runtime.sendMessage({ action: 'INJETAR_SONDA_NETFLIX' });
        }

        let playerContainer = document.querySelector('[data-videoid]');
        let videoIdDetectado = playerContainer ? playerContainer.getAttribute('data-videoid') : null;

        if (videoIdDetectado && videoIdDetectado !== videoIdAtual) {
            videoIdAtual = videoIdDetectado;
            resetarMonitoramento();
        }
    } else if (url !== urlAtual) {
        urlAtual = url;
        resetarMonitoramento();
    }

    let video = document.querySelector('video');
    // Ignora vídeos muito curtos (Trailers menores que 2.5 minutos / 150 segundos)
    if (video && !monitorando && video.duration > 150) {
        chrome.storage.local.get(['customUrls'], (res) => {
            const urlsPermitidas = ["netflix.com", "crunchyroll.com", "primevideo.com", "amazon.com/gp/video", "drive.google.com"];
            const sitesCustomizados = res.customUrls || [];
            urlsPermitidas.push(...sitesCustomizados);

            const siteEhMonitorado = urlsPermitidas.some(site => url.includes(site));

            if (siteEhMonitorado && (video.src || video.querySelector('source'))) {
                monitorando = true;
                iniciarMonitoramento(video);
            }
        });
    }
}, 3000);

function resetarMonitoramento() {
    monitorando = false;
    animeDetectado = null;
    overlayCriado = false;
    totalEpisodiosAnime = 0;
    numeroEpisodioAtual = null; 
    malProgressoSincronizado = false;
    verificandoNota = false;
    
    const overlayAntigo = document.getElementById('mal-overlay-container');
    if (overlayAntigo) overlayAntigo.remove();

    const toastAntigo = document.getElementById('mal-tracking-toast');
    if (toastAntigo) toastAntigo.remove();
}

function iniciarMonitoramento(video) {
    console.log("MAL Reviewer: Vídeo detectado. Monitorando...");
    console.log("MAL Reviewer: Episódio detectado no player:", detectarEpisodioAtual());

    chrome.storage.local.get([
        'autoUpdateProgress', 'autoUpdateTrigger', 'autoCompleteOnLast', 
        'blockRegressionOnComplete', 'autoOpenOverlayIfNoScore', 
        'enableTrackingToast', 'showFlashInFullscreen', 'enableRatingOverlay',
        'sizeToastExp', 'sizeToastMicro', 'sizeToastFlash', 'sizeOverlay'
    ], (res) => {
        cfgAutoUpdateProgress = res.autoUpdateProgress ?? true;
        cfgAutoUpdateTrigger = res.autoUpdateTrigger ?? '80percent';
        cfgAutoCompleteOnLast = res.autoCompleteOnLast ?? true;
        cfgBlockRegressionOnComplete = res.blockRegressionOnComplete ?? true;
        cfgAutoOpenOverlayIfNoScore = res.autoOpenOverlayIfNoScore ?? true;
        
        window.cfgEnableTrackingToast = res.enableTrackingToast ?? true;
        window.cfgShowFlashInFullscreen = res.showFlashInFullscreen ?? true;
        window.cfgEnableRatingOverlay = res.enableRatingOverlay ?? true;
        
        window.cfgSizeToastExp = res.sizeToastExp || 'medium';
        window.cfgSizeToastMicro = res.sizeToastMicro || 'medium';
        window.cfgSizeToastFlash = res.sizeToastFlash || 'medium';
        window.cfgSizeOverlay = res.sizeOverlay || 'medium';
    });

    detectarNomeAnime().then(nome => {
        if(nome) {
            buscarDadosNoJikan(nome);
        }
    });

    video.addEventListener('timeupdate', () => {
        const isCompleted = animeDetectado && animeDetectado.my_list_status && animeDetectado.my_list_status.status === 'completed';
        
        const bloquearEnvio = cfgBlockRegressionOnComplete && isCompleted;

        if (!isToastDismissed && video.duration > 0) {
            let pct = (video.currentTime / video.duration) * 100;
            
            let microFill = document.getElementById('micro-progress-fill');
            if (microFill) microFill.style.width = `${pct}%`;

            let hoverFill = document.querySelector('.hover-episode-fill');
            if (hoverFill) hoverFill.style.width = `${pct}%`;
        }

        if (!totalEpisodiosAnime || totalEpisodiosAnime === 0) return;

        let epAbsVal = detectarEpisodioAtual();
        let ehFilme = epAbsVal === null; 
        let epAbsolute = epAbsVal || 1;
        
        let duracaoMinutos = video.duration > 0 ? (video.duration / 60) : 0;

        let analise = selecionarTemporadaAdequada(epAbsolute, duracaoMinutos, ehFilme, animeDetectado ? animeDetectado.title : "");
        if (!analise || !totalEpisodiosAnime || totalEpisodiosAnime === 0) return;

        let epRelativo = analise.relativo;

        if (cfgAutoUpdateProgress && !malProgressoSincronizado && !bloquearEnvio && animeDetectado && animeDetectado.mal_id && video.duration > 0) {
            let alcancouGatilho = false;

            if (cfgAutoUpdateTrigger === '15min') {
                alcancouGatilho = video.currentTime >= 900;
            } else if (cfgAutoUpdateTrigger === '5min_left') {
                alcancouGatilho = (video.duration - video.currentTime <= 300) && video.duration > 300;
            } else {
                alcancouGatilho = (video.currentTime / video.duration) >= 0.8;
            }

            if (alcancouGatilho) {
                malProgressoSincronizado = true;
                
                let statusParaEnviar = 'watching';
                let epParaEnviar = epRelativo;

                // TRATAMENTO PARA FILMES DIVIDIDOS EM EPISÓDIOS (Ex: Kaguya First Kiss)
                if (animeDetectado.is_split_movie) {
                    if (epRelativo < totalEpisodiosAnime) {
                        epParaEnviar = 0;
                    } else {
                        epParaEnviar = 1;
                        statusParaEnviar = 'completed';
                    }
                } 
                else if (cfgAutoCompleteOnLast && epRelativo === totalEpisodiosAnime) {
                    statusParaEnviar = 'completed';
                }

                if (statusParaEnviar === 'completed') {
                    if (!animeDetectado.my_list_status) animeDetectado.my_list_status = {};
                    animeDetectado.my_list_status.status = 'completed';
                }

                sincronizarProgressoNoMAL(animeDetectado.mal_id, epParaEnviar, statusParaEnviar);

                if (!isToastDismissed) {
                    
                    const executarFlash = () => {
                        let toast = document.getElementById('mal-tracking-toast');
                        
                        if (!toast) {
                            injetarCSSDiscreto();
                            toast = document.createElement('div');
                            toast.id = 'mal-tracking-toast';
                            document.body.appendChild(toast);
                        }

                        let isFs = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
                        
                        if (isFs && window.cfgShowFlashInFullscreen) {
                            isFs.appendChild(toast); 
                        }

                        clearTimeout(toastTimeout); 
                        toast.style.display = 'block';
                        toast.className = 'mostrar flash-mode';
                        
                        setTimeout(() => { 
                            toast.classList.remove('mostrar', 'flash-mode');
                            setTimeout(() => { toast.remove(); isToastDismissed = true; }, 400); 
                        }, 3000);
                    };

                    let isFs = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
                    
                    if (isFs && !window.cfgShowFlashInFullscreen) {
                        let toastExistente = document.getElementById('mal-tracking-toast');
                        if(toastExistente) toastExistente.style.display = 'none'; 
                        
                        const exitFsHandler = () => {
                            let nowFs = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
                            if (!nowFs) {
                                executarFlash();
                                ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(e => document.removeEventListener(e, exitFsHandler));
                            }
                        };
                        ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(e => document.addEventListener(e, exitFsHandler));
                    } else {
                        executarFlash();
                    }
                }
            }
        }
        
        if (epRelativo === totalEpisodiosAnime) {
            let tempoRestante = video.duration - video.currentTime;
            let ehFim = (tempoRestante < 120 && video.duration > 300); 

            if (ehFim && !overlayCriado) {
                overlayCriado = true;
                verificarSeJaTemNotaEExibir();
            }
        }
    });
}

function sincronizarProgressoNoMAL(animeId, ep, status = 'watching') {
    console.log(`MAL Reviewer: Enviando atualização de progresso automática para o MAL. Status: ${status}, Episódio: ${ep}`);
    chrome.runtime.sendMessage({ action: 'sincronizarEpisodioMAL', animeId: animeId, episodio: ep, status: status }, (response) => {
        if (chrome.runtime.lastError) return;
        if (response && response.success) {
            console.log(`MAL Reviewer: Progresso (${status}) atualizado com sucesso no MAL!`);
        }
    });
}

function obterEpisodioRelativo(epAbsolute, totalMAL) {
    if (!totalMAL || epAbsolute <= totalMAL) return epAbsolute;
    let rel = epAbsolute % totalMAL;
    return rel === 0 ? totalMAL : rel;
}

function detectarEpisodioAtual() {
    let url = window.location.href;
    let numeroEncontrado = null;
    
    // Netflix
    if (url.includes("netflix.com")) {
        let metaNetflix = extrairMetadadosNetflix();
        
        // MÁGICA 1: Tenta ler o Cache Invisível extraído da Memória RAM
        if (metaNetflix && metaNetflix.episode) {
            numeroEncontrado = metaNetflix.episode;
            numeroEpisodioAtual = numeroEncontrado;
            // LOG REMOVIDO PARA EVITAR LOOP
            return numeroEncontrado;
        }

        // Fallback: Lê a tela se o cache falhar ou demorar
        let tituloContainer = document.querySelector('[data-uia="video-title"]');
        if (tituloContainer) {
            let spans = tituloContainer.querySelectorAll('span');
            for (let span of spans) {
                let match = span.innerText.match(/E\s*:?\s*(\d+)/i) || 
                            span.innerText.match(/Episódio\s*(\d+)/i) || 
                            span.innerText.match(/Episode\s*(\d+)/i) || 
                            span.innerText.match(/Ep\.\s*(\d+)/i);
                if (match) {
                    numeroEncontrado = parseInt(match[1]);
                    break;
                }
            }
        }
        if (numeroEncontrado) numeroEpisodioAtual = numeroEncontrado;
        else numeroEncontrado = numeroEpisodioAtual;
    }
    // CRUNCHYROLL
    else if (url.includes("crunchyroll.com")) {
        let meta = extrairMetadadosCrunchyroll();
        if (meta.success && meta.numEpisodio !== undefined && meta.numEpisodio !== null) {
            // LOG REMOVIDO PARA EVITAR LOOP
            return parseInt(meta.numEpisodio);
        }

        let tituloAba = document.title;
        let match = tituloAba.match(/Episódio\s*(\d+)/i) || 
                    tituloAba.match(/Episode\s*(\d+)/i) || 
                    tituloAba.match(/E(\d+)/i);
        
        if (match) return parseInt(match[1]);
    } 
    else if (url.includes("primevideo.com") || url.includes("amazon.com/gp/video")) {
        let overlaySubtitle = document.querySelector('.atvwebplayersdk-subtitle-text')?.innerText;
        if (overlaySubtitle) {
            let match = overlaySubtitle.match(/Episódio\s*(\d+)/i) || 
                        overlaySubtitle.match(/Episode\s*(\d+)/i) || 
                        overlaySubtitle.match(/Ep\.\s*(\d+)/i);
            if (match) numeroEncontrado = parseInt(match[1]);
        }
    }// UNIVERSAL
    else {
        let parts = url.replace(/\/$/, '').split('/');
        let lastPart = parts[parts.length - 1];
        
        if (!isNaN(lastPart) && lastPart.length > 0 && lastPart.length <= 4) {
            numeroEncontrado = parseInt(lastPart);
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
                let match = t.match(/Epis[óo]dio\s*(\d+)/i) || 
                            t.match(/Episode\s*(\d+)/i) || 
                            t.match(/Ep\.\s*(\d+)/i) ||
                            t.match(/Ep\s*(\d+)/i);
                if (match) {
                    numeroEncontrado = parseInt(match[1]);
                    break;
                }
            }
        }
    }

    return numeroEncontrado;
}

function injetarCSSDiscreto() {
    if (document.getElementById('mal-reviewer-css')) return;
    let style = document.createElement('style');
    style.id = 'mal-reviewer-css';
    style.textContent = `
        /* --- CSS do Fim de Temporada --- */
         #mal-overlay-container { 
            position: fixed; bottom: 30px; right: 30px; width: 320px; 
            background: linear-gradient(145deg, rgba(20, 20, 25, 0.95), rgba(30, 30, 40, 0.95)); 
            backdrop-filter: blur(10px); border: 1px solid rgba(108, 92, 231, 0.3); 
            border-top: 4px solid #6c5ce7; border-radius: 12px; padding: 16px; 
            box-shadow: 0 15px 35px rgba(0,0,0,0.5), 0 0 15px rgba(108, 92, 231, 0.2); 
            z-index: 2147483647; font-family: 'Segoe UI', sans-serif; color: white; 
            visibility: hidden; opacity: 0; transform: translateY(40px) scale(0.95); 
            transition: all 0.4s cubic-bezier(0.25, 1, 0.5, 1);
            box-sizing: border-box; overflow: hidden;
        }
        
        #mal-overlay-container.mostrar { visibility: visible; opacity: 1; transform: translateY(0) scale(1); pointer-events: auto; }
        
        /* ESTADO COLAPSADO (Grudado na direita) */
        #mal-overlay-container.micro-mode {
            width: 6px; height: 80px; padding: 0; right: 0; bottom: 40px;
            border-radius: 8px 0 0 8px; border: none; background: #6c5ce7;
            cursor: pointer; pointer-events: auto; opacity: 0.6; visibility: visible; transform: none;
        }
        #mal-overlay-container.micro-mode:hover { opacity: 1; width: 10px; }
        #mal-overlay-container.micro-mode > * { opacity: 0; pointer-events: none; display: none; }

        /* ESTADO HOVER (Expande de novo) */
        #mal-overlay-container.hover-mode {
            visibility: visible; opacity: 1; transform: translateY(0) scale(1); pointer-events: auto;
            width: 320px; height: auto; right: 30px; bottom: 30px; padding: 16px;
            border-radius: 12px; border: 1px solid rgba(108, 92, 231, 0.3); border-top: 4px solid #6c5ce7;
            background: linear-gradient(145deg, rgba(20, 20, 25, 0.95), rgba(30, 30, 40, 0.95));
        }
        #mal-overlay-container.hover-mode > * { opacity: 1; pointer-events: auto; display: flex; }
        
        /* Controles do Cabeçalho */
        .overlay-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px; margin-bottom: 12px; }
        .overlay-header span { font-size: 14px; font-weight: 800; color: #a29bfe; text-transform: uppercase; letter-spacing: 0.5px; }
        .overlay-controls { display: flex; gap: 10px; }
        .close-btn { background: none; border: none; color: #888; cursor: pointer; font-size: 16px; font-weight: bold; transition: color 0.2s; padding: 0; line-height: 1; }
        .close-btn:hover { color: #ff7675; }
        .collapse-btn { background: none; border: none; color: #888; cursor: pointer; font-size: 14px; font-weight: bold; transition: color 0.2s; padding: 0; line-height: 1; }
        .collapse-btn:hover { color: #a29bfe; }
        
        .overlay-body { display: flex; flex-direction: column; gap: 12px; }
        .overlay-info { display: flex; gap: 12px; align-items: center; }
        .overlay-info img { width: 45px; height: 65px; object-fit: cover; border-radius: 6px; box-shadow: 0 4px 10px rgba(0,0,0,0.4); }
        .btn-rate { width: 100%; background: linear-gradient(135deg, #6c5ce7, #5649c0); color: white; border: none; padding: 10px; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 13px; text-shadow: 0 1px 2px rgba(0,0,0,0.5); transition: all 0.2s; box-shadow: 0 4px 15px rgba(108, 92, 231, 0.3); }
        .btn-rate:hover { background: linear-gradient(135deg, #5649c0, #483a99); transform: translateY(-2px); box-shadow: 0 6px 20px rgba(108, 92, 231, 0.4); }
        .btn-rate:active { transform: translateY(1px); box-shadow: 0 2px 10px rgba(108, 92, 231, 0.3); }

        #mal-tracking-toast {
            position: fixed; 
            bottom: 25px; 
            left: 25px; 
            width: 290px; 
            background: rgba(20, 20, 25, 0.95); backdrop-filter: blur(8px); 
            border-left: 4px solid #00b894; border-radius: 8px; 
            box-shadow: 0 4px 15px rgba(0,0,0,0.6); z-index: 2147483647; 
            color: white; font-family: 'Segoe UI', sans-serif; 
            opacity: 0; 
            transform: translateX(-40px); 
            transition: left 0.5s cubic-bezier(0.25, 1, 0.5, 1), transform 0.5s cubic-bezier(0.25, 1, 0.5, 1), width 0.4s ease, height 0.4s ease, bottom 0.4s ease, opacity 0.4s ease, padding 0.4s ease, border-radius 0.4s ease, background 0.4s ease; 
            pointer-events: none; overflow: hidden;
            box-sizing: border-box;
        }
        
        #toast-timer-bar { position: absolute; top: 0; left: 0; height: 3px; background: #a29bfe; width: 100%; transform-origin: left; transition: transform linear; }
        .toast-controls { position: absolute; top: 6px; right: 10px; display: flex; gap: 8px; }
        .toast-btn-top { background: none; border: none; color: #aaa; cursor: pointer; font-size: 14px; font-weight: bold; line-height: 1; padding: 0 4px; transition: color 0.15s; }
        .toast-btn-top:hover { color: white; }
        .toast-close-x { display: none; }
        .toast-collapse-btn { display: block; }

        /* ESTADO 1 (Aparece na Esquerda) */
        #mal-tracking-toast.mostrar { 
            left: 25px; 
            transform: translateX(0); 
            opacity: 1; pointer-events: auto; padding: 12px; 
        }
        .season-progress-container { display: block; }
        .episode-progress-container { display: none; }
        
        /* ESTADO 2 (Desliza para o CENTRO INFERIOR) */
        #mal-tracking-toast.micro-mode { 
            width: 120px; 
            height: 4px; 
            padding: 0; 
            bottom: 20px; 
            left: 50%; 
            transform: translateX(-50%); 
            border-left-width: 0; 
            border-radius: 4px; 
            background: rgba(0,0,0,0.5); 
            cursor: pointer; 
            opacity: 1; 
            pointer-events: auto; 
        }
        #mal-tracking-toast.micro-mode .toast-content, 
        #mal-tracking-toast.micro-mode #toast-timer-bar { 
            opacity: 0; pointer-events: none; visibility: hidden; 
        }
        
        /* ESTADO 3 (Fica no CENTRO, mas expande a info) */
        #mal-tracking-toast.hover-mode { 
            width: 250px; 
            padding: 12px; 
            bottom: 25px;
            left: 50%; 
            transform: translateX(-50%); 
            border-left: 4px solid #00b894; 
            opacity: 1; pointer-events: auto; height: auto; 
        }
        #mal-tracking-toast.hover-mode .toast-content { opacity: 1; pointer-events: auto; visibility: visible; }
        #mal-tracking-toast.hover-mode .season-progress-container { display: none; }
        #mal-tracking-toast.hover-mode .episode-progress-container { display: block; }
        #mal-tracking-toast.hover-mode #toast-timer-bar { display: none; } 
        #mal-tracking-toast.hover-mode .toast-collapse-btn { display: none; }
        #mal-tracking-toast.hover-mode .toast-close-x { display: block; } 
        
        /* ESTADO 4 (VOLTA para a ESQUERDA num salto suave e vira pílula) */
        #mal-tracking-toast.flash-mode { 
            width: auto; height: auto; 
            padding: 8px 15px; 
            border-left-width: 0; 
            border-radius: 20px; 
            background: rgba(0, 184, 148, 0.9); 
            left: 25px; 
            transform: translateX(0); 
            opacity: 1;
        }
        #mal-tracking-toast.flash-mode .toast-content, #mal-tracking-toast.flash-mode #toast-timer-bar { display: none; }
        #mal-tracking-toast.flash-mode::after { content: '✔️ Episódio Marcado!'; font-weight: bold; font-size: 13px; color: white; }

        .toast-progress-bg { background: #333; height: 4px; border-radius: 2px; overflow: hidden; margin-top: 10px; }
        .toast-progress-fill-season { background: #6c5ce7; height: 100%; transition: width 0.5s ease; }
        .toast-progress-fill-ep { background: #00b894; height: 100%; width: 0%; transition: width 0.2s linear; }
        
        /* Barra de progreso do vídeo em modo Micro (Absoluta para não bugar o tamanho) */
        #micro-progress-fill { 
            position: absolute; top: 0; left: 0; height: 100%; width: 0%; 
            background: #00b894; transition: width 0.2s linear; 
            opacity: 0; pointer-events: none;
        }
        #mal-tracking-toast.micro-mode #micro-progress-fill { opacity: 1; }

        .btn-wrong-anime { background: transparent; color: #ff7675; border: none; font-size: 11px; cursor: pointer; padding: 0; margin-top: 8px; transition: color 0.2s; }
        .btn-wrong-anime:hover { text-decoration: underline; color: #d63031; }
        #overlay-timer-bar { position: absolute; top: 0; left: 0; height: 4px; background: #00b894; width: 100%; transform-origin: left; transition: transform linear; z-index: 5; }

        /* CLASSES DE REDIMENSIONAMENTO DINÂMICO (TOAST) */
        #mal-tracking-toast.size-exp-small.mostrar { width: 240px !important; padding: 10px !important; }
        #mal-tracking-toast.size-exp-small .toast-img-capa { width: 28px !important; height: 40px !important; }
        #mal-tracking-toast.size-exp-small .toast-text-title { font-size: 11px !important; }
        #mal-tracking-toast.size-exp-small .toast-text-sub { font-size: 9px !important; }
        #mal-tracking-toast.size-exp-small .toast-monitor-label { font-size: 8px !important; }
        #mal-tracking-toast.size-exp-small .btn-wrong-anime { font-size: 9px !important; margin-top: 5px !important; }
        #mal-tracking-toast.size-exp-small .toast-progress-bg { height: 2px !important; margin-top: 6px !important; }

        #mal-tracking-toast.size-exp-large.mostrar { width: 360px !important; padding: 18px !important; }
        #mal-tracking-toast.size-exp-large .toast-img-capa { width: 45px !important; height: 65px !important; }
        #mal-tracking-toast.size-exp-large .toast-text-title { font-size: 16px !important; }
        #mal-tracking-toast.size-exp-large .toast-text-sub { font-size: 13px !important; }
        #mal-tracking-toast.size-exp-large .toast-monitor-label { font-size: 12px !important; }
        #mal-tracking-toast.size-exp-large .btn-wrong-anime { font-size: 13px !important; margin-top: 12px !important; }
        #mal-tracking-toast.size-exp-large .toast-progress-bg { height: 6px !important; margin-top: 14px !important; }

        /* CLASSES DE REDIMENSIONAMENTO DINÂMICO (OVERLAY ROXO) */
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
    `;
    document.head.appendChild(style);
}

// Funções auxiliares para a barra de timer
function startTimerBar(duration) {
    let bar = document.getElementById('toast-timer-bar');
    if (!bar) return;
    bar.style.transition = 'none';
    bar.style.transform = 'scaleX(1)';
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            bar.style.transition = `transform ${duration}ms linear`;
            bar.style.transform = 'scaleX(0)';
        });
    });
}

function pauseTimerBar() {
    let bar = document.getElementById('toast-timer-bar');
    if (!bar) return;
    let computedStyle = window.getComputedStyle(bar);
    bar.style.transition = 'none';
    bar.style.transform = computedStyle.getPropertyValue('transform'); // Congela a barra
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

function colapsarToast() {
    isToastMicro = true;
    isHoverMode = false;
    let toast = document.getElementById('mal-tracking-toast');
    if (toast) {
        toast.classList.remove('mostrar', 'hover-mode');
        toast.classList.add('micro-mode');
    }
}

function fecharToastCompletamente() {
    isToastDismissed = true;
    let toast = document.getElementById('mal-tracking-toast');
    if (toast) {
        toast.classList.remove('mostrar', 'micro-mode', 'hover-mode', 'flash-mode');
        setTimeout(() => toast.remove(), 400);
    }
}

function mostrarToastRastreio(anime, epAtual, epTotal) {
    if (window.cfgEnableTrackingToast === false) return;

    let toast = document.getElementById('mal-tracking-toast');
    if (toast) toast.remove(); 
    
    isToastMicro = false;
    isHoverMode = false;
    isToastDismissed = false;

    let pctTemporada = (epTotal > 0 && epAtual <= epTotal) ? (epAtual / epTotal) * 100 : 100;

    injetarCSSDiscreto();
    let div = document.createElement('div');
    div.id = 'mal-tracking-toast';
    
    // Adicionado fallback 'medium' caso o banco de dados atrase 1 milissegundo
    div.className = `size-exp-${window.cfgSizeToastExp || 'medium'} size-micro-${window.cfgSizeToastMicro || 'medium'} size-flash-${window.cfgSizeToastFlash || 'medium'}`;
    
    div.innerHTML = `   
        <div id="toast-timer-bar"></div>
        <div class="toast-content">
            <div class="toast-controls">
                <button class="toast-btn-top toast-collapse-btn" title="Ocultar (Colapsar)">&#x25BC;</button>
                <button class="toast-btn-top toast-close-x" title="Fechar Rastreio">X</button>
            </div>
            <div style="display: flex; gap: 10px; align-items: center; margin-top: 4px;">
                <!-- MÁGICA: Adicionada a classe toast-img-capa -->
                <img class="toast-img-capa" src="${anime.images.jpg.small_image_url}" style="width: 35px; height: 50px; border-radius: 4px; object-fit: cover;">
                <div style="flex-grow: 1; min-width: 0; padding-right: 40px;">
                    <div class="toast-monitor-label" style="font-size: 10px; color: #00b894; font-weight: bold; text-transform: uppercase;">Monitorando Anime</div>
                    <!-- MÁGICA: Adicionada a classe toast-text-title -->
                    <div class="toast-text-title" style="font-size: 13px; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${anime.title}</div>
                    <!-- MÁGICA: Adicionada a classe toast-text-sub -->
                    <div class="toast-text-sub" style="font-size: 11px; color: #aaa;">Episódio ${epAtual} / ${epTotal || '?'}</div>
                </div>
            </div>
            <div class="toast-progress-bg season-progress-container">
                <div class="toast-progress-fill-season" style="width: ${pctTemporada}%;"></div>
            </div>
            <div class="toast-progress-bg episode-progress-container" style="height: 6px;">
                <div class="toast-progress-fill-ep hover-episode-fill"></div>
            </div>
            <div style="display: flex; justify-content: flex-end;">
                <button id="btnWrongAnime" class="btn-wrong-anime">Anime errado?</button>
            </div>
        </div>
        <div id="micro-progress-fill"></div>
    `;
    
    // --- O PULO DO GATO: Lógica de Tela Cheia Dinâmica ---
    const fixarNoContainerCerto = () => {
        let isFs = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
        
        if (isFs && window.cfgShowFlashInFullscreen) {
            isFs.appendChild(div);
        } else {
            document.body.appendChild(div);
        }
    };

    // Fixa ao criar a primeira vez
    fixarNoContainerCerto();
    
    // Fica escutando: se o usuário entrar/sair de tela cheia, move o Toast junto!
    const listenerTelaCheia = () => {
        if (isToastDismissed) {
            document.removeEventListener('fullscreenchange', listenerTelaCheia);
            return;
        }
        fixarNoContainerCerto();
    };
    document.addEventListener('fullscreenchange', listenerTelaCheia);

    // Anima a entrada
    setTimeout(() => {
        div.classList.add('mostrar');
        startTimerBar(6000);
    }, 50);

    // BOTOES DE CONTROLE DO TOAST
    div.querySelector('.toast-close-x').addEventListener('click', fecharToastCompletamente);
    
    div.querySelector('.toast-collapse-btn').addEventListener('click', () => {
        clearTimeout(toastTimeout);
        colapsarToast();
    });
    
    div.querySelector('#btnWrongAnime').addEventListener('click', () => {
        chrome.storage.local.set({ isCorrectionMode: true }, () => {
            chrome.runtime.sendMessage({ action: 'openSidePanel' }, (response) => {
                if (!response || !response.success) {
                    let btn = div.querySelector('#btnWrongAnime');
                    btn.textContent = "Abra a extensão lá em cima ↗️";
                    btn.style.color = "#a29bfe"; btn.style.textDecoration = "none";
                    clearTimeout(toastTimeout);
                    startTimerBar(5000);
                    toastTimeout = setTimeout(() => { if(!isToastDismissed) colapsarToast(); }, 5000);
                } else {
                    fecharToastCompletamente();
                }
            });
        });
    });

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
            startTimerBar(750);
            toastTimeout = setTimeout(() => { if (!isToastDismissed) colapsarToast(); }, 750);
        } else if (!isToastMicro) {
            startTimerBar(3000);
            toastTimeout = setTimeout(() => { if (!isToastDismissed) colapsarToast(); }, 3000);
        }
    });
    
    toastTimeout = setTimeout(colapsarToast, 6000);
}

function verificarSeJaTemNotaEExibir() {
    if (!animeDetectado) return;
    
    chrome.storage.local.get([animeDetectado.title], (res) => {
        const dadosSalvos = res[animeDetectado.title];
        
        if (dadosSalvos && dadosSalvos.media) {
            console.log("MAL Reviewer: Obra já avaliada. Ocultando aviso de fim de temporada.");
            return;
        }
        
        verificarEExibirOverlay();
    });
}

function verificarEExibirOverlay() {
    let isFullscreen = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;

    if (isFullscreen) {
        const exitHandler = () => {
            let nowFullscreen = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
            if (!nowFullscreen) {
                mostrarOverlay();
                ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(e => document.removeEventListener(e, exitHandler));
            }
        };
        ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(e => document.addEventListener(e, exitHandler));
    } else {
        mostrarOverlay();
    }
}

async function detectarNomeAnime() {
    let url = window.location.href;
    
    // NETFLIX
    if (url.includes("netflix.com")) {
        
        let nomeFinal = "";
        let metaNetflix = extrairMetadadosNetflix();
        
        let sufixoSeason = "";
        if (metaNetflix && metaNetflix.season > 1) {
            let num = metaNetflix.season;
            sufixoSeason = num === 2 ? " 2nd Season" : num === 3 ? " 3rd Season" : ` ${num}th Season`;
        }

        // Usa a nossa Memória Fotográfica (pega o nome mesmo se a UI estiver escondida!)
        if (metaNetflix && metaNetflix.title) {
            let nomeLimpo = metaNetflix.title.replace(/T\d+:?|Temporada \d+|Season \d+|Parte \d+/ig, "").replace(/-$/, "").trim();
            nomeFinal = (nomeLimpo + sufixoSeason).trim();
            
            console.log("MAL Reviewer: Nome da Netflix recuperado da Memória:", nomeFinal);
            return nomeFinal;
        }

        // TRUQUE DOS METADADOS (O SEO DA NETFLIX) - Só roda em último caso extremo se o vídeo não tiver título UI
        let videoId = document.querySelector('[data-videoid]')?.getAttribute('data-videoid');
        if (videoId) {
            try {
                console.log("MAL Reviewer: Interface oculta e sem memória. Buscando fallback SEO...");
                let response = await fetch(`https://www.netflix.com/title/${videoId}`);
                let html = await response.text();
                
                let parser = new DOMParser();
                let doc = parser.parseFromString(html, 'text/html');
                let tagTitulo = doc.querySelector('meta[property="og:title"]') || doc.querySelector('title');
                
                if (tagTitulo && (tagTitulo.content || tagTitulo.textContent)) {
                    let textoCru = tagTitulo.content || tagTitulo.textContent;
                    let nome = textoCru.replace(/Assistir /i, "").replace(/Watch /i, "")
                                       .replace(/\(?Dublado\)?/i, "").replace(/\(?Legendado\)?/i, "")
                                       .replace(/Em Português Brasileiro/i, "").replace(/Em Português/i, "")
                                       .split('|')[0].split('-')[0].replace(/Netflix/i, "").trim();
                                       
                    if (nome.length > 0) {
                        nomeFinal = (nome + sufixoSeason).trim();
                        return nomeFinal;
                    }
                }
            } catch (err) { }
        }

        if (document.title && document.title !== "Netflix") {
            return (document.title.split('|')[0].replace(/- Netflix/i, "").trim() + sufixoSeason).trim();
        }

        return null;
    }

    // CRUNCHYROLL
    if (url.includes("crunchyroll.com")) {
        let meta = extrairMetadadosCrunchyroll();
        
        if (meta.success && meta.nomeSerie) {
            let nomeShow = meta.nomeSerie;
            let seasonNum = meta.numTemporada;
            let nomeTemporadaLimpo = meta.nomeTemporada ? meta.nomeTemporada.replace(/\(.*Dub.*\)/i, "").trim() : "";

            if (nomeTemporadaLimpo) {
                let nomeTempBaixo = nomeTemporadaLimpo.toLowerCase();

                if (nomeTempBaixo.includes("ova") || nomeTempBaixo.includes("oad") || nomeTempBaixo.includes("special")) {
                    let urlSlug = window.location.href.split('/').pop().split('?')[0].replace(/-/g, " ").trim();
                    console.log(`MAL Reviewer: Crunchyroll OVA/Special! Buscando por "${nomeShow} ${urlSlug}"...`);
                    return `${nomeShow} ${urlSlug}`;
                }

                let matchTexto = nomeTemporadaLimpo.match(/(?:Season|Temporada)\s*(\d+)|(\d+)[ªaºo]?\s*(?:Season|Temporada)/i);
                
                if (matchTexto) {
                    seasonNum = parseInt(matchTexto[1] || matchTexto[2]); 
                } 
                else if (!nomeTempBaixo.includes(nomeShow.toLowerCase()) && nomeTemporadaLimpo.length > 3) {
                    return `${nomeShow} ${nomeTemporadaLimpo}`;
                } 
                else if (nomeTemporadaLimpo !== nomeShow && nomeTemporadaLimpo.length > nomeShow.length) {
                    return nomeTemporadaLimpo;
                }
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

    // GOOGLE DRIVE
    if (url.includes("drive.google.com")) {
        return document.title.replace(" - Google Drive", "").trim();
    }
    
    // UNIVERSAL
    let titleRaw = document.title;

    try {
        let scripts = document.querySelectorAll('script[type="application/ld+json"]');
        for (let script of scripts) {
            let data = JSON.parse(script.textContent);
            let items = Array.isArray(data) ? data : [data];
            for (let item of items) {
                if (item["@type"] === "WebPage" || item["@type"] === "VideoObject" || item["@type"] === "TVEpisode") {
                    if (item.name) {
                        titleRaw = item.name;
                        break;
                    }
                }
            }
        }
    } catch(e) {}

    let nomeLimpo = titleRaw
        .replace(/Assistir /i, "")
        .replace(/Watch /i, "")
        .replace(/\(?Dublado\)?/i, "")
        .replace(/\(?Legendado\)?/i, "")
        .replace(/Em Português Brasileiro/i, "")
        .replace(/Em Português/i, "")
        .replace(/Online/i, "")
        .replace(/HD/i, "")
        .replace(/Grátis/i, "")
        .split(/ - | \| | : /)[0] 
        .replace(/Epis[óo]dio \d+/i, "")
        .replace(/Episode \d+/i, "")
        .trim();

    console.log("MAL Reviewer: Nome extraído do Site Genérico:", nomeLimpo);
    return nomeLimpo;
}

function extrairMetadadosCrunchyroll() {
    try {
        let scripts = document.querySelectorAll('script[type="application/ld+json"]');
        for (let script of scripts) {
            let text = script.textContent;
            if (text.includes('"TVEpisode"')) {
                let data = JSON.parse(text);
                
                let item = Array.isArray(data) 
                    ? data.find(x => x["@type"] === "TVEpisode" || (x["@type"] && x["@type"].includes("TVEpisode"))) 
                    : (data["@type"] === "TVEpisode" ? data : null);
                
                if (item) {
                    let nomeLimpo = item.partOfSeries ? item.partOfSeries.name.replace(/\(.*Dub.*\)/i, "").trim() : null;
                    
                    return {
                        success: true,
                        nomeSerie: nomeLimpo,
                        numTemporada: item.partOfSeason ? item.partOfSeason.seasonNumber : null,
                        nomeTemporada: item.partOfSeason ? item.partOfSeason.name : null,
                        numEpisodio: item.episodeNumber
                    };
                }
            }
        }
    } catch (e) {
        console.error("MAL Reviewer: Erro ao interpretar metadados JSON-LD da Crunchyroll", e);
    }
    return { success: false };
}

function ehNomeGenerico(nome) {
    let n = nome.toLowerCase();
    return n.length <= 3 || n.includes("season") || n.includes("temporada") || n.includes("episodios");
}

function buscarDadosNoJikan(termo) {
    if(!termo) return;
    chrome.runtime.sendMessage({ action: 'buscarJikan', termo: termo, isAuto: true }, (response) => {
        if (chrome.runtime.lastError || !response || !response.success) return;
        
        let rawData = response.data;
        listaTemporadasDetectadas = (rawData && rawData.data && Array.isArray(rawData.data)) ? rawData.data : (Array.isArray(rawData) ? rawData : []);

        console.log("MAL Reviewer: Lista de obras recebida do AniList (Auto):", listaTemporadasDetectadas);
        
        let epAbsVal = detectarEpisodioAtual();
        
        let isOvaOrMovie = termo.toLowerCase().includes("ova") || termo.toLowerCase().includes("movie");
        let ehFilme = epAbsVal === null || isOvaOrMovie; 
        
        let epAbs = epAbsVal || 1;

        setTimeout(() => {
            let video = document.querySelector('video');
            let duracaoMinutos = (video && video.duration && !isNaN(video.duration)) ? (video.duration / 60) : 0;
            
            console.log(`MAL Reviewer: [Análise de Mídia] Modo Filme: ${ehFilme ? "ATIVADO" : "DESATIVADO"} | Duração Capturada: ${duracaoMinutos.toFixed(2)} minutos.`);

            let analise = selecionarTemporadaAdequada(epAbs, duracaoMinutos, ehFilme, termo);

            if (analise) {
                console.log(`MAL Reviewer: ✅ Mapeado com SUCESSO para: "${analise.anime.title}" (ID: ${analise.anime.mal_id}) | EP Relativo: ${analise.relativo}/${analise.total}`);

                mostrarToastRastreio(analise.anime, analise.relativo, analise.total);
                
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

    // EXCEÇÕES
    if (listaTemporadasDetectadas.length === 1 && listaTemporadasDetectadas[0].is_direct_id) {
        let anime = listaTemporadasDetectadas[0];
        animeDetectado = anime;
        totalEpisodiosAnime = anime.episodes || 1;
        
        let epRelativo = anime.is_split_movie ? epAbsolute : 1; 
        // LOG REMOVIDO PARA EVITAR LOOP
        return { anime: anime, total: totalEpisodiosAnime, relativo: epRelativo };
    }

    // MODO FILME OU EPISÓDIO
    if (ehFilme) {
        let candidatos = listaTemporadasDetectadas;
        
        let melhorFilme = null;
        let maiorPontuacao = -1;

        const limpaString = (s) => s ? s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "") : "";
        const nomeAlvo = limpaString(termoBusca);

        for (let temp of candidatos) {
            let pontuacao = 0;
            let logMotivo = [];

            if (duracaoVideoEmMinutos > 0 && temp.duration > 0) {
                let proporcao = duracaoVideoEmMinutos / temp.duration;
                if (proporcao >= 0.8 && proporcao <= 1.25) { 
                    pontuacao += 50; 
                    logMotivo.push(`Duração Bateu (${temp.duration}m)`);
                }
            }

            let titulos = [temp.title, ...(temp.alternative_titles || [])];
            let nomeParcialAplicado = false;

            for (let t of titulos) {
                let nomeTemp = limpaString(t);
                
                if (nomeTemp === nomeAlvo) {
                    pontuacao += 100; 
                    logMotivo.push("Nome Exato");
                    break;
                } else if (!nomeParcialAplicado && (nomeTemp.includes(nomeAlvo) || nomeAlvo.includes(nomeTemp))) {
                    pontuacao += 30; 
                    logMotivo.push("Nome Parcial");
                    nomeParcialAplicado = true;
                }
            }

            if (pontuacao > maiorPontuacao) {
                maiorPontuacao = pontuacao;
                melhorFilme = temp;
            }
        }

        if (melhorFilme && maiorPontuacao > 0) {
            animeDetectado = melhorFilme;
            return { anime: melhorFilme, total: melhorFilme.episodes || 1, relativo: 1 };
        } else if (candidatos.length > 0) {
            animeDetectado = candidatos[0];
            return { anime: candidatos[0], total: candidatos[0].episodes || 1, relativo: 1 };
        }
    }

    // 2. MODO SÉRIE 
    let series = listaTemporadasDetectadas.filter(t => ['tv', 'ona'].includes(t.media_type));
    if (series.length === 0) series = listaTemporadasDetectadas; 
    
    // Ordena as temporadas cronologicamente
    series.sort((a, b) => {
        const anoA = a.year === 0 ? 9999 : a.year;
        const anoB = b.year === 0 ? 9999 : b.year;
        if (anoA !== anoB) return anoA - anoB;
        return a.mal_id - b.mal_id;
    });

    // --- A MÁGICA: CHECAGEM DE NUMERAÇÃO RESETADA ---
    let mTemp = termoBusca.toLowerCase().match(/(\d+)(?:nd|rd|th)\s*season|season\s*(\d+)/);
    if (mTemp) {
        let numBuscado = parseInt(mTemp[1] || mTemp[2]);
        if (numBuscado > 1) { 
            // Dicionário Romano de conversão
            const romanMap = { 2: " ii", 3: " iii", 4: " iv", 5: " v", 6: " vi", 7: " vii", 8: " viii", 9: " ix" };
            let roman = romanMap[numBuscado] || "";

            let seriesFiltradas = series.filter(temp => {
                let titulos = [temp.title, ...(temp.alternative_titles || [])].map(t => t.toLowerCase());
                return titulos.some(t => {
                    let limpo = t.replace(/[^a-z0-9]/g, "");
                    
                    // Checa também se o nome termina com o número romano (Ex: "DanMachi III")
                    let endWithRoman = roman ? (t.endsWith(roman) || t.includes(roman + " ")) : false;

                    return limpo.includes(`${numBuscado}ndseason`) ||
                           limpo.includes(`${numBuscado}rdseason`) ||
                           limpo.includes(`${numBuscado}thseason`) ||
                           t.includes(`season ${numBuscado}`) ||
                           t.includes(`season${numBuscado}`) ||
                           t.includes(`part ${numBuscado}`) ||
                           endWithRoman;
                });
            });
            if (seriesFiltradas.length > 0) {
                series = seriesFiltradas;
                // LOG REMOVIDO PARA EVITAR LOOP
            }
        }
    }

    let acumuladorEps = 0;
    let temporadaSelecionada = series[0];

    for (let i = 0; i < series.length; i++) {
        let temp = series[i];
        let limiteInferior = acumuladorEps + 1;
        let limiteSuperior = acumuladorEps + (temp.episodes || 12);

        if (epAbsolute >= limiteInferior && epAbsolute <= limiteSuperior) {
            temporadaSelecionada = temp;
            break;
        }
        acumuladorEps = limiteSuperior;
    }

    animeDetectado = temporadaSelecionada;
    totalEpisodiosAnime = temporadaSelecionada ? (temporadaSelecionada.episodes || 0) : 0;
    
    let offset = 0;
    if (temporadaSelecionada) {
        for (let i = 0; i < series.length; i++) {
            let temp = series[i];
            if (temp.mal_id === temporadaSelecionada.mal_id) break;
            offset += temp.episodes || 12;
        }
    }
    
    let epRelativo = epAbsolute - offset;
    if (epRelativo <= 0) epRelativo = 1; 
    
    return { anime: animeDetectado, total: totalEpisodiosAnime, relativo: epRelativo };
}


function mostrarOverlay() {
    if (!animeDetectado || isOverlayDismissed) return; 
    if (document.getElementById('mal-overlay-container')) return; 
    
    // CORREÇÃO: Lê a variável corretamente do objeto window
    if (window.cfgEnableRatingOverlay === false) return; 
    
    injetarCSSDiscreto(); 
    
    isOverlayMicro = false;
    isOverlayHover = false;
    isOverlayDismissed = false;

    let div = document.createElement('div');
    div.id = 'mal-overlay-container';
    
    // Adicionado fallback 'medium'
    div.className = `size-ov-${window.cfgSizeOverlay || 'medium'}`;
    
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
                <img id="mal-overlay-img" src="${animeDetectado.images.jpg.small_image_url || ""}" alt="Capa">
                <div class="overlay-info-text">
                    <div id="mal-overlay-title" style="font-weight:800; font-size:14px; line-height: 1.2; margin-bottom: 6px;">${animeDetectado.title || ""}</div>
                    <div style="font-size:11px; color:#aaa">Deseja avaliar a parte técnica?</div>
                </div>
            </div>
            <button class="btn-rate" id="btnOpenExtension">AVALIAR OBRA</button>
        </div>
    `;

    document.body.appendChild(div);
    
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            div.classList.add('mostrar');
        });
    });
    
    overlayCriado = true;

    // AÇÕES DOS BOTÕES DE CONTROLE
    const fecharTotalmente = () => {
        isOverlayDismissed = true;
        div.classList.remove('mostrar', 'hover-mode', 'micro-mode');
        setTimeout(() => div.remove(), 400); 
    };

    const colapsarParaBorda = () => {
        if (!isOverlayDismissed) {
            isOverlayMicro = true;
            isOverlayHover = false;
            div.classList.remove('mostrar', 'hover-mode');
            div.classList.add('micro-mode');
        }
    };

    div.querySelector('.close-btn').addEventListener('click', fecharTotalmente);
    
    div.querySelector('.collapse-btn').addEventListener('click', () => {
        clearTimeout(overlayTimeoutTimer);
        colapsarParaBorda();
    });

    // SISTEMA DE HOVER
    div.addEventListener('mouseenter', () => {
        clearTimeout(overlayTimeoutTimer);
        pauseOverlayTimerBar();
        if (isOverlayMicro) {
            div.classList.remove('micro-mode');
            div.classList.add('hover-mode');
            isOverlayHover = true;
            isOverlayMicro = false;
        }
    });

    div.addEventListener('mouseleave', () => {
        if (isOverlayHover || div.classList.contains('mostrar')) {
            startOverlayTimerBar(10000);
            overlayTimeoutTimer = setTimeout(colapsarParaBorda, 4000); 
        }
    });

    setTimeout(() => {
        div.classList.add('mostrar');
        startOverlayTimerBar(20000);
    }, 50);

    overlayTimeoutTimer = setTimeout(colapsarParaBorda, 20000);

    // BOTÃO DE AVALIAR
    div.querySelector('#btnOpenExtension').addEventListener('click', () => {
        chrome.storage.local.set({ 
            'ultimoAnimeDetectado': animeDetectado.title,
            'ultimoAnimeDetectadoExato': animeDetectado 
        });

        const exibirMensagemDeClique = () => {
            const body = div.querySelector('.overlay-body');
            body.innerHTML = `
                <div style="text-align: center; padding: 15px 5px; animation: fadeIn 0.4s;">
                    <div style="font-size: 30px; margin-bottom: 10px;">🧩</div>
                    <div style="font-size: 14px; color: #fff; font-weight: bold;">Abra a extensão</div>
                    <div style="font-size: 12px; color: #a29bfe; margin-top: 6px;">Clique no ícone na barra superior ou lateral!</div>
                </div>
            `;
            setTimeout(fecharTotalmente, 4500);
        };

        chrome.storage.local.get(['viewMode'], (res) => {
            if (res.viewMode === 'sidepanel') {
                chrome.runtime.sendMessage({ action: 'openSidePanel' }, (response) => {
                    if (response && response.success) {
                        fecharTotalmente();
                    } else {
                        exibirMensagemDeClique();
                    }
                });
            } else {
                exibirMensagemDeClique();
            }
        });
    });
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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "SOLICITAR_NOME_ANIME") {
        let epAbsVal = detectarEpisodioAtual();
        let ehFilme = epAbsVal === null;
        let epAbs = epAbsVal || 1;
        
        let video = document.querySelector('video');
        let duracaoMin = video && video.duration && !isNaN(video.duration) ? (video.duration / 60) : 0;
        let epRel = epAbs;
        
        if (animeDetectado && animeDetectado.title) {
            if (listaTemporadasDetectadas && listaTemporadasDetectadas.length > 0) {
                let analise = selecionarTemporadaAdequada(epAbs, duracaoMin, ehFilme, animeDetectado.title);
                if (analise) epRel = analise.relativo;
            }
            
            sendResponse({ 
                nome: animeDetectado.title, 
                epAtual: epRel,
                animeExato: animeDetectado 
            });
        } 
        else {
            detectarNomeAnime().then(nomeEncontrado => {
                sendResponse({ nome: nomeEncontrado, epAtual: epRel });
            });
            return true;
        }
    }
    if (request.action === "FORCAR_CORRECAO_ANIME" && request.animeExato) {
        console.log("MAL Reviewer: Correção manual recebida! Alterando rastreio para:", request.animeExato.title);
        animeDetectado = request.animeExato;
        totalEpisodiosAnime = animeDetectado.episodes || 1;
        
        let epAbs = detectarEpisodioAtual() || 1;
        malProgressoSincronizado = false; 
        
        mostrarToastRastreio(animeDetectado, epAbs, totalEpisodiosAnime);
        sendResponse({success: true});
    }
    if (request.action === "CANCELAR_CORRECAO") {
        let btn = document.getElementById('btnWrongAnime');
        if (btn) {
            btn.textContent = "Anime errado?";
            btn.style.color = "#ff7675";
        }
        sendResponse({success: true});
    }
});



// EXTRAI DADOS INVISÍVEIS DA NETFLIX (Lendo a memória global)
// EXTRAI DADOS INVISÍVEIS DA NETFLIX (Lendo a memória global)
function extrairMetadadosNetflix() {
    let videoId = document.querySelector('[data-videoid]')?.getAttribute('data-videoid');
    if (!videoId) return null;

    // Se mudou de episódio/série, reseta a nossa memória fotográfica
    if (videoId !== videoIdAtual) {
        netflixTituloSalvo = "";
        netflixTemporadaSalva = null;
        netflixEpisodioSalvo = null;
    }

    // Salva o título da interface (Ele aparece por 3s quando o vídeo começa. Nós gravamos pra sempre!)
    let tituloElement = document.querySelector('[data-uia="video-title"] h4') || document.querySelector('[data-uia="video-title"]');
    if (tituloElement && tituloElement.textContent) {
        netflixTituloSalvo = tituloElement.textContent.replace(/[【】]/g, "").trim();
    }

    // 👉 A MÁGICA: Lê os dados que a sonda (que rodou no mundo MAIN) escreveu no HTML
    let sondaDiv = document.getElementById('mal-reviewer-netflix-data');
    if (sondaDiv && sondaDiv.innerText) {
        try {
            let cacheData = JSON.parse(sondaDiv.innerText);
            if (cacheData.season) netflixTemporadaSalva = cacheData.season;
            if (cacheData.episode) netflixEpisodioSalvo = cacheData.episode;
        } catch(e) {}
    }

    // Se a sonda conseguiu achar dados, retorna eles com o título!
    return {
        title: netflixTituloSalvo,
        season: netflixTemporadaSalva,
        episode: netflixEpisodioSalvo
    };
}