import { describe, expect, it } from 'vitest';
import { dec } from '../src/decimal.js';
import { evaluerFormule, validerFormule, variablesUtilisees } from '../src/formule.js';

const portee = {
  QTY: dec('12.5'),
  TENEUR: dec('3.2'),
  COUT_UNITAIRE: dec('120'),
  PCT_COUT: dec('0.85'),
  PRIX_PAR_POURCENT: dec('140'),
  VALEUR_TENEUR: dec('448'),
};

describe('évaluateur de formules', () => {
  it('applique la priorité des opérateurs', () => {
    expect(evaluerFormule('2 + 3 * 4', portee).toFixed()).toBe('14');
    expect(evaluerFormule('(2 + 3) * 4', portee).toFixed()).toBe('20');
  });

  it('évalue la formule par défaut du barème', () => {
    expect(evaluerFormule('QTY * COUT_UNITAIRE * PCT_COUT', portee).toFixed()).toBe('1275');
  });

  it('évalue la formule par défaut du prix par 1 %', () => {
    expect(evaluerFormule('QTY * VALEUR_TENEUR * PCT_COUT', { ...portee, PCT_COUT: dec('1') }).toFixed()).toBe('5600');
  });

  it('gère l unaire, les puissances et les fonctions', () => {
    expect(evaluerFormule('-QTY + 20', portee).toFixed()).toBe('7.5');
    expect(evaluerFormule('2 ^ 10', portee).toFixed()).toBe('1024');
    expect(evaluerFormule('min(QTY, 10)', portee).toFixed()).toBe('10');
    expect(evaluerFormule('max(QTY, 10)', portee).toFixed()).toBe('12.5');
    expect(evaluerFormule('arrondi(TENEUR, 0)', portee).toFixed()).toBe('3');
    expect(evaluerFormule('plafond(TENEUR)', portee).toFixed()).toBe('4');
    expect(evaluerFormule('plancher(TENEUR)', portee).toFixed()).toBe('3');
  });

  it('accepte la virgule décimale française en entrée numérique', () => {
    expect(dec('3,2').toFixed()).toBe('3.2');
  });

  it('refuse une variable inconnue', () => {
    expect(() => evaluerFormule('QTY * PRIX_SPOT', portee)).toThrow(/Variable inconnue/);
  });

  it('refuse une fonction inconnue', () => {
    expect(() => evaluerFormule('sqrt(QTY)', portee)).toThrow(/Fonction inconnue/);
  });

  it('refuse la division par zéro', () => {
    expect(() => evaluerFormule('QTY / 0', portee)).toThrow(/Division par zéro/);
  });

  it("n'exécute aucun code arbitraire", () => {
    expect(() => evaluerFormule('process.exit(1)', portee)).toThrow();
    expect(() => evaluerFormule('QTY; console.log(1)', portee)).toThrow();
    expect(() => evaluerFormule('constructor', portee)).toThrow(/Variable inconnue/);
  });

  it('signale une parenthèse non fermée', () => {
    expect(validerFormule('QTY * (COUT_UNITAIRE').valide).toBe(false);
    expect(validerFormule('QTY * COUT_UNITAIRE').valide).toBe(true);
  });

  it('liste les variables réellement utilisées', () => {
    expect(variablesUtilisees('QTY * COUT_UNITAIRE * PCT_COUT').sort()).toEqual([
      'COUT_UNITAIRE',
      'PCT_COUT',
      'QTY',
    ]);
  });
});
