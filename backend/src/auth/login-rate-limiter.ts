import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

interface Bucket {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 5 * 60_000;
const MAX_PER_USER = 8; // tentativas falhas por (IP + usuário)
const MAX_PER_IP = 40; // tentativas falhas por IP (evita varrer usuários)

/**
 * Limitador simples de força bruta no login, em memória (por instância).
 * Conta apenas FALHAS: login correto zera o contador do usuário.
 */
@Injectable()
export class LoginRateLimiter {
  private buckets = new Map<string, Bucket>();

  /** Lança 429 se a chave estourou o limite na janela atual. */
  assertAllowed(ip: string, username: string): void {
    this.check(`u:${ip}|${username}`, MAX_PER_USER);
    this.check(`ip:${ip}`, MAX_PER_IP);
  }

  registerFailure(ip: string, username: string): void {
    this.bump(`u:${ip}|${username}`);
    this.bump(`ip:${ip}`);
  }

  registerSuccess(ip: string, username: string): void {
    this.buckets.delete(`u:${ip}|${username}`);
  }

  private check(key: string, max: number): void {
    const b = this.buckets.get(key);
    if (!b || b.resetAt < Date.now()) return;
    if (b.count >= max) {
      const waitS = Math.ceil((b.resetAt - Date.now()) / 1000);
      throw new HttpException(
        `Muitas tentativas de login. Tente novamente em ${waitS}s.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private bump(key: string): void {
    const now = Date.now();
    const b = this.buckets.get(key);
    if (!b || b.resetAt < now) {
      this.buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
      return;
    }
    b.count += 1;
    // Limpeza oportunista para o Map não crescer sem limite.
    if (this.buckets.size > 10_000) {
      for (const [k, v] of this.buckets) {
        if (v.resetAt < now) this.buckets.delete(k);
      }
    }
  }
}
