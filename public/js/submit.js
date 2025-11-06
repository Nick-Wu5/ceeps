// Submit results page logic

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('submit-game-form');
  const messageDiv = document.getElementById('message');

  if (!form) return;

  // Load existing players for autocomplete
  loadPlayers();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(form);
    const team1 = [
      formData.get('team1_player1'),
      formData.get('team1_player2'),
      formData.get('team1_player3'),
      formData.get('team1_player4')
    ];
    const team2 = [
      formData.get('team2_player1'),
      formData.get('team2_player2'),
      formData.get('team2_player3'),
      formData.get('team2_player4')
    ];

    // Collect individual stats
    const individualStats = {};
    const allPlayers = [...team1, ...team2];
    
    allPlayers.forEach(playerName => {
      if (playerName) {
        individualStats[playerName] = {
          cups_hit: parseInt(formData.get(`${playerName}_cups`) || 0),
          ot_cups_hit: parseInt(formData.get(`${playerName}_ot_cups`) || 0),
          naked_lap: formData.get(`${playerName}_naked_lap`) === 'on'
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

    const gameData = {
      date: formData.get('date'),
      team1,
      team2,
      winner: formData.get('winner'),
      team1_score,
      team2_score,
      overtime: formData.get('overtime') === 'on',
      team1_ot_cups: parseInt(formData.get('team1_ot_cups') || 0),
      team2_ot_cups: parseInt(formData.get('team2_ot_cups') || 0),
      scorecard_player: formData.get('scorecard_player'),
      individual_stats: individualStats
    };

    try {
      showMessage('Submitting game result...', 'info');
      const result = await window.ceepsAPI.submitGameResult(gameData);
      
      if (result.success) {
        // Hide form and show success confirmation
        form.style.display = 'none';
        showSuccessConfirmation();
        // Reload players list in case new players were added
        loadPlayers();
      }
    } catch (error) {
      showMessage(`Error: ${error.message}`, 'error');
    }
  });

  // Auto-calculate scorecard player
  const winnerSelect = document.getElementById('winner');
  if (winnerSelect) {
    winnerSelect.addEventListener('change', () => {
      updateScorecardPlayer();
    });
  }
});

async function loadPlayers() {
  try {
    const players = await window.ceepsAPI.getAllPlayers();
    
    // Populate datalist for autocomplete
    const datalist = document.getElementById('players-list');
    if (datalist && players.length > 0) {
      datalist.innerHTML = players.map(player => 
        `<option value="${player}">${player}</option>`
      ).join('');
    }
  } catch (error) {
    console.error('Failed to load players:', error);
  }
}

function updateScorecardPlayer(gameData = null) {
  // This would auto-calculate based on winner and cups hit
  // For now, let user select manually
}

function showMessage(text, type = 'info') {
  const messageDiv = document.getElementById('message');
  if (!messageDiv) return;

  messageDiv.textContent = text;
  messageDiv.className = `message message-${type}`;
  messageDiv.style.display = 'block';

  if (type === 'success') {
    setTimeout(() => {
      messageDiv.style.display = 'none';
    }, 3000);
  }
}

function showSuccessConfirmation() {
  const confirmationDiv = document.getElementById('success-confirmation');
  const messageDiv = document.getElementById('message');
  
  if (confirmationDiv) {
    // Hide any existing messages
    if (messageDiv) {
      messageDiv.classList.add('hidden');
    }
    // Show confirmation
    confirmationDiv.classList.remove('hidden');
  }
}

