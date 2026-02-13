const axios = require('axios');
const cheerio = require('cheerio');

const BASE_URL = 'https://www.kleinanzeigen.de';

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15'
];

function getRandomUserAgent() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Add random delay to avoid detection patterns
 */
function randomDelay(min = 500, max = 2000) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, delay));
}

async function fetchListings(query, location = '') {
    try {
        const formattedQuery = query.trim().replace(/\s+/g, '-');
        const url = `${BASE_URL}/s-${formattedQuery}/k0`;

        console.log(`🔍 Scraping: ${url}`);

        // Random delay between requests
        await randomDelay(300, 1500);

        const response = await axios.get(url, {
            headers: {
                'User-Agent': getRandomUserAgent(),
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.7,en;q=0.3',
                'Accept-Encoding': 'gzip, deflate, br',
                'Referer': 'https://www.google.de/',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'cross-site',
                'Cache-Control': 'max-age=0'
            },
            timeout: 15000
        });

        const $ = cheerio.load(response.data);
        const items = [];

        $('.aditem').each((i, el) => {
            const $el = $(el);
            const id = $el.attr('data-adid');

            // ─── Filter out sponsored / commercial ads ───────────
            // Skip TopAds (promoted placements)
            const elClass = ($el.attr('class') || '').toLowerCase();
            if (elClass.includes('is-topad') || elClass.includes('is-highlight') || elClass.includes('is-premium')) return;

            // Skip ads with pro/shop badges
            const hasBadge = $el.find('[class*="badge-hint-pro"], [class*="pro-small"], [class*="icon-feature-topad"], [class*="ribbon"], [class*="commercial"]').length > 0;
            if (hasBadge) return;

            // Skip if link contains /pro/ (professional seller pages)
            const rawLink = $el.find('.text-module-begin > a').attr('href') || '';
            if (rawLink.includes('/pro/')) return;

            // Skip "Gewerblicher Verkäufer" (commercial seller)
            const sellerInfo = $el.text().toLowerCase();
            if (sellerInfo.includes('gewerblich') || sellerInfo.includes('händler') || sellerInfo.includes('shop')) return;
            // ─────────────────────────────────────────────────────

            const title = $el.find('.text-module-begin > a').text().trim();
            const link = BASE_URL + rawLink;
            const price = $el.find('.aditem-main--middle--price-shipping--price').text().trim();
            const locationText = $el.find('.aditem-main--top--left').text().trim();
            const date = $el.find('.aditem-main--top--right').text().trim();

            // Image parsing (often lazy loaded)
            let image = $el.find('.imagebox').attr('data-imgsrc');
            if (!image) {
                image = $el.find('.imagebox img').attr('src');
            }

            // Description / Teaser
            const description = $el.find('.aditem-main--middle--description').text().trim();

            // Filter out Top Ads (they often have empty dates)
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
                    timestamp: Date.now(),
                    source: 'kleinanzeigen'
                });
            }
        });

        console.log(`✅ Found ${items.length} items for "${query}"`);
        return items;

    } catch (error) {
        if (error.response) {
            const status = error.response.status;
            if (status === 403) {
                console.error(`🚫 Blocked (403) for "${query}" — may need proxy rotation`);
            } else if (status === 429) {
                console.error(`⏳ Rate limited (429) for "${query}" — backing off`);
            } else {
                console.error(`❌ HTTP ${status} for "${query}": ${error.message}`);
            }
        } else if (error.code === 'ECONNABORTED') {
            console.error(`⏰ Timeout for "${query}" — request took too long`);
        } else {
            console.error(`❌ Network error for "${query}":`, error.message);
        }
        return [];
    }
}

module.exports = { fetchListings };
