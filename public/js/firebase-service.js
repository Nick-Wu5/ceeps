// Firebase service layer - replaces api.js
// Provides the same interface as the old API but uses Firestore

// Guest player constant
const GUEST_PLAYER_NAME = "Guest";

// Wait for Firebase to be initialized
function ensureFirebase() {
  if (!window.firebase || !window.db) {
    throw new Error(
      "Firebase not initialized. Make sure Firebase SDK scripts are loaded before this file."
    );
  }
  return window.db;
}

// Helper to get Firestore instance
function getFirestore() {
  return window.db; // Return the Firestore instance, not the namespace
}

// Submit a game result
async function submitGameResult(gameData, photoFile = null) {
  const db = ensureFirebase();
  const firestore = getFirestore();

  try {
    // Validation
    if (
      !gameData.date ||
      !gameData.team1 ||
      !gameData.team2 ||
      !gameData.winner ||
      gameData.team1_score === undefined ||
      gameData.team2_score === undefined ||
      !gameData.scorecard_player
    ) {
      throw new Error("Missing required fields");
    }

    if (gameData.team1.length !== 4 || gameData.team2.length !== 4) {
      throw new Error("Each team must have exactly 4 players");
    }

    if (
      !gameData.individual_stats ||
      Object.keys(gameData.individual_stats).length === 0
    ) {
      throw new Error("Individual stats required");
    }

    // 1. Upload photo if provided (before creating game document)
    let photoUrl = null;
    let photoFilename = null;

    if (photoFile) {
      try {
        const imagePath = `game-photos/${Date.now()}-${photoFile.name}`;
        photoUrl = await uploadImageToStorage(photoFile, imagePath);
        photoFilename = photoFile.name;
      } catch (error) {
        console.error("Error uploading game photo:", error);
        // Don't block game submission if photo upload fails
        // Photo will remain null and game will be saved without photo
      }
    }

    // 2. Build individual_stats object and calculate naked laps
    const allPlayers = [...gameData.team1, ...gameData.team2];
    const individualStats = {};

    allPlayers.forEach((playerName) => {
      const stats = gameData.individual_stats[playerName] || {};
      const cupsHit = stats.cups_hit || 0;
      const team = gameData.team1.includes(playerName) ? "team1" : "team2";

      // Calculate naked laps (rule: losing team with ≤9 cups)
      const isLosingTeam =
        (team === "team1" && gameData.winner === "team2") ||
        (team === "team2" && gameData.winner === "team1");
      const ruleNakedLap = isLosingTeam && cupsHit <= 9;
      const manualNakedLap = (stats.naked_laps || 0) > 0;
      const finalNakedLapsCount = manualNakedLap
        ? stats.naked_laps
        : ruleNakedLap
        ? 1
        : 0;

      individualStats[playerName] = {
        cups_hit: cupsHit,
        naked_laps: finalNakedLapsCount,
      };
    });

    // 3. Add game document with individual_stats and photo included
    const gameRef = await firestore.collection("games").add({
      date: gameData.date,
      team1: gameData.team1,
      team2: gameData.team2,
      winner: gameData.winner,
      team1_score: gameData.team1_score,
      team2_score: gameData.team2_score,
      scorecard_player: gameData.scorecard_player,
      individual_stats: individualStats,
      photo_url: photoUrl,
      photo_filename: photoFilename,
      created_at: window.firebase.firestore.FieldValue.serverTimestamp(),
    });

    const gameId = gameRef.id;

    // 4. Update player stats using transaction
    await updatePlayerStats(gameId, gameData);

    return { success: true, game_id: gameId };
  } catch (error) {
    console.error("Error submitting game result:", error);
    throw error;
  }
}

// Helper function to update player stats (replaces database.js updatePlayerStats)
async function updatePlayerStats(gameId, individualStatsFromRequest) {
  const db = ensureFirebase();
  const firestore = getFirestore();

  // Get game details
  const gameDoc = await firestore.collection("games").doc(gameId).get();
  if (!gameDoc.exists) {
    throw new Error("Game not found");
  }

  const game = gameDoc.data();
  const winner = game.winner;
  const scorecardPlayer = game.scorecard_player;
  const allPlayers = [...game.team1, ...game.team2];

  // Get individual stats from game document (stored as nested object)
  const stats = game.individual_stats || {};

  // Update stats for each player using transactions
  const updatePromises = allPlayers.map(async (playerName) => {
    // Skip Guest - don't create/update player_stats for Guest
    if (playerName === GUEST_PLAYER_NAME) {
      return;
    }

    const playerStat = stats[playerName];
    if (!playerStat) return;

    // Derive team from game document
    const playerTeam = game.team1.includes(playerName) ? "team1" : "team2";
    const won = playerTeam === winner;
    const cupsHit = playerStat.cups_hit || 0;
    const nakedLapsCount = playerStat.naked_laps || 0;
    const gotScorecard = playerName === scorecardPlayer ? 1 : 0;

    const playerStatsRef = firestore.collection("player_stats").doc(playerName);

    await firestore.runTransaction(async (transaction) => {
      const playerStatsDoc = await transaction.get(playerStatsRef);

      if (!playerStatsDoc.exists) {
        // Create new player stats
        const newStats = {
          games_played: 1,
          games_won: won ? 1 : 0,
          win_ratio: won ? 1.0 : 0.0,
          cups_hit_avg: cupsHit,
          total_cups_hit: cupsHit,
          number_of_scorecards: gotScorecard,
          naked_laps_run: nakedLapsCount,
          game_ids: [gameId], // Initialize game_ids array with this game
          last_updated: window.firebase.firestore.FieldValue.serverTimestamp(),
        };
        transaction.set(playerStatsRef, newStats);
      } else {
        // Update existing stats
        const currentStats = playerStatsDoc.data();
        const gamesPlayed = currentStats.games_played + 1;
        const gamesWon = currentStats.games_won + (won ? 1 : 0);
        const winRatio = gamesWon / gamesPlayed;
        const totalCupsHit = currentStats.total_cups_hit + cupsHit;
        const cupsHitAvg = totalCupsHit / gamesPlayed;
        const scorecards = currentStats.number_of_scorecards + gotScorecard;
        const nakedLaps = currentStats.naked_laps_run + nakedLapsCount;

        // Add gameId to game_ids array
        const updateData = {
          games_played: gamesPlayed,
          games_won: gamesWon,
          win_ratio: winRatio,
          cups_hit_avg: cupsHitAvg,
          total_cups_hit: totalCupsHit,
          number_of_scorecards: scorecards,
          naked_laps_run: nakedLaps,
          last_updated: window.firebase.firestore.FieldValue.serverTimestamp(),
        };

        // Handle game_ids array: initialize if missing, or add gameId if not present
        const currentGameIds = currentStats.game_ids || [];
        if (currentGameIds.length === 0) {
          // Initialize game_ids array if it doesn't exist
          updateData.game_ids = [gameId];
        } else if (!currentGameIds.includes(gameId)) {
          // Add gameId to existing array using arrayUnion (idempotent)
          updateData.game_ids =
            window.firebase.firestore.FieldValue.arrayUnion(gameId);
        }
        // If gameId already in array, no need to update game_ids

        transaction.update(playerStatsRef, updateData);
      }
    });
  });

  await Promise.all(updatePromises);
}

// Helper function to get all players who played in a specific game
async function getPlayersByGameId(gameId) {
  const db = ensureFirebase();
  const firestore = getFirestore();

  try {
    // Query player_stats where game_ids array contains this gameId
    const snapshot = await firestore
      .collection("player_stats")
      .where("game_ids", "array-contains", gameId)
      .get();

    const players = [];
    snapshot.forEach((doc) => {
      players.push(doc.id);
    });

    return players;
  } catch (error) {
    console.error("Error fetching players by game ID:", error);
    throw error;
  }
}

// Get recent games with pagination
async function getRecentGames(limit = 5, offset = 0, includeTotal = false) {
  const db = ensureFirebase();
  const firestore = getFirestore();

  try {
    let totalCount = null;
    if (includeTotal) {
      // Firebase v8 doesn't have count(), so we fetch all IDs and count
      // For large datasets, consider using a separate counter document
      const allGamesSnapshot = await firestore.collection("games").get();
      totalCount = allGamesSnapshot.size;
    }

    // Firestore doesn't support offset, so we'll use a simpler approach
    // For now, we'll fetch all and paginate client-side (not ideal for large datasets)
    const gamesSnapshot = await firestore
      .collection("games")
      .orderBy("date", "desc")
      .orderBy("created_at", "desc")
      .limit(limit + offset)
      .get();

    const allGames = [];
    gamesSnapshot.forEach((doc) => {
      allGames.push({ id: doc.id, ...doc.data() });
    });

    // Apply offset client-side
    const games = allGames.slice(offset, offset + limit);

    // Individual stats are now stored directly in the game document
    // No separate query needed - individual_stats is already in each game object

    // Convert Firestore Timestamps to ISO strings for compatibility
    games.forEach((game) => {
      if (game.created_at && game.created_at.toDate) {
        game.created_at = game.created_at.toDate().toISOString();
      } else if (game.created_at && game.created_at instanceof Date) {
        game.created_at = game.created_at.toISOString();
      }
    });

    if (includeTotal) {
      return { games, total: totalCount };
    }
    return games;
  } catch (error) {
    console.error("Error fetching recent games:", error);
    throw error;
  }
}

// Get player stats
async function getPlayerStats(playerName) {
  const db = ensureFirebase();
  const firestore = getFirestore();

  try {
    const playerStatsDoc = await firestore
      .collection("player_stats")
      .doc(playerName)
      .get();

    if (!playerStatsDoc.exists) {
      throw new Error("Player not found");
    }

    const data = playerStatsDoc.data();

    // Convert Timestamp to ISO string if needed
    if (data.last_updated && data.last_updated.toDate) {
      data.last_updated = data.last_updated.toDate().toISOString();
    } else if (data.last_updated && data.last_updated instanceof Date) {
      data.last_updated = data.last_updated.toISOString();
    }

    return {
      player_name: playerName,
      games_played: data.games_played || 0,
      games_won: data.games_won || 0,
      win_ratio: data.win_ratio || 0,
      cups_hit_avg: data.cups_hit_avg || 0,
      total_cups_hit: data.total_cups_hit || 0,
      number_of_scorecards: data.number_of_scorecards || 0,
      naked_laps_run: data.naked_laps_run || 0,
    };
  } catch (error) {
    console.error("Error fetching player stats:", error);
    throw error;
  }
}

// Get leaderboard
async function getLeaderboard(
  sortBy = "win_ratio",
  limit = 20,
  pledgeClass = null
) {
  const db = ensureFirebase();
  const firestore = getFirestore();

  try {
    let orderByField;
    let useSecondaryOrderBy = true;

    switch (sortBy) {
      case "cups_hit_avg":
        orderByField = "cups_hit_avg";
        break;
      case "total_cups":
        orderByField = "total_cups_hit";
        break;
      case "total_wins":
        orderByField = "games_won";
        break;
      case "games_played":
        // When sorting by games_played, we can't use it twice
        // Use only one orderBy and sort client-side
        orderByField = "games_played";
        useSecondaryOrderBy = false;
        break;
      case "scorecards":
        orderByField = "number_of_scorecards";
        break;
      case "win_ratio":
      default:
        orderByField = "win_ratio";
        break;
    }

    // Build query - only add second orderBy if not sorting by games_played
    let query = firestore
      .collection("player_stats")
      .where("games_played", ">", 0);

    // Filter by pledge class if provided
    if (pledgeClass !== null) {
      query = query.where("pledge_class", "==", parseInt(pledgeClass));
    }

    if (useSecondaryOrderBy) {
      query = query
        .orderBy("games_played", "desc")
        .orderBy(orderByField, "desc");
    } else {
      // When sorting by games_played, only order by that field
      query = query.orderBy(orderByField, "desc");
    }

    // Fetch more than limit to ensure we have enough after client-side sorting
    // This helps with tie-breaking edge cases
    const snapshot = await query.limit(limit * 2).get();

    // Handle empty results
    if (snapshot.empty) {
      return [];
    }

    const leaderboard = [];
    snapshot.forEach((doc) => {
      // Filter out Guest from leaderboard
      if (doc.id === GUEST_PLAYER_NAME) {
        return;
      }

      const data = doc.data();
      // Ensure all fields have safe defaults
      leaderboard.push({
        player_name: doc.id,
        games_played: Number(data.games_played) || 0,
        games_won: Number(data.games_won) || 0,
        win_ratio: Number(data.win_ratio) || 0,
        cups_hit_avg: Number(data.cups_hit_avg) || 0,
        total_cups_hit: Number(data.total_cups_hit) || 0,
        number_of_scorecards: Number(data.number_of_scorecards) || 0,
        naked_laps_run: Number(data.naked_laps_run) || 0,
      });
    });

    // Always sort client-side for consistent tie-breaking across all sort types
    leaderboard.sort((a, b) => {
      let primaryValueA, primaryValueB;

      // Get primary sort value
      switch (sortBy) {
        case "cups_hit_avg":
          primaryValueA = a.cups_hit_avg;
          primaryValueB = b.cups_hit_avg;
          break;
        case "win_ratio":
          primaryValueA = a.win_ratio;
          primaryValueB = b.win_ratio;
          break;
        case "total_wins":
          primaryValueA = a.games_won;
          primaryValueB = b.games_won;
          break;
        case "total_cups":
          primaryValueA = a.total_cups_hit;
          primaryValueB = b.total_cups_hit;
          break;
        case "games_played":
          primaryValueA = a.games_played;
          primaryValueB = b.games_played;
          break;
        case "scorecards":
          primaryValueA = a.number_of_scorecards;
          primaryValueB = b.number_of_scorecards;
          break;
        default:
          primaryValueA = a.cups_hit_avg;
          primaryValueB = b.cups_hit_avg;
      }

      // Primary sort (descending)
      if (primaryValueB !== primaryValueA) {
        return primaryValueB - primaryValueA;
      }

      // Tie-breaking: Use win_ratio as secondary sort (except when already sorting by it)
      if (sortBy !== "win_ratio") {
        if (b.win_ratio !== a.win_ratio) {
          return b.win_ratio - a.win_ratio;
        }
      }

      // Tertiary tie-breaking: Use games_played
      if (b.games_played !== a.games_played) {
        return b.games_played - a.games_played;
      }

      // Final tie-breaking: Alphabetical by player name
      return a.player_name.localeCompare(b.player_name);
    });

    // Limit to requested number and assign ranks
    const limitedLeaderboard = leaderboard.slice(0, limit);
    limitedLeaderboard.forEach((player, index) => {
      player.rank = index + 1;
    });

    return limitedLeaderboard;
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    throw error;
  }
}

// ========== PRESET PLAYER LIST FUNCTIONS ==========

// Get preset player list from Firestore
async function getPresetPlayers() {
  const db = ensureFirebase();
  const firestore = getFirestore();

  try {
    const presetDoc = await firestore
      .collection("players")
      .doc("preset_list")
      .get();

    if (!presetDoc.exists) {
      return [];
    }

    const data = presetDoc.data();
    const players = data.names || [];

    // Ensure "Guest" is always included
    if (!players.includes("Guest")) {
      players.push("Guest");
    }

    return players.sort();
  } catch (error) {
    console.error("Error fetching preset players:", error);
    throw error;
  }
}

// Update preset player list (admin only)
async function updatePresetPlayers(names) {
  const db = ensureFirebase();
  const firestore = getFirestore();

  // Validate input
  if (!Array.isArray(names)) {
    throw new Error("Names must be an array");
  }

  // Filter out empty strings and ensure all are strings
  const validNames = names
    .filter(
      (name) => name && typeof name === "string" && name.trim().length > 0
    )
    .map((name) => name.trim());

  if (validNames.length === 0) {
    throw new Error("At least one player name is required");
  }

  try {
    await firestore
      .collection("players")
      .doc("preset_list")
      .set({ names: validNames }, { merge: false });

    return { success: true };
  } catch (error) {
    console.error("Error updating preset players:", error);
    throw error;
  }
}

// Add player to preset list (admin only)
async function addPlayerToPreset(playerName) {
  if (!playerName || typeof playerName !== "string" || !playerName.trim()) {
    throw new Error("Valid player name is required");
  }

  const trimmedName = playerName.trim();
  const currentPlayers = await getPresetPlayers();

  // Remove "Guest" from current list temporarily (we'll add it back automatically)
  const playersWithoutGuest = currentPlayers.filter((p) => p !== "Guest");

  if (playersWithoutGuest.includes(trimmedName)) {
    throw new Error("Player already exists in preset list");
  }

  const updatedPlayers = [...playersWithoutGuest, trimmedName];
  return await updatePresetPlayers(updatedPlayers);
}

// Remove player from preset list (admin only)
async function removePlayerFromPreset(playerName) {
  if (!playerName || typeof playerName !== "string" || !playerName.trim()) {
    throw new Error("Valid player name is required");
  }

  const trimmedName = playerName.trim();

  // Don't allow removing "Guest"
  if (trimmedName === "Guest") {
    throw new Error("Guest cannot be removed from preset list");
  }

  const currentPlayers = await getPresetPlayers();
  const playersWithoutGuest = currentPlayers.filter((p) => p !== "Guest");

  if (!playersWithoutGuest.includes(trimmedName)) {
    throw new Error("Player not found in preset list");
  }

  const updatedPlayers = playersWithoutGuest.filter((p) => p !== trimmedName);
  return await updatePresetPlayers(updatedPlayers);
}

// Get all players (uses preset list first, falls back to player_stats)
async function getAllPlayers() {
  const db = ensureFirebase();
  const firestore = getFirestore();

  try {
    // First try to get preset list
    const presetPlayers = await getPresetPlayers();

    // If preset list exists and has players (other than Guest), use it
    if (presetPlayers.length > 0) {
      return presetPlayers;
    }

    // Fallback to player_stats collection
    const snapshot = await firestore.collection("player_stats").get();
    const players = [];
    snapshot.forEach((doc) => {
      players.push(doc.id);
    });

    // Ensure Guest is included even in fallback
    if (!players.includes("Guest")) {
      players.push("Guest");
    }

    return players.sort();
  } catch (error) {
    console.error("Error fetching players:", error);
    throw error;
  }
}

// ========== GAME MANAGEMENT FUNCTIONS ==========

// Get a single game by ID with individual stats
async function getGameById(gameId) {
  const db = ensureFirebase();
  const firestore = getFirestore();

  try {
    // Get game document
    const gameDoc = await firestore.collection("games").doc(gameId).get();
    if (!gameDoc.exists) {
      throw new Error("Game not found");
    }

    const game = { id: gameDoc.id, ...gameDoc.data() };

    // Individual stats are now stored directly in the game document
    // Ensure individual_stats exists (default to empty object if missing)
    if (!game.individual_stats) {
      game.individual_stats = {};
    }

    // Convert Firestore Timestamps to ISO strings for compatibility
    if (game.created_at && game.created_at.toDate) {
      game.created_at = game.created_at.toDate().toISOString();
    } else if (game.created_at && game.created_at instanceof Date) {
      game.created_at = game.created_at.toISOString();
    }

    return game;
  } catch (error) {
    console.error("Error fetching game by ID:", error);
    throw error;
  }
}

// Helper function to recalculate a single player's stats from scratch
async function recalculatePlayerStats(playerName) {
  const db = ensureFirebase();
  const firestore = getFirestore();

  // Skip Guest - don't recalculate stats for Guest
  if (playerName === GUEST_PLAYER_NAME) {
    return;
  }

  try {
    // Get player's current stats to get game_ids array
    const playerStatsRef = firestore.collection("player_stats").doc(playerName);
    const playerStatsDoc = await playerStatsRef.get();

    if (!playerStatsDoc.exists) {
      // Player has no stats, nothing to recalculate
      return;
    }

    const currentStats = playerStatsDoc.data();
    const gameIds = currentStats.game_ids || [];

    if (gameIds.length === 0) {
      // No games to recalculate from, but player document exists
      // This shouldn't happen, but handle gracefully
      return;
    }

    // Fetch all games for this player
    const gamePromises = gameIds.map((gameId) =>
      firestore.collection("games").doc(gameId).get()
    );
    const gameDocs = await Promise.all(gamePromises);

    // Recalculate stats from scratch
    let gamesPlayed = 0;
    let gamesWon = 0;
    let totalCupsHit = 0;
    let number_of_scorecards = 0;
    let nakedLapsRun = 0;

    gameDocs.forEach((gameDoc) => {
      if (!gameDoc.exists) {
        // Game was deleted but still in game_ids array - skip it
        return;
      }

      const game = gameDoc.data();
      const individualStats = game.individual_stats || {};
      const playerStat = individualStats[playerName];

      if (!playerStat) {
        // Player not in this game's stats - skip it
        return;
      }

      gamesPlayed++;
      totalCupsHit += playerStat.cups_hit || 0;
      nakedLapsRun += playerStat.naked_laps || 0;

      // Check if player won (derive team from game document)
      const playerTeam = game.team1.includes(playerName) ? "team1" : "team2";
      if (playerTeam === game.winner) {
        gamesWon++;
      }

      // Check if player got scorecard
      if (playerName === game.scorecard_player) {
        number_of_scorecards++;
      }
    });

    // Calculate derived stats
    const winRatio = gamesPlayed > 0 ? gamesWon / gamesPlayed : 0;
    const cupsHitAvg = gamesPlayed > 0 ? totalCupsHit / gamesPlayed : 0;

    // Update player stats document
    await firestore.runTransaction(async (transaction) => {
      const currentDoc = await transaction.get(playerStatsRef);
      if (!currentDoc.exists) {
        // Document was deleted during recalculation - skip
        return;
      }

      transaction.update(playerStatsRef, {
        games_played: gamesPlayed,
        games_won: gamesWon,
        win_ratio: winRatio,
        cups_hit_avg: cupsHitAvg,
        total_cups_hit: totalCupsHit,
        number_of_scorecards: number_of_scorecards,
        naked_laps_run: nakedLapsRun,
        last_updated: window.firebase.firestore.FieldValue.serverTimestamp(),
        // Keep existing game_ids array
      });
    });
  } catch (error) {
    console.error(`Error recalculating stats for ${playerName}:`, error);
    throw error;
  }
}

// Recalculate player stats for multiple players
async function recalculatePlayerStatsForPlayers(playerNames) {
  const db = ensureFirebase();
  const firestore = getFirestore();

  if (!Array.isArray(playerNames) || playerNames.length === 0) {
    throw new Error("playerNames must be a non-empty array");
  }

  try {
    // Recalculate stats for each player in parallel
    const promises = playerNames.map((playerName) =>
      recalculatePlayerStats(playerName)
    );
    await Promise.all(promises);

    return { success: true, playersRecalculated: playerNames.length };
  } catch (error) {
    console.error("Error recalculating player stats:", error);
    throw error;
  }
}

// Update an existing game
async function updateGame(gameId, gameData, photoFile = null) {
  const db = ensureFirebase();
  const firestore = getFirestore();

  try {
    // Get old game to find affected players
    const oldGameDoc = await firestore.collection("games").doc(gameId).get();
    if (!oldGameDoc.exists) {
      throw new Error("Game not found");
    }

    const oldGame = oldGameDoc.data();
    const oldPlayers = [...oldGame.team1, ...oldGame.team2];
    const oldPhotoUrl = oldGame.photo_url;

    // Validation
    if (
      !gameData.date ||
      !gameData.team1 ||
      !gameData.team2 ||
      !gameData.winner ||
      gameData.team1_score === undefined ||
      gameData.team2_score === undefined ||
      !gameData.scorecard_player
    ) {
      throw new Error("Missing required fields");
    }

    if (gameData.team1.length !== 4 || gameData.team2.length !== 4) {
      throw new Error("Each team must have exactly 4 players");
    }

    if (
      !gameData.individual_stats ||
      Object.keys(gameData.individual_stats).length === 0
    ) {
      throw new Error("Individual stats required");
    }

    // Get new players
    const newPlayers = [...gameData.team1, ...gameData.team2];
    const allAffectedPlayers = [
      ...new Set([...oldPlayers, ...newPlayers]),
    ].filter((p) => p !== GUEST_PLAYER_NAME); // Remove Guest from recalculation list

    // 1. Handle photo update
    let photoUrl = oldPhotoUrl || null;
    let photoFilename = oldGame.photo_filename || null;

    if (photoFile) {
      // New photo provided - upload new photo
      try {
        const imagePath = `game-photos/${Date.now()}-${photoFile.name}`;
        photoUrl = await uploadImageToStorage(photoFile, imagePath);
        photoFilename = photoFile.name;

        // Delete old photo if it exists
        if (oldPhotoUrl) {
          try {
            const storage = window.storage;
            if (storage) {
              const oldPhotoRef = storage.refFromURL(oldPhotoUrl);
              await oldPhotoRef.delete();
            }
          } catch (error) {
            console.error("Error deleting old game photo:", error);
            // Continue even if old photo deletion fails
          }
        }
      } catch (error) {
        console.error("Error uploading new game photo:", error);
        // Keep existing photo if new upload fails
        photoUrl = oldPhotoUrl;
        photoFilename = oldGame.photo_filename;
      }
    }
    // If no photoFile provided, keep existing photo (photoUrl and photoFilename already set above)

    // 2. Build individual_stats object and calculate naked laps
    const allPlayers = [...gameData.team1, ...gameData.team2];
    const individualStats = {};

    allPlayers.forEach((playerName) => {
      const stats = gameData.individual_stats[playerName] || {};
      const cupsHit = stats.cups_hit || 0;

      // Calculate naked laps (rule: losing team with ≤9 cups)
      const team = gameData.team1.includes(playerName) ? "team1" : "team2";
      const isLosingTeam =
        (team === "team1" && gameData.winner === "team2") ||
        (team === "team2" && gameData.winner === "team1");
      const ruleNakedLap = isLosingTeam && cupsHit <= 9;
      const manualNakedLap = (stats.naked_laps || 0) > 0;
      const finalNakedLapsCount = manualNakedLap
        ? stats.naked_laps
        : ruleNakedLap
        ? 1
        : 0;

      individualStats[playerName] = {
        cups_hit: cupsHit,
        naked_laps: finalNakedLapsCount,
      };
    });

    // 3. Update game document with all fields including individual_stats and photo
    await firestore.collection("games").doc(gameId).update({
      date: gameData.date,
      team1: gameData.team1,
      team2: gameData.team2,
      winner: gameData.winner,
      team1_score: gameData.team1_score,
      team2_score: gameData.team2_score,
      scorecard_player: gameData.scorecard_player,
      individual_stats: individualStats,
      photo_url: photoUrl,
      photo_filename: photoFilename,
    });

    // 4. Recalculate stats for all affected players
    await recalculatePlayerStatsForPlayers(allAffectedPlayers);

    return { success: true, game_id: gameId };
  } catch (error) {
    console.error("Error updating game:", error);
    throw error;
  }
}

// Delete a game and update affected player stats
async function deleteGame(gameId) {
  const db = ensureFirebase();
  const firestore = getFirestore();

  try {
    // Get game to find affected players
    const gameDoc = await firestore.collection("games").doc(gameId).get();
    if (!gameDoc.exists) {
      throw new Error("Game not found");
    }

    const game = gameDoc.data();
    const allPlayers = [...game.team1, ...game.team2];
    const affectedPlayers = allPlayers.filter((p) => p !== GUEST_PLAYER_NAME); // Remove Guest from recalculation list

    // 1. Delete photo from Storage if exists (before deleting game document)
    if (game.photo_url) {
      try {
        const storage = window.storage;
        if (storage) {
          const photoRef = storage.refFromURL(game.photo_url);
          await photoRef.delete();
        }
      } catch (error) {
        console.error("Error deleting game photo from Storage:", error);
        // Continue with game deletion even if photo deletion fails
      }
    }

    // 2. Delete game document (individual_stats are stored in the game document, so they're deleted automatically)
    await firestore.collection("games").doc(gameId).delete();

    // 3. Remove gameId from all affected players' game_ids arrays
    const updatePromises = affectedPlayers.map(async (playerName) => {
      const playerStatsRef = firestore
        .collection("player_stats")
        .doc(playerName);
      await firestore.runTransaction(async (transaction) => {
        const playerStatsDoc = await transaction.get(playerStatsRef);
        if (!playerStatsDoc.exists) {
          return; // Player stats don't exist, skip
        }

        const currentStats = playerStatsDoc.data();
        const currentGameIds = currentStats.game_ids || [];

        if (currentGameIds.includes(gameId)) {
          // Remove gameId from array
          const updatedGameIds = currentGameIds.filter((id) => id !== gameId);
          transaction.update(playerStatsRef, {
            game_ids: updatedGameIds,
            last_updated:
              window.firebase.firestore.FieldValue.serverTimestamp(),
          });
        }
      });
    });

    await Promise.all(updatePromises);

    // 4. Recalculate stats for all affected players
    if (affectedPlayers.length > 0) {
      await recalculatePlayerStatsForPlayers(affectedPlayers);
    }

    return { success: true };
  } catch (error) {
    console.error("Error deleting game:", error);
    throw error;
  }
}

// ========== HALL OF FAME FUNCTIONS ==========

// Get all Hall of Fame photos (public)
async function getHallOfFame() {
  const db = ensureFirebase();
  const firestore = getFirestore();

  try {
    // Try the indexed query first, fallback to client-side sorting if index not ready
    let snapshot;
    let needsClientSort = false;

    try {
      snapshot = await firestore
        .collection("hall_of_fame")
        .orderBy("display_order")
        .orderBy("created_at", "desc")
        .get();
    } catch (indexError) {
      // If index is still building, fetch all and sort client-side
      if (indexError.message && indexError.message.includes("index")) {
        console.warn("Index not ready, using client-side sorting");
        snapshot = await firestore.collection("hall_of_fame").get();
        needsClientSort = true;
      } else {
        throw indexError;
      }
    }

    const photos = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      const photo = { id: doc.id, ...data };

      // If we need client-side sorting, add sortable timestamp
      if (needsClientSort) {
        if (data.created_at?.toDate) {
          photo._sortTimestamp = data.created_at.toDate().getTime();
        } else if (data.created_at?.getTime) {
          photo._sortTimestamp = data.created_at.getTime();
        } else {
          photo._sortTimestamp = 0;
        }
      }

      photos.push(photo);
    });

    // If we fetched without index, sort client-side
    if (needsClientSort && photos.length > 0) {
      photos.sort((a, b) => {
        // Primary sort: display_order (ascending)
        const orderA = a.display_order || 0;
        const orderB = b.display_order || 0;
        if (orderA !== orderB) {
          return orderA - orderB;
        }
        // Secondary sort: created_at (descending)
        return (b._sortTimestamp || 0) - (a._sortTimestamp || 0);
      });
      // Remove temporary sort field
      photos.forEach((photo) => delete photo._sortTimestamp);
    }

    return photos;
  } catch (error) {
    console.error("Error fetching hall of fame:", error);
    throw error;
  }
}

// Upload image to Firebase Storage
async function uploadImageToStorage(file, path) {
  const storage = window.storage;
  if (!storage) {
    throw new Error("Firebase Storage not initialized");
  }

  const storageRef = storage.ref();
  const imageRef = storageRef.child(path);
  const uploadSnapshot = await imageRef.put(file);
  const downloadURL = await uploadSnapshot.ref.getDownloadURL();
  return downloadURL;
}

// Add Hall of Fame photo (admin)
async function addHallOfFamePhoto(imageFile, caption, displayOrder = 0) {
  const db = ensureFirebase();
  const firestore = getFirestore();

  if (!imageFile) {
    throw new Error("Image file is required");
  }

  if (!caption || !caption.trim()) {
    throw new Error("Caption is required");
  }

  try {
    // Upload image to Storage
    const imagePath = `hall-of-fame/${Date.now()}-${imageFile.name}`;
    const imageUrl = await uploadImageToStorage(imageFile, imagePath);

    // Add document to Firestore
    const docRef = await firestore.collection("hall_of_fame").add({
      image_url: imageUrl,
      image_filename: imageFile.name, // Keep for backward compatibility
      caption: caption.trim(),
      display_order: displayOrder,
      created_at: window.firebase.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true, id: docRef.id };
  } catch (error) {
    console.error("Error adding hall of fame photo:", error);
    throw error;
  }
}

// Update Hall of Fame photo (admin)
async function updateHallOfFamePhoto(
  photoId,
  caption,
  displayOrder = 0,
  imageFile = null
) {
  const db = ensureFirebase();
  const firestore = getFirestore();

  if (!caption || !caption.trim()) {
    throw new Error("Caption is required");
  }

  try {
    const updateData = {
      caption: caption.trim(),
      display_order: displayOrder,
    };

    // If new image uploaded, upload to Storage and update URL
    if (imageFile) {
      const imagePath = `hall-of-fame/${Date.now()}-${imageFile.name}`;
      const imageUrl = await uploadImageToStorage(imageFile, imagePath);
      updateData.image_url = imageUrl;
      updateData.image_filename = imageFile.name;
    }

    await firestore.collection("hall_of_fame").doc(photoId).update(updateData);

    return { success: true };
  } catch (error) {
    console.error("Error updating hall of fame photo:", error);
    throw error;
  }
}

// Delete Hall of Fame photo (admin)
async function deleteHallOfFamePhoto(photoId) {
  const db = ensureFirebase();
  const firestore = getFirestore();
  const storage = window.storage;

  try {
    // Get photo document to find image URL
    const photoDoc = await firestore
      .collection("hall_of_fame")
      .doc(photoId)
      .get();

    if (!photoDoc.exists) {
      throw new Error("Photo not found");
    }

    const photoData = photoDoc.data();

    // Delete from Firestore
    await firestore.collection("hall_of_fame").doc(photoId).delete();

    // Delete image from Storage if it's a Storage URL
    if (
      photoData.image_url &&
      photoData.image_url.includes("firebasestorage")
    ) {
      try {
        const imageRef = storage.refFromURL(photoData.image_url);
        await imageRef.delete();
      } catch (storageError) {
        console.warn("Could not delete image from Storage:", storageError);
        // Continue even if Storage delete fails
      }
    }

    return { success: true };
  } catch (error) {
    console.error("Error deleting hall of fame photo:", error);
    throw error;
  }
}

// ========== ADMIN AUTHENTICATION FUNCTIONS ==========

// Simple password-based admin authentication
const ADMIN_PASSWORD = "RoomOneTroom"; // Change this to your desired password

// Check if admin is authenticated
function isAdminAuthenticated() {
  return localStorage.getItem("adminAuthenticated") === "true";
}

// Admin login
function adminLogin(password) {
  if (password === ADMIN_PASSWORD) {
    localStorage.setItem("adminAuthenticated", "true");
    return { success: true };
  } else {
    return { success: false, error: "Invalid password" };
  }
}

// Admin logout
function adminLogout() {
  localStorage.removeItem("adminAuthenticated");
}

// Export for use in other files (same interface as api.js)
window.ceepsAPI = {
  submitGameResult,
  getRecentGames,
  getPlayerStats,
  getLeaderboard,
  getAllPlayers,
  // Preset player list functions
  getPresetPlayers,
  updatePresetPlayers,
  addPlayerToPreset,
  removePlayerFromPreset,
  // Hall of Fame functions
  getHallOfFame,
  addHallOfFamePhoto,
  updateHallOfFamePhoto,
  deleteHallOfFamePhoto,
  // Admin functions
  isAdminAuthenticated,
  adminLogin,
  adminLogout,
  // Game management helper functions
  getPlayersByGameId,
  // Game management functions (Phase 5)
  getGameById,
  recalculatePlayerStatsForPlayers,
  updateGame,
  deleteGame,
  // Constants
  GUEST_PLAYER_NAME,
};
