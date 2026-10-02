// 📡 API EXTERNA: INTEGRAÇÃO COM O CINEFY AUTO PREENCHER

const ID_EXTENSAO_CINEFY = "pkgcomlobhfgmpcodkpogidcpodholpk"; 

chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
    if (sender.id !== ID_EXTENSAO_CINEFY) return;

    if (request.action === "PING") {
        sendResponse({ status: "OK" });
        return;
    }

    if (request.action === "OBTER_NOTA_CINEFY") {
        processarRequisicaoCinefy(request).then(sendResponse);
        return true; 
    }
    
});

async function processarRequisicaoCinefy(req) {
    let { titulo, temporada, episodio } = req;
    if (!titulo) return { sucesso: false, erro: "Título não fornecido." };

    let nomeBaixo = titulo.toLowerCase();
    let isMovie = nomeBaixo.includes('filme') || nomeBaixo.includes('movie');

    let resultados = await new Promise((resolve) => {
        executarBuscaJikan(titulo, true, isMovie, (resposta) => {
            resolve(resposta && resposta.success ? resposta.data : []);
        });
    });

    if (!resultados || resultados.length === 0) {
        return { sucesso: false, erro: "Não é um anime ou não foi encontrado." };
    }

    let animeExato = resultados[0]; 
    
    let tempNum = parseInt(temporada);
    if (!isNaN(tempNum) && tempNum > 1) {
        let encontrado = resultados.find(anime => {
            let titulos = [anime.title, ...(anime.alternative_titles || [])].map(t => t.toLowerCase().replace(/[^a-z0-9]/g, ""));
            return titulos.some(t => 
                t.includes(`${tempNum}ndseason`) || 
                t.includes(`${tempNum}rdseason`) || 
                t.includes(`${tempNum}thseason`) || 
                t.includes(`season${tempNum}`) ||
                t.includes(`part${tempNum}`)
            );
        });
        if (encontrado) animeExato = encontrado;
    }

    let config = await chrome.storage.sync.get(['officialScore']);
    let isOfficialScore = config.officialScore === true;
    let token = await getValidAccessToken();

    let notaMAL = 0;
    
    if (token) {
        try {
            let url = `https://api.myanimelist.net/v2/anime/${animeExato.mal_id}?fields=my_list_status`;
            let res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
            if (res.ok) {
                let data = await res.json();
                if (data.my_list_status && data.my_list_status.score > 0) {
                    notaMAL = data.my_list_status.score;
                }
            }
        } catch (e) { console.error("Erro ao checar MAL API", e); }
    }

    let dbLocal = await chrome.storage.local.get([animeExato.title]);
    let dadosLocais = dbLocal[animeExato.title];
    let notaTecnica = dadosLocais && dadosLocais.media ? parseFloat(dadosLocais.media) : 0;

    let notaFinal = 0;
    if (isOfficialScore) {
        if (notaMAL > 0) notaFinal = notaMAL;
        else if (notaTecnica > 0) notaFinal = Math.round(notaTecnica);
    } else {
        if (notaTecnica > 0) notaFinal = notaTecnica;
        else if (notaMAL > 0) notaFinal = notaMAL;
    }

    if (notaFinal > 0) {
        return { sucesso: true, nota: notaFinal, tituloOriginal: animeExato.title };
    } else {
        return { sucesso: false, erro: "Anime encontrado, mas sem nota." };
    }
}