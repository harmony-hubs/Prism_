import './index.css';

function showModuleLoadError(err: unknown) {
  const root = document.getElementById('root');
  const msg = err instanceof Error ? err.message : String(err);
  if (!root) return;
  root.replaceChildren();
  const wrap = document.createElement('div');
  wrap.style.cssText =
    'min-height:100dvh;box-sizing:border-box;padding:24px;font-family:ui-monospace,monospace,system-ui;font-size:13px;background:#09090b;color:#fecaca;';
  const h1 = document.createElement('h1');
  h1.textContent = 'PRISM could not start';
  h1.style.cssText = 'color:#fff;font-size:1rem;font-weight:700;margin:0 0 8px;';
  const p = document.createElement('p');
  p.textContent = 'A script or module failed to load (this often means a bad public key or a broken import).';
  p.style.cssText = 'color:rgba(255,255,255,0.55);margin:0 0 12px;max-width:42rem;';
  const pre = document.createElement('pre');
  pre.style.cssText = 'margin:0;white-space:pre-wrap;word-break:break-word;color:#fecaca;';
  pre.textContent = msg;
  wrap.append(h1, p, pre);
  root.append(wrap);
}

void import('./boot')
  .then((m) => {
    m.renderApp();
  })
  .catch((err) => {
    console.error(err);
    showModuleLoadError(err);
  });
