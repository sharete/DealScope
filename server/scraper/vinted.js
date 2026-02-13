const axios = require('axios');

const BASE_URL = 'https://www.vinted.de';
const API_URL = `${BASE_URL}/api/v2/catalog/items`;

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

function randomDelay(min = 500, max = 2000) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, delay));
}

// ─── Token Management ────────────────────────────────────
let accessToken = null;
let allCookies = null;
let sessionUA = null;
let lastTokenFetch = 0;
const TOKEN_TTL = 60 * 60 * 1000; // 1 hour (token is valid for 2h)

async function getAccessToken() {
    const now = Date.now();
    if (accessToken && (now - lastTokenFetch < TOKEN_TTL)) {
        return { token: accessToken, cookies: allCookies, ua: sessionUA };
    }

    console.log('🍪 Vinted: Acquiring access token...');
    try {
        sessionUA = getRandomUserAgent();

        const response = await axios.get(BASE_URL, {
            headers: {
                'User-Agent': sessionUA,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'de-DE,de;q=0.9,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Cache-Control': 'max-age=0',
            },
            timeout: 15000,
            maxRedirects: 5,
        });

        const setCookies = response.headers['set-cookie'] || [];
        const cookies = setCookies.map(c => c.split(';')[0]).join('; ');

        // Extract the access_token_web from cookies
        let token = null;
        for (const cookie of setCookies) {
            const match = cookie.match(/access_token_web=([^;]+)/);
            if (match && match[1] && match[1] !== '') {
                token = match[1];
            }
        }

        if (token) {
            accessToken = token;
            allCookies = cookies;
            lastTokenFetch = Date.now();
            console.log('✅ Vinted: Access token acquired');
            return { token, cookies, ua: sessionUA };
        } else {
            console.error('❌ Vinted: No access_token_web found in cookies');
            return null;
        }
    } catch (err) {
        console.error('❌ Vinted: Session error:', err.message);
        return null;
    }
}

// ─── Fetch Listings ──────────────────────────────────────
async function fetchListings(query) {
    try {
        const session = await getAccessToken();
        if (!session) {
            console.error('🚫 Vinted: No access token — skipping');
            return [];
        }

        await randomDelay(300, 1500);

        console.log(`🔍 Vinted: Searching "${query}"...`);

        const response = await axios.get(API_URL, {
            params: {
                search_text: query,
                order: 'newest_first',
                page: 1,
                per_page: 30,
            },
            headers: {
                'User-Agent': session.ua,
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'de-DE,de;q=0.9',
                'Authorization': `Bearer ${session.token}`,
                'Cookie': session.cookies,
                'Referer': `${BASE_URL}/catalog?search_text=${encodeURIComponent(query)}`,
                'X-Requested-With': 'XMLHttpRequest',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-origin',
            },
            timeout: 15000,
        });

        const data = response.data;
        const rawItems = data.items || [];

        const items = rawItems.map((item, i) => {
            const photoUrl = item.photo?.url || item.photos?.[0]?.url || null;

            // Vinted returns price as { amount: "5.00", currency_code: "EUR" }
            let price = '';
            const priceObj = item.price || item.total_item_price;
            if (priceObj) {
                if (typeof priceObj === 'object' && priceObj.amount) {
                    price = `${priceObj.amount} €`;
                } else if (typeof priceObj === 'string') {
                    price = priceObj;
                } else if (typeof priceObj === 'number') {
                    price = `${priceObj} €`;
                }
            }

            const brandTitle = item.brand_title || '';
            const sizeTitle = item.size_title || '';
            const desc = [brandTitle, sizeTitle].filter(Boolean).join(' · ');

            return {
                id: `vinted-${item.id}`,
                title: item.title || 'Vinted Item',
                price,
                location: item.city || item.country_title || '',
                date: item.created_at_ts
                    ? new Date(item.created_at_ts * 1000).toLocaleDateString('de-DE')
                    : new Date().toLocaleDateString('de-DE'),
                link: item.url
                    ? (item.url.startsWith('http') ? item.url : `${BASE_URL}${item.url}`)
                    : `${BASE_URL}/items/${item.id}`,
                image: photoUrl,
                description: desc || item.description || '',
                timestamp: item.created_at_ts ? item.created_at_ts * 1000 : Date.now(),
                source: 'vinted',
            };
        });

        console.log(`✅ Vinted: Found ${items.length} items for "${query}"`);
        return items;

    } catch (error) {
        if (error.response) {
            const status = error.response.status;
            if (status === 401 || status === 403) {
                accessToken = null; // Force token refresh
                console.error(`🚫 Vinted: Auth error (${status}) for "${query}" — token will refresh`);
            } else if (status === 429) {
                console.error(`⏳ Vinted: Rate limited (429) for "${query}"`);
            } else {
                console.error(`❌ Vinted: HTTP ${status} for "${query}": ${error.message}`);
            }
        } else if (error.code === 'ECONNABORTED') {
            console.error(`⏰ Vinted: Timeout for "${query}"`);
        } else {
            console.error(`❌ Vinted: Error for "${query}":`, error.message);
        }
        return [];
    }
}

module.exports = { fetchListings };
