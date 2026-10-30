const LOCAL_NAMES = new Set(['.git', '.asc', '.ios-release', '.app-store-assets', '.aws', '.ssh', '.gnupg']);
const PRIVATE_NAME = /^(?:\.env(?:\..*)?|\.npmrc|\.netrc|id_(?:rsa|ed25519)(?:\..*)?)$/i;
const CREDENTIAL_NAME = /(?:^|[-_])(?:credentials?|secrets?)(?:[-_.]|$)/i;
const SIGNING_FILE = /\.(?:p8|pem|key|p12|pfx|mobileprovision)$/i;

export function sensitiveAssetPath(value) {
  return value.split('/').some(part => LOCAL_NAMES.has(part.toLowerCase()) || PRIVATE_NAME.test(part) || CREDENTIAL_NAME.test(part) || SIGNING_FILE.test(part));
}
