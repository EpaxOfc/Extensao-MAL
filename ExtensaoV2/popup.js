// Função inteligente que detecta e cura qualquer corrupção de caracteres do MAL
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
        { regex: /Fotografia/i, sub: "Direção de fotografia" }
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
    // Botão de Configurações
    document.getElementById('btnOptions').addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });
    
    verificarModoDeSalvamento();
    verificarConexaoNecessaria();
    configurarOuvintes();

    chrome.storage.local.get(['syncMal', 'viewMode'], (res) => {
        if (res.syncMal) {
            const btn = document.getElementById('btnSalvar');
            btn.innerText = "SALVAR NO MAL";
            btn.style.background = "#2e51a2"; 
        }

        // Identifica o modo e adiciona a classe correta de dimensionamento no body
        const mode = res.viewMode || 'popup';
        document.body.classList.remove('popup-mode', 'sidepanel-mode');
        document.body.classList.add(mode + '-mode');
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
    if (document.hidden) {
        return;
    }

    chrome.storage.local.get(['ultimoAnimeDetectado'], function(result) {
        if (result.ultimoAnimeDetectado) {
            iniciar(result.ultimoAnimeDetectado);
            chrome.storage.local.remove('ultimoAnimeDetectado');
        } else {
            chrome.tabs.query({active: true, lastFocusedWindow: true}, function(tabs) {
                let activeTab = tabs[0];
                if (!activeTab || !activeTab.url) {
                    iniciar("");
                    return;
                }
                
                let url = activeTab.url;

                if (url.includes("drive.google.com")) {
                    let nomeLimpo = limparTitulo(activeTab.title);
                    iniciar(nomeLimpo);
                } 
                else if (url.includes("netflix.com")) {
                    chrome.tabs.sendMessage(activeTab.id, { action: "SOLICITAR_NOME_ANIME" }, (response) => {
                        if (chrome.runtime.lastError || !response || !response.nome) {
                            iniciar(limparTitulo(activeTab.title));
                        } else {
                            iniciar(response.nome);
                        }
                    });
                }
                else {
                    iniciar(limparTitulo(activeTab.title));
                }
            });
        }
    });
}

function configurarOuvintes() {
    document.getElementById('btnBuscar').addEventListener('click', async function() {
        const campoInput = document.getElementById('animeTitle');
        const termoOriginal = campoInput.value;

        if (termoOriginal.length > 2) {
            console.log("Botão lupa clicado. Processando...");
            const termoTraduzido = await traduzirParaIngles(termoOriginal);
            campoInput.value = termoTraduzido; 
            buscarNoJikan(termoTraduzido, false);
        }
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
}

async function iniciar(nomeInicial) {
    // Filtro de memória que previne buscas idênticas duplicadas
    if (nomeInicial === ultimoNomeIniciado) {
        return; 
    }
    ultimoNomeIniciado = nomeInicial;

    document.getElementById('animeTitle').value = nomeInicial;

    const termosProibidos = ["Anata no wo", "Eigakan", "Netflix"];
    let nomeEhValido = !termosProibidos.some(termo => nomeInicial.includes(termo));

    if (!nomeEhValido || !nomeInicial) {
        nomeInicial = ""; 
    }
    
    chrome.storage.local.get([nomeInicial], async function(result) {
        if (result[nomeInicial]) {
            carregarDadosNaTela(result[nomeInicial], nomeInicial);
        } else {
            gerarInterfaceDinamica();
            if(nomeInicial && nomeInicial.length > 2) {
                const nomeParaBusca = await traduzirParaIngles(nomeInicial);
                buscarNoJikan(nomeParaBusca, true);
            }
        }
    });
}

function gerarInterfaceDinamica(dadosSalvos = null) {
    const container = document.getElementById('containerNotasDinamico');
    const defaultCriterios = ["Direção", "Animação", "Complexidade", "Enredo", "Originalidade", "Design", "Coreografia de luta", "Personagens Principais", "Antagonista", "Direção de fotografia"];

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
            
            // Adiciona quaisquer critérios antigos salvos na obra que por acaso não estejam na sua configuração de critérios global
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
        let nota = parseFloat(sel.value);
        if (nota > 0) { 
            soma += nota;
            contador++;
        }
    });

    let media = contador > 0 ? (soma / contador) : 0;
    document.getElementById('mediaFinal').innerText = media.toFixed(2);
}

function buscarNoJikan(termo, buscaAutomatica) {
    let listaDiv = document.getElementById('listaResultados');
    if (!buscaAutomatica) {
        listaDiv.style.display = 'block';
        listaDiv.innerHTML = '<div style="padding:10px; color:#ccc;">Buscando...</div>';
    }

    fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(termo)}&limit=5`)
        .then(response => {
            if (!response.ok) throw new Error(`HTTP Error! Status: ${response.status}`);
            return response.json();
        })
        .then(data => {
            listaDiv.innerHTML = ''; 
            if (!data.data || data.data.length === 0) {
                if (!buscaAutomatica) {
                    listaDiv.innerHTML = '<div style="padding:10px; color:#ff7675;">Nenhum anime encontrado.</div>';
                }
                return;
            }
            
            if (buscaAutomatica) {
                let anime = data.data[0];
                selecionarAnime(anime);
                verificarNotaNoMAL(anime.mal_id);
                return; 
            }
            
            data.data.forEach(anime => {
                let anoLista = anime.year || "TBA";

                let div = document.createElement('div');
                div.className = 'item-resultado';
                div.innerHTML = `
                    <img src="${anime.images.jpg.small_image_url}">
                    <div>
                        <b>${anime.title}</b><br>
                        <small>${anoLista}</small>
                    </div>`;
                
                div.addEventListener('click', () => {
                    selecionarAnime(anime);
                    verificarNotaNoMAL(anime.mal_id);
                    listaDiv.style.display = 'none'; 
                });
                listaDiv.appendChild(div);
            });
        })
        .catch(err => {
            console.error("MAL Reviewer: Erro ao buscar no Jikan:", err);
            if (!buscaAutomatica) {
                listaDiv.innerHTML = '<div style="padding:10px; color:#ff7675;">Erro na conexão. Tente novamente.</div>';
            }
        });
}

function selecionarAnime(anime) {
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
        let label = sel.getAttribute('data-criterio');
        notasDinamicas[label] = sel.value;
    });

    let dados = {
        ...notasDinamicas, 
        media: mediaVal.toFixed(2),
        mal_id: malID,
        capa: document.getElementById('animeCapa').src,
        nome_oficial: document.getElementById('animeNomeOficial').innerText
    };

    let salvar = {};
    salvar[nomeChave] = dados;
    chrome.storage.local.set(salvar);

    chrome.storage.local.get(['syncMal', 'officialScore', 'mal_access_token'], (config) => {
        let status = document.getElementById('status');
        if (config.syncMal && config.mal_access_token && malID) {
            status.innerText = "Sincronizando MAL...";
            let notaMAL = config.officialScore ? Math.round(mediaVal) : 0;
            enviarParaMAL(malID, notaMAL, config.mal_access_token, dados);
        } else {
            status.innerText = "Salvo Localmente!";
            setTimeout(() => status.innerText = "", 2000);
        }
    });
}

function enviarParaMAL(animeId, score, token, dados) {
    let listStr = "";
    for (let key in dados) {
        if (!['media','mal_id','capa','nome_oficial'].includes(key) && dados[key] > 0) {
            let cleanKey = normalizarCriterio(key); // Cura a chave antes de mandar pro MAL
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

async function verificarNotaNoMAL(malId) {
    const res = await chrome.storage.local.get(['mal_access_token']);
    if (!res.mal_access_token) return false;

    try {
        const resp = await fetch(`https://api.myanimelist.net/v2/anime/${malId}?fields=my_list_status{score,comments}`, {
            headers: { 'Authorization': `Bearer ${res.mal_access_token}` }
        });
        
        if (resp.ok) {
            const dados = await resp.json();
            if (dados.my_list_status) {
                document.getElementById('notaUsuarioMAL').innerText = dados.my_list_status.score > 0 ? dados.my_list_status.score : "-";
                let selMal = document.getElementById('notaMalOficial');
                if(selMal) selMal.value = dados.my_list_status.score || 0;

                if (dados.my_list_status.comments) {
                    processarComentarioParaPopup(dados.my_list_status.comments, malId);
                    return true;
                }
                if (dados.my_list_status.score > 0) return true;
            } else {
                document.getElementById('notaUsuarioMAL').innerText = "-";
            }
        } else {
            document.getElementById('notaUsuarioMAL').innerText = "-";
        }
    } catch (e) { 
        console.error("Erro API MAL:", e); 
        document.getElementById('notaUsuarioMAL').innerText = "-";
    }
    return false;
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

async function traduzirParaIngles(titulo) {
    if (titulo.length < 3) return titulo;

    try {
        console.log("Tentando traduzir:", titulo); 
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(titulo)}`;
        
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();
        
        if (data && data[0] && data[0][0] && data[0][0][0]) {
            const resultado = data[0][0][0];
            console.log("Tradução concluída:", resultado); 
            return resultado;
        }
    } catch (e) {
        console.error("Falha na conexão com tradutor:", e);
    }
    return titulo;
}

function inlineTrim(str) {
    return str ? str.trim() : "";
}