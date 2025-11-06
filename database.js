const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

// Determine database path (use Railway volume if available, otherwise local data folder)
const dbDir =
  process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, "data");
const dbPath = path.join(dbDir, "ceeps.db");

// Ensure data directory exists
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Create database connection
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Error opening database:", err.message);
  } else {
    console.log("Connected to SQLite database at", dbPath);
  }
});

// Initialize database tables
function initDatabase() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Games table
      db.run(
        `CREATE TABLE IF NOT EXISTS games (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        team1_player1 TEXT NOT NULL,
        team1_player2 TEXT NOT NULL,
        team1_player3 TEXT NOT NULL,
        team1_player4 TEXT NOT NULL,
        team2_player1 TEXT NOT NULL,
        team2_player2 TEXT NOT NULL,
        team2_player3 TEXT NOT NULL,
        team2_player4 TEXT NOT NULL,
        winner TEXT NOT NULL,
        team1_score INTEGER NOT NULL,
        team2_score INTEGER NOT NULL,
        overtime BOOLEAN DEFAULT 0,
        team1_ot_cups INTEGER DEFAULT 0,
        team2_ot_cups INTEGER DEFAULT 0,
        scorecard_player TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
        (err) => {
          if (err) {
            console.error("Error creating games table:", err.message);
            reject(err);
            return;
          }
        }
      );

      // Individual game stats table
      db.run(
        `CREATE TABLE IF NOT EXISTS individual_game_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id INTEGER NOT NULL,
        player_name TEXT NOT NULL,
        cups_hit INTEGER NOT NULL,
        ot_cups_hit INTEGER DEFAULT 0,
        team TEXT NOT NULL,
        naked_lap BOOLEAN DEFAULT 0,
        FOREIGN KEY (game_id) REFERENCES games(id)
      )`,
        (err) => {
          if (err) {
            console.error(
              "Error creating individual_game_stats table:",
              err.message
            );
            reject(err);
            return;
          }
        }
      );

      // Player stats table (aggregated)
      db.run(
        `CREATE TABLE IF NOT EXISTS player_stats (
        player_name TEXT PRIMARY KEY,
        games_played INTEGER DEFAULT 0,
        games_won INTEGER DEFAULT 0,
        win_ratio REAL DEFAULT 0,
        cups_hit_avg REAL DEFAULT 0,
        total_cups_hit INTEGER DEFAULT 0,
        total_ot_cups_hit INTEGER DEFAULT 0,
        number_of_scorecards INTEGER DEFAULT 0,
        naked_laps_run INTEGER DEFAULT 0,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
        (err) => {
          if (err) {
            console.error("Error creating player_stats table:", err.message);
            reject(err);
            return;
          }
        }
      );

      // Hall of Fame table
      db.run(
        `CREATE TABLE IF NOT EXISTS hall_of_fame (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        image_filename TEXT NOT NULL,
        caption TEXT NOT NULL,
        display_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
        (err) => {
          if (err) {
            console.error("Error creating hall_of_fame table:", err.message);
            reject(err);
            return;
          }
          console.log("Database tables initialized successfully");
          resolve();
        }
      );
    });
  });
}

// Helper function to update player stats after a game is added
function updatePlayerStats(gameId) {
  return new Promise((resolve, reject) => {
    // Get game details
    db.get(
      "SELECT winner, team1_player1, team1_player2, team1_player3, team1_player4, team2_player1, team2_player2, team2_player3, team2_player4, scorecard_player FROM games WHERE id = ?",
      [gameId],
      (err, game) => {
        if (err) {
          reject(err);
          return;
        }

        // Get all individual stats for this game
        db.all(
          "SELECT player_name, cups_hit, ot_cups_hit, team, naked_lap FROM individual_game_stats WHERE game_id = ?",
          [gameId],
          (err, stats) => {
            if (err) {
              reject(err);
              return;
            }

            const winner = game.winner;
            const scorecardPlayer = game.scorecard_player;
            const allPlayers = [
              game.team1_player1,
              game.team1_player2,
              game.team1_player3,
              game.team1_player4,
              game.team2_player1,
              game.team2_player2,
              game.team2_player3,
              game.team2_player4,
            ];

            // Update stats for each player
            const updatePromises = allPlayers.map((playerName) => {
              return new Promise((resolveUpdate, rejectUpdate) => {
                const playerStat = stats.find(
                  (s) => s.player_name === playerName
                );
                if (!playerStat) {
                  resolveUpdate();
                  return;
                }

                const playerTeam = playerStat.team;
                const won = playerTeam === winner;
                const cupsHit = playerStat.cups_hit || 0;
                const otCupsHit = playerStat.ot_cups_hit || 0;
                const nakedLap = playerStat.naked_lap ? 1 : 0;
                const gotScorecard = playerName === scorecardPlayer ? 1 : 0;

                // Get current stats
                db.get(
                  "SELECT * FROM player_stats WHERE player_name = ?",
                  [playerName],
                  (err, currentStats) => {
                    if (err) {
                      rejectUpdate(err);
                      return;
                    }

                    if (!currentStats) {
                      // Create new player stats
                      const gamesPlayed = 1;
                      const gamesWon = won ? 1 : 0;
                      const winRatio = won ? 1.0 : 0.0;
                      const totalCupsHit = cupsHit;
                      const totalOtCupsHit = otCupsHit;
                      const cupsHitAvg = cupsHit;
                      const scorecards = gotScorecard ? 1 : 0;
                      const nakedLaps = nakedLap;

                      db.run(
                        `INSERT INTO player_stats 
                  (player_name, games_played, games_won, win_ratio, cups_hit_avg, total_cups_hit, total_ot_cups_hit, number_of_scorecards, naked_laps_run, last_updated)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                        [
                          playerName,
                          gamesPlayed,
                          gamesWon,
                          winRatio,
                          cupsHitAvg,
                          totalCupsHit,
                          totalOtCupsHit,
                          scorecards,
                          nakedLaps,
                        ],
                        (err) => {
                          if (err) rejectUpdate(err);
                          else resolveUpdate();
                        }
                      );
                    } else {
                      // Update existing stats
                      const gamesPlayed = currentStats.games_played + 1;
                      const gamesWon = currentStats.games_won + (won ? 1 : 0);
                      const winRatio = gamesWon / gamesPlayed;
                      const totalCupsHit =
                        currentStats.total_cups_hit + cupsHit;
                      const totalOtCupsHit =
                        currentStats.total_ot_cups_hit + otCupsHit;
                      const cupsHitAvg = totalCupsHit / gamesPlayed;
                      const scorecards =
                        currentStats.number_of_scorecards + gotScorecard;
                      const nakedLaps = currentStats.naked_laps_run + nakedLap;

                      db.run(
                        `UPDATE player_stats SET
                  games_played = ?,
                  games_won = ?,
                  win_ratio = ?,
                  cups_hit_avg = ?,
                  total_cups_hit = ?,
                  total_ot_cups_hit = ?,
                  number_of_scorecards = ?,
                  naked_laps_run = ?,
                  last_updated = CURRENT_TIMESTAMP
                  WHERE player_name = ?`,
                        [
                          gamesPlayed,
                          gamesWon,
                          winRatio,
                          cupsHitAvg,
                          totalCupsHit,
                          totalOtCupsHit,
                          scorecards,
                          nakedLaps,
                          playerName,
                        ],
                        (err) => {
                          if (err) rejectUpdate(err);
                          else resolveUpdate();
                        }
                      );
                    }
                  }
                );
              });
            });

            Promise.all(updatePromises)
              .then(() => resolve())
              .catch(reject);
          }
        );
      }
    );
  });
}

module.exports = {
  db,
  initDatabase,
  updatePlayerStats,
};
