// Credenciais (Configurado como App "Web")
const CLIENT_ID = '99af70589d12334cc55c2ffd92807197'; 
const CLIENT_SECRET = '3e91cc1126b403cfa0ab4d11359078ad3d51daacdb064e24487f6cb2f887ffea';
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
                // SALVANDO EM DOIS LUGARES:
                // 1. mal_access_token para sua interface não desconectar no F5
                // 2. mal_token_data para o background conseguir renovar o token depois
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
        client_secret: CLIENT_SECRET,
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
        client_secret: CLIENT_SECRET,
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
            // Atualiza os dois lugares novamente ao renovar
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

    // Se não houver dados de expiração mas houver um token solto, usa ele (compatibilidade)
    if (!tokenData) return result.mal_access_token || null;

    // Se o token ainda é válido por mais de 5 minutos, usa ele
    if (Date.now() < tokenData.expires_at - 300000) {
        return tokenData.access_token;
    }

    // Caso contrário, renova
    console.log("Renovando token automaticamente...");
    return await refreshMalToken(tokenData.refresh_token);
}

async function executarEnvioMAL(payload, sendResponse) {
    const { animeId, score, comentario } = payload;
    
    // Agora pegamos o token sempre do background, garantindo que esteja válido
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

        const data = await response.json();
        sendResponse({ success: !!data.status, data: data });
    } catch (err) {
        sendResponse({ success: false, error: err.message });
    }
}