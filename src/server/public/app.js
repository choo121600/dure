// Shared JavaScript utilities for Orchestral frontend

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
 * Show a notification toast
 */
function showNotification(message, type = 'info') {
  // Simple alert for now, could be enhanced with a toast library
  if (type === 'error') {
    alert('Error: ' + message);
  } else {
    console.log(`[${type}] ${message}`);
  }
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
    showNotification
  };
}
