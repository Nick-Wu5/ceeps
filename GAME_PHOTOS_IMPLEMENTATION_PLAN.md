# Game Photos Implementation Plan

## Overview

Add optional photo upload functionality for each game, displayed as thumbnails on the recent games page with click-to-expand lightbox functionality.

---

## Requirements

1. **Optional photo per game** - Not required for game submission
2. **Thumbnail display** - Show small thumbnail in game card
3. **Click to expand** - Lightbox/modal to view full-size image
4. **Admin deletion** - Photos deletable when game is deleted
5. **Firebase Storage** - Use existing Storage infrastructure

---

## Implementation Plan

### Phase 1: Schema & Storage Setup

#### 1.1 Update Games Schema

**File**: `public/js/firebase-service.js`

Add optional fields to `games` collection:

```javascript
games/{gameId}: {
  // ... existing fields ...
  photo_url: string | null,        // Firebase Storage URL (optional)
  photo_filename: string | null,   // Original filename (optional)
}
```

**Changes**:

- Update `submitGameResult()` to accept optional photo
- Update `updateGame()` to handle photo updates
- Update `deleteGame()` to delete photo from Storage

#### 1.2 Update Storage Rules

**File**: `storage.rules`

Add rules for `game-photos` path:

```javascript
// Game photos - public read, write allowed
match /game-photos/{allPaths=**} {
  allow read: if true;
  allow write: if true;
}
```

**Path Structure**: `game-photos/{gameId}-{timestamp}-{filename}`

---

### Phase 2: Upload Functionality

#### 2.1 Add File Input to Submit Form

**File**: `public/submit_results.html`

Add photo upload field in the form:

```html
<!-- Photo Upload (Optional) -->
<div>
  <label class="block text-orange-500 font-bold mb-2">
    Game Photo (Optional)
  </label>
  <input
    type="file"
    name="game_photo"
    id="game-photo-input"
    accept="image/*"
    class="form-input"
  />
  <p class="text-sm text-gray-400 mt-1">
    Upload a photo from this game (optional)
  </p>
</div>
```

**Location**: Add after date field, before team inputs

#### 2.2 Update Submit Form Logic

**File**: `public/js/submit.js`

**Changes**:

1. Collect photo file from form:

   ```javascript
   const photoFile = formData.get("game_photo");
   ```

2. Add photo to `gameData`:

   ```javascript
   const gameData = {
     // ... existing fields ...
     photo_file: photoFile || null, // File object or null
   };
   ```

3. Pass to `submitGameResult()`:
   ```javascript
   const result = await window.ceepsAPI.submitGameResult(
     window.pendingGameData
   );
   ```

**Note**: File object cannot be stored in `pendingGameData` (not serializable). Handle upload in `submitGameResult()` directly.

---

### Phase 3: Backend Photo Handling

#### 3.1 Update `submitGameResult()`

**File**: `public/js/firebase-service.js`

**Changes**:

1. Accept optional `photoFile` parameter:

   ```javascript
   async function submitGameResult(gameData, photoFile = null) {
   ```

2. Upload photo if provided (before creating game document):

   ```javascript
   let photoUrl = null;
   let photoFilename = null;

   if (photoFile) {
     const imagePath = `game-photos/${Date.now()}-${photoFile.name}`;
     photoUrl = await uploadImageToStorage(photoFile, imagePath);
     photoFilename = photoFile.name;
   }
   ```

3. Include photo fields in game document:
   ```javascript
   const gameRef = await firestore.collection("games").add({
     // ... existing fields ...
     photo_url: photoUrl,
     photo_filename: photoFilename,
   });
   ```

#### 3.2 Update `updateGame()`

**File**: `public/js/firebase-service.js`

**Changes**:

1. Accept optional `photoFile` parameter:

   ```javascript
   async function updateGame(gameId, gameData, photoFile = null) {
   ```

2. Handle photo update:

   - If new photo provided: Upload new photo, delete old photo (if exists)
   - If no photo provided: Keep existing photo
   - If photo should be removed: Add separate function or flag

3. Update game document with new photo URL

#### 3.3 Update `deleteGame()`

**File**: `public/js/firebase-service.js`

**Changes**:

1. Get photo URL from game document before deletion
2. Delete photo from Storage if exists:
   ```javascript
   if (game.photo_url) {
     try {
       const photoRef = storage.refFromURL(game.photo_url);
       await photoRef.delete();
     } catch (error) {
       console.error("Error deleting game photo:", error);
       // Continue with game deletion even if photo deletion fails
     }
   }
   ```

#### 3.4 Helper Function: Delete Photo from Storage

**File**: `public/js/firebase-service.js`

Add helper function:

```javascript
async function deletePhotoFromStorage(photoUrl) {
  const storage = window.storage;
  if (!storage) {
    throw new Error("Firebase Storage not initialized");
  }

  try {
    const photoRef = storage.refFromURL(photoUrl);
    await photoRef.delete();
    return { success: true };
  } catch (error) {
    console.error("Error deleting photo from Storage:", error);
    throw error;
  }
}
```

---

### Phase 4: Display Functionality

#### 4.1 Update Game Card HTML

**File**: `public/js/recent-games.js`

**Changes**:

1. Add thumbnail section to `createGameCard()`:

   ```javascript
   ${game.photo_url ? `
     <div class="mt-4">
       <img
         src="${game.photo_url}"
         alt="Game photo"
         class="game-photo-thumbnail cursor-pointer hover:opacity-80 transition-opacity"
         onclick="openPhotoLightbox('${game.photo_url}')"
       />
     </div>
   ` : ''}
   ```

2. Add CSS classes for thumbnail styling

#### 4.2 Add Lightbox Modal

**File**: `public/js/recent-games.js` or separate file

**Implementation**:

1. Create lightbox HTML structure:

   ```html
   <div
     id="photo-lightbox"
     class="hidden fixed inset-0 z-50 bg-black bg-opacity-90 flex items-center justify-center"
   >
     <div class="relative max-w-4xl max-h-full p-4">
       <button
         id="close-lightbox"
         class="absolute top-2 right-2 text-white text-4xl hover:text-gray-300"
       >
         ×
       </button>
       <img
         id="lightbox-image"
         src=""
         alt="Game photo"
         class="max-w-full max-h-[90vh] object-contain"
       />
     </div>
   </div>
   ```

2. Add to `recent_games.html` or inject via JavaScript

3. JavaScript functions:

   ```javascript
   function openPhotoLightbox(photoUrl) {
     const lightbox = document.getElementById("photo-lightbox");
     const image = document.getElementById("lightbox-image");
     image.src = photoUrl;
     lightbox.classList.remove("hidden");
   }

   function closePhotoLightbox() {
     const lightbox = document.getElementById("photo-lightbox");
     lightbox.classList.add("hidden");
   }
   ```

4. Event listeners:
   - Click thumbnail → open lightbox
   - Click close button → close lightbox
   - Click outside image → close lightbox
   - ESC key → close lightbox

#### 4.3 Add CSS Styling

**File**: `public/styles.css` or inline in `recent-games.js`

**Styles**:

```css
.game-photo-thumbnail {
  width: 200px;
  height: 150px;
  object-fit: cover;
  border-radius: 0.5rem;
  border: 2px solid rgba(255, 165, 0, 0.3);
}
```

---

### Phase 5: Admin Features (Optional)

#### 5.1 Photo Deletion in Admin Panel

**File**: `public/admin/test-game-management.html` or new admin page

**Features**:

- List games with photos
- Delete photo from game (without deleting game)
- Replace photo

#### 5.2 Update `deleteGame()` Function

Already covered in Phase 3.3

---

## File Changes Summary

### Files to Modify:

1. ✅ `public/js/firebase-service.js`

   - Update `submitGameResult()` - add photo upload
   - Update `updateGame()` - handle photo updates
   - Update `deleteGame()` - delete photo from Storage
   - Add `deletePhotoFromStorage()` helper

2. ✅ `public/submit_results.html`

   - Add file input for photo upload

3. ✅ `public/js/submit.js`

   - Collect photo file from form
   - Pass to `submitGameResult()`

4. ✅ `public/js/recent-games.js`

   - Update `createGameCard()` to show thumbnail
   - Add lightbox functionality

5. ✅ `public/recent_games.html`

   - Add lightbox modal HTML (or inject via JS)

6. ✅ `storage.rules`

   - Add rules for `game-photos` path

7. ✅ `public/styles.css` (or inline)
   - Add thumbnail and lightbox styles

### Files to Create:

- None (all functionality in existing files)

---

## Implementation Order

### Step 1: Storage & Schema Setup

1. Update `storage.rules` for `game-photos` path
2. Update `submitGameResult()` to accept and store photo
3. Test photo upload

### Step 2: Form Integration

1. Add file input to `submit_results.html`
2. Update `submit.js` to collect and pass photo
3. Test end-to-end upload

### Step 3: Display

1. Update `createGameCard()` to show thumbnail
2. Add lightbox HTML and JavaScript
3. Add CSS styling
4. Test thumbnail and lightbox

### Step 4: Cleanup & Admin

1. Update `deleteGame()` to delete photos
2. Update `updateGame()` to handle photo updates
3. Test deletion

---

## Technical Considerations

### 1. File Size Limits

- **Firebase Storage**: Default 32MB per file
- **Recommendation**: Add client-side validation (e.g., max 10MB)
- **Compression**: Consider client-side image compression before upload

### 2. Image Formats

- Accept: `image/*` (all image types)
- Common: JPG, PNG, WebP
- Storage: Store as-is (no conversion needed)

### 3. Thumbnail Generation

- **Option 1**: Use full image as thumbnail (browser scales)
- **Option 2**: Generate thumbnail on upload (requires image processing library)
- **Recommendation**: Start with Option 1, optimize later if needed

### 4. Error Handling

- Photo upload failure should not block game submission
- Show error message but allow game to be saved
- Log errors for debugging

### 5. Performance

- Thumbnails: Use `object-fit: cover` for consistent sizing
- Lazy loading: Consider lazy loading images below fold
- Caching: Browser will cache images automatically

### 6. Security

- Storage rules: Public read (photos are public)
- File validation: Check file type and size client-side
- Path structure: Use timestamp to prevent collisions

---

## Testing Checklist

- [ ] Photo upload works in submit form
- [ ] Photo displays as thumbnail in game card
- [ ] Lightbox opens on thumbnail click
- [ ] Lightbox closes on button/outside/ESC
- [ ] Photo deletion works when game is deleted
- [ ] Photo update works in `updateGame()`
- [ ] Games without photos display correctly
- [ ] Large images are handled properly
- [ ] Error handling works (upload failure, etc.)

---

## Future Enhancements (Optional)

1. **Multiple photos per game** - Array of photo URLs
2. **Photo captions** - Add caption field
3. **Photo editing** - Crop, rotate, filters
4. **Photo compression** - Client-side compression before upload
5. **Thumbnail generation** - Server-side thumbnail creation
6. **Photo gallery view** - Grid view of all game photos

---

_Last Updated: Game photos implementation plan_
