// Recent games page logic

let currentPage = 1;
const gamesPerPage = 5;
let totalGames = 0;

document.addEventListener("DOMContentLoaded", () => {
  loadRecentGames(1);
});

// Make loadRecentGames globally accessible for onclick handlers
window.loadRecentGames = async function (page) {
  const container = document.getElementById("recent-games-container");
  const paginationContainer = document.getElementById("pagination-container");
  if (!container) return;

  try {
    container.innerHTML = '<p class="text-orange-500">Loading games...</p>';

    // Calculate offset: page 1 = 0, page 2 = 5, page 3 = 10, etc.
    const offset = (page - 1) * gamesPerPage;

    // Always include total count to calculate total pages
    const response = await window.ceepsAPI.getRecentGames(
      gamesPerPage,
      offset,
      true
    );

    // Handle response format - should be { games: [], total: number } when includeTotal is true
    let games;
    if (Array.isArray(response)) {
      // Old format (array) - shouldn't happen when includeTotal is true, but handle it
      games = response;
      totalGames = games.length;
    } else if (response && response.games) {
      // New format with games and total
      games = response.games;
      totalGames =
        response.total !== undefined ? parseInt(response.total) : games.length;
    } else {
      // Fallback
      games = [];
      totalGames = 0;
    }

    if (games.length === 0) {
      container.innerHTML =
        '<p class="text-orange-500">No games found. Be the first to submit a result!</p>';
      if (paginationContainer) {
        paginationContainer.innerHTML = "";
      }
      return;
    }

    container.innerHTML = games.map((game) => createGameCard(game)).join("");
    currentPage = page;

    // Render pagination controls
    renderPagination();
  } catch (error) {
    container.innerHTML = `<p class="text-red-500">Error loading games: ${error.message}</p>`;
    if (paginationContainer) {
      paginationContainer.innerHTML = "";
    }
  }
};

function renderPagination() {
  const paginationContainer = document.getElementById("pagination-container");
  if (!paginationContainer) {
    return;
  }

  const totalPages = Math.ceil(totalGames / gamesPerPage);

  if (totalPages <= 1) {
    paginationContainer.innerHTML = "";
    return;
  }

  let paginationHTML =
    '<div class="flex flex-wrap justify-center items-center gap-2">';

  // Previous button
  if (currentPage > 1) {
    paginationHTML += `
      <button 
        onclick="loadRecentGames(${currentPage - 1})" 
        class="nav-button bg-gray-600 hover:bg-gray-700 px-4 py-2"
      >
        Previous
      </button>
    `;
  }

  // Page numbers
  const maxPagesToShow = 7;
  let startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
  let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);

  // Adjust if we're near the end
  if (endPage - startPage < maxPagesToShow - 1) {
    startPage = Math.max(1, endPage - maxPagesToShow + 1);
  }

  // Show first page if not in range
  if (startPage > 1) {
    paginationHTML += `
      <button 
        onclick="loadRecentGames(1)" 
        class="nav-button px-4 py-2 ${
          currentPage === 1 ? "bg-orange-600" : "bg-gray-600 hover:bg-gray-700"
        }"
      >
        1
      </button>
    `;
    if (startPage > 2) {
      paginationHTML += '<span class="text-white px-2">...</span>';
    }
  }

  // Show page numbers in range
  for (let i = startPage; i <= endPage; i++) {
    paginationHTML += `
      <button 
        onclick="loadRecentGames(${i})" 
        class="nav-button px-4 py-2 ${
          currentPage === i ? "bg-orange-600" : "bg-gray-600 hover:bg-gray-700"
        }"
      >
        ${i}
      </button>
    `;
  }

  // Show last page if not in range
  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      paginationHTML += '<span class="text-white px-2">...</span>';
    }
    paginationHTML += `
      <button 
        onclick="loadRecentGames(${totalPages})" 
        class="nav-button px-4 py-2 ${
          currentPage === totalPages
            ? "bg-orange-600"
            : "bg-gray-600 hover:bg-gray-700"
        }"
      >
        ${totalPages}
      </button>
    `;
  }

  // Next button
  if (currentPage < totalPages) {
    paginationHTML += `
      <button 
        onclick="loadRecentGames(${currentPage + 1})" 
        class="nav-button bg-gray-600 hover:bg-gray-700 px-4 py-2"
      >
        Next
      </button>
    `;
  }

  paginationHTML += "</div>";
  paginationContainer.innerHTML = paginationHTML;
}

function createGameCard(game) {
  const winnerTeam = game.winner === "team1" ? game.team1 : game.team2;
  const loserTeam = game.winner === "team1" ? game.team2 : game.team1;
  const winnerScore =
    game.winner === "team1" ? game.team1_score : game.team2_score;
  const loserScore =
    game.winner === "team1" ? game.team2_score : game.team1_score;
  const individualStats = game.individual_stats || {};

  return `
    <div class="game-card">
      <div class="flex justify-between items-start mb-4">
        <h3 class="text-xl font-bold text-orange-500">Game on ${formatDate(
          game.date
        )}</h3>
      </div>
      
      <div class="grid grid-cols-2 gap-4 mb-4">
        <div>
          <h4 class="font-bold text-green-500 mb-2">Winners (${winnerScore} cups)</h4>
          <ul class="list-none space-y-1">
            ${winnerTeam
              .map((player) => {
                const cupsHit = individualStats[player] || 0;
                return `<li class="text-white">${player} - ${cupsHit} cups</li>`;
              })
              .join("")}
          </ul>
        </div>
        <div>
          <h4 class="font-bold text-red-500 mb-2">Losers (${loserScore} cups)</h4>
          <ul class="list-none space-y-1">
            ${loserTeam
              .map((player) => {
                const cupsHit = individualStats[player] || 0;
                return `<li class="text-white">${player} - ${cupsHit} cups</li>`;
              })
              .join("")}
          </ul>
        </div>
      </div>

      <div class="text-sm text-gray-400 mt-4">
        <p>Scorecard: <span class="text-orange-500 font-bold">${
          game.scorecard_player
        }</span></p>
      </div>
    </div>
  `;
}

function formatDate(dateString) {
  try {
    // Parse YYYY-MM-DD format and create date in local timezone
    // This prevents timezone issues where UTC dates shift by one day
    if (
      typeof dateString === "string" &&
      dateString.match(/^\d{4}-\d{2}-\d{2}$/)
    ) {
      const [year, month, day] = dateString.split("-").map(Number);
      const date = new Date(year, month - 1, day); // month is 0-indexed
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    }
    // Fallback for other formats
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return dateString;
  }
}
