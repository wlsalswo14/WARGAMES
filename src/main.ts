import './style.css';
import { BrickWarfare } from './game/BrickWarfare';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('App root was not found.');
}

const game = new BrickWarfare(app);
game.start();
