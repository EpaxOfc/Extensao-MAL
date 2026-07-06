let monitorando = false;
let animeDetectado = null;
let totalEpisodiosAnime = 0;
let overlayCriado = false;
let urlAtual = window.location.href; // Guarda a URL inicial

// Loop principal de verificação
const intervaloCheck = setInterval(() => {
    // 1. DETECTA MUDANÇA DE PÁGINA
    if (window.location.href !== urlAtual) {
        console.log("MAL Reviewer: Mudança de página detectada. Resetando monitoramento...");
        urlAtual = window.location.href;
        
        monitorando = false;
        animeDetectado = null;
        overlayCriado = false;
        
        const overlayAntigo = document.getElementById('mal-overlay-container');
        if (overlayAntigo) overlayAntigo.remove();
    }

    // 2. BUSCA PELO VÍDEO
    let video = document.querySelector('video');
    if (video && !monitorando) {
        if (video.src || video.querySelector('source')) {
            monitorando = true;
            iniciarMonitoramento(video);
        }
    }
}, 3000);

// function iniciarMonitoramento(video) {
//     console.log("MAL Reviewer: Vídeo detectado. Monitorando...");

//     detectarNomeAnime().then(nome => {
//         if(nome) {
//             buscarDadosNoJikan(nome);
//         }
//     });
//     console.log("ep numero:", numeroEncontrado);

//     video.addEventListener('timeupdate', () => {
//         if (!totalEpisodiosAnime || totalEpisodiosAnime === 0) return;

//         let epAtual = detectarEpisodioAtual();
        
//         if (epAtual && epAtual === totalEpisodiosAnime) {
            
//             let tempoRestante = video.duration - video.currentTime;
//             let ehFim = (tempoRestante < 90 && video.duration > 300); 

//             if (ehFim && !overlayCriado) {
//                 verificarEExibirOverlay();
//             }
//         }
//     });
// }

function verificarEExibirOverlay() {
    // Se estiver em fullscreen, esperamos sair
    if (document.fullscreenElement) {
        // Adiciona um ouvinte para quando sair da tela cheia
        document.addEventListener('fullscreenchange', () => {
            if (!document.fullscreenElement) {
                mostrarOverlay();
            }
        }, { once: true });
    } else {
        mostrarOverlay();
    }
}

// 2. DETECÇÃO INTELIGENTE DO DRIVE
async function detectarNomeAnime() {
    let url = window.location.href;
    
    if (url.includes("netflix.com")) {
        let tituloNetflix = document.querySelector('[data-uia="video-title"] h4')?.innerText || 
                           document.querySelector('[data-uia="evidence-overlay-title"]')?.innerText ||
                           document.querySelector('.watch-video--evidence-overlay-container h2')?.innerText;

        if (tituloNetflix) {
            console.log("MAL Reviewer: Nome extraído da Netflix:", tituloNetflix);
            // Remove os colchetes decorativos 【 】 se existirem, para ajudar na busca do Jikan
            return tituloNetflix.replace(/[【】]/g, "").trim();
        }

        // Caso não encontre nos elementos específicos, tenta uma busca geral por h4 e h2 no player
        let backup = document.querySelector('.video-title h4')?.innerText;
        if (backup) return backup.trim();

        if (!nomeNetflix) {
            let btnEpisodios = document.querySelector('[data-uia="control-episodes"]');
            if (btnEpisodios) {
                nomeNetflix = btnEpisodios.getAttribute('aria-label').replace("Episódios de ", "").replace("Episodes of ", "");
            }
        }

        const listaNegra = [
            "Anata no ouchi ga", 
            "Anata no wo Uchi ga", 
            "Eigakan", 
            "Netflix", 
            "Sua casa é um cinema"
        ];

        let tituloAba = document.title;
        let oNomeEhRuim = listaNegra.some(proibido => tituloAba.includes(proibido));

        if (nomeNetflix && nomeNetflix.length > 0) {
            return nomeNetflix.trim();
        } else if (!oNomeEhRuim) {
            return tituloAba.split(':')[0].trim();
        }
        
        return null; // Se tudo falhar, o usuário digita
    }

    // --- LÓGICA PARA DRIVE (Mantive para não quebrar) ---
    if (url.includes("drive.google.com")) {
        return document.title.replace(" - Google Drive", "").trim();
    }
    
    // --- OUTROS SITES ---
    return document.title.split('-')[0].replace(" - Assista na Crunchyroll", "").trim();
}

function ehNomeGenerico(nome) {
    let n = nome.toLowerCase();
    return n.length <= 3 || n.includes("season") || n.includes("temporada") || n.includes("episodios");
}

// 3. BUSCA DADOS (Igual ao popup, mas rodando no fundo)
function buscarDadosNoJikan(termo) {
    if(!termo) return;
    fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(termo)}&limit=1`)
        .then(r => r.json())
        .then(data => {
            if(data.data && data.data.length > 0) {
                animeDetectado = data.data[0];
                // AQUI: Salva o total de episódios vindo do MyAnimeList
                totalEpisodiosAnime = animeDetectado.episodes; 
                console.log(`Anime: ${animeDetectado.title} | Total EPs: ${totalEpisodiosAnime}`);
            }
        });
}

// 4. INTERFACE INJETADA (O Overlay)
function mostrarOverlay() {
    if (overlayCriado || !animeDetectado) return;
    
    // Cria o HTML da janelinha
    let div = document.createElement('div');
    div.id = 'mal-overlay-container';
    div.innerHTML = `
        <div class="overlay-header">
            <span>Fim do Episódio?</span>
            <button class="close-btn">X</button>
        </div>
        <div class="overlay-body">
            <div class="overlay-info">
                <img src="${animeDetectado.images.jpg.small_image_url}">
                <div>
                    <div style="font-weight:bold; font-size:14px">${animeDetectado.title}</div>
                    <div style="font-size:12px; color:#ccc">Dê sua nota agora!</div>
                </div>
            </div>
            <button class="btn-rate" id="btnOpenExtension">DAR NOTA</button>
        </div>
    `;

    document.body.appendChild(div);
    div.style.display = 'block';
    overlayCriado = true;

    // Eventos
    div.querySelector('.close-btn').addEventListener('click', () => {
        div.style.display = 'none';
    });

    div.querySelector('#btnOpenExtension').addEventListener('click', () => {
        // Como não podemos abrir o popup da extensão, vamos salvar no storage
        // que queremos abrir o editor e alertar o usuário para clicar no ícone
        alert("Clique no ícone da extensão (quebra-cabeça) lá em cima para editar os detalhes!");
        div.style.display = 'none';
        
        // Opcional: Aqui poderíamos expandir o overlay para mostrar os inputs
        // Mas para simplificar, mandamos o usuário clicar no ícone já com os dados pré-carregados
        chrome.storage.local.set({
            'ultimoAnimeDetectado': animeDetectado.title
        });
    });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "SOLICITAR_NOME_ANIME") {
        // Cenário 1: Já temos o objeto animeDetectado do Jikan (Melhor caso)
        if (animeDetectado && animeDetectado.title) {
            sendResponse({ nome: animeDetectado.title });
        } 
        // Cenário 2: Ainda não buscou no Jikan, mas a função detectarNomeAnime consegue pegar
        else {
            detectarNomeAnime().then(nomeEncontrado => {
                sendResponse({ nome: nomeEncontrado });
            });
            return true;
        }
    }
});

// function detectarEpisodioAtual() {
//     let url = window.location.href;
//     let numeroEncontrado = null;

//     if (url.includes("netflix.com")) {
//         // Na Netflix, o episódio geralmente aparece num span dentro do título do player
//         let spanEp = document.querySelector('[data-uia="video-title"] span:last-child');
//         if (spanEp) {
//             let match = spanEp.innerText.match(/E(\d+)/i) || spanEp.innerText.match(/Episódio\s*(\d+)/i);
//             if (match) numeroEncontrado = parseInt(match[1]); console.log(numeroEncontrado);
//         }
//     } else {
//         // No Drive ou outros, tentamos pegar o número no título da aba ou nome do arquivo
//         let match = document.title.match(/E(?:p|pisódio)?\s*(\d+)/i) || document.title.match(/[-_ ](\d+)(?:\.mp4|\.mkv| )/i);
//         if (match) numeroEncontrado = parseInt(match[1]); console.log(numeroEncontrado);
//     }
//     console.log(numeroEncontrado);
//     return numeroEncontrado;
// }