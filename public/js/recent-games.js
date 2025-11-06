// Recent games page logic

document.addEventListener('DOMContentLoaded', () => {
  loadRecentGames();
});

async function loadRecentGames(limit = 10) {
  const container = document.getElementById('recent-games-container');
  if (!container) return;

  try {
    container.innerHTML = '<p class="text-orange-500">Loading games...</p>';
    const games = await window.ceepsAPI.getRecentGames(limit);

    if (games.length === 0) {
      container.innerHTML = '<p class="text-orange-500">No games found. Be the first to submit a result!</p>';
      return;
    }

    container.innerHTML = games.map(game => createGameCard(game)).join('');
  } catch (error) {
    container.innerHTML = `<p class="text-red-500">Error loading games: ${error.message}</p>`;
  }
}

function createGameCard(game) {
  const winnerTeam = game.winner === 'team1' ? game.team1 : game.team2;
  const loserTeam = game.winner === 'team1' ? game.team2 : game.team1;
  const winnerScore = game.winner === 'team1' ? game.team1_score : game.team2_score;
  const loserScore = game.winner === 'team1' ? game.team2_score : game.team1_score;
  const otBadge = game.overtime ? '<span class="bg-yellow-500 text-black px-2 py-1 rounded text-xs ml-2">OT</span>' : '';

  return `
    <div class="game-card">
      <div class="flex justify-between items-start mb-4">
        <h3 class="text-xl font-bold text-orange-500">Game on ${formatDate(game.date)}</h3>
        ${otBadge}
      </div>
      
      <div class="grid grid-cols-2 gap-4 mb-4">
        <div>
          <h4 class="font-bold text-green-500 mb-2">Winners (${winnerScore} cups)</h4>
          <ul class="list-none space-y-1">
            ${winnerTeam.map(player => `<li class="text-white">${player}</li>`).join('')}
          </ul>
        </div>
        <div>
          <h4 class="font-bold text-red-500 mb-2">Losers (${loserScore} cups)</h4>
          <ul class="list-none space-y-1">
            ${loserTeam.map(player => `<li class="text-white">${player}</li>`).join('')}
          </ul>
        </div>
      </div>

      <div class="text-sm text-gray-400 mt-4">
        <p>Scorecard: <span class="text-orange-500 font-bold">${game.scorecard_player}</span></p>
        ${game.overtime ? `<p>OT Cups - Team 1: ${game.team1_ot_cups}, Team 2: ${game.team2_ot_cups}</p>` : ''}
      </div>
    </div>
  `;
}

function formatDate(dateString) {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return dateString;
  }
}

