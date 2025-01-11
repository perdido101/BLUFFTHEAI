import { GameState, GameAction, Card } from '../types';
import * as Joi from 'joi';

const cardSchema = Joi.object({
  suit: Joi.string().valid('hearts', 'diamonds', 'clubs', 'spades').required(),
  value: Joi.string().valid('2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A').required(),
  id: Joi.string().required()
});

const gameStateSchema = Joi.object({
  aiHand: Joi.array().items(cardSchema).required(),
  playerHand: Joi.array().items(cardSchema).required(),
  centerPile: Joi.array().items(cardSchema).required(),
  currentTurn: Joi.string().valid('player', 'ai').required(),
  lastPlay: Joi.object({
    player: Joi.string().valid('player', 'ai').required(),
    declaredCards: Joi.string().required(),
    actualCards: Joi.array().items(cardSchema).required()
  }).optional()
});

export class ValidationService {
  validateGameState(gameState: GameState): boolean {
    const { error } = gameStateSchema.validate(gameState);
    return !error;
  }

  validateAction(action: GameAction): boolean {
    const actionSchema = Joi.object({
      type: Joi.string().valid('PLAY_CARDS', 'CHALLENGE', 'PASS').required(),
      payload: Joi.object({
        cards: Joi.array().items(cardSchema),
        declaredValue: Joi.string()
      }).optional()
    });

    const { error } = actionSchema.validate(action);
    return !error;
  }
} 