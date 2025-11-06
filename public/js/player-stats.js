// Player stats page logic

document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('player-search');
  const searchButton = document.getElementById('search-button');

  if (searchButton) {
    searchButton.addEventListener('click', () => {
      const playerName = searchInput?.value.trim();
      if (playerName) {
        loadPlayerStats(playerName);
      }
    });
  }

  if (searchInput) {
    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const playerName = searchInput.value.trim();
        if (playerName) {
          loadPlayerStats(playerName);
        }
      }
    });
  }

  // Load all players for autocomplete
  loadPlayerList();
});

async function loadPlayerList() {
  try {
    const players = await window.ceepsAPI.getAllPlayers();
    const searchInput = document.getElementById('player-search');
    if (searchInput && players.length > 0) {
      // Create datalist for autocomplete
      const datalist = document.createElement('datalist');
      datalist.id = 'players-list';
      players.forEach(player => {
        const option = document.createElement('option');
        option.value = player;
        datalist.appendChild(option);
      });
      searchInput.setAttribute('list', 'players-list');
      document.body.appendChild(datalist);
    }
  } catch (error) {
    console.error('Failed to load players:', error);
  }
}

async function loadPlayerStats(playerName) {
  const container = document.getElementById('player-stats-container');
  if (!container) return;

  try {
    container.innerHTML = '<p class="text-orange-500">Loading stats...</p>';
    const stats = await window.ceepsAPI.getPlayerStats(playerName);

    container.innerHTML = createPlayerStatsCard(stats);
  } catch (error) {
    if (error.message.includes('404') || error.message.includes('not found')) {
      container.innerHTML = `<p class="text-red-500">Player "${playerName}" not found.</p>`;
    } else {
      container.innerHTML = `<p class="text-red-500">Error loading stats: ${error.message}</p>`;
    }
  }
}

function createPlayerStatsCard(stats) {
  const winRatePercent = (stats.win_ratio * 100).toFixed(1);
  
  return `
    <div class="stat-card max-w-2xl mx-auto">
      <h2 class="text-3xl font-bold text-orange-500 mb-6">${stats.player_name}</h2>
      
      <div class="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <div class="bg-black bg-opacity-50 p-4 rounded">
          <div class="text-gray-400 text-sm">Games Played</div>
          <div class="text-2xl font-bold text-white">${stats.games_played}</div>
        </div>
        
        <div class="bg-black bg-opacity-50 p-4 rounded">
          <div class="text-gray-400 text-sm">Games Won</div>
          <div class="text-2xl font-bold text-green-500">${stats.games_won}</div>
        </div>
        
        <div class="bg-black bg-opacity-50 p-4 rounded">
          <div class="text-gray-400 text-sm">Win Rate</div>
          <div class="text-2xl font-bold text-white">${winRatePercent}%</div>
        </div>
        
        <div class="bg-black bg-opacity-50 p-4 rounded">
          <div class="text-gray-400 text-sm">Avg Cups/Game</div>
          <div class="text-2xl font-bold text-orange-500">${stats.cups_hit_avg.toFixed(1)}</div>
        </div>
        
        <div class="bg-black bg-opacity-50 p-4 rounded">
          <div class="text-gray-400 text-sm">Total Cups</div>
          <div class="text-2xl font-bold text-white">${stats.total_cups_hit}</div>
        </div>
        
        <div class="bg-black bg-opacity-50 p-4 rounded">
          <div class="text-gray-400 text-sm">Scorecards</div>
          <div class="text-2xl font-bold text-yellow-500">${stats.number_of_scorecards}</div>
        </div>
      </div>

      ${stats.total_ot_cups_hit > 0 ? `
        <div class="bg-yellow-900 bg-opacity-50 p-4 rounded mb-4">
          <div class="text-yellow-400 text-sm">OT Cups Hit</div>
          <div class="text-xl font-bold text-yellow-500">${stats.total_ot_cups_hit}</div>
        </div>
      ` : ''}

      ${stats.naked_laps_run > 0 ? `
        <div class="bg-red-900 bg-opacity-50 p-4 rounded">
          <div class="text-red-400 text-sm">Naked Laps Run</div>
          <div class="text-xl font-bold text-red-500">${stats.naked_laps_run}</div>
        </div>
      ` : ''}
    </div>
  `;
}

