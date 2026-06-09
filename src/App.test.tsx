import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App.tsx';

// Smoke-test för app-skalet: bevisar att skelettet renderar utan att krascha.
// Innehållet är avsiktligt minimalt i T1 (design och vyer kommer i senare tasks),
// så testet verifierar bara att skalet lever, inte specifik layout.
describe('App-skalet', () => {
  it('renderar utan att krascha och visar appens namn', () => {
    render(<App />);

    // Rubriken bekräftar att React-trädet faktiskt monterades.
    expect(screen.getByRole('heading', { name: 'VM 2026' })).toBeInTheDocument();
  });

  it('renderar i ett main-landmark för tillgänglighet', () => {
    render(<App />);

    // Ett main-landmark gör appen navigerbar för skärmläsare från start.
    expect(screen.getByRole('main')).toBeInTheDocument();
  });
});
