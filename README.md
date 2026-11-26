# Givaudan Atelier — le site

> Projet réalisé pour le **Hackathon HETIC × Givaudan 2026**.
> API associée : [atelier-rag-api](https://github.com/Hetic-Hackathon-Givaudan-2026-Adam/atelier-rag-api)

**Givaudan Atelier** est un prototype de plateforme de commande intelligente de fragrances :

- **Espace client** : le client décrit son projet en conversation (ou importe son brief), reçoit 3 assemblages
  tirés de la banque de créations invendues de Givaudan, demande un échantillon ou un échange avec un expert,
  puis suit ses projets, ses commandes et ses messages avec sa commerciale.
- **Espace commercial** : la commerciale voit ses clients et leurs projets, les prochaines actions à mener
  (relance, devis, commande en volume) et répond aux messages.

## Démo en ligne

👉 **https://claude.ai/artifact/VpLQhAtaY8RcQhq6XHQYSR**

La démo en ligne tourne en **mode simulation** : les réponses de l'assistant sont scriptées, aucune IA n'est appelée.
Les données sont gardées dans le navigateur (`localStorage`). Le bouton « Réinitialiser la démo » remet tout à zéro.

## Lancer en local

Site statique (HTML, CSS, JavaScript, sans build). Avec [Node.js](https://nodejs.org) :

```powershell
npx serve . -l 3000
```

Puis ouvrir **http://localhost:3000**. Le port **3000** est celui autorisé par l'API (CORS).

## Connexion à l'IA locale (atelier-rag-api)

Le site utilise l'API [atelier-rag-api](https://github.com/Hetic-Hackathon-Givaudan-2026-Adam/atelier-rag-api)
quand elle tourne sur le même ordinateur (`http://127.0.0.1:8001`, réglable dans `js/config.js`) :

- une **pastille** indique l'état : « IA locale connectée » ou « Mode simulation » (cliquer pour vérifier à nouveau) ;
- la conversation « Créer un projet » et l'import de brief passent alors par l'IA locale (Ollama) ;
- si l'API ne répond pas, est arrêtée ou trop lente, le site **repasse automatiquement en simulation**,
  sans erreur pour le client.

Pour tester avec une autre adresse : `localStorage.setItem("atelierApiUrl", "http://127.0.0.1:8002")` dans la console.

## Organisation du code

| Dossier / fichier | Contenu |
|---|---|
| `*.html` | Les pages : accueil, connexion, créer un projet, mes projets, commandes, messages, mon profil, espace commercial |
| `js/` | Un fichier par page, plus `api.js` (client de l'API), `assistant.js` (moteur simulé), `store.js` (données locales) |
| `css/` | Styles, un fichier par page plus `style.css` commun |
| `frames/`, `video.mp4` | Animation de la page d'accueil |

## Équipe

À compléter
