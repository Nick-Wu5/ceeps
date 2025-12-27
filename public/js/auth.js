// Authentication logic

// Password for the site
const SITE_PASSWORD = "KNOX1839";

// Storage keys
const AUTH_STORAGE_KEY = "ceepsAuthenticated";
const AUTH_TIMESTAMP_KEY = "ceepsAuthTimestamp";

// 24 hours in milliseconds
const SESSION_TIMEOUT = 24 * 60 * 60 * 1000;

/**
 * Check if user is authenticated
 * @returns {boolean}
 */
function isAuthenticated() {
  const authenticated = localStorage.getItem(AUTH_STORAGE_KEY) === "true";
  const timestamp = localStorage.getItem(AUTH_TIMESTAMP_KEY);

  if (!authenticated || !timestamp) {
    return false;
  }

  // Check if session has expired
  const now = Date.now();
  const authTime = parseInt(timestamp, 10);
  if (now - authTime > SESSION_TIMEOUT) {
    logout();
    return false;
  }

  return true;
}

/**
 * Authenticate with password
 * @param {string} Password
 * @returns {{success: boolean, error?: string}}
 */

function login(password) {
  if (password === SITE_PASSWORD) {
    localStorage.setItem(AUTH_STORAGE_KEY, "true");
    localStorage.setItem(AUTH_TIMESTAMP_KEY, Date.now().toString());
    return { success: true };
  } else {
    return { success: false, error: "Invalid password" };
  }
}

/**
 * Logout and clear authentication
 */
function logout() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  localStorage.removeItem(AUTH_TIMESTAMP_KEY);
}

/**
 * Protect a page - redirects to login if not authenticated
 * Call this on page load or protected pages
 */
function protectPage() {
  if (!isAuthenticated()) {
    showLoginModal();
  }
}

/**
 * Show a simple login modal
 */
function showLoginModal() {
  // Create modal overlay
  const overlay = document.createElement("div");
  overlay.id = "auth-overlay";
  overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.7);
        backdrop-filter: blur(10px);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
    `;

  // Create modal content
  const modal = document.createElement("div");
  modal.style.cssText = `
        background: #1a1a1a;
        padding: 2rem;
        border: 4px solid #d2690d;
        max-width: 400px;
        width: 90%;
    `;

  modal.innerHTML = `
        <h2 class="auth-modal-title">Password Required</h2>
        <form id="auth-form" style="display: flex; flex-direction: column; gap: 1 rem;">
            <input
                type="password"
                id="auth-password"
                placeholder="Enter password..."
                class="form-input"
                required
                autofocus
            />
        <div id="auth-message" style="color: #ef4444; min-height: 1.5rem; font-size:0.9rem;"></div>
        <button
            type="submit"
            class="nav-button"
        >
            Login
        </button>
    </form>
`;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";

  // Focus password input
  const passwordInput = document.getElementById("auth-password");
  passwordInput.focus();

  // Handle form submission
  document.getElementById("auth-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const password = passwordInput.value;
    const result = login(password);
    const messageDiv = document.getElementById("auth-message");

    if (result.success) {
      overlay.remove();
      document.body.style.overflow = "";
      // Reload page to show protected content
      window.location.reload();
    } else {
      messageDiv.textContent = result.error || "Invalid Password";
      passwordInput.value = "";
      passwordInput.focus();
    }
  });

  // Prevent closing by clicking outside
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
    }
  });
}

window.ceepsAuth = {
  isAuthenticated,
  login,
  logout,
  protectPage,
  showLoginModal,
};
