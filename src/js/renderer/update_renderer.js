// update_renderer.js

document.addEventListener('DOMContentLoaded', () => {
  const latestVersionSpan = document.getElementById('latest-version');

  window.electronAPI.onLatestVersion((version) => {
    latestVersionSpan.textContent = version;
    fetchReleaseNotes(version);
  });

  // Close button
  document.getElementById('update-close-button').addEventListener('click', () => {
    window.electronAPI.closeUpdateWindow();
  });

  // Download button
  document.getElementById('download-update-button').addEventListener('click', () => {
    window.electronAPI.downloadUpdate();
  });
  
  // Remind Me Tomorrow button
  document.getElementById('remind-tomorrow-button').addEventListener('click', () => {
    window.electronAPI.remindTomorrow();
  });
});

/**
 * Fetches the release notes from GitHub for the specified version and displays them.
 * @param {string} version 
 */
function fetchReleaseNotes(version) {
  const owner = 'inulute'; 
  const repo = 'perplexity-ai-app'; 
  const branch = 'main'; 

  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/release_notes/v${version}.md`;

  fetch(rawUrl)
    .then(response => {
      if (!response.ok) {
        throw new Error(`Failed to fetch release notes for version ${version}`);
      }
      return response.text();
    })
    .then(markdown => {
      const releaseNotesContent = document.getElementById('release-notes-content');
      
      const htmlContent = marked.parse(markdown);
      
      const sanitizedContent = DOMPurify.sanitize(htmlContent);

      releaseNotesContent.innerHTML = sanitizedContent;
    })
    .catch(error => {
      console.error('Error fetching release notes:', error);
      const releaseNotesContainer = document.querySelector('.release-notes');
      releaseNotesContainer.innerHTML += `<p class="error">Failed to load release notes.</p>`;
    });
}