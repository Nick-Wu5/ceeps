// Load environment variables from .env file
require("dotenv").config();

const express = require("express");
const path = require("path");
const session = require("express-session");
const { initDatabase } = require("./database");
const apiRoutes = require("./routes/api");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware for admin authentication
app.use(
  session({
    secret:
      process.env.SESSION_SECRET ||
      "ceeps-hall-of-fame-secret-key-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }, // Set to true if using HTTPS
  })
);

// Serve static files from public directory
app.use(express.static("public"));

// API routes
app.use("/api", apiRoutes);

// Initialize database on startup
initDatabase()
  .then(() => {
    console.log("Database initialized");

    // Start server
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Visit http://localhost:${PORT}/home.html`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialize database:", err);
    process.exit(1);
  });

// Catch-all route for SPA (if needed later)
app.get("*", (req, res) => {
  // Don't interfere with API routes
  if (req.path.startsWith("/api")) {
    return res.status(404).json({ error: "API endpoint not found" });
  }
  // Serve index.html for other routes (if implementing SPA later)
  res.sendFile(path.join(__dirname, "public", "home.html"));
});

module.exports = app;
