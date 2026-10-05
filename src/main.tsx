import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/theme.css';
import { App } from './ui/App';
import { StoreCtx } from './ui/ctx';
import { openRepo } from './data/db';
import { createAppStore } from './store/store';

async function boot() {
  const repo = await openRepo();
  const store = createAppStore(repo);
  await store.getState().init();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <StoreCtx.Provider value={store}>
        <App />
      </StoreCtx.Provider>
    </StrictMode>,
  );
}

boot().catch((e) => {
  document.getElementById('root')!.innerHTML =
    `<div style="padding:24px;font-family:system-ui"><h2>IronLog couldn't start</h2><p>${String(e?.message ?? e)}</p><p>Your data has not been changed. Try reopening the app.</p></div>`;
});
