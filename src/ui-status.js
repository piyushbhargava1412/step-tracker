/**
 * Create a status reporter for updating UI status elements.
 * This is a dependency-injection seam that allows other modules to
 * report status without directly touching the DOM.
 * 
 * @param {Document} doc - The document object to use (defaults to global document)
 * @returns {Object} Object with db(text) and auth(text) methods
 */
export function createStatusReporter(doc = document) {
  return {
    /**
     * Update the database status element.
     * @param {string} text - The text to display
     */
    db(text) {
      const element = doc.getElementById('db-status');
      if (!element) {
        console.warn('[createStatusReporter] Missing element: #db-status');
        return;
      }
      element.textContent = text;
    },

    /**
     * Update the authentication status element.
     * @param {string} text - The text to display
     */
    auth(text) {
      const element = doc.getElementById('auth-status');
      if (!element) {
        console.warn('[createStatusReporter] Missing element: #auth-status');
        return;
      }
      element.textContent = text;
    }
  };
}
