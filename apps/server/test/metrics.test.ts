import { afterAll, describe, expect, it } from 'vitest';
import { Metrics } from '../src/metrics';
import { ask, connectClient, createPlayer, startServer, type TestServer } from './helpers';

describe('métricas', () => {
  it('contador, histograma e medida no formato do Prometheus', () => {
    const m = new Metrics();
    m.counter('x_total', 'Coisas');
    m.histogram('y_seconds', 'Tempo');
    m.gauge('z', 'Agora', () => 7);
    m.inc('x_total', { tipo: 'a' });
    m.inc('x_total', { tipo: 'a' });
    m.observe('y_seconds', 0.02, { event: 'game:move' });
    const text = m.render();
    m.stop();
    expect(text).toContain('# TYPE x_total counter');
    expect(text).toContain('x_total{tipo="a"} 2');
    expect(text).toContain('y_seconds_bucket{event="game:move",le="0.01"} 0');
    expect(text).toContain('y_seconds_bucket{event="game:move",le="0.025"} 1');
    expect(text).toContain('y_seconds_count{event="game:move"} 1');
    expect(text).toContain('z 7');
    expect(() => m.inc('nao_existe')).toThrow();
  });

  describe('endpoint', () => {
    let s: TestServer;
    let plain: TestServer;
    afterAll(async () => {
      await s?.close();
      await plain?.close();
    });

    it('só existe com token e só responde a quem manda o token', async () => {
      plain = await startServer();
      expect((await plain.app.inject({ url: '/api/metrics' })).statusCode).toBe(404);

      s = await startServer({}, { db: plain.ctx.db, config: { metricsToken: 'segredo' } });
      expect((await s.app.inject({ url: '/api/metrics' })).statusCode).toBe(404);
      expect((await s.app.inject({ url: '/api/metrics', headers: { authorization: 'Bearer outro' } })).statusCode).toBe(404);

      // Um evento de socket com ack conta no histograma.
      const a = await createPlayer(s, 'Medido');
      const c = await connectClient(s.url, a.token);
      await ask((r) => c.emit('lobby:list', r as never));
      c.close();

      // Erro relatado pelo app: conta por tipo; tipo desconhecido é recusado.
      const report = (payload: object) => s.app.inject({ method: 'POST', url: '/api/client-errors', payload });
      expect((await report({ kind: 'webgl-lost', message: 'contexto perdido', path: '/treino/jogo' })).statusCode).toBe(204);
      expect((await report({ kind: 'qualquer', message: 'x' })).statusCode).toBe(400);
      expect((await report({ kind: 'error' })).statusCode).toBe(400);

      const res = await s.app.inject({ url: '/api/metrics', headers: { authorization: 'Bearer segredo' } });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/plain/);
      expect(res.body).toMatch(/^domino_rooms \d+$/m);
      expect(res.body).toContain('domino_socket_ack_seconds_count{event="lobby:list"} 1');
      expect(res.body).toContain('domino_client_errors_total{kind="webgl-lost"} 1');
      expect(res.body).toMatch(/domino_http_request_seconds_count\{route="\/api\/players",status="2xx"\} 1/);
    });
  });
});
