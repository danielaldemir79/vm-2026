// Rums-UI (T14, #14): minimal, FUNKTIONELL + tillgänglig panel för tipsligan.
//
// SCOPE (KISS): skapa rum, gå med via kod, se mina rum, byt aktivt rum, se
// medlemmar, lämna. Bär stabil semantik (rubriker, fält-etiketter, role/aria) +
// data-attribut (data-rooms-*), så design-frontend lägger premium-finishen ovanpå
// utan att röra logiken (samma seam-princip som GroupTable/BracketView/ScenarioView).
//
// Visar inget när rummen är inaktiva (enabled=false, fixtures-läge): det sociala
// lagret är vilande då, appen fungerar lokalt precis som idag. Fel FAIL-LOUD:ar
// (role="alert"), inte en tyst tom panel (PRINCIPLES §8).

import { useId, useState, type ReactNode } from 'react';
import { useRoomsStore } from './rooms-context';

/**
 * Sektions-wrapper som renderar HELA rums-kortet (inkl. ytan) bara när rummen är
 * aktiva (Supabase konfigurerat). I lokalt läge returnerar den null, så ingen tom
 * platta visas. App:en använder denna i stället för att wrappa RoomPanel i en egen
 * Panel (då hade en tom yta synts i fixtures-läge). `surface` är kort-stilen App
 * ger (för att inte duplicera dess Panel-stil här).
 */
export function RoomSection({ surface }: { surface: (children: ReactNode) => ReactNode }) {
  const store = useRoomsStore();
  if (!store.enabled) {
    return null;
  }
  return surface(<RoomPanel />);
}

export function RoomPanel() {
  const store = useRoomsStore();
  const createNameId = useId();
  const createDisplayId = useId();
  const joinCodeId = useId();
  const joinDisplayId = useId();

  const [createName, setCreateName] = useState('');
  const [createDisplay, setCreateDisplay] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [joinDisplay, setJoinDisplay] = useState('');
  // Lokalt UI-fel/-meddelande (skilt från storens initierings-fel), t.ex. "rummet
  // finns inte" vid join med okänd kod. role="status" så det läses upp.
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Inaktivt (fixtures-läge): visa inget rums-UI alls. Appen fungerar lokalt.
  if (!store.enabled) {
    return null;
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    setBusy(true);
    try {
      await store.createRoom(createName.trim(), createDisplay.trim());
      setCreateName('');
      setCreateDisplay('');
      setNotice('Rummet skapades. Dela koden med kompisarna.');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Kunde inte skapa rummet.');
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    setBusy(true);
    try {
      const ok = await store.joinRoom(joinCode.trim(), joinDisplay.trim());
      if (ok) {
        setJoinCode('');
        setJoinDisplay('');
        setNotice('Du gick med i rummet.');
      } else {
        setNotice('Hittade inget rum med den koden. Dubbelkolla och försök igen.');
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Kunde inte gå med i rummet.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="rooms-heading" data-rooms-panel data-rooms-status={store.status}>
      <header className="mb-5">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-accent">
          Tips-ligan
        </p>
        <h2 id="rooms-heading" className="mt-1 font-display text-xl font-bold sm:text-2xl">
          Rum med kompisarna
        </h2>
        <p className="mt-2 text-sm text-fg-muted">
          Skapa ett rum och dela koden, eller gå med i ett befintligt. I ett rum fyller ni i
          matchresultaten tillsammans.
        </p>
      </header>

      {store.status === 'error' && store.error && (
        <p role="alert" data-rooms-error className="mb-4 text-sm text-fg">
          {store.error}
        </p>
      )}

      {/* Mina rum (klickbara, byt aktivt). */}
      {store.myRooms.length > 0 && (
        <div className="mb-6" data-rooms-list>
          <h3 className="mb-2 text-sm font-semibold text-fg-muted">Mina rum</h3>
          <ul className="flex flex-col gap-2">
            {store.myRooms.map((room) => {
              const isActive = store.activeRoom?.id === room.id;
              return (
                <li key={room.id} data-rooms-list-item data-rooms-active={isActive}>
                  <button
                    type="button"
                    onClick={() => void store.selectRoom(room.id)}
                    aria-pressed={isActive}
                    aria-label={`Välj rummet ${room.name} (kod ${room.code})`}
                    className="w-full rounded-card border border-border bg-surface px-3 py-2 text-left"
                  >
                    <span className="font-medium">{room.name}</span>{' '}
                    <span className="text-fg-muted">, kod {room.code}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Aktivt rum: medlemmar + delade resultat + lämna. */}
      {store.activeRoom && (
        <div className="mb-6" data-rooms-active-room aria-live="polite">
          <h3 className="mb-1 text-sm font-semibold">
            Aktivt rum: {store.activeRoom.name}{' '}
            <span className="font-normal text-fg-muted">, dela koden {store.activeRoom.code}</span>
          </h3>
          <p className="mb-2 text-sm text-fg-muted" data-rooms-results-count>
            {store.results.length} delade resultat
          </p>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-muted">
            Medlemmar ({store.members.length})
          </h4>
          <ul className="mb-3 flex flex-wrap gap-2" data-rooms-members>
            {store.members.map((m) => (
              <li
                key={m.userId}
                data-rooms-member
                data-rooms-member-self={m.userId === store.userId}
                className="rounded-pill border border-border bg-surface px-3 py-1 text-sm"
              >
                {m.displayName}
                {m.userId === store.userId && <span className="text-fg-muted"> (du)</span>}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => void store.leaveRoom(store.activeRoom!.id)}
            className="rounded-pill border border-border px-4 py-1.5 text-sm font-medium"
            data-rooms-leave
          >
            Lämna rummet
          </button>
        </div>
      )}

      {/* Lokalt meddelande (skapad/gick med/okänd kod). */}
      {notice && (
        <p role="status" data-rooms-notice className="mb-4 text-sm text-fg">
          {notice}
        </p>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        {/* Skapa rum. */}
        <form onSubmit={handleCreate} data-rooms-create-form className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">Skapa ett rum</h3>
          <label htmlFor={createNameId} className="text-sm text-fg-muted">
            Rummets namn
            <input
              id={createNameId}
              type="text"
              required
              maxLength={60}
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              className="mt-1 w-full rounded-card border border-border bg-surface px-3 py-2"
            />
          </label>
          <label htmlFor={createDisplayId} className="text-sm text-fg-muted">
            Ditt visningsnamn
            <input
              id={createDisplayId}
              type="text"
              required
              maxLength={40}
              value={createDisplay}
              onChange={(e) => setCreateDisplay(e.target.value)}
              className="mt-1 w-full rounded-card border border-border bg-surface px-3 py-2"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="rounded-pill bg-accent px-4 py-2 font-display text-sm font-semibold text-accent-fg disabled:opacity-60"
          >
            Skapa rum
          </button>
        </form>

        {/* Gå med via kod. */}
        <form onSubmit={handleJoin} data-rooms-join-form className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">Gå med via kod</h3>
          <label htmlFor={joinCodeId} className="text-sm text-fg-muted">
            Rumskod
            <input
              id={joinCodeId}
              type="text"
              required
              autoCapitalize="none"
              spellCheck={false}
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              className="mt-1 w-full rounded-card border border-border bg-surface px-3 py-2"
            />
          </label>
          <label htmlFor={joinDisplayId} className="text-sm text-fg-muted">
            Ditt visningsnamn
            <input
              id={joinDisplayId}
              type="text"
              required
              maxLength={40}
              value={joinDisplay}
              onChange={(e) => setJoinDisplay(e.target.value)}
              className="mt-1 w-full rounded-card border border-border bg-surface px-3 py-2"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="rounded-pill border border-border px-4 py-2 font-display text-sm font-semibold disabled:opacity-60"
          >
            Gå med
          </button>
        </form>
      </div>
    </section>
  );
}
