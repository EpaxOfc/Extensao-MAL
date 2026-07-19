let is3DEnabled = false;
let listaGlobalAnimes = [];
let animeAtualModal = null;

function normalizarCriterio(nome) {
    if (!nome) return "";
    let n = nome.trim();

    const correcoes = [
        { regex: /Dire.{0,20}(ced|amp|ccedil|tilde|atilde).{0,5}o/i, sub: "Direção" },
        { regex: /Anim.{0,20}(ced|amp|ccedil|tilde|ccedil|atilde).{0,5}o/i, sub: "Animação" },
        { regex: /M.{0,20}(amp|acute|eacut|dia).{0,5}dia/i, sub: "Média" },
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
};

function obterTokenDoBackground() {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'obterTokenValido' }, (response) => {
            if (chrome.runtime.lastError || !response || !response.success) {
                resolve(null);
            } else {
                resolve(response.token);
            }
        });
    });
}

// Substitua o bloco correspondente no lista.js:
document.addEventListener('DOMContentLoaded', async () => {
    const token = await obterTokenDoBackground();
    
    if (token) {
        carregarListaCompleta(token);
    } else {
        document.getElementById('gridAnimes').innerHTML = "<h2 style='text-align:center; padding:40px;'>Faça login nas configurações da extensão.</h2>";
    }

    document.getElementById('filtroNome').addEventListener('input', filtrarLista);
    document.getElementById('ordenarPor').addEventListener('change', filtrarLista);
    document.getElementById('filtroNotas').addEventListener('change', filtrarLista);
    
    document.querySelectorAll('.cb-status').forEach(cb => {
        cb.addEventListener('change', filtrarLista);
    });

    const btnDropdown = document.getElementById('btnDropdownStatus');
    const menuDropdown = document.getElementById('listaDropdownStatus');

    btnDropdown.addEventListener('click', (e) => {
        e.stopPropagation();
        menuDropdown.classList.toggle('show');
    });

    window.addEventListener('click', (e) => {
        if (!e.target.closest('.custom-dropdown-container')) {
            menuDropdown.classList.remove('show');
        }
    });
    
    document.querySelector('.close').addEventListener('click', fecharModal);
    window.addEventListener('click', (e) => { 
        if (e.target == document.getElementById('modalDetalhes')) fecharModal(); 
    });

    chrome.storage.sync.get(['enable3DHover'], (res) => {
        is3DEnabled = res.enable3DHover || false;
        atualizarBotao3D();
    });

    document.getElementById('btnToggle3D').addEventListener('click', () => {
        is3DEnabled = !is3DEnabled;
        chrome.storage.sync.set({ enable3DHover: is3DEnabled });
        atualizarBotao3D();
        
        if (!is3DEnabled) {
            document.querySelectorAll('.anime-card').forEach(card => {
                card.style.transform = '';
                card.style.transition = '';
                card.style.boxShadow = '';
            });
        }
    });

    function atualizarBotao3D() {
        const btn = document.getElementById('btnToggle3D');
        const status = document.getElementById('status3D');
        if (is3DEnabled) {
            btn.classList.add('active');
            status.textContent = 'ON';
        } else {
            btn.classList.remove('active');
            status.textContent = 'OFF';
        }
    }
});

function fecharModal() {
    document.getElementById('modalDetalhes').style.display = "none";
}

async function carregarListaCompleta(token) {
    const grid = document.getElementById('gridAnimes');
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 20px;">Sincronizando com MyAnimeList...</div>';

    try {
        const url = `https://api.myanimelist.net/v2/users/@me/animelist?fields=list_status{score,comments,status},mean,main_picture,start_season,studios&limit=700&sort=list_updated_at`;
        
        const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await response.json();

        if (data.data) {
            listaGlobalAnimes = data.data.map(item => {
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
                    comentarioOriginal: status.comments || "",
                    statusLista: status.status
                };
            });

            console.log("Lista completa carregada:", listaGlobalAnimes);
            renderizarCards(listaGlobalAnimes);
        }
    } catch (err) {
        console.error("Erro na carga:", err);
        grid.innerHTML = "Erro ao carregar lista.";
    }
}

function processarComentario(texto) {
    if (!texto) return { media: "N/A", detalhes: {} };

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

        let chave = normalizarCriterio(partes[0]);
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

        card.querySelector('.card-capa').src = anime.capa || "";
        card.querySelector('.card-title').textContent = anime.titulo || "";
        card.querySelector('.card-global-score').textContent = anime.notaGeralMAL || "N/A";
        card.querySelector('.card-user-score').textContent = anime.notaMAL > 0 ? anime.notaMAL : '-';
        card.querySelector('.card-tech-score').textContent = anime.mediaTecnica || "N/A";
        card.querySelector('.card-studio').textContent = anime.estudio || "Estúdio Desconhecido";
        card.querySelector('.card-year').textContent = anime.ano || "TBA";

        card.addEventListener('mousemove', (e) => {
            if (!is3DEnabled) return; 

            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top; 
            
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            
            const rotateX = ((y - centerY) / centerY) * -12; 
            const rotateY = ((x - centerX) / centerX) * 12;
            
            card.style.transition = 'none'; 
            
            card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.05, 1.05, 1.05)`;
            
            card.style.boxShadow = `${-rotateY}px ${rotateX + 10}px 25px rgba(0,0,0,0.7)`;
        });

        card.addEventListener('mouseleave', () => {
            if (!is3DEnabled) return;
            card.style.transition = 'transform 0.5s ease, box-shadow 0.5s ease';
            card.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
            card.style.boxShadow = ''; 
        });

        grid.appendChild(card);
    });
}

// --- LÓGICA DO MODAL (VIEW vs EDIT) ---

function abrirModalView(anime) {
    animeAtualModal = anime;
    const modal = document.getElementById('modalDetalhes');
    const conteudo = document.getElementById('detalhesConteudo');

    const criterios = Object.keys(anime.notasDetalhadas);

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

                <!-- Lista onde os selects das notas aparecerão -->
                <div id="listaInputsTecnicos"></div>
                
                <!-- BOTÃO DE ATIVAR MODO AVANÇADO -->
                <div style="text-align: center; margin-top: 15px;">
                    <button id="btnToggleCriterios" type="button" style="background: transparent; color: #6c5ce7; border: 1px dashed #6c5ce7; padding: 6px 15px; border-radius: 4px; font-size: 11px; cursor: pointer; transition: 0.2s;">⚙️ Adicionar ou Remover Critérios</button>
                </div>

                <!-- ÁREA AVANÇADA (Oculta por padrão) -->
                <div id="areaEditarCriterios" style="display: none; margin-top: 15px; padding-top: 15px; border-top: 1px solid #333;">
                    <div class="edit-row-add">
                        <input type="text" id="novoCritNome" placeholder="Novo critério...">
                        <button id="btnAddCriterio">+</button>
                    </div>
                </div>

                <div class="action-bar" style="margin-top: 20px;">
                    <button id="btnCancelarEdit" class="btn-secondary">Cancelar</button>
                    <button id="btnSalvarFinal" class="btn-primary">Salvar Alterações</button>
                </div>
                <div id="statusMsg" style="text-align:right; margin-top:10px; font-size:12px; font-weight:bold;"></div>
            </div>
        </div>
    `;

    conteudo.querySelector('.modal-img').src = anime.capa || "";
    conteudo.querySelector('.modal-title').textContent = anime.titulo || "";
    conteudo.querySelector('.modal-sub-header').textContent = `${anime.estudio || 'Estúdio Desconhecido'} • ${anime.ano || 'TBA'}`;
    conteudo.querySelector('.modal-global-score').textContent = anime.notaGeralMAL || "N/A";
    conteudo.querySelector('.modal-user-score').textContent = anime.notaMAL > 0 ? anime.notaMAL : '-';
    conteudo.querySelector('#displayMediaTecnica').textContent = anime.mediaTecnica || "N/A";
    conteudo.querySelector('#modalLinkMAL').href = `https://myanimelist.net/anime/${anime.id}`;

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

    document.getElementById('btnToggleCriterios').addEventListener('click', () => {
        const areaAdd = document.getElementById('areaEditarCriterios');
        const botoesDeletar = document.querySelectorAll('.btn-delete-crit');
        const btnToggle = document.getElementById('btnToggleCriterios');
        
        const isFechado = areaAdd.style.display === 'none';

        if (isFechado) {
            // Abre o modo de edição estrutural (Mostra o input e os botões de X)
            areaAdd.style.display = 'block';
            botoesDeletar.forEach(b => b.style.display = 'flex'); 
            btnToggle.textContent = "Ocultar Edição de Critérios";
            btnToggle.style.background = "#2d2d33";
        } else {
            // Fecha o modo
            areaAdd.style.display = 'none';
            botoesDeletar.forEach(b => b.style.display = 'none'); 
            btnToggle.textContent = "⚙️ Adicionar ou Remover Critérios";
            btnToggle.style.background = "transparent";
        }
    });

    modal.style.display = "flex";
}

function ativarModoEdicao() {
    document.getElementById('containerView').style.display = 'none';
    document.getElementById('containerEdit').style.display = 'block';

    const containerInputs = document.getElementById('listaInputsTecnicos');
    containerInputs.innerHTML = "";

    const defaultCriterios = ["Direção", "Animação", "Complexidade", "Enredo", "Originalidade", "Design",
         "Coreografia de luta", "Personagens Principais", "Antagonista", "Direção de fotografia", 
         "Trilha Sonora", "Efeitos Sonoros"];

    chrome.storage.local.get(['meusCriterios'], (res) => {
        let listaFinal = res.meusCriterios || [...defaultCriterios];

        const criteriosNoAnime = Object.keys(animeAtualModal.notasDetalhadas);

        criteriosNoAnime.forEach(crit => {
            if (!listaFinal.includes(crit)) {
                listaFinal.push(crit);
            }
        });

        listaFinal.forEach(crit => {
            let valor = animeAtualModal.notasDetalhadas[crit] || 0;
            adicionarInputCriterio(containerInputs, crit, valor);
        });
        
        recalcularMediaEdicao();
    });
}

function cancelarEdicao() {
    document.getElementById('containerView').style.display = 'block';
    document.getElementById('containerEdit').style.display = 'none';
}

function adicionarInputCriterio(container, nome, valor) {
    let div = document.createElement('div');
    div.className = 'edit-row';
    
    const areaEdicao = document.getElementById('areaEditarCriterios');
    const displayX = (areaEdicao && areaEdicao.style.display === 'block') ? 'flex' : 'none';

    div.innerHTML = `
        <label></label>
        <div class="input-group" style="display: flex; gap: 5px; align-items: center;">
            <select class="nota-select-modal input-calculo" data-criterio="">
                <option value="0">-</option>
                ${gerarOpcoes(valor)}
            </select>
            <button class="btn-delete-crit" type="button" title="Remover critério" style="display: ${displayX}; background: #ff7675; color: white; border: none; border-radius: 4px; padding: 0 8px; cursor: pointer; align-items: center; justify-content: center;">×</button>
        </div>
    `;
    
    div.querySelector('label').textContent = nome;
    div.querySelector('select').setAttribute('data-criterio', nome);
    
    container.appendChild(div);
    
    div.querySelector('select').addEventListener('change', recalcularMediaEdicao);

    div.querySelector('.btn-delete-crit').addEventListener('click', () => {
        div.remove();
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
            let critLimpo = normalizarCriterio(sel.getAttribute('data-criterio'));
            coment += `\n${critLimpo}: ${v}`;
        }
    });
    coment += `\nMédia: ${media}`;;

    try {
        const token = await obterTokenDoBackground();
        if (!token) throw new Error("Não foi possível autenticar a sessão.");
        
        const body = new URLSearchParams();
        body.append('score', notaMal);
        body.append('comments', coment);

        const req = await fetch(`https://api.myanimelist.net/v2/anime/${id}/my_list_status`, {
            method: 'PATCH',
            headers: { 
                'Authorization': `Bearer ${token}`, 
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
    const filtroNotas = document.getElementById('filtroNotas').value;

    const checkboxes = document.querySelectorAll('.cb-status:checked');
    const statusSelecionados = Array.from(checkboxes).map(cb => cb.value);

    const badge = document.getElementById('badgeStatusCount');
    if (statusSelecionados.length === 5) {
        badge.textContent = "Todos";
    } else if (statusSelecionados.length === 0) {
        badge.textContent = "Nenhum";
    } else {
        badge.textContent = statusSelecionados.length;
    }

    let filtrados = listaGlobalAnimes.filter(a => a.titulo.toLowerCase().includes(busca));

    filtrados = filtrados.filter(a => statusSelecionados.includes(a.statusLista));

    if (filtroNotas === 'sem_oficial') {
        filtrados = filtrados.filter(a => a.notaMAL === 0);
    } else if (filtroNotas === 'sem_tecnica') {
        filtrados = filtrados.filter(a => a.mediaTecnica === "N/A");
    } else if (filtroNotas === 'sem_nota') {
        filtrados = filtrados.filter(a => a.notaMAL === 0 && a.mediaTecnica === "N/A");
    }

    if (ordem === 'nota') {
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

