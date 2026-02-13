const axios = require('axios');
const cheerio = require('cheerio');

const BASE_URL = 'https://www.kleinanzeigen.de';

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];

function getRandomUserAgent() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function fetchListings(query, location = '') {
    try {
        // Construct URL
        // Simple format: /s-<query>/k0 (k0 = all categories)
        // If location is present, it's more complex, usually /s-<location>/<query>/k0l<locId>
        // For prototype, we stick to simple query search
        const formattedQuery = query.trim().replace(/\s+/g, '-');
        const url = `${BASE_URL}/s-${formattedQuery}/k0`;

        console.log(`🔍 Scraping: ${url}`);

        const response = await axios.get(url, {
            headers: {
                'User-Agent': getRandomUserAgent(),
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'de,en-US;q=0.7,en;q=0.3',
                'Referer': 'https://www.google.com/'
            }
        });

        const $ = cheerio.load(response.data);
        const items = [];

        $('.aditem').each((i, el) => {
            const $el = $(el);
            const id = $el.attr('data-adid');

            // Skip "Top Ads" (pro features) if we want only organic, or keep them. 
            // Usually we want everything.

            const title = $el.find('.text-module-begin > a').text().trim();
            const link = BASE_URL + $el.find('.text-module-begin > a').attr('href');
            const price = $el.find('.aditem-main--middle--price-shipping--price').text().trim();
            const locationText = $el.find('.aditem-main--top--left').text().trim();
            const date = $el.find('.aditem-main--top--right').text().trim();

            // Image parsing (often lazy loaded)
            let image = $el.find('.imagebox').attr('data-imgsrc');
            if (!image) {
                image = $el.find('.imagebox img').attr('src');
            }

            // Description / Teaser
            // Description / Teaser
            const description = $el.find('.aditem-main--middle--description').text().trim();

            // Filter out Top Ads (they often have empty dates or sit at the top)
            if (!date) return;

            if (id && title) {
                items.push({
                    id,
                    title,
                    price,
                    location: locationText,
                    date,
                    link,
                    image,
                    description,
                    timestamp: Date.now()
                });
            }
        });

        console.log(`✅ Found ${items.length} items for "${query}"`);
        return items;

    } catch (error) {
        console.error(`❌ Error scraping ${query}:`, error.message);
        if (error.response && error.response.status === 403) {
            console.error("⚠️  Blocked (403). We might need better headers or proxies.");
        }
        return [];
    }
}

module.exports = { fetchListings };
