// Loads the Thumbrella browser client from the CDN and hands it to the app.
// Kept as a same-origin module so the app does not need inline script execution
// or bundler-specific import handling to reach the CDN.
import { tbrSetup } from 'https://js.thumbrella.dev/2.1/tbr.js';

window.__brows3Thumbrella = { tbrSetup };
window.dispatchEvent(new Event('brows3-thumbrella-ready'));
