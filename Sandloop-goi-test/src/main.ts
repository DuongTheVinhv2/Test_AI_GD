import './style.css';
import { App } from './app/app';

/** Full-screen message for the cases where the game cannot draw (no WebGL, or the GPU context was lost). */
function fatal(title: string, text: string, reload = true): HTMLElement {
  const box = document.createElement('div');
  box.className = 'fatal';
  box.setAttribute('role', 'alert');
  const h = document.createElement('h1');
  h.textContent = title;
  const p = document.createElement('p');
  p.textContent = text;
  box.append(h, p);
  if (reload) {
    const b = document.createElement('button');
    b.textContent = 'Reload';
    b.onclick = () => location.reload();
    box.appendChild(b);
  }
  document.body.appendChild(box);
  return box;
}

let app: App | null = null;
try {
  app = new App();
} catch (err) {
  console.error(err);
  fatal(
    "Sand Loop can't start",
    'This game needs WebGL, which your browser could not provide. Turn on hardware acceleration in the browser settings, update your graphics driver, or try another browser.',
  );
}

if (app) {
  const game = app;
  game.stage.renderer.setAnimationLoop(() => game.frame());
  (window as unknown as { __app: App }).__app = game;

  // If the GPU drops the context mid-game, say so instead of leaving a frozen blank screen.
  let lostBox: HTMLElement | null = null;
  game.stage.canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    lostBox ??= fatal('Graphics interrupted', 'The browser lost the graphics context. Reloading the page brings the game back (your progress is saved).');
  });
  game.stage.canvas.addEventListener('webglcontextrestored', () => {
    lostBox?.remove();
    lostBox = null;
  });
}
