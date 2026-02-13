const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Socket.io Connection
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.emit('status', { message: 'Connected to DealScope Server' });

    // Send history if manager is initialized
    if (typeof manager !== 'undefined') {
        socket.emit('history', manager.getRecentItems());
        socket.emit('scan-status', { status: 'idle', timestamp: Date.now(), stats: manager.getStats() });
    }

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// Initialize Agents via Manager
const AgentManager = require('./managers/AgentManager');
const manager = new AgentManager(io);
manager.start();

// ─── API Routes ──────────────────────────────────────────

// Status
app.get('/api/status', (req, res) => {
    res.json({ status: 'online', timestamp: Date.now() });
});

// Stats
app.get('/api/stats', (req, res) => {
    res.json(manager.getStats());
});

// Manual Scan
app.post('/api/scan', async (req, res) => {
    try {
        await manager.scanNow();
        res.json({ success: true, message: 'Scan complete', stats: manager.getStats() });
    } catch (error) {
        res.status(429).json({ error: error.message });
    }
});

// ─── Agents CRUD ─────────────────────────────────────────

// List agents
app.get('/api/agents', (req, res) => {
    res.json(manager.agents);
});

// Create agent
app.post('/api/agents', (req, res) => {
    const { name, query, minPrice, maxPrice, marketplace } = req.body;
    if (!name || !query) return res.status(400).json({ error: 'Name and query are required' });
    const newAgent = manager.addAgent(name, query, minPrice, maxPrice, marketplace || 'kleinanzeigen');
    res.json(newAgent);
});

// Update agent
app.put('/api/agents/:id', (req, res) => {
    const { id } = req.params;
    const updated = manager.updateAgent(id, req.body);
    if (!updated) return res.status(404).json({ error: 'Agent not found' });
    res.json(updated);
});

// Toggle agent enabled/disabled
app.patch('/api/agents/:id/toggle', (req, res) => {
    const { id } = req.params;
    const toggled = manager.toggleAgent(id);
    if (!toggled) return res.status(404).json({ error: 'Agent not found' });
    res.json(toggled);
});

// Delete agent
app.delete('/api/agents/:id', (req, res) => {
    const { id } = req.params;
    manager.deleteAgent(id);
    res.json({ success: true });
});

// ─── Favorites ───────────────────────────────────────────

// List favorites
app.get('/api/favorites', (req, res) => {
    res.json(manager.getFavorites());
});

// Add favorite
app.post('/api/favorites', (req, res) => {
    const { item } = req.body;
    if (!item || !item.id) return res.status(400).json({ error: 'Item with id required' });
    const fav = manager.addFavorite(item);
    if (!fav) return res.status(409).json({ error: 'Already in favorites' });
    res.json(fav);
});

// Remove favorite
app.delete('/api/favorites/:id', (req, res) => {
    const { id } = req.params;
    manager.removeFavorite(id);
    res.json({ success: true });
});

// ─── Start Server ────────────────────────────────────────
server.listen(PORT, () => {
    console.log(`🚀 DealScope Server running on http://localhost:${PORT}`);
});

module.exports = { io };
