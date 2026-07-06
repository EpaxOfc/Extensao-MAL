document.addEventListener('DOMContentLoaded', function() {
    // Botão de Configurações
    document.getElementById('btnOptions').addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });
    
    verificarModoDeSalvamento();
    verificarConexaoNecessaria()
    configurarOuvintes();

    chrome.storage.local.get(['syncMal'], (res) => {
        if (res.syncMal) {
            const btn = document.getElementById('btnSalvar');
            btn.innerText = "SALVAR NO MAL";
            // Opcional: Mudar cor para azul do MAL para indicar visualmente
             btn.style.background = "#2e51a2"; 
        }
    });

    // 1. Tenta recuperar anime do monitoramento automático
    chrome.storage.local.get(['ultimoAnimeDetectado'], function(result) {
        if (result.ultimoAnimeDetectado) {
            iniciar(result.ultimoAnimeDetectado);
            chrome.storage.local.remove('ultimoAnimeDetectado');
        } else {
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                let activeTab = tabs[0];
                if (!activeTab || !activeTab.url) return;
                
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
});

function configurarOuvintes() {
    document.getElementById('btnBuscar').addEventListener('click', async function() {
        const campoInput = document.getElementById('animeTitle');
        const termoOriginal = campoInput.value;

        if (termoOriginal.length > 2) {
            console.log("Botão lupa clicado. Processando...");
            
            // 1. Traduz
            const termoTraduzido = await traduzirParaIngles(termoOriginal);
            
            // 2. Opcional: Atualiza o campo de texto para o usuário ver a tradução
            campoInput.value = termoTraduzido; 

            // 3. Busca no Jikan
            console.log("Enviando para o Jikan:", termoTraduzido);
            buscarNoJikan(termoTraduzido, false);
        }
    });
    document.getElementById('animeTitle').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault(); // Evita atualizar a janela
            document.getElementById('btnBuscar').click(); // Simula o clique na lupa
        }
    });
    document.getElementById('btnSalvar').addEventListener('click', salvarDados);
    document.getElementById('btnVerLista').addEventListener('click', () => {
        chrome.tabs.create({ url: 'lista.html' });
    });

    // --- BOTÕES DO MODAL DE AVISO ---
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
    document.getElementById('animeTitle').value = nomeInicial;

    const termosProibidos = ["Anata no wo", "Eigakan", "Netflix"];
    let nomeEhValido = !termosProibidos.some(termo => nomeInicial.includes(termo));

    if (!nomeEhValido || !nomeInicial) {
        nomeInicial = ""; 
    }
    
    // Tenta carregar localmente com o nome original (chave do banco)
    chrome.storage.local.get([nomeInicial], async function(result) {
        if (result[nomeInicial]) {
            carregarDadosNaTela(result[nomeInicial], nomeInicial);
        } else {
            gerarInterfaceDinamica();
            if(nomeInicial && nomeInicial.length > 2) {
                // --- AQUI ENTRA A TRADUÇÃO ---
                // Traduzimos para o inglês para garantir que o Jikan encontre
                const nomeParaBusca = await traduzirParaIngles(nomeInicial);
                buscarNoJikan(nomeParaBusca, true);
            }
        }
    });
}

// GERA OS SELECTS DINAMICAMENTE
function gerarInterfaceDinamica(dadosSalvos = null) {
    const container = document.getElementById('containerNotasDinamico');
    const defaultCriterios = ["Direção", "Animação", "Complexidade", "Enredo", "Originalidade", "Design", "Coreografia de luta", "Personagens Principais", "Antagonista", "Direção de fotografia"];

    if (!container) return;

    // Função interna para desenhar
    const desenharInputs = (listaCriterios) => {
        container.innerHTML = ""; 
        
        // FILTRO DE SEGURANÇA: Remove 'Média', 'media', 'Meacutedia' da lista de inputs
        listaCriterios = listaCriterios.filter(c => !c.toLowerCase().match(/^(média|media|meacutedia|nota_mal)$/));

        listaCriterios.forEach(crit => {
            // Cria ID limpo para o HTML
            let idLimpo = "nota_" + crit.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, '_');
            
            let box = document.createElement('div');
            box.className = "criterio-box";
            
            let label = document.createElement('label');
            label.textContent = crit; // Exibe o nome correto com acento
            
            let sel = document.createElement('select');
            sel.id = idLimpo;
            sel.className = "nota-select";
            sel.setAttribute('data-criterio', crit); // Guarda o nome original

            let optDefault = document.createElement('option');
            optDefault.value = "0";
            optDefault.textContent = "-";
            sel.appendChild(optDefault);

            for (let i = 1; i <= 10; i += 1) {
                let opt = document.createElement('option');
                opt.value = i.toString();
                opt.textContent = i.toFixed(1);
                
                // Marca selecionado se houver dados salvos
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
        
        // Se tiver Nota Oficial salva (do MAL), preenche o select lá de cima
        if (dadosSalvos && dadosSalvos.nota_mal) {
            let selMal = document.getElementById('notaMalOficial');
            if(selMal) selMal.value = dadosSalvos.nota_mal;
        }

        calcularMediaInteligente();
    };

    if (dadosSalvos) {
        // Pega as chaves que não são metadados
        const chavesIgnorar = ['media', 'mal_id', 'capa', 'nome_oficial', 'nota_mal'];
        const criteriosEncontrados = Object.keys(dadosSalvos).filter(k => !chavesIgnorar.includes(k));

        if (criteriosEncontrados.length > 0) {
            desenharInputs(criteriosEncontrados);
            return;
        }
    }

    // Padrão
    chrome.storage.local.get(['meusCriterios'], (res) => {
        const listaFinal = res.meusCriterios || defaultCriterios;
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
        .then(response => response.json())
        .then(data => {
            listaDiv.innerHTML = ''; 
            if (!data.data || data.data.length === 0) return;
            
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
            listStr += `\n${key}: ${dados[key]}`;
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

// --- UTIL ---
function lerCaminhoDoDrivePagina() {
    let tituloAba = document.title.replace(" - Google Drive", "").trim();

    let elementos = Array.from(document.querySelectorAll('div[role="navigation"] [role="link"], div[role="navigation"] button, div[role="main"] h2'));
    
    let nomes = elementos
        .map(el => el.innerText.trim())
        .filter(t => t.length > 1 && t.length < 50 && !t.includes("Feedback") && !t.includes("Acessibilidade"));

    return nomes.length > 0 ? nomes : [tituloAba];
}

function processarCaminhoDrive(listaNomes, tituloAba) {
    const termosLixo = ["Meu Drive", "My Drive", "Computadores", "Recentes", "Feedback", "Acessibilidade", "Google", "Drive"];
    
    let nomesValidos = listaNomes.filter(n => {
        return !termosLixo.some(lixo => n.toLowerCase().includes(lixo.toLowerCase()));
    });

    if (nomesValidos.length === 0) return limparTitulo(tituloAba);

    let nomeAtual = nomesValidos[nomesValidos.length - 1];

    if (nomeAtual.includes(".")) return limparTitulo(nomeAtual);

    const regexTemp = /(^|[ \-_])(t|s|season|temporada|parte|part|p|vol|volume)[ \.\-_]?\d+/i;
    const ehTemporada = regexTemp.test(nomeAtual) || (nomeAtual.length <= 4 && /\d/.test(nomeAtual));

    if (ehTemporada && nomesValidos.length > 1) {
        let nomePai = nomesValidos[nomesValidos.length - 2];
        return `${nomePai} ${nomeAtual}`;
    }

    return nomeAtual;
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
            }
        }
    } catch (e) { console.error("Erro API MAL:", e); }
    return false;
}

// NOVA FUNÇÃO: Transforma o comentário do MAL em objeto para o Popup
function processarComentarioParaPopup(comentario, malId) {
    const txtArea = document.createElement('textarea');
    txtArea.innerHTML = comentario;
    const textoDecodificado = txtArea.value;

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
        let match = linha.match(regex);
        if (match) {
            let chave = match[1].trim();
            
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

    // Se achou critérios, desenha a tela
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
        console.log("Tentando traduzir:", titulo); // Debug
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(titulo)}`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data && data[0] && data[0][0] && data[0][0][0]) {
            const resultado = data[0][0][0];
            console.log("Tradução concluída:", resultado); // Debug
            return resultado;
        }
    } catch (e) {
        console.error("Falha na conexão com tradutor:", e);
    }
    return titulo;
}