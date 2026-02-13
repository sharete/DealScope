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

    // Send initial status or data if needed
    socket.emit('status', { message: 'Connected to DealScope Server' });

    // Send history if variable is available (will be after manager init)
    if (typeof manager !== 'undefined') {
        socket.emit('history', manager.getRecentItems());
    }

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// Initialize Agents via Manager
const AgentManager = require('./managers/AgentManager');
const manager = new AgentManager(io);
manager.start();

// API Routes
app.get('/api/status', (req, res) => {
    res.json({ status: 'online', timestamp: Date.now() });
});

app.post('/api/scan', async (req, res) => {
    try {
        await manager.scanNow();
        res.json({ success: true, message: 'Scan complete' });
    } catch (error) {
        res.status(429).json({ error: error.message });
    }
});

app.get('/api/agents', (req, res) => {
    res.json(manager.agents);
});

app.post('/api/agents', (req, res) => {
    const { name, query } = req.body;
    if (!name || !query) return res.status(400).json({ error: 'Missing fields' });
    const newAgent = manager.addAgent(name, query);
    res.json(newAgent);
});

app.delete('/api/agents/:id', (req, res) => {
    const { id } = req.params;
    manager.deleteAgent(id);
    res.json({ success: true });
});

// Start Server
server.listen(PORT, () => {
    console.log(`🚀 DealScope Server running on http://localhost:${PORT}`);
});

// Export io for use in other modules
module.exports = { io };
