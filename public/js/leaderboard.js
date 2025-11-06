// Leaderboard page logic

document.addEventListener('DOMContentLoaded', () => {
  const sortSelect = document.getElementById('sort-by');
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      loadLeaderboard(e.target.value);
    });
  }
  
  loadLeaderboard('win_ratio');
});

async function loadLeaderboard(sortBy = 'win_ratio') {
  const container = document.getElementById('leaderboard-container');
  if (!container) return;

  try {
    container.innerHTML = '<p class="text-orange-500">Loading leaderboard...</p>';
    const leaderboard = await window.ceepsAPI.getLeaderboard(sortBy, 50);

    if (leaderboard.length === 0) {
      container.innerHTML = '<p class="text-orange-500">No players found.</p>';
      return;
    }

    container.innerHTML = `
      <div class="overflow-x-auto">
        <table class="w-full text-left">
          <thead>
            <tr class="border-b border-orange-500">
              <th class="p-3 text-orange-500">Rank</th>
              <th class="p-3 text-orange-500">Player</th>
              <th class="p-3 text-orange-500">Games</th>
              <th class="p-3 text-orange-500">Wins</th>
              <th class="p-3 text-orange-500">Win Rate</th>
              <th class="p-3 text-orange-500">Avg Cups</th>
              <th class="p-3 text-orange-500">Total Cups</th>
              <th class="p-3 text-orange-500">Scorecards</th>
            </tr>
          </thead>
          <tbody>
            ${leaderboard.map(player => createLeaderboardRow(player)).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (error) {
    container.innerHTML = `<p class="text-red-500">Error loading leaderboard: ${error.message}</p>`;
  }
}

function createLeaderboardRow(player) {
  const winRatePercent = (player.win_ratio * 100).toFixed(1);
  
  return `
    <tr class="border-b border-gray-700 hover:bg-black hover:bg-opacity-50">
      <td class="p-3 text-white font-bold">#${player.rank}</td>
      <td class="p-3 text-orange-500 font-bold">${player.player_name}</td>
      <td class="p-3 text-white">${player.games_played}</td>
      <td class="p-3 text-white">${player.games_won}</td>
      <td class="p-3 text-white">${winRatePercent}%</td>
      <td class="p-3 text-white">${player.cups_hit_avg.toFixed(1)}</td>
      <td class="p-3 text-white">${player.total_cups_hit}</td>
      <td class="p-3 text-yellow-500">${player.number_of_scorecards}</td>
    </tr>
  `;
}

