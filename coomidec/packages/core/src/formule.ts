/**
 * Évaluateur d'expressions restreint.
 *
 * Les formules de calcul sont des données de configuration : elles sont saisies
 * dans PARAMÈTRES et stockées en base. Elles ne doivent donc jamais atteindre
 * `eval` ni `new Function` — une expression venue de la base ne s'exécute pas.
 *
 * Grammaire :
 *   expr    := terme (('+' | '-') terme)*
 *   terme   := unaire (('*' | '/') unaire)*
 *   unaire  := ('-' | '+')? puissance
 *   puiss.  := primaire ('^' unaire)?
 *   primaire:= NOMBRE | VARIABLE | FONCTION '(' args ')' | '(' expr ')'
 */
import { Decimal, dec } from './decimal.js';

export const VARIABLES_AUTORISEES = [
  'QTY',
  'TENEUR',
  'COUT_UNITAIRE',
  'PCT_COUT',
  'PRIX_PAR_POURCENT',
  'VALEUR_TENEUR',
] as const;

export type VariableAutorisee = (typeof VARIABLES_AUTORISEES)[number];
export type Portee = Partial<Record<VariableAutorisee, Decimal>>;

export class ErreurFormule extends Error {
  constructor(message: string, readonly position?: number) {
    super(message);
    this.name = 'ErreurFormule';
  }
}

type Jeton =
  | { type: 'nombre'; valeur: Decimal; pos: number }
  | { type: 'nom'; valeur: string; pos: number }
  | { type: 'symbole'; valeur: string; pos: number }
  | { type: 'fin'; pos: number };

const SYMBOLES = new Set(['+', '-', '*', '/', '^', '(', ')', ',']);

function decouper(src: string): Jeton[] {
  const jetons: Jeton[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (SYMBOLES.has(c)) {
      jetons.push({ type: 'symbole', valeur: c, pos: i });
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      const debut = i;
      while (i < src.length && /[0-9.]/.test(src[i]!)) i++;
      const brut = src.slice(debut, i);
      if ((brut.match(/\./g) ?? []).length > 1) {
        throw new ErreurFormule(`Nombre invalide « ${brut} »`, debut);
      }
      jetons.push({ type: 'nombre', valeur: dec(brut), pos: debut });
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const debut = i;
      while (i < src.length && /[A-Za-z0-9_]/.test(src[i]!)) i++;
      jetons.push({ type: 'nom', valeur: src.slice(debut, i), pos: debut });
      continue;
    }
    throw new ErreurFormule(`Caractère non autorisé « ${c} »`, i);
  }
  jetons.push({ type: 'fin', pos: src.length });
  return jetons;
}

type Noeud =
  | { k: 'nb'; v: Decimal }
  | { k: 'var'; nom: VariableAutorisee }
  | { k: 'bin'; op: string; g: Noeud; d: Noeud; pos: number }
  | { k: 'neg'; e: Noeud }
  | { k: 'fn'; nom: string; args: Noeud[]; pos: number };

const FONCTIONS: Record<string, { arite: number[]; appliquer: (a: Decimal[]) => Decimal }> = {
  min: { arite: [2], appliquer: ([a, b]) => (a!.lessThan(b!) ? a! : b!) },
  max: { arite: [2], appliquer: ([a, b]) => (a!.greaterThan(b!) ? a! : b!) },
  arrondi: {
    arite: [1, 2],
    appliquer: ([x, n]) => x!.toDecimalPlaces(n ? n.toNumber() : 0, Decimal.ROUND_HALF_UP),
  },
  plafond: { arite: [1], appliquer: ([x]) => x!.ceil() },
  plancher: { arite: [1], appliquer: ([x]) => x!.floor() },
  abs: { arite: [1], appliquer: ([x]) => x!.abs() },
};

class Analyseur {
  private i = 0;
  constructor(private readonly jetons: Jeton[]) {}

  private courant(): Jeton {
    return this.jetons[this.i]!;
  }

  private avaler(valeur: string): void {
    const j = this.courant();
    if (j.type !== 'symbole' || j.valeur !== valeur) {
      throw new ErreurFormule(`« ${valeur} » attendu`, j.pos);
    }
    this.i++;
  }

  private estSymbole(...valeurs: string[]): boolean {
    const j = this.courant();
    return j.type === 'symbole' && valeurs.includes(j.valeur);
  }

  analyser(): Noeud {
    const n = this.expr();
    if (this.courant().type !== 'fin') {
      throw new ErreurFormule('Expression incomplète ou parenthèse en trop', this.courant().pos);
    }
    return n;
  }

  private expr(): Noeud {
    let g = this.terme();
    while (this.estSymbole('+', '-')) {
      const j = this.courant() as Extract<Jeton, { type: 'symbole' }>;
      this.i++;
      g = { k: 'bin', op: j.valeur, g, d: this.terme(), pos: j.pos };
    }
    return g;
  }

  private terme(): Noeud {
    let g = this.unaire();
    while (this.estSymbole('*', '/')) {
      const j = this.courant() as Extract<Jeton, { type: 'symbole' }>;
      this.i++;
      g = { k: 'bin', op: j.valeur, g, d: this.unaire(), pos: j.pos };
    }
    return g;
  }

  private unaire(): Noeud {
    if (this.estSymbole('-')) {
      this.i++;
      return { k: 'neg', e: this.unaire() };
    }
    if (this.estSymbole('+')) {
      this.i++;
      return this.unaire();
    }
    return this.puissance();
  }

  private puissance(): Noeud {
    const base = this.primaire();
    if (this.estSymbole('^')) {
      const j = this.courant() as Extract<Jeton, { type: 'symbole' }>;
      this.i++;
      return { k: 'bin', op: '^', g: base, d: this.unaire(), pos: j.pos };
    }
    return base;
  }

  private primaire(): Noeud {
    const j = this.courant();
    if (j.type === 'nombre') {
      this.i++;
      return { k: 'nb', v: j.valeur };
    }
    if (j.type === 'nom') {
      this.i++;
      const minuscule = j.valeur.toLowerCase();
      if (this.estSymbole('(')) {
        if (!(minuscule in FONCTIONS)) {
          throw new ErreurFormule(`Fonction inconnue « ${j.valeur} »`, j.pos);
        }
        this.avaler('(');
        const args: Noeud[] = [];
        if (!this.estSymbole(')')) {
          args.push(this.expr());
          while (this.estSymbole(',')) {
            this.i++;
            args.push(this.expr());
          }
        }
        this.avaler(')');
        const def = FONCTIONS[minuscule]!;
        if (!def.arite.includes(args.length)) {
          throw new ErreurFormule(
            `« ${minuscule} » attend ${def.arite.join(' ou ')} argument(s), ${args.length} fourni(s)`,
            j.pos,
          );
        }
        return { k: 'fn', nom: minuscule, args, pos: j.pos };
      }
      const majuscule = j.valeur.toUpperCase();
      if (!(VARIABLES_AUTORISEES as readonly string[]).includes(majuscule)) {
        throw new ErreurFormule(
          `Variable inconnue « ${j.valeur} ». Disponibles : ${VARIABLES_AUTORISEES.join(', ')}`,
          j.pos,
        );
      }
      return { k: 'var', nom: majuscule as VariableAutorisee };
    }
    if (j.type === 'symbole' && j.valeur === '(') {
      this.i++;
      const n = this.expr();
      this.avaler(')');
      return n;
    }
    throw new ErreurFormule('Expression attendue', j.pos);
  }
}

function evaluerNoeud(n: Noeud, portee: Portee): Decimal {
  switch (n.k) {
    case 'nb':
      return n.v;
    case 'var': {
      const v = portee[n.nom];
      if (v === undefined) {
        throw new ErreurFormule(`Variable « ${n.nom} » non disponible pour cette matière`);
      }
      return v;
    }
    case 'neg':
      return evaluerNoeud(n.e, portee).negated();
    case 'fn':
      return FONCTIONS[n.nom]!.appliquer(n.args.map((a) => evaluerNoeud(a, portee)));
    case 'bin': {
      const g = evaluerNoeud(n.g, portee);
      const d = evaluerNoeud(n.d, portee);
      switch (n.op) {
        case '+':
          return g.plus(d);
        case '-':
          return g.minus(d);
        case '*':
          return g.times(d);
        case '/':
          if (d.isZero()) throw new ErreurFormule('Division par zéro', n.pos);
          return g.dividedBy(d);
        case '^':
          return g.pow(d);
        default:
          throw new ErreurFormule(`Opérateur inconnu « ${n.op} »`, n.pos);
      }
    }
  }
}

/** Analyse une formule. Lève `ErreurFormule` si elle est invalide. */
export function compilerFormule(source: string): (portee: Portee) => Decimal {
  if (!source || !source.trim()) throw new ErreurFormule('Formule vide');
  const arbre = new Analyseur(decouper(source)).analyser();
  return (portee: Portee) => evaluerNoeud(arbre, portee);
}

export function evaluerFormule(source: string, portee: Portee): Decimal {
  return compilerFormule(source)(portee);
}

/** Variables réellement référencées — sert à vérifier un paramétrage. */
export function variablesUtilisees(source: string): VariableAutorisee[] {
  const vues = new Set<VariableAutorisee>();
  const visiter = (n: Noeud): void => {
    if (n.k === 'var') vues.add(n.nom);
    else if (n.k === 'bin') { visiter(n.g); visiter(n.d); }
    else if (n.k === 'neg') visiter(n.e);
    else if (n.k === 'fn') n.args.forEach(visiter);
  };
  visiter(new Analyseur(decouper(source)).analyser());
  return [...vues];
}

/** Contrôle de saisie pour l'écran PARAMÈTRES. */
export function validerFormule(source: string): { valide: boolean; erreur?: string } {
  try {
    compilerFormule(source);
    return { valide: true };
  } catch (e) {
    return { valide: false, erreur: e instanceof Error ? e.message : String(e) };
  }
}
