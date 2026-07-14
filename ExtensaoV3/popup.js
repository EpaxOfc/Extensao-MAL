function normalizarCriterio(nome) {
    if (!nome) return "";
    let n = nome.trim();

    const correcoes = [
        { regex: /Dire.*(ced|amp|ccedil|tilde|ccedil|atilde).*o/i, sub: "Direção" },
        { regex: /Anim.*(ced|amp|ccedil|tilde|ccedil|atilde).*o/i, sub: "Animação" },
        { regex: /M.*(amp|acute|eacut|dia).*dia/i, sub: "Média" },
        { regex: /Complexidade/i, sub: "Complexidade" },
        { regex: /Enredo/i, sub: "Enredo" },
        { regex: /Originalidade/i, sub: "Originalidade" },
        { regex: /Design/i, sub: "Design" },
        { regex: /Coreografia/i, sub: "Coreografia de luta" },
        { regex: /Personagens/i, sub: "Personagens Principais" },
        { regex: /Antagonista/i, sub: "Antagonista" },
        { regex: /Fotografia/i, sub: "Direção de fotografia" },
        { regex: /Trilha/i, sub: "Trilha Sonora" },     
        { regex: /Efeito/i, sub: "Efeitos Sonoros" }   
    ];

    for (let c of correcoes) {
        if (c.regex.test(n)) {
            return c.sub;
        }
    }
    return n;
}

let ultimoNomeIniciado = ""; 
let timerDetectar = null;   

document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('btnOptions').addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });
    
    verificarModoDeSalvamento();
    verificarConexaoNecessaria();
    configurarOuvintes();

    chrome.storage.local.get(['syncMal', 'viewMode', 'officialScore'], (res) => {
        if (res.syncMal) {
            const btn = document.getElementById('btnSalvar');
            btn.innerText = "SALVAR NO MAL";
            btn.style.background = "#2e51a2"; 
        }

        const mode = res.viewMode || 'popup';
        document.body.classList.remove('popup-mode', 'sidepanel-mode');
        document.body.classList.add(mode + '-mode');

        // 👈 Controla exibição do campo de nota oficial do MAL com base na preferência
        const boxMalOficial = document.getElementById('malOfficialScoreBox');
        if (boxMalOficial) {
            boxMalOficial.style.display = res.officialScore ? 'none' : 'flex';
        }
    });

    iniciarRapido();
});

chrome.tabs.onActivated.addListener(iniciarLento);

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tab.active && (changeInfo.url || changeInfo.status === 'complete')) {
        iniciarLento();
    }
});

document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        iniciarRapido();
    }
});

function debouncedDetectar(tempoEspera) {
    clearTimeout(timerDetectar);
    timerDetectar = setTimeout(() => {
        detectarEIniciar();
    }, tempoEspera);
}

function iniciarRapido() {
    debouncedDetectar(150);
}

function iniciarLento() {
    debouncedDetectar(5000);
}

function detectarEIniciar() {
    if (document.hidden) return;

    chrome.storage.local.get(['ultimoAnimeDetectado', 'ultimoAnimeDetectadoExato'], function(result) {
        if (result.ultimoAnimeDetectado) {
            iniciar(result.ultimoAnimeDetectado, null, result.ultimoAnimeDetectadoExato);
            chrome.storage.local.remove(['ultimoAnimeDetectado', 'ultimoAnimeDetectadoExato']);
        } else {
            chrome.tabs.query({active: true, lastFocusedWindow: true}, function(tabs) {
                let activeTab = tabs[0];
                if (!activeTab || !activeTab.url) {
                    iniciar("", null);
                    return;
                }
                
                chrome.tabs.sendMessage(activeTab.id, { action: "SOLICITAR_NOME_ANIME" }, (response) => {
                    if (!chrome.runtime.lastError && response && response.nome) {
                        iniciar(response.nome, response.epAtual, response.animeExato);
                    } else {
                        chrome.scripting.executeScript({
                            target: { tabId: activeTab.id },
                            func: () => {
                                try {
                                    let scripts = document.querySelectorAll('script[type="application/ld+json"]');
                                    for (let script of scripts) {
                                        if (script.textContent.includes('"TVEpisode"')) {
                                            let data = JSON.parse(script.textContent);
                                            let item = Array.isArray(data) ? data.find(x => x["@type"] && x["@type"].includes("TVEpisode")) : data;
                                            if (item && item.partOfSeries) {
                                                let nome = item.partOfSeries.name.replace(/\(.*Dub.*\)/i, "").trim();
                                                let season = item.partOfSeason ? item.partOfSeason.seasonNumber : null;
                                                if (season && parseInt(season) > 1) {
                                                    let num = parseInt(season);
                                                    let sufixo = num === 2 ? "2nd Season" : num === 3 ? "3rd Season" : num + "th Season";
                                                    return { nome: `${nome} ${sufixo}`, ep: item.episodeNumber };
                                                }
                                                return { nome: nome, ep: item.episodeNumber };
                                            }
                                        }
                                    }
                                } catch(e){}
                                return null;
                            }
                        }, (results) => {
                            if (results && results[0] && results[0].result) {
                                iniciar(results[0].result.nome, results[0].result.ep);
                            } else {
                                iniciar(limparTitulo(activeTab.title), null);
                            }
                        });
                    }
                });
            });
        }
    });
}

async function iniciar(nomeInicial, epAtual, animeExato = null) {
    if (nomeInicial === ultimoNomeIniciado) return; 
    ultimoNomeIniciado = nomeInicial;
    document.getElementById('animeTitle').value = nomeInicial;

    const termosProibidos = ["Anata no wo", "Eigakan", "Netflix", "Crunchyroll", "Google Drive", "Prime Video"];
    let nomeEhValido = !termosProibidos.some(termo => nomeInicial.toLowerCase().includes(termo.toLowerCase()));
    if (!nomeEhValido || !nomeInicial) nomeInicial = ""; 

    chrome.storage.local.get([nomeInicial, 'isCorrectionMode'], async function(result) {
        
        if (result.isCorrectionMode) {
            let container = document.getElementById('correctionModeContainer');
            container.style.display = 'block';
            
            let divCorretor = document.getElementById('divCorretorEpisodio');
            if (!divCorretor) {
                divCorretor = document.createElement('div');
                divCorretor.id = 'divCorretorEpisodio';
                divCorretor.style.cssText = 'margin-top: 15px; padding-top: 15px; border-top: 1px solid #444;';
                container.appendChild(divCorretor);
            }
            
            divCorretor.innerHTML = `
                <div style="font-size: 13px; margin-bottom: 5px; color: #fff;">Ou corrigirá apenas o número do episódio:</div>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <input type="number" id="inputCorrecaoEp" value="${parseInt(epAtual) || 1}" style="width: 50px; background: #222; color: #fff; border: 1px solid #6c5ce7; border-radius: 4px; padding: 4px;">
                    <button id="btnSalvarCorrecaoEp" style="background: #6c5ce7; color: #fff; border: none; border-radius: 4px; cursor: pointer; padding: 4px 10px; font-weight: bold;">Salvar Episódio</button>
                </div>
            `;
            
            document.getElementById('btnSalvarCorrecaoEp').addEventListener('click', () => {
                let newEp = parseInt(document.getElementById('inputCorrecaoEp').value);
                if (!isNaN(newEp) && newEp > 0) {
                    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                        if (tabs[0]) {
                            chrome.tabs.sendMessage(tabs[0].id, { action: "FORCAR_EPISODIO", ep: newEp }, () => {
                                let btnCancel = document.getElementById('btnCancelCorrection');
                                if(btnCancel) btnCancel.click(); 
                                
                                chrome.storage.local.get(['autoCloseCorrection'], (res) => {
                                    if (res.autoCloseCorrection ?? true) window.close();
                                });
                            });
                        }
                    });
                }
            });

            let areaAvaliacao = document.getElementById('areaDeAvaliacao');
            if (areaAvaliacao) areaAvaliacao.style.display = 'none';
            document.getElementById('animeInfo').style.display = 'none';
            return; 
        }

        document.getElementById('correctionModeContainer').style.display = 'none';
        let areaAvaliacao = document.getElementById('areaDeAvaliacao');
        if (areaAvaliacao) areaAvaliacao.style.display = 'block';

        if (result[nomeInicial]) {
            carregarDadosNaTela(result[nomeInicial], nomeInicial);
            exibirEpisodioAtualNoPopup(epAtual);
        } else {
            gerarInterfaceDinamica();
            if (animeExato) {
                selecionarAnime(animeExato);
                verificarNotaNoMAL(animeExato.mal_id);
                exibirEpisodioAtualNoPopup(epAtual);
            } 
            else if (nomeInicial && nomeInicial.length > 2) {
                chrome.runtime.sendMessage({ action: 'buscarJikan', termo: nomeInicial, isAuto: false }, (response) => {
                    if (response && response.success && response.data && response.data.length > 0) {
                        selecionarAnime(response.data[0]);
                        verificarNotaNoMAL(response.data[0].mal_id);
                    }
                });
                exibirEpisodioAtualNoPopup(epAtual);
            }
        }
    });
}

function limparInterface() {
    document.getElementById('animeInfo').style.display = 'none';
    
    const epAssistindo = document.getElementById('epAssistindo');
    if(epAssistindo) epAssistindo.style.display = 'none';
    
    document.getElementById('status').innerText = '';

    let selects = document.querySelectorAll('.nota-select');
    selects.forEach(sel => sel.value = "0");
    
    let media = document.getElementById('mediaFinal');
    if (media) media.innerText = "0.00";
    
    let notaUsuarioMAL = document.getElementById('notaUsuarioMAL');
    if (notaUsuarioMAL) notaUsuarioMAL.innerText = "-";

    let notaTecnicaHeader = document.getElementById('notaTecnicaHeader');
    if (notaTecnicaHeader) notaTecnicaHeader.innerText = "-";
}

function configurarOuvintes() {
    document.getElementById('btnBuscar').addEventListener('click', async function() {
        const campoInput = document.getElementById('animeTitle');
        const termoOriginal = campoInput.value;

        if (termoOriginal.trim().length > 2) {
            console.log("Botão lupa clicado. Processando...");
            limparInterface();
            
            const termoTraduzido = await traduzirParaIngles(termoOriginal);
            campoInput.value = termoTraduzido; 
            
            let listaDiv = document.getElementById('listaResultados');
            listaDiv.style.display = 'block';
            listaDiv.innerHTML = '<div style="padding:10px; color:#ccc;">Buscando...</div>';

            chrome.runtime.sendMessage({ action: 'buscarJikan', termo: termoTraduzido, isAuto: false }, (response) => {
                if (chrome.runtime.lastError || !response || !response.success || !response.data || response.data.length === 0) {
                    listaDiv.innerHTML = '<div style="padding:10px; color:#ff7675;">Nenhum anime encontrado.</div>';
                    return;
                }
                
                listaDiv.innerHTML = ''; 
                response.data.forEach(anime => {
                    let anoLista = anime.year || "TBA";
                    let div = document.createElement('div');
                    div.className = 'item-resultado';
                    div.innerHTML = `
                        <img src="${escapeHTML(anime.images.jpg.small_image_url || '')}">
                        <div>
                            <b>${escapeHTML(anime.title)}</b><br>
                            <small>${escapeHTML(anoLista)} • ${escapeHTML(anime.media_type.toUpperCase())}</small>
                        </div>`;
                    
                    div.addEventListener('click', () => {
                        chrome.storage.local.set({ isCorrectionMode: false }, () => {
                            let areaAvaliacao = document.getElementById('areaDeAvaliacao');
                            if (areaAvaliacao) areaAvaliacao.style.display = 'block';
                            document.getElementById('correctionModeContainer').style.display = 'none';
                            
                            ultimoNomeIniciado = ""; 

                            selecionarAnime(anime, true);
                            verificarNotaNoMAL(anime.mal_id);
                            listaDiv.style.display = 'none'; 
                            
                            chrome.storage.local.get(['autoCloseCorrection'], (res) => {
                                if (res.autoCloseCorrection ?? true) window.close();
                            });
                        });
                    });
                    listaDiv.appendChild(div);
                });
            });
        }
    });

    document.getElementById('animeTitle').addEventListener('input', function() {
        limparInterface();
        document.getElementById('listaResultados').innerHTML = '';
    });

    document.getElementById('animeTitle').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault(); 
            document.getElementById('btnBuscar').click(); 
        }
    });
    
    document.getElementById('btnSalvar').addEventListener('click', salvarDados);
    document.getElementById('btnVerLista').addEventListener('click', () => {
        chrome.tabs.create({ url: 'lista.html' });
    });

    const btnLogin = document.getElementById('btnIrParaLogin');
    if (btnLogin) {
        btnLogin.addEventListener('click', () => {
            chrome.runtime.openOptionsPage(); 
            window.close(); 
        });
    }

    const btnLocal = document.getElementById('btnUsarLocal');
    if (btnLocal) {
        btnLocal.addEventListener('click', () => {
            chrome.storage.local.set({ syncMal: false }, () => {
                document.getElementById('modalAvisoConexao').style.display = 'none'; 
                verificarModoDeSalvamento(); 
            });
        });
    }

    const btnCancelCorrection = document.getElementById('btnCancelCorrection');
    if (btnCancelCorrection) {
        btnCancelCorrection.addEventListener('click', () => {
            chrome.storage.local.set({ isCorrectionMode: false }, () => {
                document.getElementById('correctionModeContainer').style.display = 'none';
                let areaAvaliacao = document.getElementById('areaDeAvaliacao');
                if (areaAvaliacao) areaAvaliacao.style.display = 'block'; 
                
                limparInterface();
                ultimoNomeIniciado = ""; 
                
                chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                    if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { action: "CANCELAR_CORRECAO" });
                });
                
                detectarEIniciar(); 
            });
        });
    }
}

async function traduzirParaIngles(titulo) {
    if (titulo.length < 3) return titulo;
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(titulo)}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP Error! Status: ${response.status}`);
        const data = await response.json();
        if (data && data[0] && data[0][0] && data[0][0][0]) {
            return data[0][0][0];
        }
    } catch (e) {
        console.error("MAL Reviewer: Falha na conexão com o tradutor em segundo plano:", e);
    }
    return titulo;
}

function gerarInterfaceDinamica(dadosSalvos = null) {
    const container = document.getElementById('containerNotasDinamico');
    
    // 👈 Adicionado "Trilha Sonora" e "Efeitos Sonoros" na lista base (Total: 12 critérios)
    const defaultCriterios = ["Direção", "Animação", "Complexidade", "Enredo", "Originalidade", "Design", "Coreografia de luta", "Personagens Principais", "Antagonista", "Direção de fotografia", "Trilha Sonora", "Efeitos Sonoros"];

    if (!container) return;

    const desenharInputs = (listaCriterios) => {
        container.innerHTML = ""; 
        listaCriterios = listaCriterios.filter(c => !c.toLowerCase().match(/^(média|media|meacutedia|nota_mal)$/));

        listaCriterios.forEach(crit => {
            let idLimpo = "nota_" + crit.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, '_');
            
            let box = document.createElement('div');
            box.className = "criterio-box";
            
            let label = document.createElement('label');
            label.textContent = crit; 
            
            let sel = document.createElement('select');
            sel.id = idLimpo;
            sel.className = "nota-select";
            sel.setAttribute('data-criterio', crit);

            let optDefault = document.createElement('option');
            optDefault.value = "0";
            optDefault.textContent = "-";
            sel.appendChild(optDefault);

            for (let i = 1; i <= 10; i += 1) {
                let opt = document.createElement('option');
                opt.value = i.toString();
                opt.textContent = i.toFixed(1);
                
                if (dadosSalvos && (dadosSalvos[crit] == i || dadosSalvos[crit] == i.toString())) {
                    opt.selected = true;
                }
                sel.appendChild(opt);
            }

            sel.addEventListener('change', calcularMediaInteligente);
            box.appendChild(label);
            box.appendChild(sel);
            container.appendChild(box);
        });
        
        if (dadosSalvos && dadosSalvos.nota_mal) {
            let selMal = document.getElementById('notaMalOficial');
            if(selMal) selMal.value = dadosSalvos.nota_mal;
        }

        calcularMediaInteligente();
    };

    chrome.storage.local.get(['meusCriterios'], (res) => {
        let listaFinal = res.meusCriterios || [...defaultCriterios];

        if (dadosSalvos) {
            const chavesIgnorar = ['media', 'mal_id', 'capa', 'nome_oficial', 'nota_mal'];
            const criteriosEncontrados = Object.keys(dadosSalvos).filter(k => !chavesIgnorar.includes(k));
            
            criteriosEncontrados.forEach(crit => {
                if (!listaFinal.includes(crit)) {
                    listaFinal.push(crit);
                }
            });
        }

        desenharInputs(listaFinal);
    });
}

function calcularMediaInteligente() {
    let selects = document.querySelectorAll('.nota-select');
    let soma = 0;
    let contador = 0;

    selects.forEach(sel => {
        if (sel.id === 'notaMalOficial') return; // 👈 Impede que a nota oficial interfira no cálculo da média técnica!
        let nota = parseFloat(sel.value);
        if (nota > 0) { 
            soma += nota;
            contador++;
        }
    });

    let media = contador > 0 ? (soma / contador) : 0;
    let mediaFormatada = media.toFixed(2);

    let mediaFinal = document.getElementById('mediaFinal');
    if (mediaFinal) mediaFinal.innerText = mediaFormatada;

    let notaTecnicaHeader = document.getElementById('notaTecnicaHeader');
    if (notaTecnicaHeader) {
        notaTecnicaHeader.innerText = media > 0 ? mediaFormatada : "-";
    }
}

function buscarNoJikan(termo, buscaAutomatica) {
    let listaDiv = document.getElementById('listaResultados');
    if (!buscaAutomatica) {
        listaDiv.style.display = 'block';
        listaDiv.innerHTML = '<div style="padding:10px; color:#ccc;">Buscando...</div>';
    }

    chrome.runtime.sendMessage({ action: 'buscarJikan', termo: termo, isAuto: false }, (response) => {
        if (chrome.runtime.lastError) {
            if (!buscaAutomatica) listaDiv.innerHTML = '<div style="padding:10px; color:#ff7675;">Erro na conexão. Tente novamente.</div>';
            return;
        }

        if (response && response.success) {
            let temporadas = response.data;
            listaDiv.innerHTML = ''; 
            
            if (!temporadas || temporadas.length === 0) {
                if (!buscaAutomatica) listaDiv.innerHTML = '<div style="padding:10px; color:#ff7675;">Nenhum anime encontrado.</div>';
                return;
            }
            
            if (buscaAutomatica) {
                selecionarAnime(temporadas[0]);
                verificarNotaNoMAL(temporadas[0].mal_id);
                return; 
            }
            
            temporadas.forEach(anime => {
                let anoLista = anime.year || "TBA";
                let div = document.createElement('div');
                div.className = 'item-resultado';
                div.innerHTML = `
                    <img src="${escapeHTML(anime.images.jpg.small_image_url || '')}">
                    <div>
                        <b>${escapeHTML(anime.title)}</b><br>
                        <small>${escapeHTML(anoLista)} • ${escapeHTML(anime.media_type ? anime.media_type.toUpperCase() : 'TV')}</small>
                    </div>`;
                
                div.addEventListener('click', () => {
                    chrome.storage.local.set({ isCorrectionMode: false }, () => {
                            let areaAvaliacao = document.getElementById('areaDeAvaliacao');
                            if (areaAvaliacao) areaAvaliacao.style.display = 'block';
                            document.getElementById('correctionModeContainer').style.display = 'none';
                            
                            ultimoNomeIniciado = ""; 

                            selecionarAnime(anime, true);
                            verificarNotaNoMAL(anime.mal_id);
                            listaDiv.style.display = 'none';  
                            
                            chrome.storage.local.get(['autoCloseCorrection'], (res) => {
                                if (res.autoCloseCorrection ?? true) window.close();
                            });
                    });
                });
                listaDiv.appendChild(div);
            });
        }
    });
}

function exibirEpisodioAtualNoPopup(ep) {
    const el = document.getElementById('epAssistindo');
    if (el && ep) {
        el.innerHTML = `📺 Assistindo: Episódio <b id="textEpAtual"></b> 
        <button id="btnEditEp" style="background:none; border:none; cursor:pointer; font-size:12px; margin-left:5px; padding:0;" title="Corrigir Episódio">✏️</button>`;
        el.style.display = 'block';

        const textEpAtual = el.querySelector('#textEpAtual');
        if (textEpAtual) textEpAtual.textContent = ep;

        document.getElementById('btnEditEp').addEventListener('click', () => {
            el.innerHTML = `📺 Assistindo: <input type="number" id="inputEditEp" value="${escapeHTML(ep)}" style="width:45px; background:#222; color:#fff; border:1px solid #6c5ce7; border-radius:4px; padding:2px 4px;"> 
            <button id="btnSaveEp" style="background:#6c5ce7; color:#fff; border:none; border-radius:4px; cursor:pointer; padding:2px 8px; margin-left:5px; font-weight:bold;">Salvar</button>`;
            
            document.getElementById('btnSaveEp').addEventListener('click', () => {
                let newEp = parseInt(document.getElementById('inputEditEp').value);
                if (!isNaN(newEp) && newEp > 0) {
                    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                        if (tabs[0]) {
                            chrome.tabs.sendMessage(tabs[0].id, { action: "FORCAR_EPISODIO", ep: newEp }, () => {
                                exibirEpisodioAtualNoPopup(newEp); 
                            });
                        }
                    });
                }
            });
        });
    } else if (el) {
        el.style.display = 'none';
    }
}

function selecionarAnime(anime, isManualCorrection = false) {
    if (isManualCorrection) {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, { action: "FORCAR_CORRECAO_ANIME", animeExato: anime });
            }
        });
    }

    document.getElementById('animeInfo').style.display = 'flex';
    document.getElementById('animeCapa').src = anime.images.jpg.image_url;
    document.getElementById('animeNomeOficial').innerText = anime.title;
    document.getElementById('malID').value = anime.mal_id;
    document.getElementById('animeTitle').value = anime.title;
    
    let ano = anime.year || (anime.aired && anime.aired.prop && anime.aired.prop.from && anime.aired.prop.from.year) || "TBA";
    let estudio = (anime.studios && anime.studios.length > 0) ? " • " + anime.studios[0].name : "";
    document.getElementById('animeAno').innerText = ano + estudio;

    document.getElementById('notaGlobalMAL').innerText = anime.score || "-";
    document.getElementById('notaUsuarioMAL').innerText = "...";

    verificarDadosExistentes(anime.title, anime.mal_id);
}

function salvarDados() {
    let nomeChave = document.getElementById('animeTitle').value;
    let malID = document.getElementById('malID').value;
    let mediaVal = parseFloat(document.getElementById('mediaFinal').innerText);
    let selects = document.querySelectorAll('.nota-select');
    
    let notasDinamicas = {};
    selects.forEach(sel => {
        if (sel.id === 'notaMalOficial') return; // 👈 Ignora o seletor da nota do MAL para não entrar nos critérios técnicos
        let label = sel.getAttribute('data-criterio');
        notasDinamicas[label] = sel.value;
    });

    let notaMalDropdown = document.getElementById('notaMalOficial');
    let notaMalSalvar = notaMalDropdown ? parseInt(notaMalDropdown.value) : 0;

    let dados = {
        ...notasDinamicas, 
        media: mediaVal.toFixed(2),
        mal_id: malID,
        capa: document.getElementById('animeCapa').src,
        nome_oficial: document.getElementById('animeNomeOficial').innerText,
        nota_mal: notaMalSalvar // 👈 Salva a nota individual no banco de dados local
    };

    chrome.storage.local.get(['syncMal', 'officialScore', 'mal_access_token'], (config) => {
        let status = document.getElementById('status');
        
        // Se a nota do MAL e a técnica precisarem ser as mesmas, sobrescreve a nota de envio e de salvamento
        if (config.officialScore) {
            dados.nota_mal = Math.round(mediaVal);
        }

        let salvar = {};
        salvar[nomeChave] = dados;
        chrome.storage.local.set(salvar);

        if (config.syncMal && config.mal_access_token && malID) {
            status.innerText = "Sincronizando MAL...";
            enviarParaMAL(malID, dados.nota_mal, config.mal_access_token, dados);
        } else {
            status.innerText = "Salvo Localmente!";
            setTimeout(() => status.innerText = "", 2000);
        }
    });
}

function enviarParaMAL(animeId, score, token, dados) {
    let listStr = "";
    for (let key in dados) {
        if (!['media','mal_id','capa','nome_oficial','nota_mal'].includes(key) && dados[key] > 0) {
            let cleanKey = normalizarCriterio(key); 
            listStr += `\n${cleanKey}: ${dados[key]}`;
        }
    }
    let coment = `Review Técnica:${listStr}\nMédia: ${dados.media}`;
    chrome.runtime.sendMessage({ action: 'enviarNotaMAL', dados: { animeId, score, token, comentario: coment }}, (r) => {
        document.getElementById('status').innerText = r.success ? "MAL Atualizado!" : "Erro ao sincronizar.";
        setTimeout(() => document.getElementById('status').innerText = "", 3000);
    });
}

function carregarDadosNaTela(dados, nomeSeTiver) {
    gerarInterfaceDinamica(dados);

    if (dados.capa) {
        document.getElementById('animeInfo').style.display = 'flex';
        document.getElementById('animeCapa').src = dados.capa;
        document.getElementById('animeNomeOficial').innerText = dados.nome_oficial || nomeSeTiver;
        document.getElementById('malID').value = dados.mal_id;
    }
}

function limparTitulo(t) {
    if (!t) return "";
    return t
        .replace(/[【】]/g, "") 
        .replace(/ - Assista na Crunchyroll/i, "") 
        .replace(/ na Netflix/i, "") 
        .replace(/ - Netflix/i, "") 
        .replace(/ - Google Drive/i, "")
        .replace(/Assista/i, "")
        .replace(/Assistir/i, "")
        .replace(/[(]dublado[)]/i, "") 
        .split('|')[0]
        .split(':')[0] 
        .split(' - ')[0] 
        .trim();
}

function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function verificarNotaNoMAL(malId) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'buscarDetalhesMAL', malId: malId }, (response) => {
            if (chrome.runtime.lastError || !response || !response.success) {
                document.getElementById('notaUsuarioMAL').innerText = "-";
                resolve(false);
                return;
            }

            const dadosMAL = response.data;

            document.getElementById('animeNomeOficial').innerText = dadosMAL.title;
            document.getElementById('notaGlobalMAL').innerText = dadosMAL.mean ? dadosMAL.mean.toFixed(2) : "-";
            
            if (dadosMAL.main_picture && dadosMAL.main_picture.large) {
                document.getElementById('animeCapa').src = dadosMAL.main_picture.large;
            }

            let ano = dadosMAL.start_season ? dadosMAL.start_season.year : "TBA";
            let estudio = (dadosMAL.studios && dadosMAL.studios.length > 0) ? " • " + dadosMAL.studios[0].name : "";
            document.getElementById('animeAno').innerText = ano + estudio;

            if (dadosMAL.my_list_status) {
                document.getElementById('notaUsuarioMAL').innerText = dadosMAL.my_list_status.score > 0 ? dadosMAL.my_list_status.score : "-";
                
                let selMal = document.getElementById('notaMalOficial');
                if(selMal) selMal.value = dadosMAL.my_list_status.score || 0;

                if (dadosMAL.my_list_status.comments) {
                    processarComentarioParaPopup(dadosMAL.my_list_status.comments, malId);
                    resolve(true);
                    return;
                }
                if (dadosMAL.my_list_status.score > 0) {
                    resolve(true);
                    return;
                }
            } else {
                document.getElementById('notaUsuarioMAL').innerText = "-";
            }
            resolve(false);
        });
    });
}

function processarComentarioParaPopup(comentario, malId) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(comentario, 'text/html');
    const textoDecodificado = doc.documentElement.textContent || "";

    const linhas = textoDecodificado.split('\n');
    const dadosRecuperados = { mal_id: malId };

    const mapaCorrecao = {
        "Direccedilatildeo": "Direção",
        "Animaccedilatildeo": "Animação",
        "Meacutedia": "Média",
        "Meacute;dia": "Média",
        "M&eacute;dia": "Média"
    };

    const regex = /^(.+?):\s*(\d+(?:[.,]\d+)?)/;

    linhas.forEach(linha => {
        let match = inlineTrim(linha).match(regex);
        if (match) {
            let chave = normalizarCriterio(match[1]);
            
            if (mapaCorrecao[chave]) chave = mapaCorrecao[chave];

            chave = chave.replace(/[^\w\s\u00C0-\u00FF\/]/g, "").trim();
            
            let valor = parseFloat(match[2].replace(',', '.'));
            
            if (chave.toLowerCase().match(/^(média|media|average|meacutedia)$/)) {
                dadosRecuperados['media'] = valor;
            } else {
                dadosRecuperados[chave] = valor;
            }
        }
    });

    if (Object.keys(dadosRecuperados).length > 1) { 
        let nomeOficial = document.getElementById('animeNomeOficial').innerText;
        carregarDadosNaTela(dadosRecuperados, nomeOficial);
    }
}

async function verificarDadosExistentes(titulo, malId) {
    const config = await chrome.storage.local.get(['syncMal', 'mal_access_token']);
    const deveSync = config.syncMal !== false; 

    if (deveSync && config.mal_access_token && malId) {
        console.log("Prioridade MAL: Consultando API...");
        const achouNoMAL = await verificarNotaNoMAL(malId);
        
        if (!achouNoMAL) {
            console.log("MAL vazio. Verificando se existe algo local...");
            buscarNoStorageLocal(titulo);
        }
    } else {
        console.log("Modo Local ou Desconectado. Verificando storage...");
        buscarNoStorageLocal(titulo);
    }
}

function buscarNoStorageLocal(titulo) {
    chrome.storage.local.get([titulo], (res) => {
        if (res[titulo]) {
            console.log("Dados locais encontrados!");
            carregarDadosNaTela(res[titulo], titulo);
        } else {
            console.log("Nenhum dado encontrado para este anime.");
            gerarInterfaceDinamica(); 
        }
    });
}

function verificarConexaoNecessaria() {
    chrome.storage.local.get(['syncMal', 'mal_access_token'], (res) => {
        const sincronizacaoAtiva = res.syncMal !== false;
        
        if (sincronizacaoAtiva && !res.mal_access_token) {
            document.getElementById('modalAvisoConexao').style.display = 'flex';
        }
    });
}

function verificarModoDeSalvamento() {
    chrome.storage.local.get(['syncMal', 'mal_access_token'], (res) => {
        const btn = document.getElementById('btnSalvar');
        if (res.syncMal !== false && res.mal_access_token) {
            btn.innerText = "SALVAR NO MAL";
            btn.style.background = "#2e51a2"; 
        } else {
            btn.innerText = "SALVAR REVIEW";
            btn.style.background = "#6c5ce7"; 
        }
    });
}

function inlineTrim(str) {
    return str ? str.trim() : "";
}