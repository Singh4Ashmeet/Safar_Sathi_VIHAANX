import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';

describe('Health and Liveness Probes', () => {
  it('GET /api/healthz should return 200 OK and server status', async () => {
    const res = await request(app).get('/api/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('service', 'safarsaathi-api');
    expect(res.body).toHaveProperty('timestamp');
  });

  it('GET /healthz alias should also return 200 OK', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
  });
});

