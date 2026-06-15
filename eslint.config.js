import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

// ESLint flat config. eslint-config-prettier sist så att den stänger av
// formaterings-regler som annars krockar med Prettier (Prettier äger formatet).
export default tseslint.config(
  // supabase/functions är Deno-kod (npm:/jsr:-importer, Deno-globaler), en egen
  // runtime som deployas separat och INTE typas/lintas av app-grafen. De rena,
  // testbara bitarna bor i src/data/livescore/. Lintad här skulle Deno-importerna
  // + Deno.* flaggas falskt av browser/tseslint-konfigen.
  //
  // `.claude` är en git-ignorerad lokal katalog (se .gitignore) som kan innehålla
  // hela repo-kopior i tillfälliga arbetsträd. Sådana lokala arbetsträd-kopior är
  // aldrig en del av app-grafen och ska inte lintas , annars dubbel-flaggas koden i
  // kopiorna (inkl. supabase/functions ovan, som bara ignoreras på rot-nivå).
  { ignores: ['dist', 'dev-dist', 'coverage', 'supabase/functions', '.claude'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // react-hooks v6 ändrade `configs.recommended` från ett `{ rules }`-objekt
      // till en flat-config-ARRAY (`[{ plugins, rules }]`). Den gamla wiringen
      // `...reactHooks.configs.recommended.rules` blev då `...undefined`, dvs
      // reglerna registrerades aldrig och `exhaustive-deps`/`rules-of-hooks` var
      // tysta (lint grön på falska grunder). Sätt dem explicit i stället, så de
      // faktiskt körs och inte kan no-op:a igen vid en framtida plugin-bump.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  prettier
);
