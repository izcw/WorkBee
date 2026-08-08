import React from 'react';
import ReactDOM from 'react-dom/client';
import Prism from 'prismjs';
import './styles.css';

// MDXEditor registers Prism language extensions while its module is evaluated.
// Make the dependency available first so production bundles do not fail before React mounts.
globalThis.Prism ??= Prism;

const { App } = await import('./App');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
);

window.setTimeout(() => {
  const splash = document.getElementById('startup-splash');
  if (!splash) return;
  splash.classList.add('is-hiding');
  window.setTimeout(() => splash.remove(), 500);
}, 2000);
