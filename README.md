# Ceeps Website

A Century Pong game tracking website built with Firebase and vanilla JavaScript.

## Features

- **Game Submission**: Submit game results with team scores, individual player stats, and naked lap tracking
- **Recent Games**: View recent games with pagination (5 games per page)
- **Player Stats**: Search and view individual player statistics
- **Leaderboards**: Sortable leaderboards by win rate, total cups, games played, or scorecards
- **Hall of Fame**: Photo gallery of memorable moments
- **Admin Panel**: Manage Hall of Fame photos (password protected)

## Tech Stack

- **Frontend**: Vanilla HTML, CSS (Tailwind), JavaScript
- **Backend**: Firebase (Firestore, Storage, Hosting)
- **Database**: Cloud Firestore
- **Storage**: Firebase Storage (for Hall of Fame images)
- **Hosting**: Firebase Hosting

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build CSS:
   ```bash
   npm run build-css-prod
   ```

3. Deploy to Firebase:
   ```bash
   npx firebase deploy
   ```

## Development

- Watch CSS changes: `npm run build-css`
- Production CSS build: `npm run build-css-prod`

## Project Structure

- `public/` - All frontend files (HTML, JS, CSS, images)
- `src/input.css` - Tailwind CSS source file
- `firebase.json` - Firebase configuration
- `firestore.rules` - Firestore security rules
- `storage.rules` - Storage security rules

## Admin Access

Admin password is configured in `public/js/firebase-service.js`. Change the `ADMIN_PASSWORD` constant to set your admin password.
