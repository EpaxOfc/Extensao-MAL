document.addEventListener('DOMContentLoaded', () => {
    // Inicialização
    chrome.storage.local.get(['mal_access_token'], (res) => {
        if (res.mal_access_token) {
            carregarListaCompleta(res.mal_access_token);
        } else {
            document.getElementById('gridAnimes').innerHTML = "<h2 style='text-align:center; padding:40px;'>Faça login nas configurações da extensão.</h2>";
        }
    });

    // Filtros
    document.getElementById('filtroNome').addEventListener('input', filtrarLista);
    document.getElementById('ordenarPor').addEventListener('change', filtrarLista);
    
    // Fechar modal (Botão X e Clicar fora)
    document.querySelector('.close').addEventListener('click', fecharModal);
    window.addEventListener('click', (e) => { 
        if (e.target == document.getElementById('modalDetalhes')) fecharModal(); 
    });
});

let listaGlobalAnimes = [];
let animeAtualModal = null; // Guarda o anime aberto atualmente

function fecharModal() {
    document.getElementById('modalDetalhes').style.display = "none";
}

async function carregarListaCompleta(token) {
    const grid = document.getElementById('gridAnimes');
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 20px;">Sincronizando com MyAnimeList...</div>';

    try {
        // Adicionamos 'sort=list_updated_at' na URL para garantir que o "Recente" seja real
        const url = `https://api.myanimelist.net/v2/users/@me/animelist?fields=list_status{score,comments,status},mean,main_picture,start_season,studios&limit=700&sort=list_updated_at`;
        
        const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await response.json();

        if (data.data) {
            // --- FILTRO AQUI ---
            // Remove 'plan_to_watch' (Planejo assistir) e 'on_hold' (Em espera) se desejar
            const listaFiltrada = data.data.filter(item => {
                const s = item.list_status.status;
                return s === 'completed' || s === 'dropped' || s === 'watching';
            });

            listaGlobalAnimes = listaFiltrada.map(item => {
                const anime = item.node;
                const status = item.list_status || {};
                const dadosProcessados = processarComentario(status.comments);

                return {
                    id: anime.id,
                    titulo: anime.title,
                    capa: anime.main_picture ? anime.main_picture.large || anime.main_picture.medium : "",
                    notaMAL: status.score || 0,
                    notaGeralMAL: anime.mean || "N/A",
                    ano: anime.start_season ? `${anime.start_season.year}` : "TBA",
                    estudio: anime.studios && anime.studios.length > 0 ? anime.studios[0].name : "Estúdio Desconhecido",
                    mediaTecnica: dadosProcessados.media,
                    notasDetalhadas: dadosProcessados.detalhes,
                    comentarioOriginal: status.comments || ""
                };
            });

            console.log("Lista filtrada e carregada:", listaGlobalAnimes);
            renderizarCards(listaGlobalAnimes);
        }
    } catch (err) {
        console.error("Erro na carga:", err);
        grid.innerHTML = "Erro ao carregar lista.";
    }
}

function processarComentario(texto) {
    if (!texto) return { media: "N/A", detalhes: {} };

    const txtArea = document.createElement('textarea');
    txtArea.innerHTML = texto;
    const textoDecodificado = txtArea.value;

    const linhas = textoDecodificado.split('\n');
    const detalhes = {};
    let mediaEncontrada = "N/A";

    const mapaCorrecao = {
        "Direccedilatildeo": "Direção", "Animaccedilatildeo": "Animação", "Meacutedia": "Média"
    };

    linhas.forEach(linha => {
        linha = linha.trim();
        if (!linha || linha.toLowerCase().includes("review")) return;

        const partes = linha.split(':');
        if (partes.length < 2) return;

        let chave = partes[0].trim();
        if (mapaCorrecao[chave]) chave = mapaCorrecao[chave];
        chave = chave.replace(/[^\w\s\u00C0-\u00FF\/]/g, "").trim();

        let valorStr = partes[1].trim().replace(',', '.');
        let valor = parseFloat(valorStr);

        if (isNaN(valor)) return;

        if (chave.match(/^(Média|Media|Média Técnica|Average)$/i)) {
            mediaEncontrada = valor.toFixed(2);
        } else {
            detalhes[chave] = valor;
        }
    });

    return { media: mediaEncontrada, detalhes: detalhes };
}

function renderizarCards(lista) {
    const grid = document.getElementById('gridAnimes');
    grid.innerHTML = "";

    lista.forEach(anime => {
        const card = document.createElement('div');
        card.className = 'anime-card';
        card.addEventListener('click', () => abrirModalView(anime));

        // Define a cor da média técnica (Dourado se tiver nota, cinza se N/A)
        const corMedia = anime.mediaTecnica !== "N/A" ? "var(--gold)" : "var(--text-muted)";

        card.innerHTML = `
            <img src="${anime.capa}" class="card-capa">
            <div class="card-body">
                <h3>${anime.titulo}</h3>
                <div class="info-mal">
                    <!-- Bloco Nota Global -->
                    <div class="info-badge" title="Média Global MAL">
                        <span class="emoji">🌟</span>
                        <span class="label">Global</span>
                        <span class="valor">${anime.notaGeralMAL}</span>
                    </div>
                    
                    <!-- Bloco Sua Nota -->
                    <div class="info-badge destaque" title="Sua Nota Pessoal">
                        <span class="emoji">👤</span>
                        <span class="label">Sua Nota</span>
                        <span class="valor">${anime.notaMAL > 0 ? anime.notaMAL : '-'}</span>
                    </div>
                </div>
            </div>
            <div class="card-footer">
                <div class="tech-box">
                    <div class="tech-label">Média Técnica</div>
                    <div class="nota-media" style="color: ${corMedia}">${anime.mediaTecnica}</div>
                </div>
                
                <!-- Container para Estúdio e Ano alinhados à direita -->
                <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px; max-width: 60%;">
                    <span style="font-size: 11px; color: var(--accent); font-weight: 600; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%;">
                        ${anime.estudio}
                    </span>
                    <span class="badge-ano">${anime.ano}</span>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

// --- LÓGICA DO MODAL (VIEW vs EDIT) ---

function abrirModalView(anime) {
    animeAtualModal = anime;
    const modal = document.getElementById('modalDetalhes');
    const conteudo = document.getElementById('detalhesConteudo');

    // 1. Gera HTML do Modo Visualização
    let htmlView = `<div class="view-mode-grid">`;
    const criterios = Object.keys(anime.notasDetalhadas);
    
    if (criterios.length > 0) {
        criterios.forEach(crit => {
            htmlView += `
                <div class="view-item">
                    <span>${crit}</span>
                    <span>${anime.notasDetalhadas[crit].toFixed(1)}</span>
                </div>`;
        });
    } else {
        htmlView += `<div style="grid-column:1/-1; color:#777; padding:10px;">Sem avaliação técnica. Clique em Editar.</div>`;
    }
    htmlView += `</div>`;

    // 2. Monta estrutura do Modal
    conteudo.innerHTML = `
        <div class="modal-capa-container">
            <img src="${anime.capa}" class="modal-img">
        </div>
        <div class="modal-info">
            <div class="modal-header">
                <h2>${anime.titulo}</h2>
                <div class="sub-header">${anime.estudio} • ${anime.ano}</div>
            </div>

            <div class="stats-row">
                <div class="stat-box">
                    <span>Global</span>
                    <strong>${anime.notaGeralMAL}</strong>
                </div>
                <div class="stat-box">
                    <span>Sua Nota</span>
                    <strong>${anime.notaMAL > 0 ? anime.notaMAL : '-'}</strong>
                </div>
                <div class="stat-box highlight">
                    <span>Média Técnica</span>
                    <strong id="displayMediaTecnica">${anime.mediaTecnica}</strong>
                </div>
            </div>

            <!-- CONTAINER DE VISUALIZAÇÃO -->
            <div id="containerView">
                <h3 style="font-size:14px; color:var(--text-muted); border-bottom:1px solid #333; padding-bottom:10px; margin-bottom:20px;">DETALHES TÉCNICOS</h3>
                ${htmlView}
                <div class="action-bar">
                    <a href="https://myanimelist.net/anime/${anime.id}" target="_blank" class="btn-secondary">Ver no MAL</a>
                    <button id="btnEditarAvaliacao" class="btn-primary">✐ Editar Avaliação</button>
                </div>
            </div>

            <!-- CONTAINER DE EDIÇÃO -->
            <div id="containerEdit" class="edit-mode-container">
                <h3 style="font-size:14px; color:var(--text-muted); margin-bottom:15px;">EDITANDO AVALIAÇÃO</h3>
                
                <!-- AQUI ESTÁ A CORREÇÃO: id="destaqueNotaMal" -->
                <div class="edit-row" id="destaqueNotaMal">
                     <label>Sua Nota Oficial (MAL)</label>
                     <select id="editNotaMAL">
                        <option value="0">-</option>
                        ${gerarOpcoes(anime.notaMAL, true)}
                     </select>
                </div>

                <div id="listaInputsTecnicos"></div>
                
                <div class="edit-row-add">
                    <input type="text" id="novoCritNome" placeholder="Novo critério...">
                    <button id="btnAddCriterio">+</button>
                </div>

                <div class="action-bar">
                    <button id="btnCancelarEdit" class="btn-secondary">Cancelar</button>
                    <button id="btnSalvarFinal" class="btn-primary">Salvar Alterações</button>
                </div>
                <div id="statusMsg" style="text-align:right; margin-top:10px; font-size:12px; font-weight:bold;"></div>
            </div>
        </div>
    `;

    // 3. Listeners
    document.getElementById('btnEditarAvaliacao').addEventListener('click', ativarModoEdicao);
    document.getElementById('btnCancelarEdit').addEventListener('click', cancelarEdicao);
    document.getElementById('btnAddCriterio').addEventListener('click', addCriterioDOM);
    document.getElementById('btnSalvarFinal').addEventListener('click', () => salvarNoMAL(anime.id));

    modal.style.display = "flex";
}

function ativarModoEdicao() {
    document.getElementById('containerView').style.display = 'none';
    document.getElementById('containerEdit').style.display = 'block';

    const containerInputs = document.getElementById('listaInputsTecnicos');
    containerInputs.innerHTML = "";

    // Define quais critérios mostrar
    let criterios = Object.keys(animeAtualModal.notasDetalhadas);
    if (criterios.length === 0) {
        criterios = ["Direção", "Animação", "Complexidade", "Enredo", "Originalidade", "Design", "Coreografia de luta", "Personagens Principais", "Antagonista", "Direção de fotografia"];
    }

    criterios.forEach(crit => {
        let valor = animeAtualModal.notasDetalhadas[crit] || 0;
        adicionarInputCriterio(containerInputs, crit, valor);
    });
    
    recalcularMediaEdicao();
}

function cancelarEdicao() {
    document.getElementById('containerView').style.display = 'block';
    document.getElementById('containerEdit').style.display = 'none';
}

function adicionarInputCriterio(container, nome, valor) {
    let div = document.createElement('div');
    div.className = 'edit-row';
    
    // HTML estruturado com Label em cima e (Select + Botão) embaixo
    div.innerHTML = `
        <label>${nome}</label>
        <div class="input-group">
            <select class="nota-select-modal input-calculo" data-criterio="${nome}">
                <option value="0">-</option>
                ${gerarOpcoes(valor)}
            </select>
            <button class="btn-delete-crit" type="button" title="Remover critério">×</button>
        </div>
    `;
    
    container.appendChild(div);
    
    // 1. Listener para recalcular a média ao mudar a nota
    div.querySelector('select').addEventListener('change', recalcularMediaEdicao);

    // 2. Listener para o botão de deletar
    div.querySelector('.btn-delete-crit').addEventListener('click', () => {
        // Remove o elemento da tela (div.edit-row)
        div.remove();
        // Recalcula a média imediatamente, pois esse item não existe mais
        recalcularMediaEdicao();
    });
}

function addCriterioDOM() {
    let nome = document.getElementById('novoCritNome').value;
    if(!nome) return;
    adicionarInputCriterio(document.getElementById('listaInputsTecnicos'), nome, 0);
    document.getElementById('novoCritNome').value = "";
}

function recalcularMediaEdicao() {
    let selects = document.querySelectorAll('.input-calculo');
    let soma = 0, qtd = 0;
    selects.forEach(s => {
        let v = parseFloat(s.value);
        if (v > 0) { soma += v; qtd++; }
    });
    let media = qtd > 0 ? (soma / qtd).toFixed(2) : "N/A";
    
    document.getElementById('displayMediaTecnica').innerText = media;
    if(media !== "N/A") document.getElementById('displayMediaTecnica').style.color = "var(--gold)";
}

function gerarOpcoes(selecionado, ehInteiro = false) {
    let html = "";
    for(let i=1; i<=10; i++) {
        let val = ehInteiro ? i : i + ".0";
        let sel = (parseFloat(selecionado) == i) ? "selected" : "";
        html += `<option value="${i}" ${sel}>${val}</option>`;
    }
    return html;
}

async function salvarNoMAL(id) {
    const status = document.getElementById('statusMsg');
    status.innerText = "Enviando...";
    status.style.color = "#ccc";

    let notaMal = document.getElementById('editNotaMAL').value;
    let media = document.getElementById('displayMediaTecnica').innerText;
    if(media === "N/A") media = "0.00";

    let coment = "Review Técnica:";
    document.querySelectorAll('.input-calculo').forEach(sel => {
        let v = parseInt(sel.value);
        if (v > 0) {
            coment += `\n${sel.getAttribute('data-criterio')}: ${v}`;
        }
    });
    coment += `\nMédia: ${media}`;

    try {
        const res = await chrome.storage.local.get(['mal_access_token']);
        
        const body = new URLSearchParams();
        body.append('score', notaMal);
        body.append('comments', coment);

        const req = await fetch(`https://api.myanimelist.net/v2/anime/${id}/my_list_status`, {
            method: 'PATCH',
            headers: { 
                'Authorization': `Bearer ${res.mal_access_token}`, 
                'Content-Type': 'application/x-www-form-urlencoded' 
            },
            body: body
        });

        if (req.ok) {
            status.innerText = "Salvo! Atualizando...";
            status.style.color = "#4cd137";
            setTimeout(() => location.reload(), 1000);
        } else {
            throw new Error("Erro API");
        }
    } catch (e) {
        console.error(e);
        status.innerText = "Erro ao salvar.";
        status.style.color = "#e84118";
    }
}

function filtrarLista() {
    const busca = document.getElementById('filtroNome').value.toLowerCase();
    const ordem = document.getElementById('ordenarPor').value;

    let filtrados = listaGlobalAnimes.filter(a => a.titulo.toLowerCase().includes(busca));

    if (ordem === 'recente') {
    } else if (ordem === 'nota') {
        filtrados.sort((a, b) => b.notaMAL - a.notaMAL);
    } else if (ordem === 'media_tecnica') {
        filtrados.sort((a, b) => {
            let notaA = a.mediaTecnica === "N/A" ? 0 : parseFloat(a.mediaTecnica);
            let notaB = b.mediaTecnica === "N/A" ? 0 : parseFloat(b.mediaTecnica);
            return notaB - notaA;
        });
    } else if (ordem === 'nome') {
        filtrados.sort((a, b) => a.titulo.localeCompare(b.titulo));
    }

    renderizarCards(filtrados);
}