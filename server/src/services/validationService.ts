import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';

interface ValidationSchema {
  [key: string]: Joi.ObjectSchema | undefined;
  query?: Joi.ObjectSchema;
  params?: Joi.ObjectSchema;
  body?: Joi.ObjectSchema;
}

export const validate = (schema: ValidationSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const validationResults = ['query', 'params', 'body'].map(key => {
      const schemaForKey = schema[key];
      if (schemaForKey) {
        const reqValue = req[key as keyof Request];
        return schemaForKey.validate(reqValue, { abortEarly: false });
      }
      return { error: null };
    });

    const errors = validationResults
      .filter(result => result.error)
      .map(result => result.error!.details)
      .flat();

    if (errors.length > 0) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.map(error => ({
          field: error.path.join('.'),
          message: error.message
        }))
      });
    }

    next();
    return; // Explicit return for TypeScript
  };
};

// Validation schemas
export const schemas = {
  logSearch: {
    query: Joi.object({
      startDate: Joi.date().iso(),
      endDate: Joi.date().iso().min(Joi.ref('startDate')),
      severity: Joi.string().pattern(/^(low|medium|high)(,(low|medium|high))*$/),
      path: Joi.string(),
      statusCode: Joi.number().integer().min(100).max(599),
      searchText: Joi.string(),
      page: Joi.number().integer().min(1).default(1),
      pageSize: Joi.number().integer().min(1).max(100).default(20)
    })
  },
  gameMove: {
    body: Joi.object({
      action: Joi.object({
        type: Joi.string().valid('PLAY_CARDS', 'CHALLENGE', 'PASS').required(),
        payload: Joi.when('type', {
          is: 'PLAY_CARDS',
          then: Joi.object({
            cards: Joi.array().items(Joi.object({
              suit: Joi.string().valid('hearts', 'diamonds', 'clubs', 'spades').required(),
              value: Joi.string().valid('2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A').required()
            })).required(),
            declaredValue: Joi.string().valid('2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A').required()
          }).required(),
          otherwise: Joi.forbidden()
        })
      }).required(),
      gameState: Joi.object().required()
    })
  }
}; 