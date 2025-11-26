// Leaderboard page logic

document.addEventListener("DOMContentLoaded", () => {
  const sortSelect = document.getElementById("sort-by");
  if (sortSelect) {
    sortSelect.addEventListener("change", (e) => {
      loadLeaderboard(e.target.value);
    });
  }

  loadLeaderboard("cups_hit_avg");
});

async function loadLeaderboard(sortBy = "cups_hit_avg") {
  const container = document.getElementById("leaderboard-container");
  if (!container) return;

  try {
    container.innerHTML =
      '<p class="text-orange-500">Loading leaderboard...</p>';
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
            ${leaderboard
              .map((player) => createLeaderboardRow(player))
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  } catch (error) {
    container.innerHTML = `<p class="text-red-500">Error loading leaderboard: ${error.message}</p>`;
  }
}

function createLeaderboardRow(player) {
  // Safely handle all numeric values with defaults
  const winRatePercent = ((player.win_ratio || 0) * 100).toFixed(1);
  const cupsHitAvg = (player.cups_hit_avg || 0).toFixed(1);
  const gamesPlayed = player.games_played || 0;
  const gamesWon = player.games_won || 0;
  const totalCupsHit = player.total_cups_hit || 0;
  const scorecards = player.number_of_scorecards || 0;
  const playerName = player.player_name || "Unknown";
  const rank = player.rank || 0;

  return `
    <tr class="border-b border-gray-700 hover:bg-black hover:bg-opacity-50">
      <td class="p-3 text-white font-bold">#${rank}</td>
      <td class="p-3 text-orange-500 font-bold">${playerName}</td>
      <td class="p-3 text-white">${gamesPlayed}</td>
      <td class="p-3 text-white">${gamesWon}</td>
      <td class="p-3 text-white">${winRatePercent}%</td>
      <td class="p-3 text-white">${cupsHitAvg}</td>
      <td class="p-3 text-white">${totalCupsHit}</td>
      <td class="p-3 text-yellow-500">${scorecards}</td>
    </tr>
  `;
}
