export function facebookShareUrl(url: string): string {
  const destination = new URL("https://www.facebook.com/sharer/sharer.php");
  destination.searchParams.set("u", url);
  return destination.toString();
}

export function whatsAppShareUrl(title: string, url: string): string {
  const destination = new URL("https://wa.me/");
  destination.searchParams.set("text", `${title} ${url}`);
  return destination.toString();
}
