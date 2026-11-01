import 'dotenv/config';
import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';

describe('API (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    process.env.PRIVY_APP_ID ||= 'test-app';
    process.env.PRIVY_APP_SECRET ||= 'test-secret';
    process.env.WORKERS_ENABLED = '0';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('GET /health is public', () => {
    return request(app.getHttpServer()).get('/health').expect(200).expect({ ok: true });
  });

  it('GET /me without a token is 401', () => {
    return request(app.getHttpServer()).get('/me').expect(401);
  });

  it('GET /me with a bad token is 401', () => {
    return request(app.getHttpServer())
      .get('/me')
      .set('Authorization', 'Bearer not-a-jwt')
      .expect(401);
  });

  afterAll(async () => {
    await app.close();
  });
});
