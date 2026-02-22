const axios = require('axios');
const cheerio = require('cheerio');

async function scrapeWebsite(url) {
    try {
        console.log(`🔍 Acessando site: ${url}`);
        const { data } = await axios.get(url, { 
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 8000 
        });
        const $ = cheerio.load(data);
        
        // Remove lixo do HTML
        $('script, style, footer, nav, header').remove();
        
        const content = $('body').text().replace(/\s\s+/g, ' ').trim();
        return content.substring(0, 15000); 
    } catch (error) {
        console.error("❌ Erro ao ler o site:", error.message);
        return "Dados do site indisponíveis.";
    }
}

// ESTA LINHA É A CHAVE! Ela precisa estar no final do arquivo:
module.exports = scrapeWebsite;