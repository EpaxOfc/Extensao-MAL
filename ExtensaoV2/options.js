const criteriosPadrao = ["Direção", "Animação", "Complexidade", "Enredo", "Originalidade", "Design", "Coreografia de luta", "Personagens Principais", "Antagonista", "Direção de fotografia"];

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
    return n; // Mantém intacto se for um critério personalizado do usuário
}

// Listas de controle para a barra de salvamento (Estilo Discord)
let criteriosOriginais = [];
let criteriosTemporarios = [];

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

    // Ouvinte do botão de Login
    document.getElementById('btnLogin').addEventListener('click', () => {
        document.getElementById('loginStatus').innerText = "Aguardando login...";
        chrome.runtime.sendMessage({ action: 'loginMAL' }, (response) => {
            if (response && response.success) {
                chrome.storage.local.get(['mal_access_token'], (res) => {
                    if (res.mal_access_token) {
                        buscarPerfilMAL(res.mal_access_token);
                    }
                });
            } else {
                document.getElementById('loginStatus').innerText = "Erro: " + (response ? response.error : 'Desconhecido');
            }
        });
    });

    // Ouvinte do botão de Logout
    document.getElementById('btnLogout').addEventListener('click', () => {
        if (confirm("Deseja realmente desconectar sua conta do MyAnimeList?")) {
            chrome.storage.local.remove(['mal_access_token', 'mal_token_data'], () => {
                atualizarInterfaceLogin(false);
                verificarExibicaoBotoesBatch();
            });
        }
    });

    // Ouvinte do botão para abrir a biblioteca
    document.getElementById('btnVerBibliotecaOptions').addEventListener('click', () => {
        chrome.tabs.create({ url: 'lista.html' });
    });

    // Monitora a caixinha em tempo real para exibir o bloco de atualização instantaneamente
    document.getElementById('officialScore').addEventListener('change', verificarExibicaoBotoesBatch);

    // Salvamento automático das preferências
    ['autoOpen', 'syncMal', 'officialScore'].forEach(id => {
        document.getElementById(id).addEventListener('change', (e) => {
            const config = {};
            config[id] = e.target.checked;
            
            chrome.storage.local.set(config, () => {
                verificarExibicaoBotoesBatch();
            });
        });
    });

    document.getElementById('btnAddCriterio').addEventListener('click', () => {
        let nome = document.getElementById('novoCriterio').value.trim();
        if (nome) {
            criteriosTemporarios.push(nome);
            document.getElementById('novoCriterio').value = "";
            renderizarCriteriosTemporarios();
            verificarAlteracoesCriterios();
        }
    });

    // Ouvintes da Barra do Discord (Salvar ou Descartar)
    document.getElementById('btnSalvarCriterios').addEventListener('click', salvarCriteriosNoStorage);
    document.getElementById('btnDescartarCriterios').addEventListener('click', descartarAlteracoesCriterios);

    // Ouvintes dos Lotes
    document.getElementById('btnBatchUpdate').addEventListener('click', executarAtualizacaoEmMassa);
    document.getElementById('btnRestoreBackup').addEventListener('click', restaurarNotasOriginais);
});

// Carrega preferências salvas
function carregarConfig() {
    chrome.storage.local.get(['autoOpen', 'syncMal', 'officialScore', 'viewMode'], (res) => {
        document.getElementById('viewMode').addEventListener('change', (e) => {
            const mode = e.target.value;
            chrome.storage.local.set({ viewMode: mode }, () => {
                aplicarModoDeExibicao(mode);
            });
        });

        // --- DETECÇÃO DO OPERA / OPERA GX ---
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
                helpText.innerHTML = "⚠️ No Opera GX, a barra lateral já funciona pelo ícone azul na <b>esquerda</b>. Deixe esta opção em 'Popup' para o botão do topo direito também funcionar.";
            }
            
            if (res.viewMode === 'sidepanel') {
                chrome.storage.local.set({ viewMode: 'popup' });
                aplicarModoDeExibicao('popup');
                res.viewMode = 'popup';
            }
        }

        document.getElementById('autoOpen').checked = res.autoOpen ?? true;
        document.getElementById('syncMal').checked = res.syncMal ?? true;
        document.getElementById('officialScore').checked = res.officialScore ?? false;
        
        verificarExibicaoBotoesBatch();
        
        document.getElementById('viewMode').value = res.viewMode || 'popup';
    });
}


// Inicializa a lista de critérios
function carregarCriterios() {
    chrome.storage.local.get(['meusCriterios'], (res) => {
        criteriosOriginais = res.meusCriterios || [...criteriosPadrao];
        criteriosTemporarios = [...criteriosOriginais];
        renderizarCriteriosTemporarios();
    });
}

// Renderiza a lista baseada nos critérios temporários na tela
function renderizarCriteriosTemporarios() {
    let container = document.getElementById('listaCriterios');
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

// Verifica se os critérios temporários estão diferentes dos originais e anima a barra do Discord
function verificarAlteracoesCriterios() {
    const bar = document.getElementById('discordSaveBar');
    
    // Compara os dois arrays
    const saoIguais = criteriosOriginais.length === criteriosTemporarios.length && 
                      criteriosOriginais.every((val, index) => val === criteriosTemporarios[index]);
    
    if (!saoIguais) {
        bar.style.bottom = "20px"; // Mostra barra
    } else {
        bar.style.bottom = "-85px"; // Esconde barra
    }
}

// Salva de fato no storage e atualiza o estado original
function salvarCriteriosNoStorage() {
    chrome.storage.local.set({ meusCriterios: criteriosTemporarios }, () => {
        criteriosOriginais = [...criteriosTemporarios];
        verificarAlteracoesCriterios();
        
        // Efeito de feedback rápido na barra
        const textElement = document.getElementById('discordBarText');
        const textOriginal = textElement.innerText;
        textElement.innerText = "Alterações de critérios salvas com sucesso!";
        textElement.style.color = "#00b894";
        
        setTimeout(() => {
            textElement.innerText = textOriginal;
            textElement.style.color = "#ffffff";
        }, 1500);
    });
}

// Reverte as alterações para o que estava salvo no storage
function descartarAlteracoesCriterios() {
    criteriosTemporarios = [...criteriosOriginais];
    renderizarCriteriosTemporarios();
    verificarAlteracoesCriterios();
}

// Busca o perfil do usuário na API do MAL
async function buscarPerfilMAL(token) {
    try {
        let resp = await fetch('https://api.myanimelist.net/v2/users/@me?fields=picture', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (resp.ok) {
            let user = await resp.json();
            atualizarInterfaceLogin(true, user);
            verificarExibicaoBotoesBatch();
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

    if (conectado && dadosUser) {
        perfilArea.style.display = 'flex';
        loginContainer.style.display = 'none';
        document.getElementById('userName').innerText = dadosUser.name;
        document.getElementById('userImg').src = dadosUser.picture || "";
        document.getElementById('loginStatus').innerText = "CONECTADO!";
        document.getElementById('loginStatus').className = "status logged-in";
    } else {
        perfilArea.style.display = 'none';
        loginContainer.style.display = 'block';
        document.getElementById('loginStatus').innerText = "Desconectado";
        document.getElementById('loginStatus').className = "status logged-out";
    }
}

function verificarExibicaoBotoesBatch() {
    const isOfficialScoreChecked = document.getElementById('officialScore').checked;
    
    chrome.storage.local.get(['mal_access_token', 'mal_backup_scores'], (res) => {
        const batchArea = document.getElementById('batchUpdateArea');
        const btnRestore = document.getElementById('btnRestoreBackup');
        const progress = document.getElementById('batchProgress');

        if (isOfficialScoreChecked && res.mal_access_token) {
            batchArea.style.display = 'block';
        } else {
            batchArea.style.display = 'none';
            progress.innerText = "";
        }

        if (res.mal_backup_scores && Object.keys(res.mal_backup_scores.scores || {}).length > 0) {
            btnRestore.style.display = 'inline-block';
        } else {
            btnRestore.style.display = 'none';
        }
    });
}

// --- ATUALIZAÇÃO EM MASSA (SISTEMA INTELIGENTE DE RECALCULO ISOLADO) ---
async function executarAtualizacaoEmMassa() {
    const progress = document.getElementById('batchProgress');
    progress.innerText = "Carregando chave de acesso...";
    
    const res = await chrome.storage.local.get(['mal_access_token']);
    const token = res.mal_access_token;
    if (!token) {
        progress.innerText = "Erro: Usuário não está autenticado no MAL.";
        return;
    }

    if (!confirm("Isso irá analisar os animes do seu MyAnimeList. Se houver notas de avaliação técnica nos seus comentários de review da extensão, a nota oficial do MAL será atualizada para essa média técnica arredondada.\n\nUm backup das notas atuais será criado. Deseja continuar?")) {
        progress.innerText = "";
        return;
    }

    progress.innerText = "Buscando a sua lista de animes do MyAnimeList (isso pode levar alguns segundos)...";
    
    try {
        let url = 'https://api.myanimelist.net/v2/users/@me/animelist?fields=list_status{score,comments,status}&limit=1000';
        let response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        let data = await response.json();

        if (!data || !data.data) {
            progress.innerText = "Falha ao obter lista do MyAnimeList.";
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
            progress.innerText = "Sua lista está em dia! Todos os animes que possuem notas técnicas já correspondem à nota oficial do MAL.";
            return;
        }

        if (!confirm(`Identificamos ${animesParaAtualizar.length} anime(s) que precisam ser atualizados ou corrigidos. Deseja iniciar a atualização e criar o backup agora?`)) {
            progress.innerText = "Ação cancelada pelo usuário.";
            return;
        }

        await chrome.storage.local.set({
            mal_backup_scores: {
                timestamp: Date.now(),
                scores: backupScores
            }
        });

        progress.innerText = `Atualizando animes... (Aguarde o processo concluir)`;

        for (let i = 0; i < animesParaAtualizar.length; i++) {
            let anime = animesParaAtualizar[i];
            progress.innerText = `[${i + 1}/${animesParaAtualizar.length}] Atualizando "${anime.titulo}" para nota ${anime.novaNota}...`;

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

        progress.innerText = "Suas notas foram atualizadas com sucesso para a média técnica!";
        verificarExibicaoBotoesBatch();

    } catch (e) {
        console.error(e);
        progress.innerText = "Erro durante a sincronização em lote.";
    }
}

// --- RESTAURAR NOTAS DO BACKUP ---
async function restaurarNotasOriginais() {
    const progress = document.getElementById('batchProgress');
    
    const res = await chrome.storage.local.get(['mal_access_token', 'mal_backup_scores']);
    const token = res.mal_access_token;
    const backup = res.mal_backup_scores;

    if (!token || !backup || !backup.scores) {
        progress.innerText = "Erro: Dados de backup ou token ausentes.";
        return;
    }

    const ids = Object.keys(backup.scores);
    if (ids.length === 0) {
        progress.innerText = "Nenhum anime encontrado no histórico de backup.";
        return;
    }

    if (!confirm(`Deseja restaurar as notas originais de ${ids.length} animes? Isso reverterá a nota oficial do MAL para os valores anteriores à atualização em lote.`)) {
        return;
    }

    progress.innerText = "Revertendo notas oficiais no MyAnimeList...";

    for (let i = 0; i < ids.length; i++) {
        let id = ids[i];
        let dadosOriginais = backup.scores[id];
        progress.innerText = `[${i + 1}/${ids.length}] Restaurando ID ${id} para nota original ${dadosOriginais.score}...`;

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
        progress.innerText = "Notas originais restauradas! O backup foi limpo.";
        verificarExibicaoBotoesBatch();
    });
}

// Lê os critérios do comentário individual, cura as chaves corrompidas e calcula a média de forma segura
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
        
        if (!linha || linha.toLowerCase().includes("review") || linha.toLowerCase().match(/^(média|media|average|meacutedia):/i)) {
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

// Reconstrói o bloco de comentários de forma 100% limpa, curando a corrupção de caracteres no MAL
function atualizarLinhaDeMediaNoComentario(comentarioOriginal, novaMediaFormatada) {
    const linhas = comentarioOriginal.split('\n');
    let listStr = "";

    linhas.forEach(linha => {
        linha = inlineTrim(linha);
        if (!linha || linha.toLowerCase().includes("review") || linha.toLowerCase().match(/^(média|media|average|meacutedia):/i)) {
            return;
        }

        const match = linha.match(/^(.+?):\s*(\d+(?:[.,]\d+)?)/);
        if (match) {
            let valor = parseFloat(match[2].replace(',', '.'));
            if (valor > 0 && valor <= 10) {
                let cleanKey = normalizarCriterio(match[1]); // Cura o critério na hora de remontar
                listStr += `\n${cleanKey}: ${valor}`;
            }
        }
    });

    return `Review Técnica:${listStr}\nMédia: ${novaMediaFormatada}`;
}

function carregarModoDeExibicaoSalvo() {
    chrome.storage.local.get(['viewMode'], (res) => {
        document.getElementById('viewMode').value = res.viewMode || 'popup';
    });
}

function aplicarModoDeExibicao(mode) {
    chrome.runtime.sendMessage({ action: 'mudarModoExibicao', mode: mode });
}

function inlineTrim(str) {
    return str ? str.trim() : "";
}