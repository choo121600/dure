// Shared JavaScript utilities for Orchestral frontend

// ============================================
// Global Error Handling (Task 7.1)
// ============================================

/**
 * Global error handler for unhandled errors
 */
window.addEventListener('error', (event) => {
  console.error('Unhandled error:', event.error);
  showToast('An unexpected error occurred. Please try again.', 'error');
});

/**
 * Global handler for unhandled promise rejections
 */
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  const message = event.reason?.message || 'A network error occurred.';
  showToast(message, 'error');
  event.preventDefault();
});

// ============================================
// Offline Detection (Task 7.3)
// ============================================

let isOnline = navigator.onLine;
let offlineBanner = null;

/**
 * Create offline banner element
 */
function createOfflineBanner() {
  if (offlineBanner) return offlineBanner;

  offlineBanner = document.createElement('div');
  offlineBanner.id = 'offline-banner';
  offlineBanner.className = 'offline-banner';
  offlineBanner.setAttribute('role', 'alert');
  offlineBanner.setAttribute('aria-live', 'assertive');
  offlineBanner.innerHTML = `
    <span class="offline-icon" aria-hidden="true">&#x26A0;</span>
    <span>You are offline. Some features may not work.</span>
  `;
  offlineBanner.style.display = 'none';
  document.body.insertBefore(offlineBanner, document.body.firstChild);
  return offlineBanner;
}

/**
 * Show offline banner
 */
function showOfflineBanner() {
  const banner = createOfflineBanner();
  banner.style.display = 'flex';
  isOnline = false;
}

/**
 * Hide offline banner
 */
function hideOfflineBanner() {
  if (offlineBanner) {
    offlineBanner.style.display = 'none';
  }
  isOnline = true;
}

/**
 * Attempt to reconnect WebSocket
 */
function reconnectWebSocket() {
  if (typeof socket !== 'undefined' && socket.disconnected) {
    socket.connect();
    showToast('Reconnected to server', 'success');
  }
}

window.addEventListener('online', () => {
  hideOfflineBanner();
  reconnectWebSocket();
  showToast('Connection restored', 'success');
});

window.addEventListener('offline', () => {
  showOfflineBanner();
  showToast('You are offline', 'warning');
});

// Initialize offline banner on load
document.addEventListener('DOMContentLoaded', () => {
  createOfflineBanner();
  if (!navigator.onLine) {
    showOfflineBanner();
  }
});

// ============================================
// Toast Notifications (Enhanced)
// ============================================

let toastContainer = null;

/**
 * Create toast container
 */
function createToastContainer() {
  if (toastContainer) return toastContainer;

  toastContainer = document.createElement('div');
  toastContainer.id = 'toast-container';
  toastContainer.className = 'toast-container';
  toastContainer.setAttribute('aria-live', 'polite');
  toastContainer.setAttribute('aria-atomic', 'true');
  document.body.appendChild(toastContainer);
  return toastContainer;
}

/**
 * Show a toast notification
 */
function showToast(message, type = 'info', duration = 5000) {
  const container = createToastContainer();

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');

  const icon = getToastIcon(type);
  toast.innerHTML = `
    <span class="toast-icon" aria-hidden="true">${icon}</span>
    <span class="toast-message">${escapeHtml(message)}</span>
    <button class="toast-close" aria-label="Close notification" onclick="this.parentElement.remove()">
      <span aria-hidden="true">&times;</span>
    </button>
  `;

  container.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  // Auto remove
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);

  return toast;
}

/**
 * Get icon for toast type
 */
function getToastIcon(type) {
  const icons = {
    success: '&#x2713;',
    error: '&#x2717;',
    warning: '&#x26A0;',
    info: '&#x2139;'
  };
  return icons[type] || icons.info;
}

// ============================================
// Loading State Management (Task 7.2)
// ============================================

const loadingStates = new Map();

/**
 * Show loading state for an element
 */
function showLoading(elementOrId, text = 'Loading...') {
  const element = typeof elementOrId === 'string'
    ? document.getElementById(elementOrId)
    : elementOrId;

  if (!element) return;

  // Store original content
  loadingStates.set(element, {
    originalContent: element.innerHTML,
    originalDisabled: element.disabled
  });

  // Add loading class
  element.classList.add('loading');

  // Handle different element types
  if (element.tagName === 'BUTTON') {
    element.disabled = true;
    element.innerHTML = `<span class="loading-spinner" aria-hidden="true"></span> ${escapeHtml(text)}`;
  } else if (element.tagName === 'TABLE') {
    const tbody = element.querySelector('tbody');
    if (tbody) {
      const colSpan = element.querySelector('thead tr')?.children.length || 1;
      tbody.innerHTML = `<tr><td colspan="${colSpan}" class="loading-cell">
        <span class="loading-spinner" aria-hidden="true"></span> ${escapeHtml(text)}
      </td></tr>`;
    }
  } else {
    element.innerHTML = `<div class="loading-placeholder">
      <span class="loading-spinner" aria-hidden="true"></span> ${escapeHtml(text)}
    </div>`;
  }

  element.setAttribute('aria-busy', 'true');
}

/**
 * Hide loading state for an element
 */
function hideLoading(elementOrId) {
  const element = typeof elementOrId === 'string'
    ? document.getElementById(elementOrId)
    : elementOrId;

  if (!element) return;

  const state = loadingStates.get(element);
  if (state) {
    element.innerHTML = state.originalContent;
    if (element.tagName === 'BUTTON') {
      element.disabled = state.originalDisabled;
    }
    loadingStates.delete(element);
  }

  element.classList.remove('loading');
  element.setAttribute('aria-busy', 'false');
}

/**
 * Show skeleton loading for a container
 */
function showSkeleton(elementOrId, count = 3) {
  const element = typeof elementOrId === 'string'
    ? document.getElementById(elementOrId)
    : elementOrId;

  if (!element) return;

  loadingStates.set(element, {
    originalContent: element.innerHTML
  });

  let skeletons = '';
  for (let i = 0; i < count; i++) {
    skeletons += '<div class="skeleton-item"><div class="skeleton-line"></div></div>';
  }

  element.innerHTML = `<div class="skeleton-container" aria-label="Loading content">${skeletons}</div>`;
  element.setAttribute('aria-busy', 'true');
}

/**
 * Enhanced API helper with loading states
 */
async function apiRequest(endpoint, options = {}) {
  const { method = 'GET', data, loadingElement, loadingText } = options;

  if (loadingElement) {
    showLoading(loadingElement, loadingText);
  }

  try {
    const fetchOptions = {
      method,
      headers: {}
    };

    if (data) {
      fetchOptions.headers['Content-Type'] = 'application/json';
      fetchOptions.body = JSON.stringify(data);
    }

    const res = await fetch(endpoint, fetchOptions);
    const json = await res.json();

    if (!res.ok) {
      throw new Error(json.error || `Request failed with status ${res.status}`);
    }

    return json;
  } catch (error) {
    if (!navigator.onLine) {
      showToast('You are offline. Please check your connection.', 'error');
    } else {
      showToast(error.message || 'An error occurred', 'error');
    }
    throw error;
  } finally {
    if (loadingElement) {
      hideLoading(loadingElement);
    }
  }
}

// ============================================
// Accessibility Helpers (Task 7.4)
// ============================================

/**
 * Add keyboard navigation support to interactive elements
 */
function enableKeyboardNav(selector) {
  const elements = document.querySelectorAll(selector);
  elements.forEach(el => {
    if (!el.hasAttribute('tabindex') && el.tagName !== 'BUTTON' && el.tagName !== 'A') {
      el.setAttribute('tabindex', '0');
    }

    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        el.click();
      }
    });
  });
}

/**
 * Announce message to screen readers
 */
function announce(message, priority = 'polite') {
  const announcer = document.getElementById('sr-announcer') || createAnnouncer();
  announcer.setAttribute('aria-live', priority);
  announcer.textContent = message;

  // Clear after a delay to allow re-announcement of same message
  setTimeout(() => {
    announcer.textContent = '';
  }, 1000);
}

/**
 * Create screen reader announcer element
 */
function createAnnouncer() {
  const announcer = document.createElement('div');
  announcer.id = 'sr-announcer';
  announcer.className = 'sr-only';
  announcer.setAttribute('aria-live', 'polite');
  announcer.setAttribute('aria-atomic', 'true');
  document.body.appendChild(announcer);
  return announcer;
}

/**
 * Focus trap for modals
 */
function createFocusTrap(element) {
  const focusableElements = element.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  function handleKeydown(e) {
    if (e.key !== 'Tab') return;

    if (e.shiftKey && document.activeElement === firstElement) {
      e.preventDefault();
      lastElement.focus();
    } else if (!e.shiftKey && document.activeElement === lastElement) {
      e.preventDefault();
      firstElement.focus();
    }
  }

  element.addEventListener('keydown', handleKeydown);
  firstElement?.focus();

  return () => element.removeEventListener('keydown', handleKeydown);
}

// ============================================
// Utility Functions
// ============================================

/**
 * Format phase for display
 */
function formatPhase(phase) {
  const labels = {
    refine: 'Refine',
    build: 'Build',
    verify: 'Verify',
    gate: 'Gate',
    waiting_human: 'Waiting',
    ready_for_merge: 'Ready',
    completed: 'Completed',
    failed: 'Failed'
  };
  return labels[phase] || phase;
}

/**
 * Format agent status for display
 */
function formatStatus(status) {
  const labels = {
    pending: '○',
    running: '●',
    completed: '✓',
    failed: '✗'
  };
  return labels[status] || status;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Format date for display
 */
function formatDate(dateStr) {
  return new Date(dateStr).toLocaleString();
}

/**
 * API helper for GET requests
 */
async function apiGet(endpoint) {
  const res = await fetch(endpoint);
  return res.json();
}

/**
 * API helper for POST requests
 */
async function apiPost(endpoint, data) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return res.json();
}

/**
 * API helper for PUT requests
 */
async function apiPut(endpoint, data) {
  const res = await fetch(endpoint, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return res.json();
}

/**
 * Show a notification toast (alias for showToast)
 */
function showNotification(message, type = 'info') {
  showToast(message, type);
}

/**
 * Debounce function
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function
 */
function throttle(func, limit) {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

// Export for use in modules (if using module bundler)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    formatPhase,
    formatStatus,
    escapeHtml,
    formatDate,
    apiGet,
    apiPost,
    apiPut,
    apiRequest,
    showNotification,
    showToast,
    showLoading,
    hideLoading,
    showSkeleton,
    enableKeyboardNav,
    announce,
    createFocusTrap,
    debounce,
    throttle
  };
}
