const socket = io();
const feedContainer = document.getElementById('feed-container');

socket.on('connect', () => {
    console.log('Connected to server');
});

socket.on('new-listing', (data) => {
    console.log('New Listing:', data);
    renderItem(data);
    playSound();
});

socket.on('history', (items) => {
    console.log('History:', items);
    items.forEach(data => renderItem(data));
});

function playSound() {
    if (isMuted) return;
    // Simple notification sound
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    // "Ka-ching" or simple beep. Using a placeholder or browser beep logic if possible.
    // For now, let's just log. Audio relies on user interaction policy usually.
    audio.play().catch(e => console.log('Audio autoplay blocked', e));
}

function renderItem(data) {
    const { item, agentName } = data;

    // Remove "Running scan..." placeholder if exists
    if (feedContainer.querySelector('.text-center')) {
        feedContainer.innerHTML = '';
    }

    const card = document.createElement('div');
    card.className = 'feed-card bg-dark border border-white/10 rounded-lg p-4 flex gap-4 hover:border-accent/50 transition-all duration-300 animate-slide-in group';
    // Add agent ID for filtering
    card.dataset.agentId = data.agentId;

    // Check filter on render
    if (currentFilterId && currentFilterId !== data.agentId) {
        card.style.display = 'none';
    }

    // Image handling
    const imgUrl = item.image ? item.image : 'https://placehold.co/100x100/333/666?text=No+Img';

    card.innerHTML = `
        <div class="w-24 h-24 flex-shrink-0 bg-black/50 rounded overflow-hidden relative">
            <img src="${imgUrl}" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500">
            <div class="absolute top-0 left-0 bg-accent text-black text-[10px] font-bold px-1.5 py-0.5">
                ${agentName}
            </div>
        </div>
        
        <div class="flex-1 flex flex-col justify-between">
            <div>
                <div class="flex justify-between items-start">
                    <h3 class="font-bold text-lg text-white leading-tight group-hover:text-accent transition-colors">
                        <a href="${item.link}" target="_blank">${item.title}</a>
                    </h3>
                    <span class="font-mono font-bold text-accent text-xl">${item.price}</span>
                </div>
                <p class="text-sm text-gray-400 mt-1 line-clamp-2">${item.description || 'No description'}</p>
            </div>
            
            <div class="flex justify-between items-end mt-2">
                <div class="flex items-center gap-3 text-xs text-gray-500 font-mono">
                    <span class="flex items-center gap-1">📍 ${item.location}</span>
                    <span class="flex items-center gap-1">🕒 ${item.date}</span>
                </div>
                <a href="${item.link}" target="_blank" 
                   class="px-4 py-1.5 bg-white/5 hover:bg-accent hover:text-black border border-white/10 rounded text-xs font-bold uppercase tracking-wider transition-all">
                   View Listing
                </a>
            </div>
        </div>
    `;

    feedContainer.prepend(card);

    // Autoscroll to top if enabled
    if (isAutoscroll) {
        feedContainer.scrollTop = 0;
    }
}

// Add animation style
const style = document.createElement('style');
style.innerHTML = `
    @keyframes slideIn {
        from { opacity: 0; transform: translateY(-10px); }
        to { opacity: 1; transform: translateY(0); }
    }
    .animate-slide-in {
        animation: slideIn 0.3s ease-out forwards;
    }
`;
document.head.appendChild(style);

// Fetch Agents
let currentFilterId = null;

// Fetch Agents
// Fetch Agents
// Fetch Agents
async function fetchAgents() {
    try {
        const res = await fetch('/api/agents');
        const agents = await res.json();
        const list = document.getElementById('agent-list');
        list.innerHTML = '';

        // Update "All Agents" button state
        const allBtn = document.getElementById('filter-all');
        if (allBtn) {
            const isAllActive = currentFilterId === null;
            allBtn.className = `mb-2 p-3 rounded flex justify-between items-center group cursor-pointer transition-colors ${isAllActive ? 'bg-accent/10 border border-accent/50' : 'bg-white/5 border border-white/5 hover:border-white/20'}`;
            const span = allBtn.querySelector('span');
            if (span) span.className = `font-bold text-sm ${isAllActive ? 'text-accent' : 'text-white'}`;
        }

        agents.forEach(agent => {
            const isActive = currentFilterId === agent.id;

            // Container
            const container = document.createElement('div');
            container.className = `p-3 rounded border flex justify-between items-center group transition-colors ${isActive ? 'bg-accent/10 border-accent/50' : 'bg-white/5 border-white/5 hover:border-white/20'}`;

            // Text Area (Click to Filter)
            const textArea = document.createElement('div');
            textArea.className = 'flex-1 cursor-pointer';
            textArea.innerHTML = `
                <div class="font-bold text-sm ${isActive ? 'text-accent' : 'text-white'}">${agent.name}</div>
                <div class="text-[10px] text-gray-500 font-mono">Query: ${agent.query}</div>
            `;
            textArea.addEventListener('click', () => setFilter(agent.id));

            // Delete Area
            const actions = document.createElement('div');
            actions.className = 'flex items-center gap-2 pl-2 border-l border-white/10 ml-2';

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'text-gray-500 hover:text-red-500 p-1.5 rounded hover:bg-white/10 transition-all';
            deleteBtn.title = 'Delete';
            deleteBtn.innerHTML = '🗑️';

            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                // Call global request delete
                window.requestDelete(agent.id);
            });

            actions.appendChild(deleteBtn);
            container.appendChild(textArea);
            container.appendChild(actions);
            list.appendChild(container);
        });
    } catch (e) {
        console.error('Failed to fetch agents', e);
    }
}

function setFilter(agentId) {
    console.log('Setting filter to:', agentId);
    currentFilterId = agentId;
    fetchAgents();

    // Filter feed items
    const cards = document.querySelectorAll('.feed-card');
    let visibleCount = 0;
    cards.forEach(card => {
        // Ensure dataset is present
        const cardAgentId = card.dataset.agentId;
        if (!agentId || cardAgentId === agentId) {
            card.style.display = 'flex';
            visibleCount++;
        } else {
            card.style.display = 'none';
        }
    });
    console.log(`Filter applied. Visible items: ${visibleCount}`);
}

// Confirm Modal Logic
const confirmModal = document.getElementById('confirm-modal');
const confirmCancelBtn = document.getElementById('confirm-cancel-btn');
const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
let agentToDelete = null;

function showConfirm(id) {
    agentToDelete = id;
    confirmModal.classList.remove('hidden');
}

function hideConfirm() {
    agentToDelete = null;
    confirmModal.classList.add('hidden');
}

confirmCancelBtn.addEventListener('click', hideConfirm);

confirmDeleteBtn.addEventListener('click', async () => {
    if (!agentToDelete) return;
    const id = agentToDelete;

    confirmDeleteBtn.innerText = "Deleting...";
    try {
        const res = await fetch(`/api/agents/${id}`, { method: 'DELETE' });
        if (res.ok) {
            if (currentFilterId === id) currentFilterId = null;
            fetchAgents();
            hideConfirm();
        } else {
            alert('Server failed to delete');
        }
    } catch (e) {
        console.error(e);
        alert('Failed to delete');
    } finally {
        confirmDeleteBtn.innerText = "Delete";
    }
});

// Exposed delete function for UI
window.requestDelete = showConfirm;

// Refactored fetchAgents to use requestDelete
// ... (existing helper)

fetchAgents();

// UI Logic
const muteBtn = document.getElementById('mute-btn');
const autoscrollBtn = document.getElementById('autoscroll-btn');
const addAgentBtn = document.getElementById('add-agent-btn');
const agentModal = document.getElementById('agent-modal');
const cancelAgentBtn = document.getElementById('cancel-agent-btn');
const saveAgentBtn = document.getElementById('save-agent-btn');
const agentNameInput = document.getElementById('agent-name');
const agentQueryInput = document.getElementById('agent-query');

let isMuted = true;
let isAutoscroll = true;

// Autoscroll Logic
autoscrollBtn.addEventListener('click', () => {
    isAutoscroll = !isAutoscroll;
    if (isAutoscroll) {
        autoscrollBtn.innerText = "Autoscroll: ON";
        autoscrollBtn.className = "px-2 py-0.5 rounded text-[10px] font-mono bg-accent/20 border border-accent/50 text-accent cursor-pointer hover:bg-accent/30 transition-colors";
    } else {
        autoscrollBtn.innerText = "Autoscroll: OFF";
        autoscrollBtn.className = "px-2 py-0.5 rounded text-[10px] font-mono bg-white/5 border border-white/5 text-gray-500 cursor-pointer hover:bg-white/10 transition-colors";
    }
});

// Scan Logic
const scanBtn = document.getElementById('scan-btn');
scanBtn.addEventListener('click', async () => {
    if (scanBtn.disabled) return;

    const originalText = scanBtn.innerHTML;
    scanBtn.innerHTML = "<span>↻</span> ...";
    scanBtn.disabled = true;
    scanBtn.classList.add('opacity-50', 'cursor-not-allowed');

    try {
        const res = await fetch('/api/scan', { method: 'POST' });
        const data = await res.json();

        if (res.ok) {
            scanBtn.innerHTML = "<span>✓</span> Done";
            scanBtn.className = "px-2 py-0.5 rounded text-[10px] font-mono bg-green-500/20 border border-green-500/50 text-green-400 flex items-center gap-1 transition-colors";
            setTimeout(() => {
                scanBtn.innerHTML = originalText;
                scanBtn.className = "px-2 py-0.5 rounded text-[10px] font-mono bg-white/5 border border-white/5 text-gray-400 cursor-pointer hover:bg-white/10 hover:text-white transition-colors flex items-center gap-1";
                scanBtn.disabled = false;
                scanBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            }, 2000);
        } else {
            // Cooldown or error
            scanBtn.innerHTML = "<span>⏳</span> Wait";
            scanBtn.title = data.error;
            setTimeout(() => {
                scanBtn.innerHTML = originalText;
                scanBtn.disabled = false;
                scanBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            }, 2000);
        }
    } catch (e) {
        console.error(e);
        scanBtn.innerHTML = "❌ Error";
        setTimeout(() => {
            scanBtn.innerHTML = originalText;
            scanBtn.disabled = false;
            scanBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        }, 2000);
    }
});

muteBtn.addEventListener('click', () => {
    isMuted = !isMuted;
    muteBtn.innerHTML = isMuted ? '🔇 Sound Off' : '🔊 Sound On';
    muteBtn.className = isMuted ? 'text-gray-500 hover:text-white transition-colors' : 'text-accent hover:text-green-400 transition-colors font-bold';

    // Play test sound only if unmuting to trigger user interaction allowance
    if (!isMuted) {
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
        audio.volume = 0.2;
        audio.play().catch(e => console.log('Audio blocked', e));
    }
});

/* new-listing handler needs update to respect isMuted */

// Modal Logic
addAgentBtn.addEventListener('click', () => {
    agentModal.classList.remove('hidden');
    agentNameInput.focus();
});

function closeModal() {
    agentModal.classList.add('hidden');
    agentNameInput.value = '';
    agentQueryInput.value = '';
}

cancelAgentBtn.addEventListener('click', closeModal);

saveAgentBtn.addEventListener('click', async () => {
    const name = agentNameInput.value.trim();
    const query = agentQueryInput.value.trim();

    if (!name || !query) return alert('Please fill in all fields');

    saveAgentBtn.innerText = 'Saving...';
    try {
        const res = await fetch('/api/agents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, query })
        });

        if (res.ok) {
            closeModal();
            fetchAgents(); // Refresh list
        } else {
            alert('Error saving agent');
        }
    } catch (e) {
        console.error(e);
        alert('Network error');
    } finally {
        saveAgentBtn.innerText = 'Save Agent';
    }
});
