// Admin-inloggning (T42, #72): diskret e-post-magic-link/OTP-flöde.
//
// Den FUNKTIONELLA + tillgängliga basen (stabil semantik + data-attribut som seam).
// Premium-design (det subtila "admin-läget", arena-estetiken) lämnas till
// design-frontend i T42b, samma arbetsdelning som T15/T16. Vanliga vänner ser inte
// detta som något de behöver, det är en lågmäld "arrangörs-inloggning".
//
// FLÖDE: ange e-post -> få en 6-siffrig kod i mejlet -> ange koden -> sessionen
// uppgraderas till Daniels permanenta identitet (SAMMA user_id, tips behålls).

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useAdminAuthFlow } from './use-admin-auth-flow';
import type { VmSupabaseClient } from '../../data/supabase-browser';

export interface AdminLoginProps {
  /** Den aktiva Supabase-klienten (ur facit-storen). Null = inaktivt skyddsnät. */
  client: VmSupabaseClient | null;
  /** Anropas när uppgraderingen lyckats, så sektionen kan ladda om admin-status. */
  onUpgraded: () => void;
}

export function AdminLogin({ client, onUpgraded }: AdminLoginProps) {
  const flow = useAdminAuthFlow(client);
  const [code, setCode] = useState('');
  const emailId = useId();
  const codeId = useId();
  const errorId = useId();

  const onSubmitEmail = (e: FormEvent) => {
    e.preventDefault();
    void flow.requestCode();
  };

  const onSubmitCode = (e: FormEvent) => {
    e.preventDefault();
    void flow.confirmCode(code);
  };

  // När flödet nått 'done' (lyckad uppgradering, inget fel kastades) signalerar vi
  // uppåt EXAKT EN gång per uppgradering så sektionen laddar om admin-status (i en
  // effekt, inte under render, så vi inte triggar setState-i-render). step blir
  // 'done' bara vid framgång.
  //
  // VAKT med useRef (reviewer F1): `onUpgraded` kan vara en NY closure per render
  // hos anroparen (AdminSection skickar `() => void official.refresh()`), så att ha
  // den i deps räcker inte, effekten skulle re-fyra vid VARJE render medan step är
  // 'done'. I happy-path räddas det av att admin-status flippar och AdminLogin
  // unmountar, MEN i edge-fallet "uppgraderad session som inte är admin" (fristående
  // e-postanvändare / nytt user_id) stannar vyn i 'done' och refresh() skulle loopa
  // obegränsat mot Supabase. Vakten signalerar en gång när vi NÅR 'done' och nollas
  // när vi lämnar det, så kommentaren "en gång" är sann oavsett admin-utfall.
  const signaledRef = useRef(false);
  useEffect(() => {
    if (flow.step !== 'done') {
      signaledRef.current = false;
      return;
    }
    if (!signaledRef.current) {
      signaledRef.current = true;
      onUpgraded();
    }
  }, [flow.step, onUpgraded]);

  return (
    <div data-admin-login="" className="flex flex-col gap-3">
      <h3 className="font-display text-lg font-semibold">Arrangörs-inloggning</h3>
      <p className="text-sm text-fg-muted">
        De officiella matchresultaten matas in av arrangören. Logga in med din e-post för att
        administrera facit. Vanliga deltagare behöver inte logga in.
      </p>

      {flow.error ? (
        <p id={errorId} role="alert" data-admin-login-error="" className="text-sm text-danger">
          {flow.error}
        </p>
      ) : null}

      {flow.step === 'email' ? (
        <form onSubmit={onSubmitEmail} className="flex flex-col gap-2" noValidate>
          <label htmlFor={emailId} className="text-sm font-medium">
            E-postadress
          </label>
          <input
            id={emailId}
            type="email"
            inputMode="email"
            autoComplete="email"
            value={flow.email}
            onChange={(e) => flow.setEmail(e.target.value)}
            aria-describedby={flow.error ? errorId : undefined}
            className="rounded-input border border-border bg-surface px-3 py-2"
            placeholder="namn@exempel.se"
          />
          <button
            type="submit"
            disabled={flow.busy || flow.email.trim() === ''}
            data-admin-login-request=""
            className="rounded-pill bg-accent px-5 py-2.5 font-display text-sm font-semibold text-accent-fg disabled:opacity-50"
          >
            {flow.busy ? 'Skickar…' : 'Skicka inloggningskod'}
          </button>
        </form>
      ) : null}

      {flow.step === 'code' ? (
        <form onSubmit={onSubmitCode} className="flex flex-col gap-2" noValidate>
          <p className="text-sm text-fg-muted">
            En 6-siffrig kod har skickats till <strong>{flow.email}</strong>. Ange den nedan.
          </p>
          <label htmlFor={codeId} className="text-sm font-medium">
            Inloggningskod
          </label>
          <input
            id={codeId}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            aria-describedby={flow.error ? errorId : undefined}
            className="rounded-input border border-border bg-surface px-3 py-2"
            placeholder="123456"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={flow.busy || code.trim() === ''}
              data-admin-login-confirm=""
              className="rounded-pill bg-accent px-5 py-2.5 font-display text-sm font-semibold text-accent-fg disabled:opacity-50"
            >
              {flow.busy ? 'Bekräftar…' : 'Logga in'}
            </button>
            <button
              type="button"
              onClick={flow.reset}
              className="rounded-pill border border-border px-5 py-2.5 font-display text-sm font-semibold"
            >
              Börja om
            </button>
          </div>
        </form>
      ) : null}

      {/* 'done': ge ALLTID återkoppling (Copilot R2). I normalfallet (Daniel = admin)
          flippar admin-status och hela sektionen byts till resultat-inmatningen, så
          detta syns då aldrig. Men i edge-fallet "uppgraderad men inte arrangör"
          stannar vyn här, och utan ett 'done'-block vore komponenten tom (dött läge).
          Vi bekräftar uppgraderingen och erbjuder att börja om med en annan e-post. */}
      {flow.step === 'done' ? (
        <div data-admin-login-done="" className="flex flex-col gap-2">
          <p className="text-sm text-fg-muted">
            Inloggningen lyckades. Resultat-inmatningen visas bara för arrangören. Är du arrangör
            men ser inte inmatningen, prova att ladda om sidan eller logga in med den e-post som är
            kopplad till arrangörs-rollen.
          </p>
          <button
            type="button"
            data-admin-login-restart=""
            onClick={() => {
              setCode('');
              flow.reset();
            }}
            className="self-start rounded-pill border border-border px-5 py-2.5 font-display text-sm font-semibold"
          >
            Logga in med en annan e-post
          </button>
        </div>
      ) : null}
    </div>
  );
}
