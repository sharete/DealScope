const axios = require('axios');
const cheerio = require('cheerio');

const url = 'https://www.kleinanzeigen.de/s-iphone-15-pro/k0';

console.log(`Requesting ${url}...`);

axios.get(url, {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'de,en-US;q=0.7,en;q=0.3'
    }
}).then(res => {
    console.log(`Received ${res.data.length} bytes`);
    const $ = cheerio.load(res.data);
    const items = $('.aditem');
    console.log(`Found ${items.length} items`);

    items.each((i, el) => {
        if (i > 5) return; // Only first 5
        const $el = $(el);
        const isTop = $el.hasClass('is-top-ad');
        const date = $el.find('.aditem-main--top--right').text().trim();
        const title = $el.find('.text-module-begin > a').text().trim();
        const topIcon = $el.find('.icon-feature-topad').length > 0;

        console.log(`[${i}] TopClass: ${isTop} | TopIcon: ${topIcon} | Date: "${date}" | Title: "${title.substring(0, 30)}..."`);
    });
}).catch(err => {
    console.error("Error:", err.message);
    if (err.response) console.error("Status:", err.response.status);
});
