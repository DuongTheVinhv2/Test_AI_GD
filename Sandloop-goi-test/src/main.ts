import './style.css';
import { App } from './app/app';

const app = new App();
app.stage.renderer.setAnimationLoop(() => app.frame());
(window as unknown as { __app: App }).__app = app;
