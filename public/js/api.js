// API helper functions for making requests to the backend

const API_BASE = '/api';

async function apiRequest(endpoint, options = {}) {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Request failed');
    }

    return await response.json();
  } catch (error) {
    console.error('API request failed:', error);
    throw error;
  }
}

// Submit a game result
async function submitGameResult(gameData) {
  return apiRequest('/submit-result', {
    method: 'POST',
    body: JSON.stringify(gameData)
  });
}

// Get recent games
async function getRecentGames(limit = 10) {
  return apiRequest(`/recent-games?limit=${limit}`);
}

// Get player stats
async function getPlayerStats(playerName) {
  return apiRequest(`/player-stats/${encodeURIComponent(playerName)}`);
}

// Get leaderboard
async function getLeaderboard(sortBy = 'win_ratio', limit = 20) {
  return apiRequest(`/leaderboard?sort_by=${sortBy}&limit=${limit}`);
}

// Get all players
async function getAllPlayers() {
  return apiRequest('/players');
}

// Export for use in other files
window.ceepsAPI = {
  submitGameResult,
  getRecentGames,
  getPlayerStats,
  getLeaderboard,
  getAllPlayers
};

