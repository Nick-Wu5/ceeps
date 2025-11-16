// Admin players management page logic

document.addEventListener("DOMContentLoaded", () => {
  // Check if already authenticated
  if (window.ceepsAPI.isAdminAuthenticated()) {
    showAdminPanel();
  }

  // Login form
  const loginForm = document.getElementById("login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const password = document.getElementById("admin-password").value;
      const result = window.ceepsAPI.adminLogin(password);

      if (result.success) {
        showAdminPanel();
      } else {
        showMessage(
          "login-message",
          result.error || "Invalid password",
          "error"
        );
      }
    });
  }

  // Add player form
  const addForm = document.getElementById("add-player-form");
  if (addForm) {
    addForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const playerName = document
        .getElementById("add-player-input")
        .value.trim();

      if (!playerName) {
        showMessage("add-message", "Player name is required", "error");
        return;
      }

      try {
        showMessage("add-message", "Adding player...", "info");
        await window.ceepsAPI.addPlayerToPreset(playerName);
        showMessage("add-message", "Player added successfully!", "success");
        document.getElementById("add-player-input").value = "";
        loadPlayers();
      } catch (error) {
        showMessage(
          "add-message",
          error.message || "Error adding player",
          "error"
        );
      }
    });
  }

  // Bulk import form
  const bulkForm = document.getElementById("bulk-import-form");
  if (bulkForm) {
    bulkForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = document.getElementById("bulk-import-input").value.trim();

      if (!input) {
        showMessage("bulk-message", "Please enter player names", "error");
        return;
      }

      try {
        showMessage("bulk-message", "Importing players...", "info");
        const names = input
          .split(",")
          .map((name) => name.trim())
          .filter((name) => name.length > 0);

        if (names.length === 0) {
          showMessage("bulk-message", "No valid player names found", "error");
          return;
        }

        await window.ceepsAPI.updatePresetPlayers(names);
        showMessage(
          "bulk-message",
          `Successfully imported ${names.length} players!`,
          "success"
        );
        document.getElementById("bulk-import-input").value = "";
        loadPlayers();
      } catch (error) {
        showMessage(
          "bulk-message",
          error.message || "Error importing players",
          "error"
        );
      }
    });
  }
});

function showAdminPanel() {
  document.getElementById("login-section").classList.add("hidden");
  document.getElementById("admin-panel").classList.remove("hidden");
  loadPlayers();
}

async function loadPlayers() {
  const container = document.getElementById("players-list");
  const countElement = document.getElementById("player-count");

  if (!container) return;

  try {
    container.innerHTML = '<p class="text-orange-500">Loading players...</p>';
    const players = await window.ceepsAPI.getPresetPlayers();

    if (players.length === 0) {
      container.innerHTML =
        '<p class="text-gray-400">No players in preset list. Use bulk import to add players.</p>';
      if (countElement) countElement.textContent = "0";
      return;
    }

    // Filter out Guest for display (it's always included automatically)
    const displayPlayers = players.filter((p) => p !== "Guest");

    if (countElement) {
      countElement.textContent = displayPlayers.length;
    }

    container.innerHTML = displayPlayers
      .map((player) => createPlayerRow(player))
      .join("");

    // Add event listeners for remove buttons
    displayPlayers.forEach((player) => {
      const removeBtn = document.getElementById(
        `remove-${player.replace(/[^a-zA-Z0-9]/g, "-")}`
      );
      if (removeBtn) {
        removeBtn.addEventListener("click", () => removePlayer(player));
      }
    });
  } catch (error) {
    console.error("Error loading players:", error);
    container.innerHTML = `<p class="text-red-500">Error loading players: ${error.message}</p>`;
  }
}

function createPlayerRow(playerName) {
  const safeId = playerName.replace(/[^a-zA-Z0-9]/g, "-");
  return `
    <div class="flex items-center justify-between bg-black bg-opacity-50 p-4 rounded">
      <span class="text-white font-bold">${playerName}</span>
      <button 
        id="remove-${safeId}"
        class="nav-button bg-red-600 hover:bg-red-700"
      >
        Remove
      </button>
    </div>
  `;
}

async function removePlayer(playerName) {
  if (
    !confirm(
      `Are you sure you want to remove "${playerName}" from the preset list?`
    )
  ) {
    return;
  }

  try {
    await window.ceepsAPI.removePlayerFromPreset(playerName);
    loadPlayers();
  } catch (error) {
    alert(error.message || "Error removing player");
  }
}

function showMessage(elementId, message, type) {
  const element = document.getElementById(elementId);
  if (!element) return;

  element.textContent = message;
  element.classList.remove("hidden");

  // Set color based on type
  element.classList.remove("text-red-500", "text-green-500", "text-blue-500");
  if (type === "error") {
    element.classList.add("text-red-500");
  } else if (type === "success") {
    element.classList.add("text-green-500");
  } else {
    element.classList.add("text-blue-500");
  }

  // Auto-hide after 5 seconds for success/info messages
  if (type !== "error") {
    setTimeout(() => {
      element.classList.add("hidden");
    }, 5000);
  }
}
