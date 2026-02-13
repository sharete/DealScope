# DealScope 🦅

**DealScope** is a real-time "Trading Desk" for Kleinanzeigen. It monitors search queries and alerts you instantly when new items appear, giving you a competitive edge in finding great deals.

![DealScope Dashboard](https://github.com/user-attachments/assets/placeholder) 
*(Note: Add screenshot here)*

## ✨ Features

*   **🕵️‍♂️ Multi-Agent Monitoring**: create multiple search agents for different items (e.g., "iPhone 15 Pro", "MacBook M3").
*   **⚡ Real-Time Feed**: New listings appear instantly via WebSocket connection.
*   **🔔 Instant Alerts**: Visual highlighters and audio cues ("Ka-ching!") when a deal is found.
*   **🧠 Smart Filtering**: Click on an agent in the sidebar to isolate their specific finds.
*   **📜 Autoscroll Control**: Toggle auto-scrolling to stay on top of the feed or browse history at your own pace.
*   **↻ Manual Scan**: Force an immediate update (with built-in cooldown protection to prevent IP bans).
*   **🛡️ Ban Protection**: Randomized polling intervals and duplicate detection.

## 🚀 Quick Start

### Prerequisites
*   Node.js (v18 or higher)
*   npm

### Installation

1.  **Clone the repository**
    ```bash
    git clone https://github.com/yourusername/dealscope.git
    cd dealscope
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Start the server**
    ```bash
    npm start
    ```

4.  **Open the Dashboard**
    Navigate to `http://localhost:3000` in your browser.

## 📖 Usage

1.  **Create an Agent**: Click **"+ New Agent"**, enter a Name (e.g., "Vespa") and the Search Query (e.g., "Vespa 50n").
2.  **Wait for Deals**: The system checks Kleinanzeigen periodically. New items will pop up in the feed.
3.  **Manual Refresh**: If you can't wait, hit the **"↻ Scan"** button in the header (limit: once every 10s).
4.  **Manage**: Delete agents you no longer need using the trash icon 🗑️.

## ⚙️ Configuration
Agents are stored in `config/agents.json`. You can edit this file manually or use the UI.

## ⚠️ Disclaimer
This tool is for educational purposes only. Use responsibly and respect the platform's terms of service. Excessive scraping may lead to IP blocks. DealScope includes rate limiting to help mitigate this, but use at your own risk.

## 📝 License
MIT
