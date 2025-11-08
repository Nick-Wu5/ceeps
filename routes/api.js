const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { db, updatePlayerStats } = require("../database");

// POST /api/submit-result - Submit a new game result
router.post("/submit-result", (req, res) => {
  const {
    date,
    team1,
    team2,
    winner,
    team1_score,
    team2_score,
    scorecard_player,
    individual_stats,
  } = req.body;

  // Validation
  if (
    !date ||
    !team1 ||
    !team2 ||
    !winner ||
    team1_score === undefined ||
    team2_score === undefined ||
    !scorecard_player
  ) {
    return res
      .status(400)
      .json({ success: false, error: "Missing required fields" });
  }

  if (team1.length !== 4 || team2.length !== 4) {
    return res
      .status(400)
      .json({ success: false, error: "Each team must have exactly 4 players" });
  }

  if (!individual_stats || Object.keys(individual_stats).length === 0) {
    return res
      .status(400)
      .json({ success: false, error: "Individual stats required" });
  }

  // Insert game
  const query = `INSERT INTO games 
    (date, team1_player1, team1_player2, team1_player3, team1_player4,
     team2_player1, team2_player2, team2_player3, team2_player4,
     winner, team1_score, team2_score, scorecard_player)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  db.run(
    query,
    [
      date,
      team1[0],
      team1[1],
      team1[2],
      team1[3],
      team2[0],
      team2[1],
      team2[2],
      team2[3],
      winner,
      team1_score,
      team2_score,
      scorecard_player,
    ],
    function (err) {
      if (err) {
        console.error("Error inserting game:", err);
        return res
          .status(500)
          .json({ success: false, error: "Failed to save game" });
      }

      const gameId = this.lastID;

      // Insert individual stats
      const allPlayers = [...team1, ...team2];
      const statsPromises = allPlayers.map((playerName) => {
        return new Promise((resolve, reject) => {
          const stats = individual_stats[playerName] || {};
          const cupsHit = stats.cups_hit || 0;
          const team = team1.includes(playerName) ? "team1" : "team2";
          // Get naked laps count (default 0), convert to boolean for database
          const nakedLapsCount = stats.naked_laps || (stats.naked_lap ? 1 : 0);
          const manualNakedLap = nakedLapsCount > 0;

          // Determine if player should run naked lap
          // Rule: 9 or fewer cups on losing team
          const isLosingTeam =
            (team === "team1" && winner === "team2") ||
            (team === "team2" && winner === "team1");
          const ruleNakedLap = isLosingTeam && cupsHit <= 9;

          const shouldRunNakedLap = ruleNakedLap || manualNakedLap;
          // Store naked laps count for player stats update
          // If manual count provided, use it; otherwise use 1 if rule applies, 0 if not
          const finalNakedLapsCount = manualNakedLap
            ? nakedLapsCount
            : ruleNakedLap
            ? 1
            : 0;
          // Store in individual_stats for updatePlayerStats
          individual_stats[playerName].naked_laps = finalNakedLapsCount;

          db.run(
            `INSERT INTO individual_game_stats 
          (game_id, player_name, cups_hit, team, naked_lap)
          VALUES (?, ?, ?, ?, ?)`,
            [gameId, playerName, cupsHit, team, shouldRunNakedLap ? 1 : 0],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });
      });

      Promise.all(statsPromises)
        .then(() => {
          // Update player stats (pass individual_stats for naked laps counts)
          return updatePlayerStats(gameId, individual_stats);
        })
        .then(() => {
          res.json({ success: true, game_id: gameId });
        })
        .catch((err) => {
          console.error("Error saving individual stats:", err);
          res
            .status(500)
            .json({ success: false, error: "Failed to save player stats" });
        });
    }
  );
});

// GET /api/recent-games - Get recent games list with pagination
router.get("/recent-games", (req, res) => {
  const limit = parseInt(req.query.limit) || 5;
  const offset = parseInt(req.query.offset) || 0;
  const includeTotal = req.query.includeTotal === "true";

  // Get total count if requested
  if (includeTotal) {
    db.get("SELECT COUNT(*) as total FROM games", [], (err, countRow) => {
      if (err) {
        console.error("Error fetching total games:", err);
        return res.status(500).json({ error: "Failed to fetch total games" });
      }

      const total = parseInt(countRow.total) || 0;
      fetchGamesWithStats(limit, offset, total, res);
    });
  } else {
    fetchGamesWithStats(limit, offset, null, res);
  }
});

function fetchGamesWithStats(limit, offset, totalCount, res) {
  const query = `SELECT * FROM games ORDER BY date DESC, created_at DESC LIMIT ? OFFSET ?`;

  db.all(query, [limit, offset], (err, rows) => {
    if (err) {
      console.error("Error fetching recent games:", err);
      return res.status(500).json({ error: "Failed to fetch games" });
    }

    // Get individual stats for all games
    const gameIds = rows.map((row) => row.id);
    if (gameIds.length === 0) {
      return res.json(totalCount !== null ? { games: [], total: totalCount } : []);
    }

    const placeholders = gameIds.map(() => "?").join(",");
    const statsQuery = `SELECT game_id, player_name, cups_hit FROM individual_game_stats WHERE game_id IN (${placeholders})`;

    db.all(statsQuery, gameIds, (err, statsRows) => {
      if (err) {
        console.error("Error fetching individual stats:", err);
        return res.status(500).json({ error: "Failed to fetch individual stats" });
      }

      // Create a map of game_id -> player_name -> cups_hit
      const statsMap = {};
      statsRows.forEach((stat) => {
        const gameId = parseInt(stat.game_id); // Ensure it's a number
        const playerName = stat.player_name;
        const cupsHit = parseInt(stat.cups_hit) || 0; // Ensure it's a number
        
        if (!statsMap[gameId]) {
          statsMap[gameId] = {};
        }
        statsMap[gameId][playerName] = cupsHit;
      });

      const games = rows.map((row) => ({
        id: row.id,
        date: row.date,
        team1: [
          row.team1_player1,
          row.team1_player2,
          row.team1_player3,
          row.team1_player4,
        ],
        team2: [
          row.team2_player1,
          row.team2_player2,
          row.team2_player3,
          row.team2_player4,
        ],
        winner: row.winner,
        team1_score: row.team1_score,
        team2_score: row.team2_score,
        scorecard_player: row.scorecard_player,
        created_at: row.created_at,
        individual_stats: statsMap[parseInt(row.id)] || {},
      }));

      if (totalCount !== null) {
        res.json({ games, total: totalCount });
      } else {
        res.json(games);
      }
    });
  });
}

// GET /api/player-stats/:playerName - Get statistics for a specific player
router.get("/player-stats/:playerName", (req, res) => {
  const playerName = req.params.playerName;

  db.get(
    "SELECT * FROM player_stats WHERE player_name = ?",
    [playerName],
    (err, row) => {
      if (err) {
        console.error("Error fetching player stats:", err);
        return res.status(500).json({ error: "Failed to fetch player stats" });
      }

      if (!row) {
        return res.status(404).json({ error: "Player not found" });
      }

      res.json({
        player_name: row.player_name,
        games_played: row.games_played,
        games_won: row.games_won,
        win_ratio: row.win_ratio,
        cups_hit_avg: row.cups_hit_avg,
        total_cups_hit: row.total_cups_hit,
        number_of_scorecards: row.number_of_scorecards,
        naked_laps_run: row.naked_laps_run,
      });
    }
  );
});

// GET /api/leaderboard - Get leaderboard data
router.get("/leaderboard", (req, res) => {
  const sortBy = req.query.sort_by || "win_ratio";
  const limit = parseInt(req.query.limit) || 20;

  let orderBy;
  switch (sortBy) {
    case "total_cups":
      orderBy = "total_cups_hit DESC";
      break;
    case "games_played":
      orderBy = "games_played DESC";
      break;
    case "scorecards":
      orderBy = "number_of_scorecards DESC";
      break;
    case "win_ratio":
    default:
      orderBy = "win_ratio DESC, games_played DESC";
      break;
  }

  const query = `SELECT * FROM player_stats 
    WHERE games_played > 0
    ORDER BY ${orderBy}
    LIMIT ?`;

  db.all(query, [limit], (err, rows) => {
    if (err) {
      console.error("Error fetching leaderboard:", err);
      return res.status(500).json({ error: "Failed to fetch leaderboard" });
    }

    const leaderboard = rows.map((row, index) => ({
      rank: index + 1,
      player_name: row.player_name,
      games_played: row.games_played,
      games_won: row.games_won,
      win_ratio: row.win_ratio,
      cups_hit_avg: row.cups_hit_avg,
      total_cups_hit: row.total_cups_hit,
      number_of_scorecards: row.number_of_scorecards,
      naked_laps_run: row.naked_laps_run,
    }));

    res.json(leaderboard);
  });
});

// GET /api/players - Get list of all players
router.get("/players", (req, res) => {
  db.all(
    "SELECT DISTINCT player_name FROM player_stats ORDER BY player_name",
    [],
    (err, rows) => {
      if (err) {
        console.error("Error fetching players:", err);
        return res.status(500).json({ error: "Failed to fetch players" });
      }

      const players = rows.map((row) => row.player_name);
      res.json(players);
    }
  );
});

// ========== HALL OF FAME ROUTES ==========

// Multer configuration for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "../public/images/hall-of-fame");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error("Only image files are allowed (jpeg, jpg, png, gif, webp)"));
  },
});

// Simple admin authentication
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "changeme";

function checkAdminAuth(req, res, next) {
  const token = req.headers["x-admin-token"] || req.session?.adminToken;
  if (token === ADMIN_PASSWORD) {
    req.session.adminToken = ADMIN_PASSWORD;
    return next();
  }
  res.status(401).json({ error: "Unauthorized" });
}

// GET /api/hall-of-fame - Public: Get all photos
router.get("/hall-of-fame", (req, res) => {
  db.all(
    "SELECT * FROM hall_of_fame ORDER BY display_order, created_at DESC",
    [],
    (err, rows) => {
      if (err) {
        console.error("Error fetching hall of fame:", err);
        return res.status(500).json({ error: "Failed to fetch photos" });
      }
      res.json(rows);
    }
  );
});

// POST /api/admin/login - Admin login
router.post("/admin/login", (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    req.session.adminToken = ADMIN_PASSWORD;
    res.json({ success: true, token: ADMIN_PASSWORD });
  } else {
    res.status(401).json({ error: "Invalid password" });
  }
});

// GET /api/admin/hall-of-fame - Admin: Get all photos (for editing)
router.get("/admin/hall-of-fame", checkAdminAuth, (req, res) => {
  db.all(
    "SELECT * FROM hall_of_fame ORDER BY display_order, created_at DESC",
    [],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(rows);
    }
  );
});

// POST /api/admin/hall-of-fame - Add new photo
router.post(
  "/admin/hall-of-fame",
  checkAdminAuth,
  upload.single("image"),
  (req, res) => {
    const { caption, display_order } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: "Image file required" });
    }

    if (!caption || !caption.trim()) {
      // Delete uploaded file if validation fails
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Caption is required" });
    }

    db.run(
      `INSERT INTO hall_of_fame (image_filename, caption, display_order)
    VALUES (?, ?, ?)`,
      [req.file.filename, caption.trim(), display_order || 0],
      function (err) {
        if (err) {
          fs.unlinkSync(req.file.path);
          return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, id: this.lastID });
      }
    );
  }
);

// PUT /api/admin/hall-of-fame/:id - Update photo
router.put(
  "/admin/hall-of-fame/:id",
  checkAdminAuth,
  upload.single("image"),
  (req, res) => {
    const id = req.params.id;
    const { caption, display_order } = req.body;

    if (!caption || !caption.trim()) {
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ error: "Caption is required" });
    }

    if (req.file) {
      // New image uploaded - replace old one
      db.get(
        "SELECT image_filename FROM hall_of_fame WHERE id = ?",
        [id],
        (err, row) => {
          if (err) {
            fs.unlinkSync(req.file.path);
            return res.status(500).json({ error: err.message });
          }
          if (!row) {
            fs.unlinkSync(req.file.path);
            return res.status(404).json({ error: "Photo not found" });
          }

          // Update with new image
          db.run(
            `UPDATE hall_of_fame SET image_filename = ?, caption = ?, display_order = ?
        WHERE id = ?`,
            [req.file.filename, caption.trim(), display_order || 0, id],
            function (err) {
              if (err) {
                fs.unlinkSync(req.file.path);
                return res.status(500).json({ error: err.message });
              }
              // Delete old image
              const oldPath = path.join(
                __dirname,
                "../public/images/hall-of-fame",
                row.image_filename
              );
              fs.unlink(oldPath, () => {});
              res.json({ success: true });
            }
          );
        }
      );
    } else {
      // Just update caption/order
      db.run(
        `UPDATE hall_of_fame SET caption = ?, display_order = ? WHERE id = ?`,
        [caption.trim(), display_order || 0, id],
        function (err) {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ success: true });
        }
      );
    }
  }
);

// DELETE /api/admin/hall-of-fame/:id - Delete photo
router.delete("/admin/hall-of-fame/:id", checkAdminAuth, (req, res) => {
  const id = req.params.id;

  db.get(
    "SELECT image_filename FROM hall_of_fame WHERE id = ?",
    [id],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: "Photo not found" });

      db.run("DELETE FROM hall_of_fame WHERE id = ?", [id], (err) => {
        if (err) return res.status(500).json({ error: err.message });

        // Delete image file
        const imagePath = path.join(
          __dirname,
          "../public/images/hall-of-fame",
          row.image_filename
        );
        fs.unlink(imagePath, (err) => {
          // Continue even if file delete fails
          if (err) console.error("Error deleting image file:", err);
        });
        res.json({ success: true });
      });
    }
  );
});

// GET /api/random-background - Get random background image
router.get("/random-background", (req, res) => {
  const imagesDir = path.join(__dirname, "../public/images");

  fs.readdir(imagesDir, (err, files) => {
    if (err) {
      return res.json({ image: "images/home_background.jpeg" }); // Fallback
    }

    // Filter for image files only (exclude directories and non-image files)
    const imageExtensions = /\.(jpg|jpeg|png|gif|webp)$/i;
    const imageFiles = files.filter((file) => {
      const filePath = path.join(imagesDir, file);
      return fs.statSync(filePath).isFile() && imageExtensions.test(file);
    });

    if (imageFiles.length === 0) {
      return res.json({ image: "images/home_background.jpeg" }); // Fallback
    }

    // Return random image
    const randomImage =
      imageFiles[Math.floor(Math.random() * imageFiles.length)];
    res.json({ image: `images/${randomImage}` });
  });
});

module.exports = router;
