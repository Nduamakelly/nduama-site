import fastifyJwt from '@fastify/jwt';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { RoleUtilisateur } from '../db/types.js';

export interface Jeton {
  sub: string;
  identifiant: string;
  role: RoleUtilisateur;
  siteId: string | null;
}

declare module 'fastify' {
  interface FastifyInstance {
    authentifier: (req: FastifyRequest, rep: FastifyReply) => Promise<void>;
    exigerRole: (
      ...roles: RoleUtilisateur[]
    ) => (req: FastifyRequest, rep: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: Jeton;
    user: Jeton;
  }
}

/** Hiérarchie : un ADMIN satisfait une exigence de SUPERVISEUR ou d'AGENT. */
const RANG: Record<RoleUtilisateur, number> = { AGENT: 1, SUPERVISEUR: 2, ADMIN: 3 };

export async function enregistrerAuth(
  app: FastifyInstance,
  opts: { secret: string; expiration: string },
): Promise<void> {
  await app.register(fastifyJwt, {
    secret: opts.secret,
    sign: { expiresIn: opts.expiration },
  });

  app.decorate('authentifier', async (req: FastifyRequest, rep: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      await rep.code(401).send({ erreur: 'Authentification requise.' });
    }
  });

  app.decorate(
    'exigerRole',
    (...roles: RoleUtilisateur[]) =>
      async (req: FastifyRequest, rep: FastifyReply): Promise<void> => {
        try {
          await req.jwtVerify();
        } catch {
          return rep.code(401).send({ erreur: 'Authentification requise.' });
        }
        const requis = Math.min(...roles.map((r) => RANG[r]));
        if (RANG[req.user.role] < requis) {
          return rep.code(403).send({
            erreur: `Action réservée au rôle ${roles.join(' ou ')}.`,
          });
        }
      },
  );
}
