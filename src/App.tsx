// Minimal app-shell (platshållare). Verklig design, tema och layout byggs i T2.
// Syftet med T1 är bara att bevisa att skelettet lever och är installerbart som PWA.
export default function App() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-2xl font-semibold">VM 2026</h1>
      <p className="text-sm opacity-70">Skelettet lever. Design och innehåll byggs härnäst.</p>
    </main>
  );
}
