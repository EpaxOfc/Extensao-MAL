// ==========================================
// 🛠️ MODO DESENVOLVEDOR (TRAVA DE TESTE)
// true  = Altera a barra e NÃO fecha o modal
// false = Altera a barra, clica em Avaliar
const MODO_TESTE_NOTA = false; 
const MODO_DEBUG = false; 
const logger = {
    log: (...args) => MODO_DEBUG && console.log(...args),
    warn: (...args) => MODO_DEBUG && console.warn(...args),
    error: (...args) => MODO_DEBUG && console.error(...args)
};
// ==========================================

const defaultDesc = `✨ Minhas Redes Sociais
---------------------------------
🎬  Assista minhas Lives: https://twitch.tv/seucanal
🎥  Canal Principal: https://www.youtube.com/@seucanal
📸  Instagram: @seuinstagram

(Você pode alterar este texto nas configurações da extensão)`;

let appSettings = { 
    shSave: { altKey: true, ctrlKey: false, shiftKey: false, key: 's' },
    shFill: { altKey: true, ctrlKey: false, shiftKey: false, key: 'b' },
    titleTemplate: "Nome Anime | T1 Ep. 01",
    titleNoTemp: "{obra} | Ep. {ep}", 
    titleTemp: "{obra} | T{temp} Ep. {ep}",
    copyVis: false, 
    descTemplate: defaultDesc,
    delayObra: 2000,
    delayMenu: 600,
    delayPlaylist: 1000,
    retryOnFail: true,
    enableRating: true,
    useObraAsTitle: true
};

chrome.storage.local.get(['appSettings'], (data) => { if(data.appSettings) appSettings = Object.assign(appSettings, data.appSettings); });
chrome.storage.onChanged.addListener((changes) => { if(changes.appSettings) appSettings = Object.assign(appSettings, changes.appSettings.newValue); });

const uiStyles = `
    #cinefy-container { display: none; z-index: 999999; position: fixed; bottom: 20px; right: 20px; }
    #cinefy-container.on-page { display: block; }
    #cinefy-min-btn { position: absolute; bottom: 0; right: 0; width: 50px; height: 50px; border-radius: 25px; background: #a855f7; color: white; border: none; font-size: 20px; cursor: pointer; box-shadow: 0 4px 15px rgba(0,0,0,0.5); transition: 0.3s; display: flex; justify-content: center; align-items: center; opacity: 0; pointer-events: none; transform: scale(0.5); }
    #cinefy-min-btn.show { opacity: 1; pointer-events: all; transform: scale(1); }
    #cinefy-panel { width: 280px; background: #18181b; border: 1px solid #3f3f46; border-radius: 12px; padding: 15px; box-shadow: 0 10px 30px rgba(0,0,0,0.8); font-family: 'Segoe UI', sans-serif; color: #fff; transform-origin: bottom right; transition: 0.3s; }
    #cinefy-panel.collapsed { transform: scale(0.5) translateY(50px); opacity: 0; pointer-events: none; }
    .cinefy-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .cinefy-header h3 { margin: 0; font-size: 14px; color: #e4e4e7; text-align: center; flex-grow:1; }
    .cinefy-icon-btn { background: none; border: none; color: #a1a1aa; font-size: 16px; cursor: pointer; padding: 0; transition: 0.2s; }
    .cinefy-icon-btn:hover { color: #2dd4bf; transform: scale(1.2); }
    #cinefy-panel select, .cinefy-input { width: 100%; background: #27272a; border: 1px solid #52525b; color: white; padding: 10px; border-radius: 8px; margin-bottom: 10px; outline: none; box-sizing: border-box; }
    .cinefy-btn { width: 100%; padding: 10px; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; margin-bottom: 8px; transition: 0.2s; font-size:13px;}
    .cinefy-btn-template { background: #f59e0b; color: white; } .cinefy-btn-template:hover { background: #d97706; }
    .cinefy-btn-save { background: #a855f7; color: white; } .cinefy-btn-save:hover { background: #9333ea; }
    .cinefy-btn-fill { background: #2dd4bf; color: black; } .cinefy-btn-fill:hover { background: #14b8a6; }
    #cinefy-modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 9999999; display: none; justify-content: center; align-items: center; backdrop-filter: blur(3px); }
    
    .cinefy-modal { 
        background: #18181b; padding: 20px; border-radius: 12px; 
        width: 420px; min-width: 380px; max-width: 90vw; 
        border: 1px solid #3f3f46; color: white; font-family: 'Segoe UI', sans-serif;
        resize: both; overflow: auto; /* Permite arrastar nas DUAS direções */
    }
    
    .mini-reset {
        background: none; border: none; color: #a1a1aa; float: right; 
        cursor: pointer; font-size: 16px; padding: 0 4px; transition: 0.2s;
    }
    .mini-reset:hover { color: #fff; transform: scale(1.1); }
    
    .cinefy-modal h2 { margin-top: 0; font-size: 18px; text-align: center; color: #a855f7;}
    .cinefy-modal label { font-size: 12px; color: #a1a1aa; margin-bottom: 5px; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cinefy-row { display: flex; gap: 10px; align-items: flex-end; margin-bottom: 10px;}
    .cinefy-row > div { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; }
    .cinefy-modal-actions { display: flex; gap: 10px; margin-top: 15px; }
    .cinefy-btn-cancel { background: #ef4444; color: white; }
    #cinefy-toast { position: fixed; bottom: -80px; left: 50%; transform: translateX(-50%); background: #2dd4bf; color: black; font-weight: bold; padding: 12px 45px 12px 25px; border-radius: 20px; z-index: 10000000; transition: 0.4s; box-shadow: 0 4px 15px rgba(0,0,0,0.5); opacity: 0; cursor: pointer; }
    #cinefy-toast.show { bottom: 30px; opacity: 1; }
    #cinefy-toast::after { content: '✕'; position: absolute; right: 15px; top: 50%; transform: translateY(-50%); font-size: 14px; opacity: 0.6; } #cinefy-toast:hover::after { opacity: 1; }
`;
const styleElement = document.createElement('style'); styleElement.innerHTML = uiStyles; document.head.appendChild(styleElement);

// === RASTREADORES GLOBAIS (NOTA E TEMPORADA) ===
let ultimaNotaDetectada = "";
let ultimaTempNotaDetectada = "";

document.addEventListener('click', (e) => {
    if (!appSettings.enableRating) return;
    const btn = e.target.closest('button');
    if (btn && btn.textContent.toLowerCase().includes('avaliar')) {
        const modal = btn.closest('[role="dialog"]') || document.querySelector('div[class*="Panel-sc-"]');
        if (modal) {
            const scoreSpan = modal.querySelector('span[class*="Score-sc-"]');
            if (scoreSpan) ultimaNotaDetectada = scoreSpan.textContent.trim();
            
            const tempDisplay = modal.querySelector('div[class*="SelectMain"] span[class*="DisplayName"]');
            if (tempDisplay) ultimaTempNotaDetectada = tempDisplay.textContent.trim();
        }
    }
}, true); 

// === SIMULAÇÕES DE EVENTOS REACT ===
function esperar(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function simularClique(el) {
    if (!el) return;
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
    el.click();
}

function simularCliqueCoordenadas(el, x, y) {
    if (!el) return;
    const evts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', isPrimary: true };
    el.dispatchEvent(new PointerEvent('pointerdown', evts));
    el.dispatchEvent(new MouseEvent('mousedown', evts));
    el.dispatchEvent(new PointerEvent('pointerup', evts));
    el.dispatchEvent(new MouseEvent('mouseup', evts));
    el.dispatchEvent(new MouseEvent('click', evts));
}

function setReactValue(element, value) {
    if (!element) return;
    const isTextarea = element.tagName === 'TEXTAREA';
    const proto = isTextarea ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    element.focus();
    setter.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
}

async function fecharMenu() {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await esperar(200);
}

async function executarComRetry(verificarFn, delayOriginal, descricao = "") {
    await esperar(delayOriginal);
    let res = await verificarFn();
    if (res) return res;

    if (appSettings.retryOnFail) {
        const delayMetade = Math.max(150, Math.floor(delayOriginal / 2));
        for (let i = 1; i <= 3; i++) {
            await esperar(delayMetade);
            res = await verificarFn();
            if (res) return res;
        }
    }
    return null;
}

// === LÓGICA DE MEMÓRIA DE TAMANHO DO MODAL ===
function gerenciarTamanhoModal() {
    const modal = document.querySelector('.cinefy-modal');
    if (!modal) return;
    
    let w = localStorage.getItem('cinefyModalW');
    let h = localStorage.getItem('cinefyModalH');
    if (w) modal.style.width = w;
    if (h) modal.style.height = h;

    // Salva o tamanho toda vez que o usuário terminar de redimensionar
    modal.addEventListener('mouseup', () => {
        if (modal.style.width) localStorage.setItem('cinefyModalW', modal.style.width);
        if (modal.style.height) localStorage.setItem('cinefyModalH', modal.style.height);
    });

    const btnReset = document.getElementById('btn-reset-modal-size');
    if (btnReset) {
        btnReset.onclick = () => {
            modal.style.width = ''; 
            modal.style.height = ''; 
            localStorage.removeItem('cinefyModalW');
            localStorage.removeItem('cinefyModalH');
        };
    }
}

// === LOCALIZADORES BASEADOS NO HTML DO CINEFY ===
function obterBlocoPergunta(nomeTitulo) {
    const nomeLower = nomeTitulo.toLowerCase().trim();
    const blocos = Array.from(document.querySelectorAll('div[class*="Question-sc-"], div[class*="Container-sc-d623e18b"]'));
    return blocos.find(b => {
        const spanText = b.querySelector('span[class*="Text-sc-"], label[class*="Label-sc-"]');
        return spanText && spanText.textContent.trim().toLowerCase() === nomeLower;
    });
}

function obterValorAtualDoCampo(nomeCampo) {
    const bloco = obterBlocoPergunta(nomeCampo);
    if (!bloco) return "";
    const displaySpan = bloco.querySelector('span[class*="DisplayName"]');
    if (!displaySpan) return "";
    const txt = displaySpan.textContent.trim();
    if (displaySpan.className.includes("Placeholder") || txt.toLowerCase() === "selecionar") return "";
    return txt;
}

function abrirCampoDropdown(bloco) {
    if (!bloco) return null;
    const selectMain = bloco.querySelector('div[class*="SelectMain"]');
    if (selectMain) simularClique(selectMain);
    return selectMain;
}

function clicarOpcaoNoMenu(textoBusca) {
    const busca = textoBusca.toString().toLowerCase().trim();
    const menuContainer = document.querySelector('div[class*="SelectMenuContainer"]') || document.body;

    const elementos = Array.from(menuContainer.querySelectorAll('span, p, div')).filter(el => {
        if (el.closest('#cinefy-container') || el.closest('#cinefy-modal-overlay')) return false;
        if (['INPUT', 'TEXTAREA', 'STYLE', 'SCRIPT'].includes(el.tagName)) return false;
        if (el.offsetWidth === 0 && el.offsetHeight === 0) return false;
        if (el.matches('span[class*="Text-sc-"], label[class*="Label-sc-"]')) return false;

        const txt = el.textContent ? el.textContent.trim().toLowerCase() : '';
        return txt === busca || txt.includes(busca);
    });

    if (elementos.length === 0) return false;

    elementos.sort((a, b) => a.textContent.trim().length - b.textContent.trim().length);
    const alvo = elementos[0];

    const itemLinha = alvo.closest('div[class*="Container-sc-5e52fe2-0"]') || alvo.parentElement || alvo;
    const svgIcon = itemLinha.querySelector('div[class*="Icon"] svg');
    if (svgIcon) {
        const pathData = svgIcon.innerHTML;
        if (!pathData.includes('M208,28H48')) return true; 
    }

    simularClique(alvo.closest('div[role="option"], li, button') || alvo);
    return true;
}

function gerarTitulo(baseName, temp, ep) {
    let epF = ep ? ep.toString().trim() : "01";
    if (epF.length === 1) epF = "0" + epF;
    let t = temp ? temp.toString().trim() : "";
    let nomeLimpo = baseName.replace(/\s*\(\d{4}\)$/, '').trim();
    
    if (t !== "") {
        let tpl = appSettings.titleTemp || "{obra} | T{temp} Ep. {ep}";
        return tpl.replace(/{obra}/g, nomeLimpo).replace(/{temp}/g, t).replace(/{ep}/g, epF);
    } else {
        let tpl = appSettings.titleNoTemp || "{obra} | Ep. {ep}";
        return tpl.replace(/{obra}/g, nomeLimpo).replace(/{ep}/g, epF);
    }
}

// === INTERAÇÕES AUTOMÁTICAS ===

async function vincularObra(nomeObra) {
    if (!nomeObra) return;
    const blocoObra = document.querySelector('div[class*="Container-sc-d623e18b"]') || obterBlocoPergunta("Vincular a uma obra (opcional)");
    if (!blocoObra) return;

    const cardSelected = blocoObra.querySelector('div[class*="selected"]');
    if (cardSelected) {
        const pNome = cardSelected.querySelector('p');
        const nomeAtual = pNome ? pNome.textContent.trim().toLowerCase() : "";
        if (nomeAtual === nomeObra.toLowerCase().trim()) return; 
        
        const btnRemover = cardSelected.querySelector('button');
        if (btnRemover) {
            simularClique(btnRemover);
            await esperar(500);
        }
    }

    let inputObra = blocoObra.querySelector('input') || document.querySelector('input[placeholder*="Pesquisar obra" i]');
    if (!inputObra) return;

    setReactValue(inputObra, nomeObra);

    await executarComRetry(() => {
        let nomeSemAno = nomeObra.replace(/\s*\(\d{4}\)$/, '').trim().toLowerCase();
        const menuContainer = document.querySelector('div[class*="SelectMenuContainer"]') || document.body;
        const opcoesObra = Array.from(menuContainer.querySelectorAll('div[class*="Container-sc-b5b30e7e"]'));
        
        for (let op of opcoesObra) {
            const pTitle = op.querySelector('p'); 
            if (pTitle && pTitle.textContent.trim().toLowerCase() === nomeSemAno) {
                simularClique(op);
                return true;
            }
        }
        
        if (opcoesObra.length > 0) {
            simularClique(opcoesObra[0]);
            return true;
        }
        return false;
    }, appSettings.delayObra, `Obra: ${nomeObra}`);

    await fecharMenu();
}

async function selecionarTags(tagsStr) {
    if (!tagsStr) return;
    const bloco = obterBlocoPergunta("Tags");
    if (!bloco) return;

    const valorAtual = obterValorAtualDoCampo("Tags");
    const listaTags = tagsStr.split(',').map(t => t.trim()).filter(Boolean);
    if (listaTags.length === 1 && valorAtual.toLowerCase() === listaTags[0].toLowerCase()) return;

    abrirCampoDropdown(bloco);
    await esperar(appSettings.delayMenu);

    for (let tag of listaTags) {
        await executarComRetry(() => clicarOpcaoNoMenu(tag), appSettings.delayMenu, `Tag: ${tag}`);
        await esperar(200);
    }
    await fecharMenu();
}

async function selecionarPlaylist(nomePlaylist) {
    if (!nomePlaylist) return;
    const bloco = obterBlocoPergunta("Playlists");
    if (!bloco) return;

    const valorAtual = obterValorAtualDoCampo("Playlists");
    if (valorAtual.toLowerCase().includes(nomePlaylist.toLowerCase().trim())) return; 

    abrirCampoDropdown(bloco);
    await esperar(appSettings.delayMenu);

    let achou = clicarOpcaoNoMenu(nomePlaylist);

    if (!achou) {
        const menuFlutuante = document.querySelector('div[class*="SelectMenuContainer"]') || document.body;
        const campoBusca = menuFlutuante.querySelector('input[placeholder*="Buscar" i]') || menuFlutuante.querySelector('input');
        if (campoBusca) {
            setReactValue(campoBusca, nomePlaylist);
            await executarComRetry(() => clicarOpcaoNoMenu(nomePlaylist), appSettings.delayPlaylist, `Playlist: ${nomePlaylist}`);
        }
    }
    await fecharMenu();
}

async function selecionarClassificacao(idadeStr) {
    if (!idadeStr) return;
    const bloco = obterBlocoPergunta("Classificação indicativa");
    if (!bloco) return;

    const valorAtual = obterValorAtualDoCampo("Classificação indicativa");
    if (valorAtual.toLowerCase().includes(idadeStr.toLowerCase().trim())) return; 

    abrirCampoDropdown(bloco);
    await esperar(appSettings.delayMenu);

    const apenasNum = idadeStr.replace(/\D/g, '');
    const isLivre = idadeStr.toLowerCase().includes('livre') || idadeStr.toLowerCase().trim() === 'l';

    await executarComRetry(() => {
        if (isLivre) return clicarOpcaoNoMenu("[l]");
        if (apenasNum) return clicarOpcaoNoMenu(`[+${apenasNum}]`);
        return clicarOpcaoNoMenu(idadeStr);
    }, appSettings.delayMenu, `Classificação: ${idadeStr}`);

    await fecharMenu();
}

// 6: Aplicar Avaliação (NOTA) INTELIGENTE
async function aplicarNota(notaDesejada, temporadaDesejada, tituloOriginalHelper, contexto) {
    logger.log(`[Cinefy Autofill -> aplicarNota] 🎬 Alvo: Nota ${notaDesejada} na [${temporadaDesejada}]`);
    if (!notaDesejada || !appSettings.enableRating) return;
    if (!temporadaDesejada) temporadaDesejada = "Todas as temporadas";

    let valDesejado = parseFloat(notaDesejada);
    if (isNaN(valDesejado)) valDesejado = 10;
    if (valDesejado < 1) valDesejado = 1;
    if (valDesejado > 10) valDesejado = 10;

    const blocoObra = document.querySelector('div[class*="Container-sc-d623e18b"]') || obterBlocoPergunta("Vincular a uma obra");
    if (!blocoObra) return;

    // LÓGICA INTELIGENTE 1: Verifica na tela se já está avaliado corretamente (Pulo)
    const pAvaliacao = Array.from(blocoObra.querySelectorAll('p')).find(p => p.textContent.toLowerCase().includes('sua avaliação'));
    if (pAvaliacao && !MODO_TESTE_NOTA) {
        const textoAval = pAvaliacao.textContent.toLowerCase(); // "sua avaliação · new world: 8.00"
        
        let seasonStrInUI = textoAval.includes('·') ? textoAval.split('·')[1].split(':')[0].trim() : "todas as temporadas";
        let seasonMatches = false;
        
        if (temporadaDesejada.toLowerCase() === "todas as temporadas") {
            if (seasonStrInUI === "todas as temporadas") seasonMatches = true;
        } else {
            if (seasonStrInUI === temporadaDesejada.toLowerCase()) seasonMatches = true;
            // Verifica o nome exato retornado da Helper (Ex: "Dr. STONE New World" contém "new world")
            if (tituloOriginalHelper && tituloOriginalHelper.toLowerCase().includes(seasonStrInUI)) seasonMatches = true;
        }
        
        if (seasonMatches) {
            const matchNota = textoAval.match(/(\d+\.\d{2})/);
            const currentScore = matchNota ? parseFloat(matchNota[1]) : 0;
            
            if (Math.abs(currentScore - valDesejado) < 0.1) {
                logger.log(`[Cinefy Autofill] ✅ A nota ${valDesejado} já está certa na tela principal. Pulando modal.`);
                return; // Pula totalmente sem nem abrir o modal!
            } else {
                logger.warn(`[Cinefy Autofill] 🔒 TRAVA DE 24H ATIVA. A nota está diferente, mas o Cinefy não deixa trocar agora. Cancelando.`);
                return;
            }
        }
    }

    const btnAbrirNota = Array.from(blocoObra.querySelectorAll('button')).find(b => {
        const text = b.textContent.toLowerCase();
        return text.includes('nota') || text.includes('avaliar') || text.includes('avaliação');
    });

    if (!btnAbrirNota) return;

    simularClique(btnAbrirNota);
    await esperar(800);

    const modal = document.querySelector('[role="dialog"]') || document.querySelector('div[class*="Panel-sc-"]');
    if (!modal) return;

    let notaUsada = valDesejado;
    const btnTemp = modal.querySelector('div[class*="SelectMain"]');
    
    if (btnTemp) {
        const spanDisplay = btnTemp.querySelector('span[class*="DisplayName"]');
        const currentTemp = spanDisplay ? spanDisplay.textContent.trim().toLowerCase() : "";
        
        if (currentTemp !== temporadaDesejada.toLowerCase()) {
            simularClique(btnTemp);
            await esperar(500); 
            
            let clicouOpcao = false;
            const menuContainer = document.querySelector('div[class*="SelectMenuContainer"]') || document.body;
            const elementosList = Array.from(menuContainer.querySelectorAll('span, p, div')).filter(el => {
                if (el.closest('#cinefy-container') || el.closest('#cinefy-modal-overlay')) return false;
                if (el.matches('span[class*="Text-sc-"], label[class*="Label-sc-"]')) return false;
                return el.textContent && el.textContent.trim().length > 1;
            });
            elementosList.sort((a, b) => a.textContent.trim().length - b.textContent.trim().length);

            if (tituloOriginalHelper) {
                let originalLower = tituloOriginalHelper.toLowerCase();
                for (let el of elementosList) {
                    let txt = el.textContent.trim().toLowerCase();
                    if (txt.length > 3 && originalLower.includes(txt) && txt !== "todas as temporadas") {
                        simularClique(el.closest('div[role="option"], li, button') || el);
                        clicouOpcao = true;
                        break;
                    }
                }
            }
            
            if (!clicouOpcao) {
                clicouOpcao = clicarOpcaoNoMenu(temporadaDesejada);
            }

            if (!clicouOpcao) {
                clicouOpcao = clicarOpcaoNoMenu("Todas as temporadas");
                
                if (contexto) {
                    if (contexto.modelo.notaTemporada && contexto.modelo.notaTemporada.toLowerCase() === "todas as temporadas" && contexto.modelo.nota) {
                        notaUsada = parseFloat(contexto.modelo.nota);
                    } else {
                        let tempNumAtual = parseInt(contexto.temporada) || 1;
                        if (tempNumAtual > 1 && appSettings.enableIntegration && typeof obterNotaDaIntegracao === "function") {
                            showToast("🔄 Calculando média das temporadas...", 4000);
                            let soma = 0, count = 0;
                            for (let t = 1; t <= tempNumAtual; t++) {
                                let res = await obterNotaDaIntegracao(contexto.modelo.nomeObra, t, 1);
                                if (res && res.sucesso && res.nota) {
                                    soma += parseFloat(res.nota);
                                    count++;
                                }
                            }
                            if (count > 0) {
                                notaUsada = soma / count;
                                showToast(`⭐ Média (1 a ${tempNumAtual}): ${notaUsada.toFixed(2)}`, 4000);
                            }
                        }
                    }
                }
            }
            await esperar(600); 
        }
    }

    // LÓGICA INTELIGENTE 2: Verifica a nota DENTRO do modal antes de mudar a barra
    const scoreSpanModal = modal.querySelector('span[class*="Score-sc-"]');
    const currentModalScore = scoreSpanModal ? parseFloat(scoreSpanModal.textContent.trim()) : 0;
    
    if (Math.abs(currentModalScore - notaUsada) < 0.1) {
        logger.log(`[Cinefy Autofill] A nota do modal já é ${notaUsada}. Fechando sem salvar.`);
        await fecharMenu();
        return;
    }

    const track = modal.querySelector('div[class*="Track-sc-"]');
    if (track) {
        const rect = track.getBoundingClientRect();
        if (isNaN(notaUsada)) notaUsada = 10;
        if (notaUsada < 1) notaUsada = 1;
        if (notaUsada > 10) notaUsada = 10;
        
        const percent = (notaUsada - 1) / 9;
        const targetX = rect.left + (rect.width * percent);
        const targetY = rect.top + (rect.height / 2);

        simularCliqueCoordenadas(track, targetX, targetY);
        await esperar(400); 
    }

    const btnAvaliar = Array.from(modal.querySelectorAll('button')).find(b => b.textContent.trim().toLowerCase() === 'avaliar');
    
    if (MODO_TESTE_NOTA) {
        showToast(`🛠️ TESTE: Barra movida para ${notaUsada}. Modal mantido aberto!`);
    } else {
        if (btnAvaliar) {
            simularClique(btnAvaliar);
            await esperar(400);
        } else {
            await fecharMenu();
        }
    }
}


function extrairObraAtual(tituloCompleto) {
    const blocoObra = document.querySelector('div[class*="Container-sc-d623e18b"]') || obterBlocoPergunta("Vincular a uma obra (opcional)");
    if (blocoObra) {
        const pNome = blocoObra.querySelector('div[class*="selected"] p');
        if (pNome && pNome.textContent.trim()) return pNome.textContent.trim(); 
    }
    return tituloCompleto ? tituloCompleto.split(/[|-]/)[0].trim() : "";
}

function lerVisibilidade() { 
    let activeOpt = document.querySelector('div[class*="Option-sc-"].active span[class*="OptionTitle"]'); 
    return activeOpt ? activeOpt.textContent.trim() : ""; 
}

// === INTERFACE DO PAINEL CINEFY ===
document.body.insertAdjacentHTML('beforeend', `
    <div id="cinefy-container">
        <button id="cinefy-min-btn" title="Expandir Cinefy Autofill">🎬</button>
        <div id="cinefy-panel">
            <div class="cinefy-header">
                <button id="cinefy-collapse-btn" class="cinefy-icon-btn" title="Minimizar Painel">▼</button>
                <h3>🎬 Cinefy Autofill</h3>
                <button id="cinefy-settings-btn" class="cinefy-icon-btn" title="Configurações">⚙️</button>
            </div>
            
            <div id="video-menu">
                <select id="cinefy-slot">
                    <option value="0">Slot 1 (Vazio)</option><option value="1">Slot 2 (Vazio)</option><option value="2">Slot 3 (Vazio)</option>
                    <option value="3">Slot 4 (Vazio)</option><option value="4">Slot 5 (Vazio)</option>
                </select>
                <button id="cinefy-btn-template" class="cinefy-btn cinefy-btn-template">📝 Inserir Template Rápido</button>
                <button id="cinefy-btn-save" class="cinefy-btn cinefy-btn-save">💾 Copiar & Salvar Tela</button>
                <button id="cinefy-btn-fill" class="cinefy-btn cinefy-btn-fill">⚡ Preencher Vídeo</button>
            </div>
            
            <div id="playlist-menu" style="display: none;">
                <p style="font-size:12px; color:#a1a1aa; text-align:center; margin-top:0; margin-bottom:15px;">Organiza os episódios automaticamente.</p>
                <button id="cinefy-btn-sort" class="cinefy-btn cinefy-btn-fill">🪄 Ordenar Episódios</button>
            </div>
        </div>
    </div>
    <div id="cinefy-modal-overlay"></div>
    <div id="cinefy-toast">Mensagem</div>
`);

let cinefyToastTimeout; 
const toastEl = document.getElementById('cinefy-toast');

function showToast(msg, duration = 4000) { 
    toastEl.innerText = msg; 
    toastEl.classList.add('show'); 
    clearTimeout(cinefyToastTimeout); 
    cinefyToastTimeout = setTimeout(() => { toastEl.classList.remove('show'); }, duration); 
}
toastEl.addEventListener('click', () => { 
    toastEl.classList.remove('show'); 
    clearTimeout(cinefyToastTimeout); 
});

let isPanelCollapsed = false; const container = document.getElementById('cinefy-container'); const panel = document.getElementById('cinefy-panel'); const minBtn = document.getElementById('cinefy-min-btn');
document.getElementById('cinefy-collapse-btn').addEventListener('click', () => { isPanelCollapsed = true; panel.classList.add('collapsed'); minBtn.classList.add('show'); });
minBtn.addEventListener('click', () => { isPanelCollapsed = false; panel.classList.remove('collapsed'); minBtn.classList.remove('show'); });

document.getElementById('cinefy-settings-btn').addEventListener('click', () => {
    chrome.runtime.sendMessage({action: "open_settings"}); 
});

setInterval(() => { 
    const path = window.location.pathname;
    const isEditVideoPage = path.match(/^\/studio\/video\/.+/);
    const isPlaylistPage = path.match(/^\/studio\/playlist\/.+/);

    if (isEditVideoPage || isPlaylistPage) { container.classList.add('on-page'); } else { container.classList.remove('on-page'); } 
    if (isEditVideoPage) { document.getElementById('video-menu').style.display = 'block'; document.getElementById('playlist-menu').style.display = 'none'; } 
    else if (isPlaylistPage) { document.getElementById('video-menu').style.display = 'none'; document.getElementById('playlist-menu').style.display = 'block'; }
}, 500);

let arrayModelos = [null, null, null, null, null];
chrome.storage.local.get(['cinefySlots', 'slotAtivo'], function(data) {
    if (data.cinefySlots) arrayModelos = data.cinefySlots;
    let select = document.getElementById('cinefy-slot');
    if (data.slotAtivo) select.value = data.slotAtivo;
    atualizarNomesSelect();
});

function atualizarNomesSelect() {
    let select = document.getElementById('cinefy-slot');
    for (let i = 0; i < 5; i++) {
        let nObj = arrayModelos[i] || {};
        let nome = appSettings.useObraAsTitle ? (nObj.nomeObra || `(Vazio)`) : (nObj.titulo || `(Vazio)`);
        select.options[i].text = `Slot ${i + 1}: ${nome}`;
    }
}
document.getElementById('cinefy-slot').addEventListener('change', (e) => { chrome.storage.local.set({ 'slotAtivo': e.target.value }); });
const overlay = document.getElementById('cinefy-modal-overlay');

document.getElementById('cinefy-btn-template').addEventListener('click', () => {
    let campoTitulo = document.querySelector('input[placeholder="Seu título"]');
    if (campoTitulo) setReactValue(campoTitulo, appSettings.titleTemplate);
    let campoDescricao = document.querySelector('textarea');
    if (campoDescricao) setReactValue(campoDescricao, appSettings.descTemplate);
    showToast("📝 Template Padrão Inserido!");
});

// Copiar & Salvar Tela
function triggerSalvar() {
    let campoTitulo = document.querySelector('input[placeholder="Seu título"]');
    let l_titulo_bruto = campoTitulo ? campoTitulo.value : "";
    let l_titulo = l_titulo_bruto.split('|')[0].trim(); // Extrai apenas o nome base
    
    let l_obra = extrairObraAtual(l_titulo_bruto);
    let l_desc = document.querySelector('textarea') ? document.querySelector('textarea').value : "";
    let l_play = obterValorAtualDoCampo("Playlists");
    let l_idade = obterValorAtualDoCampo("Classificação indicativa");
    let l_tags = obterValorAtualDoCampo("Tags");
    let l_vis = appSettings.copyVis ? lerVisibilidade() : "";

    let l_nota = "";
    let l_nota_temp = "Todas as temporadas";

    const blocoObra = document.querySelector('div[class*="Container-sc-d623e18b"]') || obterBlocoPergunta("Vincular a uma obra");
    if (blocoObra) {
        const pAvaliacao = Array.from(blocoObra.querySelectorAll('p')).find(p => p.textContent.toLowerCase().includes('sua avaliação'));
        if (pAvaliacao) {
            const textoAval = pAvaliacao.textContent; 
            const matchNota = textoAval.match(/(\d+\.\d{2})/);
            if (matchNota) l_nota = matchNota[1];
            
            if (textoAval.includes('·')) {
                const partes = textoAval.split('·');
                if (partes.length > 1) {
                    l_nota_temp = partes[1].split(':')[0].trim();
                }
            }
        }
    }

    overlay.innerHTML = `
        <div class="cinefy-modal">
            <h2>Revisar Modelo <button id="btn-reset-modal-size" class="mini-reset" title="Resetar Tamanho">↺</button></h2>
            <div class="cinefy-row">
                <div style="flex: 1;">
                    <label>Obra Vinculada (Com Ano)</label>
                    <input id="m-obra" class="cinefy-input" value="${l_obra}">
                </div>
                <div style="flex: 1;">
                    <label>Título Escrito (Original)</label>
                    <input id="m-titulo" class="cinefy-input" value="${l_titulo}" placeholder="Ex: Meu Episódio">
                </div>
            </div>
            
            <div class="cinefy-row">
                <div style="flex: 2;">
                    <label>Temporada da Nota</label>
                    <input id="m-nota-temp" class="cinefy-input" value="${l_nota_temp}" placeholder="Ex: Temporada 1">
                </div>
                <div style="flex: 1;">
                    <label>Nota / 10</label>
                    <input id="m-nota" class="cinefy-input" value="${l_nota}" placeholder="Ex: 5.55">
                </div>
            </div>

            <label>Playlist</label>
            <input id="m-play" class="cinefy-input" value="${l_play}">
            <label>Classificação Indicativa</label>
            <input id="m-idade" class="cinefy-input" value="${l_idade}">
            <label>Tags (Separadas por vírgula)</label>
            <input id="m-tags" class="cinefy-input" value="${l_tags}">
            <div class="cinefy-modal-actions">
                <button id="btn-cancel-modal" class="cinefy-btn cinefy-btn-cancel">Cancelar</button>
                <button id="btn-save-modal" class="cinefy-btn cinefy-btn-save">Salvar no Slot</button>
            </div>
        </div>
    `;
    overlay.style.display = 'flex';
    gerenciarTamanhoModal(); // Ativa a memória do Resize
    
    document.getElementById('btn-cancel-modal').onclick = () => { overlay.style.display = 'none'; };
    document.getElementById('btn-save-modal').onclick = () => {
        let slotIndex = document.getElementById('cinefy-slot').value;
        arrayModelos[slotIndex] = {
            nomeObra: document.getElementById('m-obra').value.trim(),
            titulo: document.getElementById('m-titulo').value.trim(),
            notaTemporada: document.getElementById('m-nota-temp').value.trim(),
            nota: document.getElementById('m-nota').value.trim(),
            playlist: document.getElementById('m-play').value.trim(),
            idade: document.getElementById('m-idade').value.trim(),
            tags: document.getElementById('m-tags').value.trim(),
            descricao: l_desc,
            visibility: l_vis,
            ultimoEp: arrayModelos[slotIndex]?.ultimoEp || "00",
            ultimaTemp: arrayModelos[slotIndex]?.ultimaTemp || ""
        };
        chrome.storage.local.set({ 'cinefySlots': arrayModelos }, () => {
            atualizarNomesSelect();
            overlay.style.display = 'none';
            showToast("✅ Modelo Salvo com Sucesso!");
        });
    };
}
document.getElementById('cinefy-btn-save').addEventListener('click', triggerSalvar);

// Preencher Vídeo
function triggerPreencher() {
    let slotIndex = document.getElementById('cinefy-slot').value;
    let modelo = arrayModelos[slotIndex];
    if (!modelo) { showToast("❌ Este Slot está vazio! Salve primeiro."); return; }
    let nextEp = modelo.ultimoEp ? (parseInt(modelo.ultimoEp) + 1).toString().padStart(2, '0') : "01";
    let lastTemp = modelo.ultimaTemp || "";

    overlay.innerHTML = `
        <div class="cinefy-modal">
            <h2>Preencher: ${appSettings.useObraAsTitle ? modelo.nomeObra : modelo.titulo} <button id="btn-reset-modal-size" class="mini-reset" title="Resetar Tamanho">↺</button></h2>
            <div class="cinefy-row">
                <div><label>Temporada (Opcional)</label><input id="m-temp" class="cinefy-input" value="${lastTemp}" placeholder="Ex: 1"></div>
                <div><label>Episódio</label><input id="m-ep" type="number" class="cinefy-input" value="${nextEp}"></div>
            </div>
            <div class="cinefy-modal-actions">
                <button id="btn-cancel-modal" class="cinefy-btn cinefy-btn-cancel">Cancelar</button>
                <button id="btn-fill-modal" class="cinefy-btn cinefy-btn-fill">Confirmar</button>
            </div>
        </div>
    `;
    overlay.style.display = 'flex';
    gerenciarTamanhoModal(); // Ativa a memória do Resize
    
    document.getElementById('m-ep').focus(); 
    document.getElementById('btn-cancel-modal').onclick = () => { overlay.style.display = 'none'; };
    document.getElementById('btn-fill-modal').onclick = () => {
        let nTemp = document.getElementById('m-temp').value;
        let nEp = document.getElementById('m-ep').value;
        arrayModelos[slotIndex].ultimaTemp = nTemp;
        arrayModelos[slotIndex].ultimoEp = nEp;
        chrome.storage.local.set({ 'cinefySlots': arrayModelos });
        overlay.style.display = 'none';
        showToast("⚡ Iniciando preenchimento...");
        iniciarPreenchimentoAutomatico(modelo, nTemp, nEp);
    };
}
document.getElementById('cinefy-btn-fill').addEventListener('click', triggerPreencher);

async function iniciarPreenchimentoAutomatico(modelo, temporada, episodio) {
    let nomeBaseParaTitulo = appSettings.useObraAsTitle ? modelo.nomeObra : modelo.titulo;
    if (!nomeBaseParaTitulo) nomeBaseParaTitulo = modelo.titulo || modelo.nomeObra;

    let tituloFinal = gerarTitulo(nomeBaseParaTitulo, temporada, episodio);
    let campoTitulo = document.querySelector('input[placeholder="Seu título"]');
    if (campoTitulo) setReactValue(campoTitulo, tituloFinal);
    
    let campoDescricao = document.querySelector('textarea');
    if (campoDescricao) setReactValue(campoDescricao, modelo.descricao);

    if (modelo.nomeObra) await vincularObra(modelo.nomeObra);

    if (appSettings.enableRating) {
        logger.log("[Cinefy Autofill] 📋 Avaliação automática ativada.");
        let notaFinal = modelo.nota;
        let tempFinal = modelo.notaTemporada;
        let tituloOriginalHelper = "";

        if (appSettings.enableIntegration && typeof obterNotaDaIntegracao === "function") {
            showToast("🔄 Consultando nota na extensão Mal Notas Extras...", 2000);
            let res = await obterNotaDaIntegracao(modelo.nomeObra, temporada, episodio);
            
            if (res && res.sucesso && res.nota) {
                notaFinal = res.nota;
                tituloOriginalHelper = res.tituloOriginal; 
                tempFinal = temporada ? `Temporada ${temporada}` : "Todas as temporadas"; 
                showToast(`⭐ Nota ${notaFinal} obtida via Integração!`, 3000);
            } else {
                showToast(notaFinal ? "⚠️ Usando nota salva no Slot local." : "⚠️ Nenhuma nota disponível.", 2000);
            }
        } 

        if (notaFinal || typeof obterNotaDaIntegracao === "function") {
            await aplicarNota(notaFinal, tempFinal, tituloOriginalHelper, { modelo: modelo, temporada: temporada });
        }
    }

    if (modelo.tags) await selecionarTags(modelo.tags);
    if (modelo.playlist) await selecionarPlaylist(modelo.playlist);
    if (modelo.idade) await selecionarClassificacao(modelo.idade);

    if (appSettings.copyVis && modelo.visibility) {
        let visSpans = Array.from(document.querySelectorAll('span'));
        let visBtn = visSpans.find(s => s.textContent.trim().toLowerCase() === modelo.visibility.toLowerCase());
        if (visBtn) simularClique(visBtn.closest('button, div') || visBtn);
    }

    showToast("✅ Tudo preenchido com sucesso!");
    logger.log("[Cinefy Autofill] 🎉 Preenchimento concluído.");
}

document.addEventListener('keydown', function(event) {
    if (!window.location.pathname.match(/^\/studio\/video\/.+/)) return;
    let s = appSettings.shSave; let b = appSettings.shFill; let k = event.key.toLowerCase();
    if (k === s.key && event.altKey === s.altKey && event.ctrlKey === s.ctrlKey && event.shiftKey === s.shiftKey) {
        event.preventDefault(); triggerSalvar();
    }
    else if (k === b.key && event.altKey === b.altKey && event.ctrlKey === b.ctrlKey && event.shiftKey === b.shiftKey) {
        event.preventDefault(); triggerPreencher();
    }
});

// === ORDENADOR DE PLAYLIST ===
document.getElementById('cinefy-btn-sort').addEventListener('click', async () => {
    let listContainer = document.querySelector('div[class*="VideoList"]');
    if (!listContainer) return;
    showToast("🪄 Iniciando ordenação profunda... Não mexa o mouse!", 4000);

    let maxMoves = 40; let moves = 0; let isSorted = false;
    while (!isSorted && moves < maxMoves) {
        let items = Array.from(listContainer.querySelectorAll('div[draggable="true"]'));
        if (items.length < 2) break;

        let parsedItems = items.map(el => {
            let titleEl = el.querySelector('span[class*="Title"]');
            let title = titleEl ? titleEl.textContent.trim() : "";
            let season = 1; let ep = 0;
            let sMatch = title.match(/T\s*(\d+)/i);
            if (sMatch) season = parseInt(sMatch[1]);
            let eMatch = title.match(/Ep\.?\s*(\d+)/i);
            if (eMatch) { ep = parseInt(eMatch[1]); } 
            else { let lastNum = title.match(/(\d+)(?!.*\d)/); if (lastNum) ep = parseInt(lastNum[1]); }
            return { title, season, ep, id: el.getAttribute('data-handler-id'), node: el };
        });

        let currentIds = parsedItems.map(i => i.id);
        let targetOrder = [...parsedItems].sort((a, b) => {
            if (a.season !== b.season) return a.season - b.season;
            return a.ep - b.ep;
        });
        let targetIds = targetOrder.map(i => i.id);

        if (JSON.stringify(currentIds) === JSON.stringify(targetIds)) {
            isSorted = true;
            break;
        }

        for (let i = 0; i < targetIds.length; i++) {
            if (currentIds[i] !== targetIds[i]) {
                let sourceItem = parsedItems.find(p => p.id === targetIds[i]);
                let targetItem = parsedItems[i]; 
                showToast(`🪄 Ajustando: ${sourceItem.title} -> Posição ${i + 1}`, 4000);
                targetItem.node.scrollIntoView({block: 'center', behavior: 'smooth'});
                await esperar(600); 
                await arrastarESoltarSmooth(sourceItem.node, targetItem.node);
                await esperar(2000); 
                moves++;
                break; 
            }
        }
    }

    if (isSorted) { showToast("✅ Playlist ordenada perfeitamente!", 5000); } 
    else { showToast("⚠️ Limite de movimentos atingido. Clique novamente se faltaram vídeos.", 5000); }
});

async function arrastarESoltarSmooth(source, target) {
    const dataTransfer = new DataTransfer();
    dataTransfer.effectAllowed = 'move';
    let dragHandle = source.querySelector('svg') ? source.querySelector('svg').parentElement : source;
    let rectSource = dragHandle.getBoundingClientRect();
    let rectTarget = target.getBoundingClientRect();
    let startX = rectSource.left + (rectSource.width / 2);
    let startY = rectSource.top + (rectSource.height / 2);
    let endX = rectTarget.left + (rectTarget.width / 2);
    let endY = rectTarget.top + (rectTarget.height / 2);

    let dragStartEvt = new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer, clientX: startX, clientY: startY });
    dragHandle.dispatchEvent(dragStartEvt);
    await esperar(50);

    let steps = 15;
    for (let i = 1; i <= steps; i++) {
        let curX = startX + ((endX - startX) * (i / steps));
        let curY = startY + ((endY - startY) * (i / steps));
        let elUnder = document.elementFromPoint(curX, curY) || target;
        let dragOverEvt = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer, clientX: curX, clientY: curY });
        elUnder.dispatchEvent(dragOverEvt);
        await esperar(30);
    }

    let dropEvt = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer, clientX: endX, clientY: endY });
    target.dispatchEvent(dropEvt);
    let dragEndEvt = new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer });
    dragHandle.dispatchEvent(dragEndEvt);
}