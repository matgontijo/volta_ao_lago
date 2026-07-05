import { beforeAll, describe, expect, it } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../src/auth/auth.service';
import { jwtSecret } from '../src/auth/jwt-secret';

/**
 * O link do espectador é UM só e permanente: o token precisa ser
 * determinístico (sem iat/exp) e aceito pelo verify() normal — que usa o
 * módulo JWT com expiresIn de 12h por padrão (foi exatamente essa herança
 * de opções que quebrou o endpoint em produção).
 */
describe('issueSpectatorToken', () => {
  let auth: AuthService;

  beforeAll(() => {
    process.env.JWT_SECRET = 'segredo-de-teste';
    // Mesmo formato do AuthModule real: signOptions com expiresIn de 12h.
    const moduleJwt = new JwtService({
      secret: jwtSecret(),
      signOptions: { expiresIn: '12h' },
    });
    // db = null: espectador não toca o banco (nem no verify).
    auth = new AuthService(null as never, moduleJwt);
  });

  it('gera SEMPRE o mesmo token (link único)', async () => {
    const a = await auth.issueSpectatorToken();
    const b = await auth.issueSpectatorToken();
    expect(a.token).toBe(b.token);
    expect(a.expiresAt).toBeNull();
  });

  it('não tem iat nem exp (permanente)', async () => {
    const { token } = await auth.issueSpectatorToken();
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    expect(payload.iat).toBeUndefined();
    expect(payload.exp).toBeUndefined();
    expect(payload.role).toBe('spectator');
  });

  it('passa no verify() normal sem consultar o banco', async () => {
    const { token } = await auth.issueSpectatorToken();
    const profile = await auth.verify(token);
    expect(profile.role).toBe('spectator');
    expect(profile.name).toBe('Espectador');
  });

  it('token adulterado é rejeitado', async () => {
    const { token } = await auth.issueSpectatorToken();
    await expect(auth.verify(token.slice(0, -3) + 'abc')).rejects.toThrow();
  });
});
