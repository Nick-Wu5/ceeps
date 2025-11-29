// Player stats page logic

document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.getElementById("player-search");

  // Load player list for autocomplete
  loadPlayerList();

  // Handle search/selection
  if (searchInput) {
    searchInput.addEventListener("change", (e) => {
      const playerName = e.target.value.trim();
      if (playerName) {
        loadPlayerStats(playerName);
      } else {
        clearStats();
      }
    });

    // Also allow Enter key to search
    searchInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        const playerName = e.target.value.trim();
        if (playerName) {
          loadPlayerStats(playerName);
        }
      }
    });
  }
});

async function loadPlayerList() {
  try {
    const players = await window.ceepsAPI.getAllPlayers();
    const datalist = document.getElementById("players-list");
    if (datalist && players.length > 0) {
      datalist.innerHTML = "";
      players.forEach((player) => {
        const option = document.createElement("option");
        option.value = player;
        datalist.appendChild(option);
      });
    }
  } catch (error) {
    console.error("Failed to load players:", error);
  }
}

async function loadPlayerStats(playerName) {
  const container = document.getElementById("player-stats-container");
  if (!container) return;

  // Handle Guest player - stats are not tracked
  if (playerName === "Guest") {
    container.innerHTML = `
      <div class="bg-black bg-opacity-70 p-6 rounded-lg text-center">
        <h2 class="text-2xl font-bold text-orange-500 mb-4">Guest Stats</h2>
        <p class="text-white text-lg mb-2">
          Guest stats are not tracked.
        </p>
        <p class="text-gray-400">
          Guest is used for games with non-regular players and can appear up to twice per game (once per team).
        </p>
      </div>
    `;
    return;
  }

  try {
    container.innerHTML =
      '<p class="text-orange-500 text-center">Loading stats...</p>';

    const stats = await window.ceepsAPI.getPlayerStats(playerName);
    container.innerHTML = createFullStatsCard(playerName, stats);
  } catch (error) {
    console.error("Failed to load player stats:", error);
    container.innerHTML = `<p class="text-red-500 text-center">Error loading stats: ${error.message}</p>`;
  }
}

function clearStats() {
  const container = document.getElementById("player-stats-container");
  if (container) {
    container.innerHTML = "";
  }
}

function createFullStatsCard(playerName, stats) {
  const winRatePercent = (stats.win_ratio * 100).toFixed(1);

  return `
    <div class="bg-black bg-opacity-70 border-2 border-orange-500 rounded-lg p-6">
      <h2 class="text-3xl font-bold text-orange-500 mb-6 text-center">${playerName}</h2>
      
      <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div class="bg-black bg-opacity-50 p-4 rounded">
          <div class="text-gray-400 text-sm">Games Played</div>
          <div class="text-2xl font-bold text-white">${stats.games_played}</div>
        </div>
        
        <div class="bg-black bg-opacity-50 p-4 rounded">
          <div class="text-gray-400 text-sm">Games Won</div>
          <div class="text-2xl font-bold text-green-500">${
            stats.games_won
          }</div>
        </div>
        
        <div class="bg-black bg-opacity-50 p-4 rounded">
          <div class="text-gray-400 text-sm">Win Rate</div>
          <div class="text-2xl font-bold text-white">${winRatePercent}%</div>
        </div>
        
        <div class="bg-black bg-opacity-50 p-4 rounded">
          <div class="text-gray-400 text-sm">Avg Cups/Game</div>
          <div class="text-2xl font-bold text-orange-500">${stats.cups_hit_avg.toFixed(
            1
          )}</div>
        </div>
        
        <div class="bg-black bg-opacity-50 p-4 rounded">
          <div class="text-gray-400 text-sm">Total Cups</div>
          <div class="text-2xl font-bold text-white">${
            stats.total_cups_hit
          }</div>
        </div>
        
        <div class="bg-black bg-opacity-50 p-4 rounded">
          <div class="text-gray-400 text-sm">Scorecards</div>
          <div class="text-2xl font-bold text-yellow-500">${
            stats.number_of_scorecards
          }</div>
        </div>
        
        <div class="bg-black bg-opacity-50 p-4 rounded">
          <div class="text-gray-400 text-sm">Naked Laps Run</div>
          <div class="text-2xl font-bold text-red-500">${
            stats.naked_laps_run || 0
          }</div>
        </div>
        
        <div class="bg-black bg-opacity-50 p-4 rounded">
          <div class="text-gray-400 text-sm">Total Errors</div>
          <div class="text-2xl font-bold text-orange-500">${
            stats.total_errors || 0
          }</div>
        </div>
        
        <div class="bg-black bg-opacity-50 p-4 rounded">
          <div class="text-gray-400 text-sm">Max Cups</div>
          <div class="text-2xl font-bold text-white">${
            stats.max_cups_hit || 0
          }</div>
        </div>
      </div>
    </div>
  `;
}
