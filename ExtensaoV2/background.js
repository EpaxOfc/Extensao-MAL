// Credenciais seguras (Configurado como App "Other")
const CLIENT_ID = 'bbbe6e02d9d0140e9bad74dd1116d6b6'; 
const REDIRECT_URI = chrome.identity.getRedirectURL(); 

console.log("Sua Redirect URI é:", REDIRECT_URI);

function generateCodeVerifier() {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    const values = new Uint32Array(64);
    crypto.getRandomValues(values);
    for (let i = 0; i < 64; i++) {
        result += charset[values[i] % charset.length];
    }
    return result;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'loginMAL') {
        iniciarLogin(sendResponse);
        return true; 
    }
    if (message.action === 'enviarNotaMAL') {
        executarEnvioMAL(message.dados, sendResponse);
        return true; 
    }
    if (message.action === 'mudarModoExibicao') {
        configurarModoDeExibicao(message.mode);
        sendResponse({ success: true });
        return true;
    }
     if (message.action === 'buscarJikan') {
        executarBuscaJikan(message.termo, message.isAuto, sendResponse);
        return true; 
    }
    if (message.action === 'buscarDetalhesMAL') {
        executarBuscaDetalhesMAL(message.malId, sendResponse);
        return true;
    }
    if (message.action === 'sincronizarEpisodioMAL') {
        executarSincronizacaoSilenciosa(message.animeId, message.episodio, message.status, sendResponse);
        return true;
    }
    if (message.action === 'openSidePanel') {
        if (chrome.sidePanel && chrome.sidePanel.open) {
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                if (tabs.length > 0) {
                    chrome.sidePanel.open({ windowId: tabs[0].windowId })
                        .then(() => sendResponse({ success: true }))
                        .catch((err) => {
                            console.error("MAL Reviewer: Abertura do Side Panel bloqueada pelo navegador (Possivelmente Opera):", err);
                            sendResponse({ success: false, error: err.message });
                        });
                } else {
                    sendResponse({ success: false, error: "Nenhuma aba ativa" });
                }
            });
        } else {
            sendResponse({ success: false, error: "API sidePanel não suportada no navegador" });
        }
        return true; 
    }

    if (message.action === 'INJETAR_SONDA_NETFLIX') {
        if (chrome.scripting && chrome.scripting.executeScript) {
            chrome.scripting.executeScript({
                target: { tabId: sender.tab.id },
                world: 'MAIN', 
                func: () => {
                    if (window.malProbeInterval) clearInterval(window.malProbeInterval);
                    
                    window.malProbeInterval = setInterval(() => {
                        try {
                            let match = window.location.pathname.match(/\/watch\/(\d+)/);
                            if (!match) return;
                            let vId = match[1];

                            let cache = window.netflix?.falcorCache?.videos;
                            
                            // Cria um payload base, mesmo que o cache falhe
                            let payload = {
                                uniqueId: vId,
                                cacheEncontrado: false,
                                type: null, 
                                season: null,
                                episode: null,
                                showTitle: null,
                                movieTitle: null
                            };

                            // Tenta ler o cache se ele existir
                            if (cache && cache[vId] && cache[vId].summary && cache[vId].summary.value) {
                                payload.cacheEncontrado = true;
                                let summary = cache[vId].summary.value;
                                payload.type = summary.type;
                                payload.season = summary.season || null;
                                payload.episode = summary.episode || summary.idx || null;

                                if (summary.type === 'movie' && cache[vId].title) {
                                    payload.movieTitle = cache[vId].title.value;
                                } else {
                                    // Tenta caçar o nome da série varrendo o cache
                                    for (let key in cache) {
                                        let item = cache[key];
                                        if (item?.summary?.value?.type === 'show' && item.title) {
                                            payload.showTitle = item.title.value;
                                        }
                                    }
                                }
                            }

                            let div = document.getElementById('mal-reviewer-netflix-data');
                            if (!div) {
                                div = document.createElement('div');
                                div.id = 'mal-reviewer-netflix-data';
                                div.style.display = 'none';
                                document.body.appendChild(div);
                            }
                            
                            let newData = JSON.stringify(payload);
                            
                            // Atualiza a tela APENAS se o ID do vídeo mudar ou se a Netflix finalmente atualizar o cache daquele vídeo
                            if (div.getAttribute('data-video') !== vId || div.innerText !== newData) {
                                div.setAttribute('data-video', vId);
                                div.innerText = newData;

                                console.log("%c🔍 [SONDA NETFLIX - CACHE] Identificado novo vídeo!", "background: #e50914; color: #fff; font-weight: bold; padding: 4px; border-radius: 4px;", payload);
                                
                                let debugBox = document.getElementById('mal-debug-box');
                                if (!debugBox) {
                                    debugBox = document.createElement('div');
                                    debugBox.id = 'mal-debug-box';
                                    debugBox.style.cssText = 'position: fixed; top: 15px; left: 15px; background: rgba(0,0,0,0.85); color: #00ffcc; padding: 12px; z-index: 2147483647; border: 1px solid #00ffcc; border-radius: 8px; font-family: monospace; font-size: 13px; pointer-events: none; text-shadow: 1px 1px 0 #000; box-shadow: 0 4px 10px rgba(0,0,0,0.5);';
                                    document.body.appendChild(debugBox);
                                }
                                
                                let statusCache = payload.cacheEncontrado 
                                    ? '<b style="color: #00b894;">SIM (Lido com sucesso)</b>' 
                                    : '<b style="color: #ff7675;">NÃO (Netflix não atualizou)</b>';

                                debugBox.innerHTML = `
                                    <strong style="color:#ff7675; font-size: 14px;">🔍 Sonda de Memória (Netflix)</strong><br>
                                    <div style="margin-top: 6px; color: #fff; line-height: 1.5;">
                                        ID do Vídeo: <b style="color: #fdcb6e;">${payload.uniqueId}</b><br>
                                        Cache do Vídeo Existe?: ${statusCache}<br>
                                        Tipo: <b style="color: #fdcb6e;">${payload.type}</b><br>
                                        Série: <b style="color: #fdcb6e;">${payload.showTitle || 'N/A'}</b><br>
                                        Temporada: <b style="color: #fdcb6e;">${payload.season || 'N/A'}</b><br>
                                        Episódio: <b style="color: #fdcb6e;">${payload.episode || 'N/A'}</b>
                                    </div>
                                `;

                                clearTimeout(window.malDebugTimeout);
                                window.malDebugTimeout = setTimeout(() => {
                                    if(debugBox) debugBox.remove();
                                }, 12000);
                            }
                        } catch(e) {}
                    }, 150);
                }
            }).catch(console.error);
        }
        sendResponse({ success: true });
        return true; 
    }
});

async function iniciarLogin(sendResponse) {
    const codeVerifier = generateCodeVerifier();
    await chrome.storage.local.set({ temp_verifier: codeVerifier });

    const authUrl = new URL('https://myanimelist.net/v1/oauth2/authorize');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', CLIENT_ID);
    authUrl.searchParams.set('code_challenge', codeVerifier);
    authUrl.searchParams.set('code_challenge_method', 'plain'); 
    authUrl.searchParams.set('redirect_uri', REDIRECT_URI);

    try {
        const redirectUrl = await chrome.identity.launchWebAuthFlow({
            url: authUrl.toString(),
            interactive: true
        });

        const urlParams = new URL(redirectUrl).searchParams;
        const code = urlParams.get('code');

        if (code) {
            const storage = await chrome.storage.local.get('temp_verifier');
            const tokenData = await trocarCodePorToken(code, storage.temp_verifier);
            
            if (tokenData && tokenData.access_token) {
                await chrome.storage.local.set({
                    'mal_access_token': tokenData.access_token,
                    'mal_token_data': {
                        access_token: tokenData.access_token,
                        refresh_token: tokenData.refresh_token,
                        expires_at: Date.now() + (tokenData.expires_in * 1000)
                    }
                });
                sendResponse({ success: true });
            } else {
                sendResponse({ success: false, error: 'Falha na troca de token.' });
            }
        }
    } catch (error) {
        console.error("Erro no fluxo:", error);
        sendResponse({ success: false, error: error.message });
    }
}

async function trocarCodePorToken(code, verifier) {
    const url = 'https://myanimelist.net/v1/oauth2/token';
    const body = new URLSearchParams({
        client_id: CLIENT_ID,
        code: code,
        code_verifier: verifier,
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT_URI
    });

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body
        });
        return await response.json();
    } catch (err) { return null; }
}

async function refreshMalToken(refreshToken) {
    const url = 'https://myanimelist.net/v1/oauth2/token';
    const body = new URLSearchParams({
        client_id: CLIENT_ID,
        grant_type: 'refresh_token',
        refresh_token: refreshToken
    });

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body
        });
        const data = await response.json();
        if (data.access_token) {
            const tokenData = {
                access_token: data.access_token,
                refresh_token: data.refresh_token || refreshToken,
                expires_at: Date.now() + (data.expires_in * 1000)
            };
            await chrome.storage.local.set({ 
                'mal_access_token': data.access_token,
                'mal_token_data': tokenData 
            });
            return data.access_token;
        }
        return null;
    } catch (err) { return null; }
}

async function getValidAccessToken() {
    const result = await chrome.storage.local.get(["mal_token_data", "mal_access_token"]);
    const tokenData = result.mal_token_data;

    if (!tokenData) return result.mal_access_token || null;

    if (Date.now() < tokenData.expires_at - 300000) {
        return tokenData.access_token;
    }

    console.log("Renovando token automaticamente...");
    return await refreshMalToken(tokenData.refresh_token);
}

async function executarEnvioMAL(payload, sendResponse) {
    const { animeId, score, comentario } = payload;
    
    const token = await getValidAccessToken();
    if (!token) {
        sendResponse({ success: false, error: "Usuário não logado" });
        return;
    }

    const url = `https://api.myanimelist.net/v2/anime/${animeId}/my_list_status`;
    const bodyParams = new URLSearchParams();
    bodyParams.append('status', 'completed');
    if (score > 0) bodyParams.append('score', score);
    bodyParams.append('comments', comentario);

    try {
        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: bodyParams
        });

        if (response.ok) {
            salvarIDCompletadoNoCache(animeId);
            const data = await response.json();
            sendResponse({ success: true, data: data });
        } else {
            sendResponse({ success: false });
        }
    } catch (err) {
        sendResponse({ success: false, error: err.message });
    }
}

// BUSCA HÍBRIDA (ANILIST -> MAL)
async function executarBuscaJikan(termo, isAuto, sendResponse) {
    try {
        const termoLimpo = termo.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, "").trim();

        // DICIONÁRIO DE EXCEÇÕES DIRETAS (Pula o AniList e busca o ID no MAL)
        const dicionarioIdsEspeciais = {
            "first kiss that never ends": { mal_id: 52198, force_split_eps: 4 },
            "stairway to adulthood": { mal_id: 61903 },
            "memory snow": { mal_id: 36286 },
            "frozen bond": { mal_id: 38414 },
            "lacos congelados": { mal_id: 38414 }
        };

        for (let key in dicionarioIdsEspeciais) {
            if (termoLimpo.includes(key.replace(/[^a-z0-9 ]/g, ""))) {
                let rule = dicionarioIdsEspeciais[key];
                console.log(`MAL Reviewer: Exceção detectada! Puxando MAL ID ${rule.mal_id} direto.`);
                
                const token = await getValidAccessToken();
                const headers = token ? { 'Authorization': `Bearer ${token}` } : { 'X-MAL-CLIENT-ID': CLIENT_ID };
                const url = `https://api.myanimelist.net/v2/anime/${rule.mal_id}?fields=id,title,main_picture,mean,start_season,num_episodes,media_type,my_list_status{score,comments,status}`;
                
                const response = await fetch(url, { headers });
                if (response.ok) {
                    const malData = await response.json();
                    let fakeList = [{
                        mal_id: malData.id,
                        title: malData.title,
                        episodes: rule.force_split_eps || malData.num_episodes || 1,
                        duration: 0,
                        year: malData.start_season ? malData.start_season.year : 0,
                        media_type: rule.force_split_eps ? "tv" : "movie",
                        alternative_titles: [],
                        my_list_status: malData.my_list_status || null,
                        images: {
                            jpg: {
                                image_url: malData.main_picture ? malData.main_picture.large : "",
                                small_image_url: malData.main_picture ? malData.main_picture.medium : ""
                            }
                        },
                        is_split_movie: !!rule.force_split_eps,
                        is_direct_id: true 
                    }];
                    return sendResponse({ success: true, data: fakeList });
                }
            }
        }


        // DICIONÁRIO DE TRADUÇÕES
        const localData = await chrome.storage.local.get(['customDict']);
        const dicionarioUsuario = localData.customDict || {};

        const dicionarioBruto = {
            "cyberpunk mercenarios": "cyberpunk edgerunners",
            "mercenarios": "cyberpunk edgerunners",
            "olhos de gato": "a whisker away",
            "amor de gata": "a whisker away", 
            "jujutsu kaisen zero": "jujutsu kaisen 0",
            "jujutsu kaisen 0": "jujutsu kaisen 0",
            "re:zero -starting life in another world- shorts": "Re:ZERO -Starting Life in Another World-",
            "re:zero": "Re:ZERO -Starting Life in Another World-",
            "meu anjo de vizinha me mima demais": "Otonari no Tenshi-sama",
            "o anjo de vizinha me mima demais": "The Angel Next Door Spoils Me Rotten",
            "100 namoradas que te amam muuuuuito": "The 100 Girlfriends Who Really, Really, Really, Really, Really Love You",
            "as 100 namoradas que te amam muuuuuito": "The 100 Girlfriends Who Really, Really, Really, Really, Really Love You",
            "diarios de uma apotecaria": "The Apothecary Diaries",
            "diario de uma apotecaria": "The Apothecary Diaries",

            "frieren e a jornada para o alem": "Sousou no Frieren",
            "frieren": "Frieren: Beyond Journey's End",
            "a veterana pitica da firma": "My Tiny Senpai", 
            "o berserker da gula": "Berserk of Gluttony",
            "kamikatsu: atividades divinas em um mundo sem deuses": "KamiKatsu: Working for God in a Godless World",
            "kamikatsu": "KamiKatsu: Working for God in a Godless World",
            "cronicas de um aristocrata em outro mundo": "The Aristocrat's Otherworldly Adventure: Serving Gods Who Go Too Far",
            "a princesa oferenda e o rei das feras": "Sacrificial Princess and the King of Beasts",
            "como raeliana foi parar na mansao do duque": "Why Raeliana Ended Up at the Duke's Mansion",
            "minha amiga de oculos esqueceu os oculos": "The Girl I Like Forgot Her Glasses",
            "a garota de que gosto esqueceu os oculos": "The Girl I Like Forgot Her Glasses",
            "nao mexa com a nagatoro": "Don't Toy With Me, Miss Nagatoro",
            "eu sou a vila, entao estou domando o chefe final": "I'm the Villainess, So I'm Taming the Final Boss",
            "reencarnado num slime": "That Time I Got Reincarnated as a Slime",
            "sobre minha reencarnacao como um slime": "That Time I Got Reincarnated as a Slime",
            "passeio na primavera azul": "Blue Spring Ride",
            "estrada da primavera azul": "Blue Spring Ride",

            "beastars - o lobo bom": "Beastars",
            "o lobo bom": "Beastars",
            "de yakuza a dono de casa": "The Way of the Househusband",
            "a viagem de chihiro": "Spirited Away", 
            "o castelo animado": "Howl's Moving Castle",
            "o reino dos gatos": "The Cat Returns", 
            "o mundo dos pequeninos": "The Secret World of Arrietty",
            "vidas ao vento": "The Wind Rises",
            "sussurros do coracao": "Whisper of the Heart",
            "o castelo no ceu": "Castle in the Sky",

            "minha adoravel cosplayer": "My Dress-Up Darling", 
            "sono bisque doll": "My Dress-Up Darling",
            "koihime musou: garotas intankaveis": "Koihime Musou",
            "o tempo com voce": "Weathering with You",
            "guerras de comida": "Food Wars!",
            "zom 100: 100 coisas para fazer antes de virar zumbi": "Zom 100: Bucket List of the Dead",
            "samurai x": "Rurouni Kenshin",
            "os cavaleiros do zodiaco": "Saint Seiya",
            "cavaleiros do zodiaco": "Saint Seiya",
            "super campeoes": "Captain Tsubasa",
            "ataque dos titas": "Attack on Titan",
            "o ataque dos titas": "Attack on Titan",
            "os sete pecados capitais": "The Seven Deadly Sins",
            "sete pecados capitais": "The Seven Deadly Sins",
            "a ascensao do heroi do escudo": "The Rising of the Shield Hero",
            "heroi do escudo": "The Rising of the Shield Hero",
            "diario do futuro": "Mirai Nikki",
            "jogadora compulsiva": "Kakegurui",
            "kakegurui: jogadora compulsiva": "Kakegurui",
            "ilusao celestial": "Heavenly Delusion",
            "tengoku daimakyo: ilusao celestial": "Heavenly Delusion",
            "que chegue a voce": "Kimi ni Todoke: From Me to You",
            "kimi ni todoke: que chegue a voce": "Kimi ni Todoke: From Me to You",
            "uma voz silenciosa": "A Silent Voice",
            "koe no katachi": "A Silent Voice",
            "quero comer seu pancreas": "I Want to Eat Your Pancreas",
            "josee, o tigre e o peixe": "Josee, the Tiger and the Fish",
            "a garota que conquistou o tempo": "The Girl Who Leapt Through Time",
            "5 centimetros por segundo": "5 Centimeters per Second",
            "em busca de vozes perdidas": "Children Who Chase Lost Voices",
            "o jardim das palavras": "The Garden of Words",
            "seu nome": "Your Name.",
            "palavras que borbulham como refrigerante": "Words Bubble Up Like Soda Pop",
            "minha casa a deriva": "Drifting Home",
            "bolhas": "Bubble",
            "o menino e a garca": "The Boy and the Heron",
            "meu vizinho totoro": "My Neighbor Totoro",
            "o servico de entregas da kiki": "Kiki's Delivery Service",
            "porco rosso: o ultimo heroi romantico": "Porco Rosso",
            "princesa mononoke": "Princess Mononoke",
            "ponyo: uma amizade que veio do mar": "Ponyo",
            "da colina kokuriko": "From Up on Poppy Hill",
            "o conto da princesa kaguya": "The Tale of the Princess Kaguya",
            "as memorias de marnie": "When Marnie Was There",
            "tesoura e a bruxa": "Earwig and the Witch",
            "o rapaz e o monstro": "The Boy and the Beast",
            "culinaria de acampamento em outro mundo com minha habilidade absurda": "Campfire Cooking in Another World with My Absurd Skill",
            "sinais de afeto": "A Sign of Affection",
            "minha proxima vida como vila: todos os caminhos levam a perdicao!": "My Next Life as a Villainess: All Routes Lead to Doom!",
            "imperio tearmoon": "Tearmoon Empire",
            "me apaixonei pela vila": "I'm in Love with the Villainess",
            "vila nivel 99: posso ser o chefe secreto, mas nao sou o rei demonio": "Villainess Level 99: I May Be the Hidden Boss but I'm Not the Demon Lord",
            "o jeito errado de usar magia curativa": "The Wrong Way to Use Healing Magic",
            "doutora elise": "Doctor Elise: The Royal Lady with the Lamp",
            "sasaki e peeps": "Sasaki and Peeps",
            "o anjo tolo danca com o demonio": "The Foolish Angel Dances with the Devil",
            "o aventureiro morto-vivo indesejado": "The Unwanted Undead Adventurer",
            "historias de aneis de casamento": "Tales of Wedding Rings",
            "toca! euphonium": "Sound! Euphonium",
            "jogos de deuses que jogamos": "Gods' Games We Play",
            "como um aristocrata reencarnado, usarei minha habilidade de avaliacao para subir no mundo": "As a Reincarnated Aristocrat, I'll Use My Appraisal Skill to Rise in the World",
            "o ex-heroi banido vive como quer": "The Banished Former Hero Lives as He Pleases",
            "vovo e vovo ficam jovens de novo": "Grandpa and Grandma Turn Young Again",
            "bateria do esquecimento": "Oblivion Battery",
            "o dilema de um arquidemonio: como amar sua noiva elfa": "An Archdemon's Dilemma: How to Love Your Elf Bride",
            "galo de briga": "Rooster Fighter",
            "sentai daishikkaku": "Go! Go! Loser Ranger!",
            "ranger reject": "Go! Go! Loser Ranger!",
            "desaparecimentos misteriosos": "Mysterious Disappearances",
            "minha garota oni": "My Oni Girl",
            "impacto incrivel": "Rising Impact",
            "as variacoes de grimm": "The Grimms Variations",
            "classe de assassinato": "Assassination Classroom",
            "a melancolia de haruhi suzumiya": "The Melancholy of Haruhi Suzumiya",

            ...dicionarioUsuario 
        };

        const dicionarioTraducoes = {};
        for (let key in dicionarioBruto) {
            let keyLimpa = key.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, "").trim();
            dicionarioTraducoes[keyLimpa] = dicionarioBruto[key];
        }

        let termoTraduzido = termo;
        let usouDicionario = false;
        let chavesOrdenadas = Object.keys(dicionarioTraducoes).sort((a, b) => b.length - a.length);

        for (let keyLimpa of chavesOrdenadas) {
            if (termoLimpo.includes(keyLimpa)) {
                let pedacoExtra = termoLimpo.replace(keyLimpa, "").trim(); 
                termoTraduzido = dicionarioTraducoes[keyLimpa] + (pedacoExtra ? " " + pedacoExtra : "");
                usouDicionario = true;
                break;
            }
        }

        if (!usouDicionario) {
            termoTraduzido = await traduzirParaIngles(termo);
        }

        let termoFinalBusca = termoTraduzido; 
        console.log(`MAL Reviewer: Buscando no AniList por: "${termoTraduzido}" | Modo Auto: ${isAuto}`);

        const query = `
        query ($search: String) {
            Page(page: 1, perPage: 15) {
                media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
                    idMal
                    title { romaji english }
                    synonyms
                    format
                    episodes
                    duration 
                    seasonYear
                    coverImage { medium large }
                    studios(isMain: true) { nodes { name } }
                }
            }
        }`;

        // Função interna para fazer a requisição ao AniList
        const buscarGraphQL = async (searchText) => {
            const response = await fetch('https://graphql.anilist.co', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ query, variables: { search: searchText } })
            });
            if (!response.ok) throw new Error(`AniList HTTP Error! Status: ${response.status}`);
            const data = await response.json();
            return data.data.Page.media.filter(item => item.idMal != null);
        };

        let resultados = await buscarGraphQL(termoTraduzido);

        if (resultados.length === 0 && (termoTraduzido.includes(':') || termoTraduzido.includes('-'))) {
            let termoBase = termoTraduzido.split(/[:\-]/)[0].trim();
            console.log(`MAL Reviewer: 0 resultados. Tentando buscar pela franquia raiz: "${termoBase}"`);
            resultados = await buscarGraphQL(termoBase);
            termoFinalBusca = termoBase; 
        }

        chrome.storage.local.get(['mal_completed_ids'], (localRes) => {
            const completadosLocais = localRes.mal_completed_ids || [];

            let temporadasMapeadas = resultados.map(item => {
                let listStatus = completadosLocais.includes(item.idMal) ? { status: 'completed' } : null;
                // MÁGICA DO ESTÚDIO AQUI:
                let mainStudio = (item.studios && item.studios.nodes && item.studios.nodes.length > 0) ? item.studios.nodes[0].name : "";

                return {
                    mal_id: item.idMal,
                    title: item.title.english || item.title.romaji,
                    episodes: item.episodes || 0,
                    duration: item.duration || 0,
                    year: item.seasonYear || 0,
                    media_type: item.format ? item.format.toLowerCase() : "tv",
                    alternative_titles: item.synonyms || [],
                    my_list_status: listStatus,
                    studio: mainStudio,
                    images: {
                        jpg: {
                            image_url: item.coverImage.large || item.coverImage.medium,
                            small_image_url: item.coverImage.medium || item.coverImage.large
                        }
                    }
                };
            });

            const formatosValidos = ['tv', 'ona', 'movie', 'ova', 'special'];
            temporadasMapeadas = temporadasMapeadas.filter(temp => formatosValidos.includes(temp.media_type));

            if (!isAuto) {
                return sendResponse({ success: true, data: temporadasMapeadas });
            }

            const cleanStr = (s) => s ? s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "") : "";
            const cleanSpace = (s) => s ? s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").trim() : "";
            
            const qStr = cleanStr(termoFinalBusca);
            const qSpace = cleanSpace(termoFinalBusca);

            let temporadasFiltradas = temporadasMapeadas.filter(temp => {
                const titulosValidos = [temp.title, ...temp.alternative_titles];
                return titulosValidos.some(titulo => {
                    const tStr = cleanStr(titulo);      
                    const tSpace = cleanSpace(titulo);  

                    if (tStr.startsWith(qStr) || qStr.startsWith(tStr)) return true;
                    if (new RegExp(`\\b${qSpace}\\b`, 'i').test(tSpace)) return true;

                    const tWords = tSpace.split(' ');
                    const qWords = qSpace.split(' ');
                    if (tWords[0] === qWords[0]) return true;

                    return false;
                });
            });

            // Reorganiza SÉRIES por ano (S1, S2...).
            temporadasFiltradas.sort((a, b) => {
                const anoA = a.year === 0 ? 9999 : a.year;
                const anoB = b.year === 0 ? 9999 : b.year;
                if (anoA !== anoB) return anoA - anoB;
                return a.mal_id - b.mal_id;
            });

            sendResponse({ success: true, data: temporadasFiltradas });
        });

    } catch (err) {
        sendResponse({ success: false, error: err.message });
    }
}

async function executarBuscaDetalhesMAL(malId, sendResponse) {
    const token = await getValidAccessToken();
    const headers = token ? { 'Authorization': `Bearer ${token}` } : { 'X-MAL-CLIENT-ID': CLIENT_ID };
    
    const url = `https://api.myanimelist.net/v2/anime/${malId}?fields=id,title,main_picture,mean,start_season,studios,my_list_status{score,comments}`;
    
    try {
        const response = await fetch(url, { headers });
        if (response.ok) {
            const data = await response.json();
            sendResponse({ success: true, data: data });
        } else {
            sendResponse({ success: false });
        }
    } catch (err) {
        sendResponse({ success: false, error: err.message });
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

async function executarSincronizacaoSilenciosa(animeId, episodio, status, sendResponse) {
    const token = await getValidAccessToken();
    if (!token) return sendResponse({ success: false, error: "Desconectado" });

    const url = `https://api.myanimelist.net/v2/anime/${animeId}/my_list_status`;
    const body = new URLSearchParams({
        status: status || 'watching',
        num_watched_episodes: episodio.toString()
    });

    try {
        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: body
        });
        
        if (response.ok) {
            if (status === 'completed') {
                salvarIDCompletadoNoCache(animeId);
            }
            sendResponse({ success: true });
        } else {
            sendResponse({ success: false });
        }
    } catch (err) {
        sendResponse({ success: false, error: err.message });
    }
}

function configurarModoDeExibicao(mode) {
    if (mode === 'sidepanel') {
        chrome.action.setPopup({ popup: '' });
        if (chrome.sidePanel) {
            chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
        }
    } else {
        chrome.action.setPopup({ popup: 'popup.html' });
        if (chrome.sidePanel) {
            chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(console.error);
        }
    }
}

function salvarIDCompletadoNoCache(animeId) {
    chrome.storage.local.get(['mal_completed_ids'], (res) => {
        let ids = res.mal_completed_ids || [];
        const idNum = parseInt(animeId);
        if (!ids.includes(idNum)) {
            ids.push(idNum);
            chrome.storage.local.set({ mal_completed_ids: ids });
        }
    });
}

function restaurarModoDeExibicao() {
    chrome.storage.local.get(['viewMode'], (res) => {
        const mode = res.viewMode || 'popup';
        configurarModoDeExibicao(mode);
    });
}

chrome.runtime.onInstalled.addListener(restaurarModoDeExibicao);
chrome.runtime.onStartup.addListener(restaurarModoDeExibicao);

restaurarModoDeExibicao();