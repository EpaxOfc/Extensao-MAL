document.addEventListener('DOMContentLoaded', () => {
    carregarConfig();

    // Botão Login
    document.getElementById('btnLogin').addEventListener('click', () => {
        document.getElementById('loginStatus').innerText = "Aguardando login...";
        
        // Manda mensagem pro background fazer o trabalho sujo
        chrome.runtime.sendMessage({ action: 'loginMAL' }, (response) => {
            if (response && response.success) {
                document.getElementById('loginStatus').innerText = "CONECTADO!";
                document.getElementById('loginStatus').className = "status logged-in";
                document.getElementById('btnLogin').disabled = true;
                document.getElementById('btnLogin').innerText = "Conta Vinculada";
            } else {
                document.getElementById('loginStatus').innerText = "Erro: " + (response ? response.error : 'Desconhecido');
            }
        });
    });

    document.getElementById('btnLogout').addEventListener('click', () => {
        if (confirm("Deseja realmente desconectar sua conta do MyAnimeList?")) {
            // Remove os tokens e dados de acesso
            chrome.storage.local.remove(['mal_access_token', 'mal_refresh_token', 'mal_expires_at'], () => {
                alert("Conta desconectada com sucesso!");
                location.reload(); // Recarrega para resetar a interface
            });
        }
    });

    // Botão Salvar
    document.getElementById('btnSalvar').addEventListener('click', () => {
        const config = {
            autoOpen: document.getElementById('autoOpen').checked,
            syncMal: document.getElementById('syncMal').checked,
            officialScore: document.getElementById('officialScore').checked
        };
        
        chrome.storage.local.set(config, () => {
            let msg = document.getElementById('msg');
            msg.innerText = "Salvo!";
            setTimeout(() => msg.innerText = "", 2000);
        });
    });
});

function carregarConfig() {
    chrome.storage.local.get(['autoOpen', 'syncMal', 'officialScore', 'mal_access_token'], (res) => {
        document.getElementById('autoOpen').checked = res.autoOpen ?? true;
        document.getElementById('syncMal').checked = res.syncMal ?? true;
        document.getElementById('officialScore').checked = res.officialScore ?? false;

        if (res.mal_access_token) {
            document.getElementById('loginStatus').innerText = "CONECTADO!";
            document.getElementById('loginStatus').className = "status logged-in";
            document.getElementById('btnLogin').disabled = true;
            document.getElementById('btnLogin').innerText = "Conta Vinculada";
        }
    });
}

const criteriosPadrao = ["Direção", "Animação", "Complexidade", "Enredo", "Originalidade", "Design", "Coreografia de luta", "Personagens Principais", "Antagonista", "Direção de fotografia"];

document.addEventListener('DOMContentLoaded', () => {
    carregarCriterios();
    
    // Buscar perfil se tiver token
    chrome.storage.local.get(['mal_access_token'], (res) => {
        if (res.mal_access_token) buscarPerfilMAL(res.mal_access_token);
    });

    // Botão Adicionar Critério
    document.getElementById('btnAddCriterio').addEventListener('click', () => {
        let nome = document.getElementById('novoCriterio').value.trim();
        if (nome) {
            chrome.storage.local.get(['meusCriterios'], (res) => {
                let lista = res.meusCriterios || criteriosPadrao;
                lista.push(nome);
                chrome.storage.local.set({ meusCriterios: lista }, () => {
                    document.getElementById('novoCriterio').value = "";
                    carregarCriterios();
                });
            });
        }
    });
});

function carregarCriterios() {
    const criteriosPadrao = ["Direção", "Animação", "Complexidade", "Enredo", "Originalidade", "Design", "Coreografia de luta", "Personagens Principais", "Antagonista", "Direção de fotografia"];
    
    chrome.storage.local.get(['meusCriterios'], (res) => {
        let lista = res.meusCriterios || criteriosPadrao;
        let container = document.getElementById('listaCriterios');
        container.innerHTML = "";

        lista.forEach((crit, index) => {
            let item = document.createElement('div');
            item.className = "row";
            
            // Criamos o texto
            let span = document.createElement('span');
            span.textContent = crit;
            
            // Criamos o botão de lixeira (sem onclick no HTML)
            let btnRemover = document.createElement('button');
            btnRemover.textContent = "🗑️";
            btnRemover.style.background = "none";
            btnRemover.style.border = "none";
            btnRemover.style.cursor = "pointer";
            
            // ADICIONAMOS O CLIQUE VIA JS (Correção do erro de CSP)
            btnRemover.addEventListener('click', () => {
                removerCriterio(index);
            });

            item.appendChild(span);
            item.appendChild(btnRemover);
            container.appendChild(item);
        });
    });
}

function removerCriterio(index) {
    const criteriosPadrao = ["Direção", "Animação", "Complexidade", "Enredo", "Originalidade", "Design", "Coreografia de luta", "Personagens Principais", "Antagonista", "Direção de fotografia"];
    chrome.storage.local.get(['meusCriterios'], (res) => {
        let lista = res.meusCriterios || criteriosPadrao;
        lista.splice(index, 1);
        chrome.storage.local.set({ meusCriterios: lista }, () => {
            carregarCriterios();
        });
    });
}

async function buscarPerfilMAL(token) {
    try {
        let resp = await fetch('https://api.myanimelist.net/v2/users/@me?fields=picture', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        let user = await resp.json();
        if (user.name) {
            document.getElementById('perfilArea').style.display = 'flex';
            document.getElementById('userImg').src = user.picture;
            document.getElementById('userName').innerText = user.name;
        }
    } catch (e) { console.error("Erro perfil:", e); }
}

function atualizarInterfaceLogin(conectado, dadosUser = null) {
    const perfilArea = document.getElementById('perfilArea');
    const loginContainer = document.getElementById('loginContainer'); // O div que tem o botão "Conectar"

    if (conectado && dadosUser) {
        perfilArea.style.display = 'flex';
        loginContainer.style.display = 'none';
        document.getElementById('userName').innerText = dadosUser.name;
        document.getElementById('userImg').src = dadosUser.picture || "";
    } else {
        perfilArea.style.display = 'none';
        loginContainer.style.display = 'block';
    }
}