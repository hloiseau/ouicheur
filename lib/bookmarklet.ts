/** Only the current URL and the chosen title leave the merchant page. */
export function browserBookmarklet(origin: string) {
  const destination = JSON.stringify(new URL("/add", origin).href);
  const linkPattern = /^https?:\/\/\S+$/i.toString();
  return `javascript:(()=>{const s=String(window.getSelection()||'').trim();const isLink=${linkPattern}.test(s);const u=new URL(${destination});u.searchParams.set('url',isLink?s:location.href);u.searchParams.set('title',(isLink?document.title:s||document.title).slice(0,160));window.open(u.href,'_blank','noopener,noreferrer')})();`;
}
