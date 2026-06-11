import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  copyMyPredictions,
  NO_LOCKS,
  type CopyLockSets,
  type LockClassifier,
} from './copy-predictions';
import type { VmSupabaseClient } from '../supabase-browser';
import type { TeamCode } from '../../domain/team-code';

// Vi mockar de KÄLL-moduler copy-predictions importerar DIREKT ur (predictions-api,
// group-predictions-api, bracket-predictions-api), inte barrel:n ./index (F1: barrel-
// importen var cirkulär eftersom index re-exporterar copy-predictions). Att mocka käll-
// modulerna träffar exakt de funktioner produktionskoden nu binder, och håller testet
// fritt från Supabase, så fokus blir orkestreringen (regel-flödet + rapporten).
// Det BEVISAR också regel 1 (bara egna tips): kopieringen läser BARA via listMy* och
// skriver BARA via upsertMy*, aldrig en bredare läsning som listRoom* (skulle dra in
// andras tips). listRoom* mockas kvar (de bor i samma käll-moduler) så vi kan asserta
// att de ALDRIG rörs , nu trivialt sant eftersom copy-predictions inte ens importerar dem.
const api = {
  listMyPredictions: vi.fn(),
  upsertMyPrediction: vi.fn(),
  listMyGroupPredictions: vi.fn(),
  upsertMyGroupPrediction: vi.fn(),
  listMyBracketPredictions: vi.fn(),
  upsertMyBracketPrediction: vi.fn(),
  listRoomPredictions: vi.fn(),
  listRoomGroupPredictions: vi.fn(),
  listRoomBracketPredictions: vi.fn(),
};

vi.mock('./predictions-api', () => ({
  listMyPredictions: (...a: unknown[]) => api.listMyPredictions(...a),
  upsertMyPrediction: (...a: unknown[]) => api.upsertMyPrediction(...a),
  listRoomPredictions: (...a: unknown[]) => api.listRoomPredictions(...a),
}));
vi.mock('./group-predictions-api', () => ({
  listMyGroupPredictions: (...a: unknown[]) => api.listMyGroupPredictions(...a),
  upsertMyGroupPrediction: (...a: unknown[]) => api.upsertMyGroupPrediction(...a),
  listRoomGroupPredictions: (...a: unknown[]) => api.listRoomGroupPredictions(...a),
}));
vi.mock('./bracket-predictions-api', () => ({
  listMyBracketPredictions: (...a: unknown[]) => api.listMyBracketPredictions(...a),
  upsertMyBracketPrediction: (...a: unknown[]) => api.upsertMyBracketPrediction(...a),
  listRoomBracketPredictions: (...a: unknown[]) => api.listRoomBracketPredictions(...a),
}));

const client = {} as VmSupabaseClient;
const SRC = 'room-A';
const DST = 'room-B';

const CODE = (s: string) => s as TeamCode;

/** Bygg en lås-klassificerare som markerar givna nycklar som låsta (resten olåsta). */
function lockClassifier(locked: Partial<CopyLockSets>): LockClassifier {
  return () => ({
    matchKeys: locked.matchKeys ?? new Set(),
    groupKeys: locked.groupKeys ?? new Set(),
    bracketKeys: locked.bracketKeys ?? new Set(),
  });
}

/** En match-tips-rad så som listMyPredictions returnerar den. */
function matchPred(matchId: string, h = 1, a = 0) {
  return { matchId, userId: 'me', homeGoals: h, awayGoals: a, updatedAt: 't' };
}
function groupPred(groupId: string) {
  return {
    groupId,
    userId: 'me',
    winnerTeamId: CODE('BRA'),
    runnerUpTeamId: CODE('ARG'),
    updatedAt: 't',
  };
}
function bracketPred(slotId: string) {
  return { slotId, userId: 'me', advancingTeamId: CODE('BRA'), updatedAt: 't' };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: tomma listor överallt (varje test fyller in det den behöver).
  api.listMyPredictions.mockResolvedValue([]);
  api.listMyGroupPredictions.mockResolvedValue([]);
  api.listMyBracketPredictions.mockResolvedValue([]);
  api.upsertMyPrediction.mockResolvedValue(undefined);
  api.upsertMyGroupPrediction.mockResolvedValue(undefined);
  api.upsertMyBracketPrediction.mockResolvedValue(undefined);
});

/** Hjälp: ge källan match-tips i rum A, målet tips i rum B (per anropsordning). */
function withSourceTargetMatches(source: unknown[], target: unknown[]) {
  // listMyPredictions anropas FÖRST för källan, SEDAN för målet (Promise.all-ordning
  // i copyMyPredictions). mockResolvedValueOnce i den ordningen.
  api.listMyPredictions.mockReset();
  api.listMyPredictions.mockResolvedValueOnce(source).mockResolvedValueOnce(target);
}

describe('copyMyPredictions, happy path (alla tre kategorier kopieras)', () => {
  it('kopierar match-, grupp- och bracket-tips till MÅLrummet och rapporterar dem', async () => {
    withSourceTargetMatches([matchPred('g-A-1', 2, 1)], []);
    api.listMyGroupPredictions.mockResolvedValueOnce([groupPred('A')]).mockResolvedValueOnce([]);
    api.listMyBracketPredictions
      .mockResolvedValueOnce([bracketPred('M73')])
      .mockResolvedValueOnce([]);

    const report = await copyMyPredictions(client, SRC, DST, NO_LOCKS);

    // Skrivningarna gick till MÅLrummet (DST), aldrig källan.
    expect(api.upsertMyPrediction).toHaveBeenCalledWith(client, DST, {
      matchId: 'g-A-1',
      homeGoals: 2,
      awayGoals: 1,
    });
    expect(api.upsertMyGroupPrediction).toHaveBeenCalledWith(client, DST, {
      groupId: 'A',
      winnerTeamId: 'BRA',
      runnerUpTeamId: 'ARG',
    });
    expect(api.upsertMyBracketPrediction).toHaveBeenCalledWith(client, DST, {
      slotId: 'M73',
      advancingTeamId: 'BRA',
    });

    expect(report.total).toEqual({ copied: 3, skippedLocked: 0, skippedExisting: 0, failed: 0 });
    expect(report.byCategory.match.copied).toBe(1);
    expect(report.byCategory.group.copied).toBe(1);
    expect(report.byCategory.bracket.copied).toBe(1);
  });

  it('regel 1 (bara egna tips): läser ALDRIG via listRoom*, bara via listMy*', async () => {
    withSourceTargetMatches([matchPred('g-A-1')], []);
    await copyMyPredictions(client, SRC, DST, NO_LOCKS);
    expect(api.listRoomPredictions).not.toHaveBeenCalled();
    expect(api.listRoomGroupPredictions).not.toHaveBeenCalled();
    expect(api.listRoomBracketPredictions).not.toHaveBeenCalled();
  });
});

describe('regel 2: deadline-lås (pre-klassificerat) hoppas utan skrivförsök', () => {
  it('ett LÅST käll-item kopieras INTE och rapporteras som skippedLocked', async () => {
    withSourceTargetMatches([matchPred('g-A-1'), matchPred('g-B-1')], []);
    // g-A-1 är låst (avspark passerad), g-B-1 olåst.
    const locks = lockClassifier({ matchKeys: new Set(['g-A-1']) });

    const report = await copyMyPredictions(client, SRC, DST, locks);

    // Den olåsta skrevs, den låsta INTE (inget skrivförsök ens, regel 2).
    expect(api.upsertMyPrediction).toHaveBeenCalledTimes(1);
    expect(api.upsertMyPrediction).toHaveBeenCalledWith(client, DST, {
      matchId: 'g-B-1',
      homeGoals: 1,
      awayGoals: 0,
    });
    expect(report.byCategory.match).toMatchObject({ copied: 1, skippedLocked: 1 });
    const locked = report.items.find((i) => i.key === 'g-A-1');
    expect(locked?.outcome).toBe('skippedLocked');
  });

  it('lås gäller per kategori (en låst grupp + en låst slot hoppas var för sig)', async () => {
    withSourceTargetMatches([], []);
    api.listMyGroupPredictions.mockResolvedValueOnce([groupPred('A')]).mockResolvedValueOnce([]);
    api.listMyBracketPredictions
      .mockResolvedValueOnce([bracketPred('champion')])
      .mockResolvedValueOnce([]);
    const locks = lockClassifier({
      groupKeys: new Set(['A']),
      bracketKeys: new Set(['champion']),
    });

    const report = await copyMyPredictions(client, SRC, DST, locks);

    expect(api.upsertMyGroupPrediction).not.toHaveBeenCalled();
    expect(api.upsertMyBracketPrediction).not.toHaveBeenCalled();
    expect(report.byCategory.group.skippedLocked).toBe(1);
    expect(report.byCategory.bracket.skippedLocked).toBe(1);
  });
});

describe('regel 3: befintliga tips i målrummet skrivs ALDRIG över (fyll bara tomma)', () => {
  it('ett item som redan finns i målet hoppas och rapporteras som skippedExisting', async () => {
    // Källan har g-A-1 + g-B-1; målet har REDAN g-A-1 (eget tips där sedan tidigare).
    withSourceTargetMatches([matchPred('g-A-1', 5, 5), matchPred('g-B-1')], [matchPred('g-A-1')]);

    const report = await copyMyPredictions(client, SRC, DST, NO_LOCKS);

    // g-A-1 fanns redan -> inget skrivförsök (regel 3); bara g-B-1 skrevs.
    expect(api.upsertMyPrediction).toHaveBeenCalledTimes(1);
    expect(api.upsertMyPrediction).toHaveBeenCalledWith(client, DST, {
      matchId: 'g-B-1',
      homeGoals: 1,
      awayGoals: 0,
    });
    expect(report.byCategory.match).toMatchObject({ copied: 1, skippedExisting: 1 });
    expect(report.items.find((i) => i.key === 'g-A-1')?.outcome).toBe('skippedExisting');
  });

  it('redan-tippad vinner över lås (existing kollas FÖRST, ingen dubbelräkning)', async () => {
    // g-A-1 finns i målet OCH är låst i källan: ska räknas som EXISTING (en gång),
    // inte locked, och definitivt inte både och.
    withSourceTargetMatches([matchPred('g-A-1')], [matchPred('g-A-1')]);
    const locks = lockClassifier({ matchKeys: new Set(['g-A-1']) });

    const report = await copyMyPredictions(client, SRC, DST, locks);

    expect(api.upsertMyPrediction).not.toHaveBeenCalled();
    expect(report.byCategory.match).toMatchObject({
      copied: 0,
      skippedExisting: 1,
      skippedLocked: 0,
    });
    // Exakt ETT item rapporterat för g-A-1 (ingen dubbelräkning).
    expect(report.items.filter((i) => i.key === 'g-A-1')).toHaveLength(1);
  });
});

describe('robust mot delfel: ett fel stoppar inte resten', () => {
  it('en felande skrivning rapporteras som failed (med feltext) men resten kopieras', async () => {
    withSourceTargetMatches([matchPred('g-A-1'), matchPred('g-B-1'), matchPred('g-C-1')], []);
    // Mittenskrivningen (g-B-1) nekas (t.ex. lås som glidit förbi klient-låset, eller
    // nätfel). De andra två ska ändå skrivas.
    api.upsertMyPrediction
      .mockResolvedValueOnce(undefined) // g-A-1 ok
      .mockRejectedValueOnce(
        new Error('[VM2026] Spara tips misslyckades: new row violates row-level security policy')
      ) // g-B-1 nekas
      .mockResolvedValueOnce(undefined); // g-C-1 ok

    const report = await copyMyPredictions(client, SRC, DST, NO_LOCKS);

    // Alla tre FÖRSÖKTES (delfelet stoppade inte de efterföljande).
    expect(api.upsertMyPrediction).toHaveBeenCalledTimes(3);
    expect(report.byCategory.match).toMatchObject({ copied: 2, failed: 1 });
    const failed = report.items.find((i) => i.key === 'g-B-1');
    expect(failed?.outcome).toBe('failed');
    expect(failed?.error).toMatch(/row-level security/);
  });

  it('ett fel i en kategori stoppar inte de andra kategorierna', async () => {
    withSourceTargetMatches([matchPred('g-A-1')], []);
    api.listMyGroupPredictions.mockResolvedValueOnce([groupPred('A')]).mockResolvedValueOnce([]);
    api.listMyBracketPredictions
      .mockResolvedValueOnce([bracketPred('M73')])
      .mockResolvedValueOnce([]);
    // Match-skrivningen nekas; grupp + bracket ska ändå kopieras.
    api.upsertMyPrediction.mockRejectedValueOnce(new Error('nekad'));

    const report = await copyMyPredictions(client, SRC, DST, NO_LOCKS);

    expect(report.byCategory.match.failed).toBe(1);
    expect(report.byCategory.group.copied).toBe(1);
    expect(report.byCategory.bracket.copied).toBe(1);
    expect(report.total).toMatchObject({ copied: 2, failed: 1 });
  });
});

describe('rapporten stämmer mot utfallet (totaler = summan av kategorierna)', () => {
  it('blandat utfall: copied + locked + existing + failed räknas rätt och konsekvent', async () => {
    // Match: g-A-1 kopieras, g-B-1 låst, g-C-1 finns redan, g-D-1 felar.
    withSourceTargetMatches(
      [matchPred('g-A-1'), matchPred('g-B-1'), matchPred('g-C-1'), matchPred('g-D-1')],
      [matchPred('g-C-1')]
    );
    const locks = lockClassifier({ matchKeys: new Set(['g-B-1']) });
    api.upsertMyPrediction
      .mockResolvedValueOnce(undefined) // g-A-1 ok (g-B-1 hoppas, g-C-1 hoppas)
      .mockRejectedValueOnce(new Error('boom')); // g-D-1 felar

    const report = await copyMyPredictions(client, SRC, DST, locks);

    expect(report.byCategory.match).toEqual({
      copied: 1,
      skippedLocked: 1,
      skippedExisting: 1,
      failed: 1,
    });
    // Totalen = summan av alla kategoriers fält (här bara match har items).
    expect(report.total).toEqual(report.byCategory.match);
    // Item-listan har exakt fyra rader (en per käll-item), inga tappade, inga dubbla.
    expect(report.items).toHaveLength(4);
  });

  it('en läsmiss (listMy*) KASTAR (fail loud för hela jobbet, inte en tyst tom rapport)', async () => {
    api.listMyPredictions.mockReset();
    api.listMyPredictions.mockRejectedValue(
      new Error('[VM2026] Hämta mina tips misslyckades: nät')
    );
    await expect(copyMyPredictions(client, SRC, DST, NO_LOCKS)).rejects.toThrow(
      /Hämta mina tips misslyckades/
    );
  });
});
