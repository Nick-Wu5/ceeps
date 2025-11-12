// Submit results page logic

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("submit-game-form");
  const messageDiv = document.getElementById("message");
  const reviewConfirmation = document.getElementById("review-confirmation");
  const tiebreakerModal = document.getElementById("tiebreaker-modal");

  if (!form) return;

  // Load existing players for autocomplete
  loadPlayers();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    try {
      // Collect form data
      const formData = new FormData(form);
      const team1 = [
        formData.get("team1_player1"),
        formData.get("team1_player2"),
        formData.get("team1_player3"),
        formData.get("team1_player4"),
      ];
      const team2 = [
        formData.get("team2_player1"),
        formData.get("team2_player2"),
        formData.get("team2_player3"),
        formData.get("team2_player4"),
      ];

      // Collect individual stats
      const individualStats = {};
      const allPlayers = [...team1, ...team2];

      allPlayers.forEach((playerName, index) => {
        if (playerName) {
          const team = index < 4 ? "team1" : "team2";
          const playerNum = (index % 4) + 1;
          individualStats[playerName] = {
            cups_hit: parseInt(
              formData.get(`${team}_player${playerNum}_cups`) || 0
            ),
            naked_laps: 0, // Will be set in confirmation screen
            team: team,
          };
        }
      });

      // Calculate team scores
      const team1_score = team1.reduce((sum, player) => {
        return sum + (individualStats[player]?.cups_hit || 0);
      }, 0);
      const team2_score = team2.reduce((sum, player) => {
        return sum + (individualStats[player]?.cups_hit || 0);
      }, 0);

      // Auto-calculate winner
      let winner;
      if (team1_score > team2_score) {
        winner = "team1";
      } else if (team2_score > team1_score) {
        winner = "team2";
      } else {
        // Tie - need user input
        showMessage(
          "Game ended in a tie. Please manually select the winner.",
          "error"
        );
        return;
      }

      // Auto-calculate scorecard player (most cups on winning team)
      const winningTeam = winner === "team1" ? team1 : team2;
      const winningTeamStats = winningTeam.map((player) => ({
        name: player,
        cups: individualStats[player]?.cups_hit || 0,
      }));

      // Find max cups
      const maxCups = Math.max(...winningTeamStats.map((s) => s.cups));
      const topPlayers = winningTeamStats.filter((s) => s.cups === maxCups);

      let scorecardPlayer;
      let scorecardTiedPlayers = null;
      if (topPlayers.length === 1) {
        scorecardPlayer = topPlayers[0].name;
      } else {
        // Tie - will be resolved in confirmation screen
        scorecardTiedPlayers = topPlayers.map((p) => p.name);
        scorecardPlayer = null; // Will be set in confirmation screen
      }

      // Prepare game data
      const gameData = {
        date: formData.get("date"),
        team1,
        team2,
        winner,
        team1_score,
        team2_score,
        scorecard_player: scorecardPlayer,
        scorecard_tied_players: scorecardTiedPlayers, // Store tied players if there's a tie
        individual_stats: individualStats,
      };

      // Store game data for final submission
      window.pendingGameData = gameData;

      // Show review confirmation
      showReviewConfirmation(gameData);
    } catch (error) {
      console.error("Error in form submission:", error);
      showMessage(`Error: ${error.message}`, "error");
    }
  });

  // Finalize submission button
  const finalizeBtn = document.getElementById("finalize-submission");
  if (finalizeBtn) {
    finalizeBtn.addEventListener("click", async () => {
      if (!window.pendingGameData) return;

      // Check if scorecard needs to be selected (tie scenario)
      if (
        !window.pendingGameData.scorecard_player &&
        window.pendingGameData.scorecard_tied_players
      ) {
        const selected = document.querySelector(
          'input[name="scorecard-tiebreaker"]:checked'
        );
        if (!selected) {
          showMessage("Please select the scorecard winner.", "error");
          return;
        }
        window.pendingGameData.scorecard_player = selected.value;
      }

      // Collect naked lap counts from confirmation inputs
      const losingTeam =
        window.pendingGameData.winner === "team1"
          ? window.pendingGameData.team2
          : window.pendingGameData.team1;
      losingTeam.forEach((player) => {
        // Create safe ID (replace spaces and special chars)
        const playerId = player.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
        const input = document.getElementById(`naked-laps-${playerId}`);
        if (input) {
          const nakedLaps = parseInt(input.value) || 0;
          window.pendingGameData.individual_stats[player].naked_laps =
            nakedLaps;
          // Also set naked_lap boolean for API compatibility (true if > 0)
          window.pendingGameData.individual_stats[player].naked_lap =
            nakedLaps > 0;
        }
      });

      try {
        showMessage("Submitting game result...", "info");
        const result = await window.ceepsAPI.submitGameResult(
          window.pendingGameData
        );

        if (result.success) {
          // Redirect to home page immediately
          window.location.href = "home.html";
        }
      } catch (error) {
        showMessage(`Error: ${error.message}`, "error");
      }
    });
  }

  // Edit form button
  const editBtn = document.getElementById("edit-form");
  if (editBtn) {
    editBtn.addEventListener("click", () => {
      // Hide review confirmation
      reviewConfirmation.classList.add("hidden");
      reviewConfirmation.style.display = "none";
      // Show form - remove inline style to let CSS take over
      form.style.display = "";
      form.classList.remove("hidden");
    });
  }
});

async function loadPlayers() {
  try {
    const players = await window.ceepsAPI.getAllPlayers();

    // Populate datalist for autocomplete
    const datalist = document.getElementById("players-list");
    if (datalist && players.length > 0) {
      datalist.innerHTML = players
        .map((player) => `<option value="${player}">${player}</option>`)
        .join("");
    }
  } catch (error) {
    console.error("Failed to load players:", error);
  }
}

function promptTiebreaker(players) {
  return new Promise((resolve) => {
    const modal = document.getElementById("tiebreaker-modal");
    const optionsDiv = document.getElementById("tiebreaker-options");
    const confirmBtn = document.getElementById("confirm-tiebreaker");

    if (!modal || !optionsDiv || !confirmBtn) {
      // Resolve with first player as fallback
      resolve(players[0]);
      return;
    }

    // Clear previous options
    optionsDiv.innerHTML = "";

    // Create radio buttons for each player
    players.forEach((player, index) => {
      const label = document.createElement("label");
      label.className =
        "flex items-center text-white p-2 hover:bg-gray-800 rounded cursor-pointer";
      label.innerHTML = `
        <input type="radio" name="tiebreaker-player" value="${player}" ${
        index === 0 ? "checked" : ""
      } class="mr-2">
        ${player}
      `;
      optionsDiv.appendChild(label);
    });

    // Show modal
    modal.classList.remove("hidden");
    modal.style.display = "flex";

    // Handle confirmation
    const handleConfirm = () => {
      const selected = document.querySelector(
        'input[name="tiebreaker-player"]:checked'
      );
      if (selected) {
        modal.classList.add("hidden");
        modal.style.display = "none";
        resolve(selected.value);
      }
    };

    // Remove old listeners and add new one
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    newConfirmBtn.addEventListener("click", handleConfirm);
  });
}

function showReviewConfirmation(gameData) {
  const form = document.getElementById("submit-game-form");
  const reviewConfirmation = document.getElementById("review-confirmation");

  if (!form || !reviewConfirmation) {
    return;
  }

  // Hide form
  form.style.display = "none";

  // Format date
  const dateObj = new Date(gameData.date + "T00:00:00");
  const formattedDate = dateObj.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const dateEl = document.getElementById("review-date");
  if (dateEl) dateEl.textContent = formattedDate;

  // Determine winners and losers
  const winningTeam =
    gameData.winner === "team1" ? gameData.team1 : gameData.team2;
  const losingTeam =
    gameData.winner === "team1" ? gameData.team2 : gameData.team1;
  const winningScore =
    gameData.winner === "team1" ? gameData.team1_score : gameData.team2_score;
  const losingScore =
    gameData.winner === "team1" ? gameData.team2_score : gameData.team1_score;
  const scorecardPlayer = gameData.scorecard_player;

  // Set headers
  const winnersHeader = document.getElementById("winners-header");
  const losersHeader = document.getElementById("losers-header");
  if (winnersHeader)
    winnersHeader.innerHTML = `Winners: <span id="winners-score">${winningScore}</span>`;
  if (losersHeader)
    losersHeader.innerHTML = `Losers: <span id="losers-score">${losingScore}</span>`;

  // Sort teams by cups hit (most to least)
  const sortedWinningTeam = [...winningTeam].sort((a, b) => {
    const cupsA = gameData.individual_stats[a]?.cups_hit || 0;
    const cupsB = gameData.individual_stats[b]?.cups_hit || 0;
    return cupsB - cupsA; // Descending order
  });

  const sortedLosingTeam = [...losingTeam].sort((a, b) => {
    const cupsA = gameData.individual_stats[a]?.cups_hit || 0;
    const cupsB = gameData.individual_stats[b]?.cups_hit || 0;
    return cupsB - cupsA; // Descending order
  });

  // Populate winners column
  const winnersDiv = document.getElementById("winners-players");
  if (winnersDiv) {
    winnersDiv.innerHTML = "";
    sortedWinningTeam.forEach((player) => {
      const playerDiv = document.createElement("div");
      const cupsHit = gameData.individual_stats[player]?.cups_hit || 0;
      const isScorecard = player === scorecardPlayer;
      playerDiv.className = `text-white ${
        isScorecard ? "bg-yellow-600 px-2 py-1 rounded" : ""
      }`;
      playerDiv.textContent = `${player} : ${cupsHit}`;
      winnersDiv.appendChild(playerDiv);
    });
  }

  // Populate losers column with naked laps inputs
  const losersDiv = document.getElementById("losers-players");
  if (losersDiv) {
    losersDiv.innerHTML = "";
    sortedLosingTeam.forEach((player) => {
      const playerDiv = document.createElement("div");
      const cupsHit = gameData.individual_stats[player]?.cups_hit || 0;
      const playerId = player.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();

      playerDiv.className = "flex items-center gap-2 text-white";
      playerDiv.innerHTML = `
        <span class="flex-1">${player} : ${cupsHit} :</span>
        <label for="naked-laps-${playerId}" class="text-white text-sm">Nakeds:</label>
        <input 
          type="number" 
          id="naked-laps-${playerId}" 
          min="0" 
          value="0" 
          class="w-16 p-1 rounded text-gray-800 text-center"
          placeholder="0"
        />
      `;
      losersDiv.appendChild(playerDiv);
    });
  }

  // Handle scorecard display/selection
  const scorecardContainer = document.getElementById(
    "review-scorecard-container"
  );
  if (scorecardContainer) {
    if (
      gameData.scorecard_tied_players &&
      gameData.scorecard_tied_players.length > 1
    ) {
      // Show selection UI for tie
      scorecardContainer.innerHTML = `
        <div class="bg-yellow-600 bg-opacity-80 border-2 border-yellow-400 rounded-lg p-4">
          <p class="text-white font-bold mb-3">Scorecard Tie - Please Select Winner:</p>
          <div id="scorecard-tiebreaker-options" class="space-y-2">
            ${gameData.scorecard_tied_players
              .map(
                (player, index) => `
              <label class="flex items-center text-white p-2 hover:bg-yellow-500 rounded cursor-pointer">
                <input type="radio" name="scorecard-tiebreaker" value="${player}" ${
                  index === 0 ? "checked" : ""
                } class="mr-2">
                ${player}
              </label>
            `
              )
              .join("")}
          </div>
        </div>
      `;
    } else {
      // Show selected scorecard
      scorecardContainer.innerHTML = `
        <p class="text-white">
          Scorecard: <span class="font-bold text-orange-500">${
            scorecardPlayer || "Not selected"
          }</span>
        </p>
      `;
    }
  }

  // Set scorecard (fallback if container doesn't exist)
  const scorecardEl = document.getElementById("review-scorecard");
  if (scorecardEl && !gameData.scorecard_tied_players) {
    scorecardEl.textContent = scorecardPlayer || "Not selected";
  }

  // Show review
  reviewConfirmation.classList.remove("hidden");
  reviewConfirmation.style.display = "block";
}

function showMessage(text, type = "info") {
  const messageDiv = document.getElementById("message");
  if (!messageDiv) return;

  messageDiv.textContent = text;
  messageDiv.className = `message message-${type}`;
  messageDiv.classList.remove("hidden");

  if (type === "success") {
    setTimeout(() => {
      messageDiv.classList.add("hidden");
    }, 3000);
  }
}

function showSuccessConfirmation() {
  const confirmationDiv = document.getElementById("success-confirmation");
  const messageDiv = document.getElementById("message");

  if (confirmationDiv) {
    // Hide any existing messages
    if (messageDiv) {
      messageDiv.classList.add("hidden");
    }
    // Show confirmation
    confirmationDiv.classList.remove("hidden");
  }
}
