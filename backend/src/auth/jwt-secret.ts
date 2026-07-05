/**
 * Segredo JWT compartilhado entre o módulo (tokens normais, 12h) e o token
 * determinístico do espectador (sem expiração). Em produção é obrigatório:
 * o fallback de dev está público no repositório.
 */
export function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error(
      'JWT_SECRET não definido. Configure a variável de ambiente antes de subir em produção.',
    );
  }
  return secret ?? 'dev-secret-volta-ao-lago';
}
