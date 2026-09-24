"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="container status-page">
      <h1>Un petit contretemps.</h1>
      <p>La page n’a pas pu être chargée. Vous pouvez réessayer.</p>
      <button className="button primary" onClick={reset}>
        Réessayer
      </button>
      <a href="/">Retour à l’accueil</a>
    </main>
  );
}
