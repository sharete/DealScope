const fs = require('fs');
const path = require('path');
const { fetchListings: fetchKleinanzeigen } = require('../scraper/kleinanzeigen');
const { fetchListings: fetchVinted } = require('../scraper/vinted');

const CONFIG_PATH = path.join(__dirname, '../../config/agents.json');
const FAVORITES_PATH = path.join(__dirname, '../../config/favorites.json');
const INTERVAL_MS = 60000; // Check every 60 seconds
const MAX_RECENT_ITEMS = 200;

function randomDelay(min = 500, max = 1000) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, delay));
}

class AgentManager {
    constructor(io) {
        this.io = io;
        this.agents = [];
        this.seenIds = new Set();
        this.recentItems = [];
        this.favorites = [];
        this.interval = null;
        this.isScanning = false;
        this.lastScanTime = 0;
        this.startTime = Date.now();
        this.totalItemsFound = 0;
        this.todayItemsFound = 0;
        this.todayDate = new Date().toDateString();
        this.loadAgents();
        this.loadFavorites();
    }

    // ─── Stats ───────────────────────────────────────────────
    getStats() {
        // Reset daily counter if day changed
        const today = new Date().toDateString();
        if (today !== this.todayDate) {
            this.todayItemsFound = 0;
            this.todayDate = today;
        }

        return {
            activeAgents: this.agents.filter(a => a.enabled).length,
            totalAgents: this.agents.length,
            totalItemsFound: this.totalItemsFound,
            todayItemsFound: this.todayItemsFound,
            uptimeMs: Date.now() - this.startTime,
            lastScanTime: this.lastScanTime,
            isScanning: this.isScanning,
            favoriteCount: this.favorites.length
        };
    }

    getRecentItems() {
        return this.recentItems;
    }

    // ─── Agents CRUD ─────────────────────────────────────────
    loadAgents() {
        try {
            const data = fs.readFileSync(CONFIG_PATH, 'utf8');
            const json = JSON.parse(data);
            this.agents = (json.agents || []).map(agent => ({
                enabled: true,
                minPrice: null,
                maxPrice: null,
                totalFound: 0,
                lastScanTime: null,
                createdAt: agent.createdAt || Date.now(),
                marketplace: agent.marketplace || 'kleinanzeigen',
                ...agent
            }));
            console.log(`📋 Loaded ${this.agents.length} agents`);
        } catch (err) {
            console.error('❌ Error loading agents:', err.message);
            this.agents = [];
        }
    }

    saveAgents() {
        const json = { agents: this.agents };
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(json, null, 4));
    }

    addAgent(name, query, minPrice = null, maxPrice = null, marketplace = 'kleinanzeigen') {
        const newAgent = {
            id: Date.now().toString(),
            name,
            query,
            enabled: true,
            marketplace,
            minPrice: minPrice ? parseFloat(minPrice) : null,
            maxPrice: maxPrice ? parseFloat(maxPrice) : null,
            totalFound: 0,
            lastScanTime: null,
            createdAt: Date.now()
        };
        this.agents.push(newAgent);
        this.saveAgents();
        this.io.emit('agent-updated', { action: 'added', agent: newAgent });
        return newAgent;
    }

    updateAgent(id, fields) {
        const agent = this.agents.find(a => a.id === id);
        if (!agent) return null;

        const allowedFields = ['name', 'query', 'minPrice', 'maxPrice', 'enabled', 'marketplace'];
        for (const key of allowedFields) {
            if (fields[key] !== undefined) {
                if (key === 'minPrice' || key === 'maxPrice') {
                    agent[key] = fields[key] !== null && fields[key] !== '' ? parseFloat(fields[key]) : null;
                } else {
                    agent[key] = fields[key];
                }
            }
        }

        this.saveAgents();
        this.io.emit('agent-updated', { action: 'updated', agent });
        return agent;
    }

    toggleAgent(id) {
        const agent = this.agents.find(a => a.id === id);
        if (!agent) return null;
        agent.enabled = !agent.enabled;
        this.saveAgents();
        this.io.emit('agent-updated', { action: 'toggled', agent });
        return agent;
    }

    deleteAgent(id) {
        this.agents = this.agents.filter(a => a.id !== id);
        this.recentItems = this.recentItems.filter(item => item.agentId !== id);
        this.saveAgents();
        this.io.emit('agent-updated', { action: 'deleted', agentId: id });
    }

    // ─── Favorites ───────────────────────────────────────────
    loadFavorites() {
        try {
            const data = fs.readFileSync(FAVORITES_PATH, 'utf8');
            const json = JSON.parse(data);
            this.favorites = json.favorites || [];
            console.log(`⭐ Loaded ${this.favorites.length} favorites`);
        } catch (err) {
            this.favorites = [];
        }
    }

    saveFavorites() {
        const json = { favorites: this.favorites };
        fs.writeFileSync(FAVORITES_PATH, JSON.stringify(json, null, 4));
    }

    addFavorite(item) {
        // Avoid duplicates
        if (this.favorites.find(f => f.id === item.id)) return null;
        const fav = { ...item, savedAt: Date.now() };
        this.favorites.unshift(fav);
        this.saveFavorites();
        return fav;
    }

    removeFavorite(id) {
        this.favorites = this.favorites.filter(f => f.id !== id);
        this.saveFavorites();
    }

    getFavorites() {
        return this.favorites;
    }

    isFavorite(id) {
        return this.favorites.some(f => f.id === id);
    }

    // ─── Scan Engine ─────────────────────────────────────────
    start() {
        if (this.interval) return;
        console.log('🚀 Starting Agent Loop...');
        this.runCycle();
        this.interval = setInterval(() => this.runCycle(), INTERVAL_MS);
    }

    async scanNow() {
        if (this.isScanning) {
            throw new Error('Scan already in progress');
        }

        const now = Date.now();
        const cooldown = 10000;
        if (this.lastScanTime && (now - this.lastScanTime < cooldown)) {
            const wait = Math.ceil((cooldown - (now - this.lastScanTime)) / 1000);
            throw new Error(`Cooldown active. Wait ${wait}s.`);
        }

        // Reset interval to avoid double scan
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = setInterval(() => this.runCycle(), INTERVAL_MS);
        }

        return this.runCycle();
    }

    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }

    /**
     * Parse a price string like "150 € VB" or "VB" into a number or null
     */
    parsePrice(priceStr) {
        if (!priceStr) return null;
        const cleaned = priceStr.replace(/[^0-9.,]/g, '').replace(',', '.');
        const num = parseFloat(cleaned);
        return isNaN(num) ? null : num;
    }

    async runCycle() {
        if (this.isScanning) return;
        this.isScanning = true;
        console.log('🔄 Running scan cycle...');

        // Emit scan-start event
        this.io.emit('scan-status', { status: 'scanning', timestamp: Date.now() });

        // Reset daily counter if needed
        const today = new Date().toDateString();
        if (today !== this.todayDate) {
            this.todayItemsFound = 0;
            this.todayDate = today;
        }

        try {
            for (const agent of this.agents) {
                if (!agent.enabled) continue;

                const marketplace = agent.marketplace || 'kleinanzeigen';
                let allItems = [];

                if (marketplace === 'kleinanzeigen' || marketplace === 'both') {
                    const kItems = await fetchKleinanzeigen(agent.query);
                    allItems = allItems.concat(kItems);
                }
                if (marketplace === 'vinted' || marketplace === 'both') {
                    if (marketplace === 'both') await randomDelay(500, 1000);
                    const vItems = await fetchVinted(agent.query);
                    allItems = allItems.concat(vItems);
                }

                let newItemsCount = 0;

                for (const item of allItems) {
                    if (!this.seenIds.has(item.id)) {
                        this.seenIds.add(item.id);
                        newItemsCount++;

                        // Price analysis
                        const numericPrice = this.parsePrice(item.price);
                        let isDeal = false;
                        let dealReason = null;

                        if (numericPrice !== null) {
                            if (agent.maxPrice !== null && numericPrice <= agent.maxPrice) {
                                isDeal = true;
                                dealReason = `Under max price (${agent.maxPrice}€)`;
                            }
                            if (agent.minPrice !== null && numericPrice < agent.minPrice) {
                                isDeal = false; // Below minimum — probably not what user wants
                            }
                        }

                        const enrichedItem = {
                            ...item,
                            numericPrice,
                            isDeal,
                            dealReason,
                            isFavorite: this.isFavorite(item.id)
                        };

                        // Add to recent buffer
                        this.recentItems.unshift({ agentId: agent.id, agentName: agent.name, item: enrichedItem });
                        if (this.recentItems.length > MAX_RECENT_ITEMS) this.recentItems.pop();

                        // Emit to frontend
                        this.io.emit('new-listing', {
                            agentId: agent.id,
                            agentName: agent.name,
                            item: enrichedItem
                        });
                    }
                }

                // Update agent stats
                if (newItemsCount > 0) {
                    agent.totalFound = (agent.totalFound || 0) + newItemsCount;
                    this.totalItemsFound += newItemsCount;
                    this.todayItemsFound += newItemsCount;
                    console.log(`✨ [${agent.name}] Found ${newItemsCount} new items!`);
                }
                agent.lastScanTime = Date.now();
            }

            this.saveAgents();
        } catch (error) {
            console.error('Error in scan cycle:', error);
        } finally {
            this.isScanning = false;
            this.lastScanTime = Date.now();
            this.io.emit('scan-status', { status: 'idle', timestamp: Date.now(), stats: this.getStats() });
        }
    }
}

module.exports = AgentManager;
