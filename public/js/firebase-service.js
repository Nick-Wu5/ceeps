// Firebase service layer - replaces api.js
// Provides the same interface as the old API but uses Firestore

// Wait for Firebase to be initialized
function ensureFirebase() {
  if (!window.firebase || !window.db) {
    throw new Error(
      "Firebase not initialized. Make sure Firebase SDK scripts are loaded before this file."
    );
  }
  return window.db;
}

// Helper to get Firestore functions
function getFirestore() {
  return window.firebase.firestore;
}

// Submit a game result
async function submitGameResult(gameData) {
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

    // 1. Add game document
    const gameRef = await firestore.collection("games").add({
      date: gameData.date,
      team1: gameData.team1,
      team2: gameData.team2,
      winner: gameData.winner,
      team1_score: gameData.team1_score,
      team2_score: gameData.team2_score,
      scorecard_player: gameData.scorecard_player,
      created_at: firestore.FieldValue.serverTimestamp(),
    });

    const gameId = gameRef.id;

    // 2. Add individual stats and calculate naked laps
    const allPlayers = [...gameData.team1, ...gameData.team2];
    const statsPromises = allPlayers.map(async (playerName) => {
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

      // Store in individual_stats for later use
      gameData.individual_stats[playerName].naked_laps = finalNakedLapsCount;

      await firestore.collection("individual_game_stats").add({
        game_id: gameId,
        player_name: playerName,
        cups_hit: cupsHit,
        team: team,
        naked_lap: finalNakedLapsCount > 0,
      });
    });

    await Promise.all(statsPromises);

    // 3. Update player stats using transaction
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

  // Get individual stats for this game
  const statsSnapshot = await firestore
    .collection("individual_game_stats")
    .where("game_id", "==", gameId)
    .get();
  const stats = {};
  statsSnapshot.forEach((doc) => {
    const data = doc.data();
    stats[data.player_name] = data;
  });

  // Update stats for each player using transactions
  const updatePromises = allPlayers.map(async (playerName) => {
    const playerStat = stats[playerName];
    if (!playerStat) return;

    const playerTeam = playerStat.team;
    const won = playerTeam === winner;
    const cupsHit = playerStat.cups_hit || 0;
    const nakedLapsCount =
      individualStatsFromRequest?.[playerName]?.naked_laps ||
      (playerStat.naked_lap ? 1 : 0);
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
          last_updated: firestore.FieldValue.serverTimestamp(),
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

        transaction.update(playerStatsRef, {
          games_played: gamesPlayed,
          games_won: gamesWon,
          win_ratio: winRatio,
          cups_hit_avg: cupsHitAvg,
          total_cups_hit: totalCupsHit,
          number_of_scorecards: scorecards,
          naked_laps_run: nakedLaps,
          last_updated: firestore.FieldValue.serverTimestamp(),
        });
      }
    });
  });

  await Promise.all(updatePromises);
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

    // Get individual stats for these games
    const gameIds = games.map((g) => g.id);
    if (gameIds.length > 0) {
      // Firestore 'in' queries are limited to 10 items, so we need to batch
      const statsMap = {};
      const batches = [];
      for (let i = 0; i < gameIds.length; i += 10) {
        const batch = gameIds.slice(i, i + 10);
        batches.push(batch);
      }

      for (const batch of batches) {
        const statsSnapshot = await firestore
          .collection("individual_game_stats")
          .where("game_id", "in", batch)
          .get();
        statsSnapshot.forEach((doc) => {
          const data = doc.data();
          const gameId = data.game_id;
          if (!statsMap[gameId]) {
            statsMap[gameId] = {};
          }
          statsMap[gameId][data.player_name] = data.cups_hit || 0;
        });
      }

      // Add individual_stats to each game
      games.forEach((game) => {
        game.individual_stats = statsMap[game.id] || {};
      });
    }

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
async function getLeaderboard(sortBy = "win_ratio", limit = 20) {
  const db = ensureFirebase();
  const firestore = getFirestore();

  try {
    let orderByField;
    switch (sortBy) {
      case "total_cups":
        orderByField = "total_cups_hit";
        break;
      case "games_played":
        orderByField = "games_played";
        break;
      case "scorecards":
        orderByField = "number_of_scorecards";
        break;
      case "win_ratio":
      default:
        orderByField = "win_ratio";
        break;
    }

    const snapshot = await firestore
      .collection("player_stats")
      .where("games_played", ">", 0)
      .orderBy("games_played", "desc")
      .orderBy(orderByField, "desc")
      .limit(limit)
      .get();
    const leaderboard = [];
    let rank = 1;
    snapshot.forEach((doc) => {
      const data = doc.data();
      leaderboard.push({
        rank: rank++,
        player_name: doc.id,
        games_played: data.games_played || 0,
        games_won: data.games_won || 0,
        win_ratio: data.win_ratio || 0,
        cups_hit_avg: data.cups_hit_avg || 0,
        total_cups_hit: data.total_cups_hit || 0,
        number_of_scorecards: data.number_of_scorecards || 0,
        naked_laps_run: data.naked_laps_run || 0,
      });
    });

    // Sort client-side since Firestore can only order by one field at a time
    if (sortBy === "win_ratio") {
      leaderboard.sort((a, b) => {
        if (b.win_ratio !== a.win_ratio) {
          return b.win_ratio - a.win_ratio;
        }
        return b.games_played - a.games_played;
      });
      // Re-assign ranks
      leaderboard.forEach((player, index) => {
        player.rank = index + 1;
      });
    }

    return leaderboard;
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    throw error;
  }
}

// Get all players
async function getAllPlayers() {
  const db = ensureFirebase();
  const firestore = getFirestore();

  try {
    const snapshot = await firestore.collection("player_stats").get();
    const players = [];
    snapshot.forEach((doc) => {
      players.push(doc.id);
    });
    return players.sort();
  } catch (error) {
    console.error("Error fetching players:", error);
    throw error;
  }
}

// ========== HALL OF FAME FUNCTIONS ==========

// Get all Hall of Fame photos (public)
async function getHallOfFame() {
  const db = ensureFirebase();
  const firestore = getFirestore();

  try {
    const snapshot = await firestore
      .collection("hall_of_fame")
      .orderBy("display_order")
      .orderBy("created_at", "desc")
      .get();

    const photos = [];
    snapshot.forEach((doc) => {
      photos.push({ id: doc.id, ...doc.data() });
    });

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
      created_at: firestore.FieldValue.serverTimestamp(),
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
  // Hall of Fame functions
  getHallOfFame,
  addHallOfFamePhoto,
  updateHallOfFamePhoto,
  deleteHallOfFamePhoto,
  // Admin functions
  isAdminAuthenticated,
  adminLogin,
  adminLogout,
};
