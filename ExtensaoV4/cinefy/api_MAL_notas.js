async function obterNotaDaIntegracao(titulo, temporada, episodio) {
    logger.log(`[Cinefy Autofill - Integração] 📡 Iniciando busca externa para: "${titulo}" | Temp: ${temporada} | Ep: ${episodio}`);
    
    return new Promise((resolve) => {
        if (!chrome.runtime || !chrome.runtime.sendMessage) {
            logger.error("[Cinefy Autofill - Integração] ❌ ERRO FATAL: API do Chrome indisponível. Contexto isolado?");
            resolve({ sucesso: false, erro: "API do Chrome indisponível." });
            return;
        }

        try {
            chrome.runtime.sendMessage({ 
                action: "OBTER_NOTA_CINEFY", titulo: titulo, 
                temporada: temporada, episodio: episodio 
            }, (response) => {
                if (chrome.runtime.lastError) {
                    logger.error("[Cinefy Autofill - Integração] ❌ FALHA DE COMUNICAÇÃO: MAL Notas Extras não respondeu ou está desligado.", chrome.runtime.lastError.message);
                    resolve({ sucesso: false, erro: chrome.runtime.lastError.message });
                } else if (response) {
                    if (response.sucesso) {
                        logger.log(`[Cinefy Autofill - Integração] ✅ SUCESSO! Nota recebida do MAL Notas Extras: ${response.nota} (Anime reconhecido: ${response.tituloOriginal})`);
                    } else {
                        logger.warn(`[Cinefy Autofill - Integração] ⚠️ MAL Notas Extras respondeu, mas não encontrou a nota. Motivo: ${response.erro}`);
                    }
                    resolve(response);
                } else {
                    logger.warn("[Cinefy Autofill - Integração] ⚠️ AVISO: A comunicação foi feita, mas a resposta chegou vazia (null/undefined).");
                    resolve({ sucesso: false, erro: "Sem resposta do MAL Notas Extras." });
                }
            });
        } catch (err) {
            logger.error("[Cinefy Autofill - Integração] ❌ EXCEÇÃO ao contatar MAL Notas Extras:", err);
            resolve({ sucesso: false, erro: err.message });
        }
    });
}