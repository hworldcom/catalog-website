export function legacyClassifierImportsRedirect(lang: string) {
  return {
    to: "/admin/classifier-uploads/new" as const,
    search: { lang },
    replace: true,
  };
}
