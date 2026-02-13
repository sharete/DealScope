const fs = require('fs');
const path = require('path');
const { fetchListings } = require('../scraper/kleinanzeigen');

const CONFIG_PATH = path.join(__dirname, '../../config/agents.json');
const INTERVAL_MS = 60000; // Check every 60 seconds

class AgentManager {
    constructor(io) {
        this.io = io;
        this.agents = [];
        this.seenIds = new Set();
        this.recentItems = []; // Buffer for new connections
        this.interval = null;
        this.isScanning = false;
        this.lastScanTime = 0;
        this.loadAgents();
    }

    getRecentItems() {
        return this.recentItems;
    }

    loadAgents() {
        try {
            const data = fs.readFileSync(CONFIG_PATH, 'utf8');
            const json = JSON.parse(data);
            this.agents = json.agents || [];
            console.log(`📋 Loaded ${this.agents.length} agents`);
        } catch (err) {
            console.error('❌ Error loading agents:', err.message);
            this.agents = [];
        }
    }

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
        const cooldown = 10000; // 10 seconds
        if (this.lastScanTime && (now - this.lastScanTime < cooldown)) {
            const wait = Math.ceil((cooldown - (now - this.lastScanTime)) / 1000);
            throw new Error(`Cooldown active. Wait ${wait}s.`);
        }

        // Reset interval to avoid double scan shortly after
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

    async runCycle() {
        if (this.isScanning) return;
        this.isScanning = true;
        console.log('🔄 Running scan cycle...');

        try {
            for (const agent of this.agents) {
                if (!agent.enabled) continue;

                const items = await fetchListings(agent.query);

                let newItemsCount = 0;
                for (const item of items) {
                    if (!this.seenIds.has(item.id)) {
                        this.seenIds.add(item.id);
                        newItemsCount++;

                        // Add to recent buffer
                        this.recentItems.unshift({ agentId: agent.id, agentName: agent.name, item: item });
                        if (this.recentItems.length > 50) this.recentItems.pop();

                        // Emit to frontend
                        this.io.emit('new-listing', {
                            agentId: agent.id,
                            agentName: agent.name,
                            item: item
                        });
                    }
                }

                if (newItemsCount > 0) {
                    console.log(`✨ [${agent.name}] Found ${newItemsCount} new items!`);
                }
            }
        } catch (error) {
            console.error('Error in scan cycle:', error);
        } finally {
            this.isScanning = false;
            this.lastScanTime = Date.now();
        }
    }

    addAgent(name, query) {
        const newAgent = {
            id: Date.now().toString(),
            name,
            query,
            enabled: true
        };
        this.agents.push(newAgent);
        this.saveAgents();
        return newAgent;
    }

    deleteAgent(id) {
        this.agents = this.agents.filter(a => a.id !== id);
        this.saveAgents();
    }

    saveAgents() {
        const json = { agents: this.agents };
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(json, null, 4));
    }
}

module.exports = AgentManager;
