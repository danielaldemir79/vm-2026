# Deploy , Cloudflare Pages (manuell koppling)

Den här sidan beskriver hur appen kommer ut på en publik adress. Den är skriven för
att du själv ska kunna koppla repot till Cloudflare i deras webb-dashboard, ett engångs-steg.

## Hur tankesättet ser ut (liknelse)

Tänk dig Cloudflare Pages som ett tryckeri. Du visar tryckeriet var manuset ligger (GitHub-repot)
och säger "varje gång något ändras, tryck en ny upplaga åt mig". Sen sköter tryckeriet resten
självt, du behöver inte skicka över något manuellt varje gång.

Vi valde att låta **Cloudflare** bygga appen direkt från repot (deras git-integration), i stället
för att vårt GitHub Actions-flöde skulle bygga och skicka över den. Skälet är enkelt och viktigt:
då behöver vi **inga hemliga nycklar (tokens) i koden eller i repot**. Färre hemligheter = färre
sätt att råka läcka något. Vårt eget CI-flöde (`.github/workflows/ci.yml`) gör därför bara
kvalitetskollen (build, test, lint), det deployar ingenting.

## Engångs-koppling i Cloudflare-dashboarden

1. Logga in på Cloudflare och gå till **Workers & Pages -> Create -> Pages**.
2. Välj **Connect to Git** och välj GitHub-repot `vm-2026`.
3. Ställ in bygg-inställningarna exakt så här:

   | Inställning            | Värde             |
   | ---------------------- | ----------------- |
   | Framework preset       | Vite              |
   | Build command          | `npm run build`   |
   | Build output directory | `dist`            |
   | Node version           | 22 (eller senare) |

4. **Produktionsgren:** `develop`. Det som ligger på `develop` blir den "skarpa" appen på
   huvud-adressen (vm-2026.pages.dev). `main` reserveras för framtida formella releaser, appen
   delas under utvecklingen från `develop`-linjen.
5. **Förhandsvisningar (previews):** Cloudflare bygger automatiskt en egen förhandsvisnings-adress
   för varje pull request. Så du kan se en ändring live INNAN den når `develop`.
   (Standard är att alla icke-produktionsgrenar får preview, det räcker, ingen extra inställning.)

Det är allt. Efter det bygger Cloudflare en ny version varje gång något pushas, helt självt.

## Branch-modell (hur det hänger ihop)

- `develop` -> produktion (skarp publik URL, vm-2026.pages.dev). Samlad nästa-version, det är
  härifrån appen delas under utvecklingen.
- `main` -> reserverad för framtida formella releaser (inte kopplad som produktion än).
- PR-grenar (t.ex. `feature/...`) -> egen förhandsvisnings-URL per PR.

## Inga hemligheter i repot

Det ska **aldrig** ligga någon Cloudflare-token, API-nyckel eller liknande i koden eller i
GitHub-repots filer. Cloudflare-kopplingen sker helt i deras dashboard. Om en deploy någon gång
skulle behöva en hemlighet (det gör den inte med den här modellen) hör den hemma i en
secret-store, aldrig i klartext i repot.
