/* ═══════════════════════════════════════════════════════════
   DealScope — Premium Dashboard Application
   ═══════════════════════════════════════════════════════════ */

const socket = io();

// ─── DOM References ──────────────────────────────────────
const feedContainer = document.getElementById('feed-container');
const emptyState = document.getElementById('empty-state');
const agentListEl = document.getElementById('agent-list');
const filterAllBtn = document.getElementById('filter-all');
const totalAgentCountEl = document.getElementById('total-agent-count');

// Stats
const statActiveAgents = document.getElementById('stat-active-agents');
const statTodayItems = document.getElementById('stat-today-items');
const statTotalItems = document.getElementById('stat-total-items');
const statUptime = document.getElementById('stat-uptime');
const statFavorites = document.getElementById('stat-favorites');

// Buttons
const addAgentBtn = document.getElementById('add-agent-btn');
const cancelAgentBtn = document.getElementById('cancel-agent-btn');
const saveAgentBtn = document.getElementById('save-agent-btn');
const autoscrollBtn = document.getElementById('autoscroll-btn');
const scanBtn = document.getElementById('scan-btn');
const muteBtn = document.getElementById('mute-btn');
const shortcutsBtn = document.getElementById('shortcuts-btn');
const favoritesBtn = document.getElementById('favorites-btn');
const menuBtn = document.getElementById('menu-btn');

// Modals
const agentModal = document.getElementById('agent-modal');
const confirmModal = document.getElementById('confirm-modal');
const shortcutsModal = document.getElementById('shortcuts-modal');
const modalTitle = document.getElementById('modal-title');

// Inputs
const agentNameInput = document.getElementById('agent-name');
const agentQueryInput = document.getElementById('agent-query');
const agentMinPriceInput = document.getElementById('agent-min-price');
const agentMaxPriceInput = document.getElementById('agent-max-price');
const feedSearchInput = document.getElementById('feed-search');
const feedSortSelect = document.getElementById('feed-sort');

// Confirm Modal
const confirmCancelBtn = document.getElementById('confirm-cancel-btn');
const confirmDeleteBtn = document.getElementById('confirm-delete-btn');

// Shortcuts Modal
const closeShortcutsBtn = document.getElementById('close-shortcuts-btn');

// Favorites
const favoritesPanel = document.getElementById('favorites-panel');
const favoritesList = document.getElementById('favorites-list');
const closeFavoritesBtn = document.getElementById('close-favorites');
const favoritesCountEl = document.getElementById('favorites-count');

// Mobile
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebar-overlay');

// ─── State ───────────────────────────────────────────────
let currentFilterId = null;
let isMuted = true;
let isAutoscroll = true;
let agentToDelete = null;
let editingAgentId = null; // null = creating new, string = editing
let favoritesOpen = false;
let feedItems = []; // track all items for search
let currentSort = 'newest';

// ─── Socket Events ───────────────────────────────────────
socket.on('connect', () => {
    console.log('Connected to DealScope Server');
    updateSystemStatus('CONNECTED', true);
});

socket.on('disconnect', () => {
    updateSystemStatus('DISCONNECTED', false);
    showToast('Connection lost. Reconnecting...', 'error');
});

socket.on('reconnect', () => {
    updateSystemStatus('RECONNECTED', true);
    showToast('Reconnected to server', 'success');
});

socket.on('status', (data) => {
    console.log('Server status:', data.message);
});

socket.on('new-listing', (data) => {
    renderItem(data);
    playSound();
    if (data.item.isDeal) {
        showToast(`🔥 DEAL found by ${data.agentName}: ${data.item.title} — ${data.item.price}`, 'success');
    }
});

socket.on('history', (items) => {
    // Reverse so newest items appear first
    items.reverse().forEach(data => renderItem(data, true));
});

socket.on('scan-status', (data) => {
    if (data.status === 'scanning') {
        scanBtn.classList.add('btn-tag--scanning');
    } else {
        scanBtn.classList.remove('btn-tag--scanning');
    }
    if (data.stats) {
        updateStats(data.stats);
    }
});

socket.on('agent-updated', (data) => {
    fetchAgents();
    if (data.action === 'added') showToast(`Agent "${data.agent.name}" created`, 'success');
    if (data.action === 'deleted') {
        showToast('Agent deleted', 'info');
        removeAgentFeedCards(data.agentId);
    }
    if (data.action === 'updated') showToast(`Agent "${data.agent.name}" updated`, 'success');
    if (data.action === 'toggled') {
        const state = data.agent.enabled ? 'enabled' : 'paused';
        showToast(`Agent "${data.agent.name}" ${state}`, 'info');
    }
});

// ─── System Status ───────────────────────────────────────
function updateSystemStatus(text, online) {
    const statusText = document.getElementById('system-status-text');
    const statusDot = document.querySelector('.status-dot');
    statusText.textContent = text;
    if (online) {
        statusDot.style.background = 'var(--accent)';
        statusText.style.color = 'var(--accent)';
    } else {
        statusDot.style.background = 'var(--danger)';
        statusText.style.color = 'var(--danger)';
    }
}

// ─── Stats ───────────────────────────────────────────────
function updateStats(stats) {
    animateCounter(statActiveAgents, stats.activeAgents);
    animateCounter(statTodayItems, stats.todayItemsFound);
    animateCounter(statTotalItems, stats.totalItemsFound);
    animateCounter(statFavorites, stats.favoriteCount);
    statUptime.textContent = formatUptime(stats.uptimeMs);
}

function animateCounter(el, newValue) {
    const currentValue = parseInt(el.textContent) || 0;
    if (currentValue !== newValue) {
        el.textContent = newValue;
        el.classList.remove('counter-tick');
        void el.offsetWidth; // reflow
        el.classList.add('counter-tick');
    }
}

function formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m`;
}

// Periodically fetch stats
async function fetchStats() {
    try {
        const res = await fetch('/api/stats');
        const stats = await res.json();
        updateStats(stats);
    } catch (e) {
        console.error('Failed to fetch stats', e);
    }
}

setInterval(fetchStats, 15000);
fetchStats();

// ─── Feed Cleanup on Agent Delete ────────────────────────
function removeAgentFeedCards(agentId) {
    // Remove cards from DOM
    const cards = feedContainer.querySelectorAll(`.feed-card[data-agent-id="${agentId}"]`);
    cards.forEach(card => card.remove());

    // Remove from tracked items
    feedItems = feedItems.filter(item => item.agentId !== agentId);

    // Show empty state if no cards remain
    const remaining = feedContainer.querySelectorAll('.feed-card');
    if (remaining.length === 0 && emptyState) {
        emptyState.style.display = '';
    }
}

// ─── Sound ───────────────────────────────────────────────
function playSound() {
    if (isMuted) return;
    try {
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
        audio.volume = 0.3;
        audio.play().catch(() => { });
    } catch (e) { }
}

// ─── Toast System ────────────────────────────────────────
const toastContainer = document.getElementById('toast-container');

function showToast(message, type = 'info', duration = 4000) {
    const icons = {
        success: '✅',
        error: '❌',
        info: 'ℹ️',
        warning: '⚠️'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${icons[type]}</span>
        <span class="toast-msg">${message}</span>
        <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
    `;

    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('toast--exit');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ─── Feed Rendering ──────────────────────────────────────
function renderItem(data, isHistory = false) {
    const { item, agentName, agentId } = data;

    // Hide empty state
    if (emptyState && emptyState.parentNode === feedContainer) {
        emptyState.style.display = 'none';
    }

    // Track item for search
    feedItems.push(data);

    const card = document.createElement('div');
    card.className = `feed-card${item.isDeal ? ' feed-card--deal' : ''}`;
    card.dataset.agentId = agentId;
    card.dataset.itemId = item.id;
    card.dataset.timestamp = item.timestamp || Date.now();
    card.dataset.price = parsePrice(item.price);
    card.dataset.title = (item.title || '').toLowerCase();
    card.dataset.searchable = `${item.title} ${item.description || ''} ${item.location || ''} ${agentName}`.toLowerCase();

    // Apply current filter
    if (currentFilterId && currentFilterId !== agentId) {
        card.style.display = 'none';
    }

    // Apply current search
    const searchTerm = feedSearchInput.value.trim().toLowerCase();
    if (searchTerm && !card.dataset.searchable.includes(searchTerm)) {
        card.style.display = 'none';
    }

    // If history, don't animate
    if (isHistory) {
        card.style.animation = 'none';
    }

    const imgUrl = item.image || 'https://placehold.co/100x100/1a1a25/60607a?text=No+Img';
    const favClass = item.isFavorite ? 'feed-card-fav feed-card-fav--active' : 'feed-card-fav';
    const favEmoji = item.isFavorite ? '⭐' : '☆';
    const dealBadge = item.isDeal ? `<span class="deal-badge">🔥 DEAL</span>` : '';
    const source = item.source || 'kleinanzeigen';
    const sourceLabel = source === 'vinted' ? 'Vinted' : 'Kleinanzeigen';
    const sourceBadge = `<span class="feed-card-source feed-card-source--${source}">${sourceLabel}</span>`;

    card.innerHTML = `
        <div class="feed-card-image">
            <img src="${imgUrl}" alt="${escapeHtml(item.title)}" loading="lazy" onerror="this.src='https://placehold.co/100x100/1a1a25/60607a?text=Error'">
            <div class="feed-card-agent-tag">${escapeHtml(agentName)}</div>
            ${sourceBadge}
        </div>
        <div class="feed-card-body">
            <div class="feed-card-top">
                <div>
                    <h3 class="feed-card-title">
                        <a href="${item.link}" target="_blank" rel="noopener">${escapeHtml(item.title)}</a>
                    </h3>
                    <p class="feed-card-desc">${escapeHtml(item.description || 'No description')}</p>
                </div>
                <div style="text-align: right;">
                    <div class="feed-card-price">${escapeHtml(item.price)}</div>
                    ${dealBadge}
                </div>
            </div>
            <div class="feed-card-bottom">
                <div class="feed-card-meta">
                    <span>📍 ${escapeHtml(item.location || 'Unknown')}</span>
                    <span>🕒 ${escapeHtml(item.date)}</span>
                </div>
                <div class="feed-card-actions">
                    <button class="${favClass}" onclick="toggleFavorite(this, ${JSON.stringify(JSON.stringify(item))})" title="Add to Favorites">
                        ${favEmoji}
                    </button>
                    <a href="${item.link}" target="_blank" rel="noopener" class="feed-card-btn">View →</a>
                </div>
            </div>
        </div>
    `;

    // Insert based on current sort order
    if (currentSort === 'newest') {
        feedContainer.prepend(card);
    } else {
        feedContainer.appendChild(card);
        sortFeed(); // re-sort to place in correct position
    }

    if (isAutoscroll && !isHistory) {
        feedContainer.scrollTop = 0;
    }
}

// ─── Price Parser ────────────────────────────────────────
function parsePrice(priceStr) {
    if (!priceStr) return Infinity;
    const cleaned = priceStr.replace(/[^0-9.,]/g, '').replace('.', '').replace(',', '.');
    const num = parseFloat(cleaned);
    return isNaN(num) ? Infinity : num;
}

// ─── Feed Sorting ────────────────────────────────────────
function sortFeed() {
    const cards = Array.from(feedContainer.querySelectorAll('.feed-card'));
    if (cards.length === 0) return;

    cards.sort((a, b) => {
        switch (currentSort) {
            case 'newest':
                return Number(b.dataset.timestamp) - Number(a.dataset.timestamp);
            case 'oldest':
                return Number(a.dataset.timestamp) - Number(b.dataset.timestamp);
            case 'price-asc':
                return Number(a.dataset.price) - Number(b.dataset.price);
            case 'price-desc': {
                const pa = Number(a.dataset.price);
                const pb = Number(b.dataset.price);
                // put Infinity (no price) at the end
                if (pa === Infinity && pb === Infinity) return 0;
                if (pa === Infinity) return 1;
                if (pb === Infinity) return -1;
                return pb - pa;
            }
            case 'alpha':
                return (a.dataset.title || '').localeCompare(b.dataset.title || '', 'de');
            default:
                return 0;
        }
    });

    // Re-append in sorted order
    cards.forEach(card => feedContainer.appendChild(card));
}

// Sort event listener
feedSortSelect.addEventListener('change', (e) => {
    currentSort = e.target.value;
    sortFeed();
});

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ─── Agents ──────────────────────────────────────────────
async function fetchAgents() {
    try {
        const res = await fetch('/api/agents');
        const agents = await res.json();
        agentListEl.innerHTML = '';

        totalAgentCountEl.textContent = agents.length;

        // Update "All" button state
        const isAllActive = currentFilterId === null;
        filterAllBtn.className = `agent-card${isAllActive ? ' agent-card--active' : ''}`;

        agents.forEach(agent => {
            const isActive = currentFilterId === agent.id;
            const isDisabled = !agent.enabled;

            const card = document.createElement('div');
            card.className = `agent-card${isActive ? ' agent-card--active' : ''}${isDisabled ? ' agent-card--disabled' : ''}`;

            const info = document.createElement('div');
            info.className = 'agent-card-info';
            info.style.cursor = 'pointer';
            const mpIcon = agent.marketplace === 'vinted' ? '👗' : agent.marketplace === 'both' ? '🔄' : '🏷️';
            info.innerHTML = `
                <div class="agent-card-name">${mpIcon} ${escapeHtml(agent.name)}</div>
                <div class="agent-card-query">${escapeHtml(agent.query)}</div>
                <div class="agent-card-stats">
                    ${agent.totalFound || 0} found${agent.maxPrice ? ` · ≤${agent.maxPrice}€` : ''}
                </div>
            `;
            info.addEventListener('click', () => setFilter(agent.id));

            const actions = document.createElement('div');
            actions.className = 'agent-card-actions';

            // Toggle button
            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'agent-action-btn';
            toggleBtn.title = agent.enabled ? 'Pause' : 'Resume';
            toggleBtn.textContent = agent.enabled ? '⏸' : '▶';
            toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleAgentEnabled(agent.id);
            });

            // Edit button
            const editBtn = document.createElement('button');
            editBtn.className = 'agent-action-btn';
            editBtn.title = 'Edit';
            editBtn.textContent = '✏️';
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openEditAgent(agent);
            });

            // Delete button
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'agent-action-btn agent-action-btn--danger';
            deleteBtn.title = 'Delete';
            deleteBtn.textContent = '🗑️';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showConfirmDelete(agent.id);
            });

            actions.appendChild(toggleBtn);
            actions.appendChild(editBtn);
            actions.appendChild(deleteBtn);
            card.appendChild(info);
            card.appendChild(actions);
            agentListEl.appendChild(card);
        });
    } catch (e) {
        console.error('Failed to fetch agents', e);
    }
}

function setFilter(agentId) {
    currentFilterId = agentId;
    fetchAgents();

    const cards = document.querySelectorAll('.feed-card');
    const searchTerm = feedSearchInput.value.trim().toLowerCase();

    cards.forEach(card => {
        const matchesAgent = !agentId || card.dataset.agentId === agentId;
        const matchesSearch = !searchTerm || (card.dataset.searchable && card.dataset.searchable.includes(searchTerm));
        card.style.display = (matchesAgent && matchesSearch) ? 'flex' : 'none';
    });

    // Close mobile sidebar
    closeMobileSidebar();
}

async function toggleAgentEnabled(id) {
    try {
        await fetch(`/api/agents/${id}/toggle`, { method: 'PATCH' });
        fetchAgents();
        fetchStats();
    } catch (e) {
        showToast('Failed to toggle agent', 'error');
    }
}

// ─── Agent Modal (Create / Edit) ─────────────────────────
function openCreateAgent() {
    editingAgentId = null;
    modalTitle.textContent = 'Add New Agent';
    saveAgentBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
        Save Agent
    `;
    agentNameInput.value = '';
    agentQueryInput.value = '';
    agentMinPriceInput.value = '';
    agentMaxPriceInput.value = '';
    setMarketplaceRadio('kleinanzeigen');
    agentModal.classList.remove('hidden');
    agentNameInput.focus();
}

function openEditAgent(agent) {
    editingAgentId = agent.id;
    modalTitle.textContent = 'Edit Agent';
    saveAgentBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
        Update Agent
    `;
    agentNameInput.value = agent.name;
    agentQueryInput.value = agent.query;
    agentMinPriceInput.value = agent.minPrice || '';
    agentMaxPriceInput.value = agent.maxPrice || '';
    setMarketplaceRadio(agent.marketplace || 'kleinanzeigen');
    agentModal.classList.remove('hidden');
    agentNameInput.focus();
}

function closeAgentModal() {
    agentModal.classList.add('hidden');
    editingAgentId = null;
    agentNameInput.value = '';
    agentQueryInput.value = '';
    agentMinPriceInput.value = '';
    agentMaxPriceInput.value = '';
    setMarketplaceRadio('kleinanzeigen');
}

function getSelectedMarketplace() {
    const checked = document.querySelector('input[name="agent-marketplace"]:checked');
    return checked ? checked.value : 'kleinanzeigen';
}

function setMarketplaceRadio(value) {
    const radio = document.querySelector(`input[name="agent-marketplace"][value="${value}"]`);
    if (radio) radio.checked = true;
}

addAgentBtn.addEventListener('click', openCreateAgent);
cancelAgentBtn.addEventListener('click', closeAgentModal);

saveAgentBtn.addEventListener('click', async () => {
    const name = agentNameInput.value.trim();
    const query = agentQueryInput.value.trim();
    const minPrice = agentMinPriceInput.value.trim() || null;
    const maxPrice = agentMaxPriceInput.value.trim() || null;
    const marketplace = getSelectedMarketplace();

    if (!name || !query) {
        showToast('Please fill in name and query', 'warning');
        return;
    }

    const originalText = saveAgentBtn.innerHTML;
    saveAgentBtn.innerHTML = 'Saving...';
    saveAgentBtn.disabled = true;

    try {
        if (editingAgentId) {
            // Update
            const res = await fetch(`/api/agents/${editingAgentId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, query, minPrice, maxPrice, marketplace })
            });
            if (!res.ok) throw new Error('Failed to update');
        } else {
            // Create
            const res = await fetch('/api/agents', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, query, minPrice, maxPrice, marketplace })
            });
            if (!res.ok) throw new Error('Failed to create');
        }
        closeAgentModal();
        fetchAgents();
        fetchStats();
    } catch (e) {
        showToast(e.message || 'Error saving agent', 'error');
    } finally {
        saveAgentBtn.innerHTML = originalText;
        saveAgentBtn.disabled = false;
    }
});

// ─── Confirm Delete ──────────────────────────────────────
function showConfirmDelete(id) {
    agentToDelete = id;
    confirmModal.classList.remove('hidden');
}

function hideConfirmDelete() {
    agentToDelete = null;
    confirmModal.classList.add('hidden');
}

confirmCancelBtn.addEventListener('click', hideConfirmDelete);

confirmDeleteBtn.addEventListener('click', async () => {
    if (!agentToDelete) return;
    const id = agentToDelete;

    confirmDeleteBtn.textContent = 'Deleting...';
    confirmDeleteBtn.disabled = true;

    try {
        const res = await fetch(`/api/agents/${id}`, { method: 'DELETE' });
        if (res.ok) {
            if (currentFilterId === id) currentFilterId = null;
            fetchAgents();
            fetchStats();
            hideConfirmDelete();
        } else {
            showToast('Failed to delete agent', 'error');
        }
    } catch (e) {
        showToast('Network error', 'error');
    } finally {
        confirmDeleteBtn.textContent = 'Delete Agent';
        confirmDeleteBtn.disabled = false;
    }
});

// ─── Favorites ───────────────────────────────────────────
async function fetchFavorites() {
    try {
        const res = await fetch('/api/favorites');
        const favorites = await res.json();
        renderFavorites(favorites);
        favoritesCountEl.textContent = favorites.length;
    } catch (e) {
        console.error('Failed to fetch favorites', e);
    }
}

function renderFavorites(favorites) {
    if (favorites.length === 0) {
        favoritesList.innerHTML = `
            <div class="empty-state" style="padding: 2rem;">
                <p class="empty-state-text">No favorites yet.<br>Click ☆ on a listing to save it.</p>
            </div>
        `;
        return;
    }

    favoritesList.innerHTML = '';
    favorites.forEach(fav => {
        const card = document.createElement('div');
        card.className = 'fav-card';
        const imgUrl = fav.image || 'https://placehold.co/50x50/1a1a25/60607a?text=N';
        card.innerHTML = `
            <div class="fav-card-image">
                <img src="${imgUrl}" alt="" loading="lazy">
            </div>
            <div class="fav-card-info">
                <div class="fav-card-title"><a href="${fav.link}" target="_blank">${escapeHtml(fav.title)}</a></div>
                <div class="fav-card-price">${escapeHtml(fav.price)}</div>
            </div>
            <button class="fav-card-remove" onclick="removeFavorite('${fav.id}')" title="Remove">✕</button>
        `;
        favoritesList.appendChild(card);
    });
}

window.toggleFavorite = async function (btn, itemJson) {
    const item = JSON.parse(itemJson);
    const isActive = btn.classList.contains('feed-card-fav--active');

    if (isActive) {
        // Remove
        try {
            await fetch(`/api/favorites/${item.id}`, { method: 'DELETE' });
            btn.classList.remove('feed-card-fav--active');
            btn.textContent = '☆';
            showToast('Removed from favorites', 'info');
            fetchFavorites();
            fetchStats();
        } catch (e) {
            showToast('Failed to remove favorite', 'error');
        }
    } else {
        // Add
        try {
            const res = await fetch('/api/favorites', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ item })
            });
            if (res.ok) {
                btn.classList.add('feed-card-fav--active');
                btn.textContent = '⭐';
                showToast('Added to favorites', 'success');
                fetchFavorites();
                fetchStats();
            } else {
                showToast('Already in favorites', 'warning');
            }
        } catch (e) {
            showToast('Failed to add favorite', 'error');
        }
    }
};

window.removeFavorite = async function (id) {
    try {
        await fetch(`/api/favorites/${id}`, { method: 'DELETE' });
        showToast('Removed from favorites', 'info');
        fetchFavorites();
        fetchStats();
        // Update feed card if visible
        const feedCard = document.querySelector(`.feed-card[data-item-id="${id}"] .feed-card-fav`);
        if (feedCard) {
            feedCard.classList.remove('feed-card-fav--active');
            feedCard.textContent = '☆';
        }
    } catch (e) {
        showToast('Failed to remove', 'error');
    }
};

function toggleFavoritesPanel() {
    favoritesOpen = !favoritesOpen;
    favoritesPanel.classList.toggle('favorites-panel--open', favoritesOpen);
    if (favoritesOpen) fetchFavorites();
}

favoritesBtn.addEventListener('click', toggleFavoritesPanel);
closeFavoritesBtn.addEventListener('click', toggleFavoritesPanel);

// ─── Scan Button ─────────────────────────────────────────
scanBtn.addEventListener('click', async () => {
    if (scanBtn.disabled) return;

    scanBtn.disabled = true;
    scanBtn.classList.add('btn-tag--scanning');
    const originalHTML = scanBtn.innerHTML;

    try {
        const res = await fetch('/api/scan', { method: 'POST' });
        const data = await res.json();

        if (res.ok) {
            scanBtn.innerHTML = `<span>✓</span> Done`;
            scanBtn.classList.remove('btn-tag--scanning');
            scanBtn.classList.add('btn-tag--active');
            showToast('Scan complete', 'success');
            fetchStats();
            setTimeout(() => {
                scanBtn.innerHTML = originalHTML;
                scanBtn.className = 'btn btn-tag';
                scanBtn.disabled = false;
            }, 2000);
        } else {
            scanBtn.innerHTML = `<span>⏳</span> Wait`;
            scanBtn.classList.remove('btn-tag--scanning');
            showToast(data.error || 'Cooldown active', 'warning');
            setTimeout(() => {
                scanBtn.innerHTML = originalHTML;
                scanBtn.disabled = false;
            }, 2000);
        }
    } catch (e) {
        scanBtn.innerHTML = `❌ Error`;
        scanBtn.classList.remove('btn-tag--scanning');
        showToast('Scan failed', 'error');
        setTimeout(() => {
            scanBtn.innerHTML = originalHTML;
            scanBtn.disabled = false;
        }, 2000);
    }
});

// ─── Autoscroll ──────────────────────────────────────────
autoscrollBtn.addEventListener('click', () => {
    isAutoscroll = !isAutoscroll;
    autoscrollBtn.textContent = `Autoscroll: ${isAutoscroll ? 'ON' : 'OFF'}`;
    autoscrollBtn.classList.toggle('btn-tag--active', isAutoscroll);
});

// ─── Mute ────────────────────────────────────────────────
muteBtn.addEventListener('click', () => {
    isMuted = !isMuted;
    muteBtn.textContent = isMuted ? '🔇' : '🔊';
    muteBtn.classList.toggle('btn-tag--active', !isMuted);

    if (!isMuted) {
        playSound(); // trigger user gesture for audio
        showToast('Sound enabled', 'info');
    } else {
        showToast('Sound muted', 'info');
    }
});

// ─── Feed Search ─────────────────────────────────────────
feedSearchInput.addEventListener('input', () => {
    const term = feedSearchInput.value.trim().toLowerCase();
    const cards = document.querySelectorAll('.feed-card');

    cards.forEach(card => {
        const matchesAgent = !currentFilterId || card.dataset.agentId === currentFilterId;
        const matchesSearch = !term || (card.dataset.searchable && card.dataset.searchable.includes(term));
        card.style.display = (matchesAgent && matchesSearch) ? 'flex' : 'none';
    });
});

// ─── Mobile Sidebar ──────────────────────────────────────
function openMobileSidebar() {
    sidebar.classList.add('sidebar--open');
    sidebarOverlay.classList.add('sidebar-overlay--visible');
}

function closeMobileSidebar() {
    sidebar.classList.remove('sidebar--open');
    sidebarOverlay.classList.remove('sidebar-overlay--visible');
}

menuBtn.addEventListener('click', openMobileSidebar);
sidebarOverlay.addEventListener('click', closeMobileSidebar);

// ─── Keyboard Shortcuts ──────────────────────────────────
shortcutsBtn.addEventListener('click', () => {
    shortcutsModal.classList.remove('hidden');
});

closeShortcutsBtn.addEventListener('click', () => {
    shortcutsModal.classList.add('hidden');
});

document.addEventListener('keydown', (e) => {
    // Don't trigger shortcuts when typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        if (e.key === 'Escape') {
            e.target.blur();
        }
        return;
    }

    switch (e.key.toLowerCase()) {
        case 'n':
            e.preventDefault();
            openCreateAgent();
            break;
        case 's':
            e.preventDefault();
            scanBtn.click();
            break;
        case 'f':
            e.preventDefault();
            toggleFavoritesPanel();
            break;
        case 'm':
            e.preventDefault();
            muteBtn.click();
            break;
        case '/':
            e.preventDefault();
            feedSearchInput.focus();
            break;
        case '?':
            e.preventDefault();
            shortcutsModal.classList.toggle('hidden');
            break;
        case 'escape':
            // Close any open modal/panel
            if (!agentModal.classList.contains('hidden')) closeAgentModal();
            else if (!confirmModal.classList.contains('hidden')) hideConfirmDelete();
            else if (!shortcutsModal.classList.contains('hidden')) shortcutsModal.classList.add('hidden');
            else if (favoritesOpen) toggleFavoritesPanel();
            else closeMobileSidebar();
            break;
    }
});

// Close modals on backdrop click
document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', () => {
        const modal = backdrop.closest('.modal');
        if (modal) modal.classList.add('hidden');
        editingAgentId = null;
        agentToDelete = null;
    });
});

// ─── Initialize ──────────────────────────────────────────
fetchAgents();
fetchFavorites();
