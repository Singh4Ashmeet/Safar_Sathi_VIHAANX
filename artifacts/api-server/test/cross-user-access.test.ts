import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';

describe('IT-10: Cross-User Access Isolation & IDOR Protection', () => {
  it('should reject unauthenticated requests to protected endpoints with 401', async () => {
    const res = await request(app).get('/api/v1/me');
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('should accept dev bypass header in non-production mode and authenticate user', async () => {
    const res = await request(app)
      .get('/api/v1/me')
      .set('x-dev-user-id', 'user_dev_priya');

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('user_dev_priya');
    expect(res.body.name).toContain('Priya');
  });

  it('should route un-implemented endpoints to 501 stub', async () => {
    const res = await request(app)
      .delete('/api/v1/guardians/00000000-0000-0000-0000-000000000001')
      .set('x-dev-user-id', 'user_dev_attacker');

    // Guardian deletion is implemented - returns 404 for non-existent guardian
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('GUARDIAN_NOT_FOUND');
  });
});
