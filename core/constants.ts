export const SPECIAL_WORKSPACE_ID = "TDUQJ4MMY";
export const GOLFNADO_3D_DOMAIN = "golfnado.xyz";
export const GOLFNADO_3D_DOMAIN_PAGES = "golfnado3d.pages.dev";
export const KEY_BASE = "golfnado-prod";

export function getDomain(teamId) {
  return teamId === SPECIAL_WORKSPACE_ID
    ? GOLFNADO_3D_DOMAIN_PAGES
    : GOLFNADO_3D_DOMAIN;
}
