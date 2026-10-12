/**
 * API Gateway（WebSocket）から呼ばれる Lambda の入口（部屋の処理は netplay-kit）
 */

import { createHandler } from '../netplay/handler.js';
import game from './game-definition.js';

export const handler = createHandler(game);
