// IndexedDB en mémoire : les tests unitaires exercent le vrai code Dexie,
// sans navigateur. Le TEST 1 lui-même est vérifié dans un vrai Chromium
// (voir e2e/test1-hors-ligne.spec.ts) — un faux IndexedDB ne prouverait pas
// la persistance après fermeture de l'application.
import 'fake-indexeddb/auto';
