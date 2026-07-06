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

    // Decodificação segura utilizando parser HTML do navegador (evita injeção)
    const parser = new DOMParser();
    const doc = parser.parseFromString(texto, 'text/html');
    const textoDecodificado = doc.documentElement.textContent || "";

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

        const corMedia = anime.mediaTecnica !== "N/A" ? "var(--gold)" : "var(--text-muted)";

        // Estrutura estática segura com classes identificadoras
        card.innerHTML = `
            <img class="card-capa" src="" alt="Capa">
            <div class="card-body">
                <h3 class="card-title"></h3>
                <div class="info-mal">
                    <!-- Bloco Nota Global -->
                    <div class="info-badge" title="Média Global MAL">
                        <span class="emoji">🌟</span>
                        <span class="label">Global</span>
                        <span class="valor card-global-score"></span>
                    </div>
                    
                    <!-- Bloco Sua Nota -->
                    <div class="info-badge destaque" title="Sua Nota Pessoal">
                        <span class="emoji">👤</span>
                        <span class="label">Sua Nota</span>
                        <span class="valor card-user-score"></span>
                    </div>
                </div>
            </div>
            <div class="card-footer">
                <div class="tech-box">
                    <div class="tech-label">Média Técnica</div>
                    <div class="nota-media card-tech-score" style="color: ${corMedia}"></div>
                </div>
                
                <!-- Container para Estúdio e Ano alinhados à direita -->
                <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px; max-width: 60%;">
                    <span class="card-studio" style="font-size: 11px; color: var(--accent); font-weight: 600; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%;"></span>
                    <span class="badge-ano card-year"></span>
                </div>
            </div>
        `;

        // Atribuição de textos e links de forma segura
        card.querySelector('.card-capa').src = anime.capa || "";
        card.querySelector('.card-title').textContent = anime.titulo || "";
        card.querySelector('.card-global-score').textContent = anime.notaGeralMAL || "N/A";
        card.querySelector('.card-user-score').textContent = anime.notaMAL > 0 ? anime.notaMAL : '-';
        card.querySelector('.card-tech-score').textContent = anime.mediaTecnica || "N/A";
        card.querySelector('.card-studio').textContent = anime.estudio || "Estúdio Desconhecido";
        card.querySelector('.card-year').textContent = anime.ano || "TBA";

        grid.appendChild(card);
    });
}

// --- LÓGICA DO MODAL (VIEW vs EDIT) ---

function abrirModalView(anime) {
    animeAtualModal = anime;
    const modal = document.getElementById('modalDetalhes');
    const conteudo = document.getElementById('detalhesConteudo');

    const criterios = Object.keys(anime.notasDetalhadas);

    // Estrutura base estática
    conteudo.innerHTML = `
        <div class="modal-capa-container">
            <img class="modal-img" src="" alt="Capa">
        </div>
        <div class="modal-info">
            <div class="modal-header">
                <h2 class="modal-title"></h2>
                <div class="sub-header modal-sub-header"></div>
            </div>

            <div class="stats-row">
                <div class="stat-box">
                    <span>Global</span>
                    <strong class="modal-global-score"></strong>
                </div>
                <div class="stat-box">
                    <span>Sua Nota</span>
                    <strong class="modal-user-score"></strong>
                </div>
                <div class="stat-box highlight">
                    <span>Média Técnica</span>
                    <strong id="displayMediaTecnica"></strong>
                </div>
            </div>

            <!-- CONTAINER DE VISUALIZAÇÃO -->
            <div id="containerView">
                <h3 style="font-size:14px; color:var(--text-muted); border-bottom:1px solid #333; padding-bottom:10px; margin-bottom:20px;">DETALHES TÉCNICOS</h3>
                <div id="modalCriteriosViewContainer"></div>
                <div class="action-bar">
                    <a id="modalLinkMAL" href="" target="_blank" class="btn-secondary">Ver no MAL</a>
                    <button id="btnEditarAvaliacao" class="btn-primary">✐ Editar Avaliação</button>
                </div>
            </div>

            <!-- CONTAINER DE EDIÇÃO -->
            <div id="containerEdit" class="edit-mode-container">
                <h3 style="font-size:14px; color:var(--text-muted); margin-bottom:15px;">EDITANDO AVALIAÇÃO</h3>
                
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

    // Atribuição textual segura
    conteudo.querySelector('.modal-img').src = anime.capa || "";
    conteudo.querySelector('.modal-title').textContent = anime.titulo || "";
    conteudo.querySelector('.modal-sub-header').textContent = `${anime.estudio || 'Estúdio Desconhecido'} • ${anime.ano || 'TBA'}`;
    conteudo.querySelector('.modal-global-score').textContent = anime.notaGeralMAL || "N/A";
    conteudo.querySelector('.modal-user-score').textContent = anime.notaMAL > 0 ? anime.notaMAL : '-';
    conteudo.querySelector('#displayMediaTecnica').textContent = anime.mediaTecnica || "N/A";
    conteudo.querySelector('#modalLinkMAL').href = `https://myanimelist.net/anime/${anime.id}`;

    // Construção segura da grade de critérios
    const viewContainer = conteudo.querySelector('#modalCriteriosViewContainer');
    viewContainer.innerHTML = '';
    
    const gridView = document.createElement('div');
    gridView.className = 'view-mode-grid';
    
    if (criterios.length > 0) {
        criterios.forEach(crit => {
            const viewItem = document.createElement('div');
            viewItem.className = 'view-item';
            
            const spanCrit = document.createElement('span');
            spanCrit.textContent = crit;
            
            const spanNota = document.createElement('span');
            spanNota.textContent = anime.notasDetalhadas[crit].toFixed(1);
            
            viewItem.appendChild(spanCrit);
            viewItem.appendChild(spanNota);
            gridView.appendChild(viewItem);
        });
        viewContainer.appendChild(gridView);
    } else {
        const emptyMsg = document.createElement('div');
        emptyMsg.style.cssText = 'grid-column:1/-1; color:#777; padding:10px;';
        emptyMsg.textContent = 'Sem avaliação técnica. Clique em Editar.';
        viewContainer.appendChild(emptyMsg);
    }

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